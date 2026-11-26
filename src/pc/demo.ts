import { BTN, neutralState } from '../shared/protocol'
import { DEMO_GAMES } from '../shared/demoGames'
import type { HubApi, HubLog, HubSnapshot } from './types'

/** Hub simulé pour l'aperçu web : manettes animées, TV en diffusion, bibliothèque de jeux. */
export function createDemoHub(): HubApi {
  const now = Date.now()
  const log = (msg: string, level: HubLog['level'] = 'info', ago = 0): HubLog => ({ ts: now - ago, level, msg })
  let snap: HubSnapshot = {
    version: '1.1.0',
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
      { id: 'p2', slot: 2, name: 'Sam', model: 'xbox', skin: 'xb-shock', transport: 'usb', address: 'USB · Galaxy S23', latency: 3, out: 'x360', virtual: true, state: neutralState(), connectedAt: now - 1000 * 60 * 3 },
      { id: 'p3', slot: 3, name: 'Xbox Wireless Controller', model: 'xbox', skin: 'xb-carbon', transport: 'tv', address: 'Salon · Google TV', latency: 7, out: 'x360', virtual: true, state: neutralState(), connectedAt: now - 1000 * 60 * 9 },
    ],
    viewers: [
      {
        id: 'tv1',
        name: 'Salon · Google TV',
        address: '192.168.1.41',
        watching: true,
        mode: 'game',
        preset: 'auto',
        stats: { w: 1920, h: 1080, fps: 60, kbps: 14200, rtt: 7, loss: 0, codec: 'H264', encoder: 'MediaFoundation' },
        latency: 7,
        connectedAt: now - 1000 * 60 * 9,
        pads: 1,
      },
    ],
    games: DEMO_GAMES,
    stream: { ready: true, mouse: true },
    bt: { available: true, enabled: true },
    logs: [
      log('Sam a rejoint la partie (P2 · USB)', 'success', 1000 * 60 * 3),
      log('Lancement de Forza Horizon 5', 'success', 1000 * 60 * 8),
      log('Xbox Wireless Controller branchée sur Salon · Google TV (P3)', 'success', 1000 * 60 * 9),
      log('Alex a rejoint la partie (P1 · Wi-Fi)', 'success', 1000 * 60 * 14),
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
        } else if (i === 1) {
          s.ry = Math.sin(t * 1.3) * 0.7
          s.rx = Math.cos(t * 1.3) * 0.7
          const dir = Math.floor(t / 0.9) % 4
          if (t % 0.9 < 0.3) s.b |= [BTN.DPAD_UP, BTN.DPAD_RIGHT, BTN.DPAD_DOWN, BTN.DPAD_LEFT][dir]
          if (Math.sin(t * 2.1) > 0.6) s.b |= BTN.RB
          if (Math.sin(t * 1.7) > 0.7) s.lt = 1
        } else {
          s.lx = Math.sin(t * 0.5) * 0.5
          s.rt = Math.sin(t * 0.8) > 0 ? 1 : 0
        }
        const base = [9, 3, 7][i] ?? 8
        return { ...p, state: s, latency: Math.max(2, base + Math.round(Math.sin(t * 3 + i) * 1.5)) }
      }),
      viewers: snap.viewers.map((v) => (v.stats ? { ...v, stats: { ...v.stats, fps: 59 + Math.round(Math.sin(t * 2)), kbps: Math.round(14000 + Math.sin(t * 0.7) * 1800), rtt: 6 + Math.round(Math.abs(Math.sin(t)) * 3) } } : v)),
    }
    subs.forEach((cb) => cb(snap))
  }

  const push = (patch: Partial<HubSnapshot>) => {
    snap = { ...snap, ...patch }
    subs.forEach((cb) => cb(snap))
  }
  const note = (msg: string, level: HubLog['level'] = 'info') => push({ logs: [{ ts: Date.now(), level, msg }, ...snap.logs] })

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
    testRumble(id) {
      const p = snap.players.find((x) => x.id === id)
      if (p) note(`Test de vibration : ${p.name}`)
    },
    regeneratePin() {
      push({ pin: String(Math.floor(1000 + Math.random() * 9000)) })
    },
    installDriver: () => note('Installation du pilote lancée (démo)'),
    openExternal(url) {
      window.open(url, '_blank', 'noopener')
    },
    testController: () => note('Panneau Windows « Contrôleurs de jeu » ouvert (démo)'),
    allowFirewall: () => note('Règles de pare-feu ajoutées (démo)', 'success'),
    refreshGames: () => note('Bibliothèque actualisée'),
    async launchGame(id) {
      const g = snap.games.find((x) => x.id === id)
      if (g) note(`Lancement de ${g.name}`, 'success')
      return { ok: true }
    },
    addGame: () => note('Choisissez un fichier .exe (démo)'),
    removeGame(id) {
      push({ games: snap.games.filter((g) => g.id !== id) })
    },
    setBluetoothBridge(on) {
      push({ bt: { ...snap.bt, enabled: on } })
    },
  }
}
