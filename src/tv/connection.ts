import { useSyncExternalStore } from 'react'
import { PROTOCOL_VERSION, type GameEntry, type HubToViewer, type PadState, type SignalData, type StreamPreset, type StreamStats, type Transport } from '../shared/protocol'
import { buildWsUrl } from '../shared/ws'

// Liaison de l'application TV avec PocketPad Hub (rôle « viewer ») : bibliothèque de jeux, lancement,
// signalisation de la diffusion et repli des manettes par WebSocket.

export type TvStatus = 'idle' | 'connecting' | 'connected' | 'error'

export interface TvState {
  status: TvStatus
  host?: string
  hubName?: string
  streamer: boolean
  games: GameEntry[]
  players: Array<{ slot: number; name: string; model: string; skin: string; transport: Transport }>
  latency?: number
  error?: string
  streamError?: string
  launched?: { id: string; ok: boolean; msg?: string; at: number }
  /** Statistiques envoyées par le PC pendant la diffusion */
  stats?: StreamStats
}

export interface TvLink {
  getState(): TvState
  subscribe(fn: () => void): () => void
  connect(host: string, name: string): void
  disconnect(): void
  launch(id: string): void
  watch(preset: StreamPreset, mode: 'desktop' | 'game'): void
  unwatch(): void
  setPreset(preset: StreamPreset): void
  setMode(mode: 'desktop' | 'game'): void
  signal(data: SignalData): void
  onSignal(fn: (d: SignalData) => void): () => void
  onRumble(fn: (i: number, l: number, s: number) => void): () => void
  /** Repli quand le canal WebRTC n'est pas ouvert */
  pad(i: number, name: string, s: PadState): void
  padOff(i: number): void
  setStats(s: StreamStats): void
  readonly demo: boolean
}

class Emitter<T extends unknown[]> {
  private fns = new Set<(...a: T) => void>()
  on(fn: (...a: T) => void) {
    this.fns.add(fn)
    return () => {
      this.fns.delete(fn)
    }
  }
  emit(...a: T) {
    this.fns.forEach((f) => f(...a))
  }
}

export class HubLink implements TvLink {
  readonly demo = false
  private state: TvState = { status: 'idle', streamer: false, games: [], players: [] }
  private listeners = new Set<() => void>()
  private ws: WebSocket | null = null
  private manual = false
  private retries = 0
  private target: { host: string; name: string } | null = null
  private retryTimer?: ReturnType<typeof setTimeout>
  private pingTimer?: ReturnType<typeof setInterval>
  private sig = new Emitter<[SignalData]>()
  private rumble = new Emitter<[number, number, number]>()

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

  connect(host: string, name: string) {
    this.disconnect()
    this.manual = false
    this.retries = 0
    this.target = { host, name }
    this.open()
  }

  private open() {
    const t = this.target
    if (!t) return
    this.set({ status: 'connecting', host: t.host, error: undefined })
    let ws: WebSocket
    try {
      ws = new WebSocket(buildWsUrl(t.host))
    } catch {
      return this.set({ status: 'error', error: 'Adresse invalide' })
    }
    this.ws = ws
    const timeout = setTimeout(() => ws.readyState !== WebSocket.OPEN && ws.close(), 5000)
    ws.onopen = () => {
      clearTimeout(timeout)
      ws.send(JSON.stringify({ t: 'viewer', v: PROTOCOL_VERSION, name: t.name }))
    }
    ws.onmessage = (e) => this.onMessage(JSON.parse(String(e.data)) as HubToViewer)
    ws.onclose = () => {
      clearTimeout(timeout)
      clearInterval(this.pingTimer)
      if (this.ws !== ws) return
      this.ws = null
      if (this.manual) return
      if (this.retries++ < 20) {
        this.set({ status: 'connecting', error: 'Connexion perdue, nouvelle tentative…' })
        this.retryTimer = setTimeout(() => this.open(), Math.min(4000, 500 * this.retries))
      } else this.set({ status: 'error', error: 'PC injoignable. Vérifiez que PocketPad Hub est ouvert.' })
    }
  }

  private onMessage(m: HubToViewer) {
    switch (m.t) {
      case 'hub':
        this.retries = 0
        this.set({ status: 'connected', hubName: m.name, streamer: m.streamer, players: m.players, error: undefined })
        this.send({ t: 'games' })
        clearInterval(this.pingTimer)
        this.pingTimer = setInterval(() => this.send({ t: 'ping', ts: performance.now(), lat: this.state.latency }), 2000)
        break
      case 'games':
        this.set({ games: m.list })
        break
      case 'launched':
        this.set({ launched: { id: m.id, ok: m.ok, msg: m.msg, at: Date.now() } })
        break
      case 'sig':
        this.sig.emit(m.data)
        break
      case 'stream-error':
        this.set({ streamError: m.msg })
        break
      case 'pong':
        this.set({ latency: Math.max(1, Math.round(performance.now() - m.ts)) })
        break
      case 'rumble':
        this.rumble.emit(m.i, m.l, m.s)
        break
      case 'error':
        this.manual = true
        this.ws?.close()
        this.set({ status: 'error', error: m.code === 'pin' ? 'Ce PC demande un code PIN (hors réseau local).' : m.msg })
        break
    }
  }

  private send(msg: object) {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg))
  }

  disconnect() {
    this.manual = true
    clearTimeout(this.retryTimer)
    clearInterval(this.pingTimer)
    const ws = this.ws
    this.ws = null
    ws?.close()
    this.set({ status: 'idle', hubName: undefined, games: [], players: [], error: undefined, streamError: undefined, stats: undefined })
  }

  launch = (id: string) => this.send({ t: 'launch', id })
  watch = (preset: StreamPreset, mode: 'desktop' | 'game') => {
    this.set({ streamError: undefined, stats: undefined })
    this.send({ t: 'watch', preset, mode })
  }
  unwatch = () => this.send({ t: 'unwatch' })
  setPreset = (preset: StreamPreset) => this.send({ t: 'preset', preset })
  setMode = (mode: 'desktop' | 'game') => this.send({ t: 'mode', mode })
  signal = (data: SignalData) => this.send({ t: 'sig', data })
  onSignal = (fn: (d: SignalData) => void) => this.sig.on(fn)
  onRumble = (fn: (i: number, l: number, s: number) => void) => this.rumble.on(fn)
  pad = (i: number, name: string, s: PadState) => this.send({ t: 'tvpad', i, name, ...s })
  padOff = (i: number) => this.send({ t: 'tvpad-off', i })
  setStats = (stats: StreamStats) => this.set({ stats })
}

export const useLink = (link: TvLink) => useSyncExternalStore(link.subscribe, link.getState)
