import { BTN, neutralState } from '../shared/protocol'
import type { HubApi, HubLog, HubSnapshot } from './types'

/** Hub simulé pour l'aperçu web : deux manettes animées, journal et appareils fictifs. */
export function createDemoHub(): HubApi {
  const now = Date.now()
  const log = (msg: string, level: HubLog['level'] = 'info', ago = 0): HubLog => ({ ts: now - ago, level, msg })
  let snap: HubSnapshot = {
    version: '1.0.0',
    port: 47800,
    pin: '4821',
    hostname: 'PC-SALON',
    addresses: ['192.168.1.20'],
    platform: 'win32',
    demo: true,
    driver: { available: true, connected: true, installer: true },
    adb: { available: true, devices: [{ serial: 'R5CT20XYZ', model: 'Galaxy S23', state: 'device', reversed: true }] },
    players: [
      { id: 'p1', slot: 1, name: 'Alex', model: 'dualsense', skin: 'ds-black', transport: 'wifi', address: '192.168.1.34', latency: 9, out: 'x360', virtual: true, state: neutralState(), connectedAt: now - 1000 * 60 * 14 },
      { id: 'p2', slot: 2, name: 'Sam', model: 'xbox', skin: 'xb-series-black', transport: 'usb', address: 'USB · Galaxy S23', latency: 3, out: 'x360', virtual: true, state: neutralState(), connectedAt: now - 1000 * 60 * 3 },
    ],
    logs: [
      log('Sam a rejoint la partie (USB · Xbox Wireless)', 'success', 1000 * 60 * 3),
      log('Tunnel USB actif sur Galaxy S23', 'info', 1000 * 60 * 3 + 4000),
      log('Alex a rejoint la partie (Wi-Fi · DualSense)', 'success', 1000 * 60 * 14),
      log('Pilote ViGEmBus connecté', 'info', 1000 * 60 * 15),
      log('Serveur prêt sur 192.168.1.20:47800', 'info', 1000 * 60 * 15 + 2000),
    ],
  }
  const subs = new Set<(s: HubSnapshot) => void>()
  let timer: ReturnType<typeof setInterval> | undefined
  let t = 0

  const animate = () => {
    t += 0.06
    snap = {
      ...snap,
      players: snap.players.map((p, i) => {
        const s = neutralState()
        if (i === 0) {
          s.lx = Math.sin(t) * 0.9
          s.ly = Math.cos(t * 0.7) * 0.6
          s.rx = Math.sin(t * 0.4) * 0.4
          const phase = Math.floor(t / 1.4) % 4
          if (t % 1.4 < 0.35) s.b |= [BTN.A, BTN.B, BTN.Y, BTN.X][phase]
          if (Math.sin(t * 0.9) > 0.75) s.rt = 1
        } else {
          s.ry = Math.sin(t * 1.3) * 0.7
          s.rx = Math.cos(t * 1.3) * 0.7
          const dir = Math.floor(t / 0.9) % 4
          if (t % 0.9 < 0.3) s.b |= [BTN.DPAD_UP, BTN.DPAD_RIGHT, BTN.DPAD_DOWN, BTN.DPAD_LEFT][dir]
          if (Math.sin(t * 2.1) > 0.6) s.b |= BTN.RB
          if (Math.sin(t * 1.7) > 0.7) s.lt = 1
        }
        const base = i === 0 ? 9 : 3
        return { ...p, state: s, latency: Math.max(2, base + Math.round(Math.sin(t * 3 + i) * 1.5)) }
      }),
    }
    subs.forEach((cb) => cb(snap))
  }

  const push = (patch: Partial<HubSnapshot>) => {
    snap = { ...snap, ...patch }
    subs.forEach((cb) => cb(snap))
  }

  return {
    getSnapshot: async () => snap,
    onSnapshot(cb) {
      subs.add(cb)
      if (!timer) timer = setInterval(animate, 60)
      return () => {
        subs.delete(cb)
        if (!subs.size) {
          clearInterval(timer)
          timer = undefined
        }
      }
    },
    setOutput(id, out) {
      push({ players: snap.players.map((p) => (p.id === id ? { ...p, out } : p)) })
    },
    kick(id) {
      const p = snap.players.find((x) => x.id === id)
      push({ players: snap.players.filter((x) => x.id !== id), logs: p ? [{ ts: Date.now(), level: 'warn', msg: `${p.name} a été déconnecté` }, ...snap.logs] : snap.logs })
    },
    regeneratePin() {
      push({ pin: String(Math.floor(1000 + Math.random() * 9000)) })
    },
    installDriver() {
      push({ logs: [{ ts: Date.now(), level: 'info', msg: 'Installation du pilote lancée (démo)' }, ...snap.logs] })
    },
    openExternal(url) {
      window.open(url, '_blank', 'noopener')
    },
    testController() {
      push({ logs: [{ ts: Date.now(), level: 'info', msg: 'Panneau Windows « Contrôleurs de jeu » ouvert (démo)' }, ...snap.logs] })
    },
    allowFirewall() {
      push({ logs: [{ ts: Date.now(), level: 'success', msg: 'Règle de pare-feu ajoutée (démo)' }, ...snap.logs] })
    },
  }
}
