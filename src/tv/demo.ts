import { DEMO_GAMES } from '../shared/demoGames'
import type { PadState, SignalData, StreamPreset, StreamStats } from '../shared/protocol'
import type { FoundHub } from '../shared/discover'
import type { TvLink, TvState } from './connection'

// Aperçu web : un Hub fictif, sa bibliothèque et une diffusion simulée.

export const DEMO_HUBS: FoundHub[] = [
  { host: '192.168.1.20', port: 47800, name: 'PC-SALON', ms: 3 },
  { host: '192.168.1.27', port: 47800, name: 'BUREAU-LEA', ms: 6 },
]

export class DemoLink implements TvLink {
  readonly demo = true
  private state: TvState = { status: 'idle', streamer: true, games: [], players: [] }
  private listeners = new Set<() => void>()
  private statsTimer?: ReturnType<typeof setInterval>
  getState = () => this.state
  subscribe = (fn: () => void) => {
    this.listeners.add(fn)
    return () => {
      this.listeners.delete(fn)
    }
  }
  private set(p: Partial<TvState>) {
    this.state = { ...this.state, ...p }
    this.listeners.forEach((l) => l())
  }
  connect(host: string) {
    const hub = DEMO_HUBS.find((h) => h.host === host) ?? DEMO_HUBS[0]
    this.set({ status: 'connecting', host })
    setTimeout(
      () =>
        this.set({
          status: 'connected',
          hubName: hub.name,
          latency: hub.ms,
          games: DEMO_GAMES,
          players: [
            { slot: 1, name: 'Alex', model: 'dualsense', skin: 'ds-black', transport: 'wifi' },
            { slot: 2, name: 'Sam', model: 'xbox', skin: 'xb-shock', transport: 'usb' },
          ],
        }),
      500,
    )
  }
  disconnect() {
    this.set({ status: 'idle', hubName: undefined, games: [], players: [] })
  }
  launch(id: string) {
    this.set({ launched: { id, ok: true, at: Date.now() } })
  }
  watch(preset: StreamPreset) {
    clearInterval(this.statsTimer)
    let t = 0
    const base: Record<StreamPreset, Partial<StreamStats>> = { auto: { h: 1080, kbps: 14000 }, quality: { h: 1080, kbps: 26000 }, smooth: { h: 720, kbps: 7200 }, eco: { h: 540, kbps: 2400 } }
    this.statsTimer = setInterval(() => {
      t += 1
      const b = base[preset]
      this.set({ stats: { w: Math.round(((b.h ?? 1080) * 16) / 9), h: b.h ?? 1080, fps: preset === 'eco' ? 30 : 59 + (t % 2), kbps: Math.round((b.kbps ?? 14000) * (0.92 + Math.random() * 0.12)), rtt: 6 + Math.round(Math.random() * 3), loss: 0, codec: 'H264', encoder: 'MediaFoundation' } })
    }, 1000)
  }
  unwatch() {
    clearInterval(this.statsTimer)
    this.set({ stats: undefined })
  }
  setPreset(preset: StreamPreset) {
    this.watch(preset)
  }
  setMode() {}
  signal(_d: SignalData) {}
  onSignal() {
    return () => {}
  }
  onRumble() {
    return () => {}
  }
  pad(_i: number, _n: string, _s: PadState) {}
  padOff() {}
  setStats(stats: StreamStats) {
    this.set({ stats })
  }
}
