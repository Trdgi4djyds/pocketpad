import { Capacitor, registerPlugin, type PluginListenerHandle } from '@capacitor/core'
import { Haptics, ImpactStyle } from '@capacitor/haptics'
import { getModel } from '../shared/catalog'
import {
  DEFAULT_PORT,
  PROTOCOL_VERSION,
  hidReport,
  neutralState,
  sameState,
  stateMessage,
  type ClientMessage,
  type PadState,
  type ServerMessage,
  type Transport,
} from '../shared/protocol'
import { getSettings } from './store'
import { useSyncExternalStore } from 'react'

// --- Plugin natif Android : le téléphone devient une manette Bluetooth HID ---

export interface BtDevice {
  name: string
  address: string
}

export interface BtStateEvent {
  registered: boolean
  connected: boolean
  name?: string
  address?: string
}

export interface BluetoothGamepadPlugin {
  isSupported(): Promise<{ supported: boolean; reason?: string }>
  enable(): Promise<{ registered: boolean }>
  disable(): Promise<void>
  makeDiscoverable(): Promise<void>
  getPairedDevices(): Promise<{ devices: BtDevice[] }>
  connect(options: { address: string }): Promise<void>
  disconnect(): Promise<void>
  sendReport(options: { data: number[] }): Promise<void>
  addListener(event: 'state', cb: (s: BtStateEvent) => void): Promise<PluginListenerHandle>
}

export const BluetoothGamepad = registerPlugin<BluetoothGamepadPlugin>('BluetoothGamepad')

// --- Gestionnaire de connexion -------------------------------------------------

export type ConnStatus = 'idle' | 'connecting' | 'connected' | 'error'

export interface ConnInfo {
  status: ConnStatus
  transport: Transport | null
  target?: string
  latency?: number
  slot?: number
  driver?: boolean
  hub?: string
  error?: string
  bt: { supported: boolean | null; reason?: string; registered: boolean; connected: boolean; host?: string }
}

/** Convertit une saisie libre (« 192.168.1.20 », « monpc.fr:47800 », « ws://… ») en URL WebSocket. */
export function buildWsUrl(input: string) {
  const raw = input.trim()
  if (/^wss?:\/\//i.test(raw)) {
    const u = new URL(raw)
    if (!u.pathname || u.pathname === '/') u.pathname = '/ws'
    return u.toString()
  }
  const host = raw.replace(/^https?:\/\//i, '').replace(/\/.*$/, '')
  const hasPort = /^\[.*\]:\d+$/.test(host) || (/:\d+$/.test(host) && host.split(':').length === 2)
  return `ws://${hasPort ? host : `${host}:${DEFAULT_PORT}`}/ws`
}

const MAX_RETRIES = 8

class ConnectionManager {
  private info: ConnInfo = { status: 'idle', transport: null, bt: { supported: null, registered: false, connected: false } }
  private listeners = new Set<() => void>()
  private ws: WebSocket | null = null
  private target: { url: string; transport: Transport; label: string } | null = null
  private manualClose = false
  private retries = 0
  private retryTimer: ReturnType<typeof setTimeout> | undefined
  private pingTimer: ReturnType<typeof setInterval> | undefined
  private keepTimer: ReturnType<typeof setInterval> | undefined
  private flushTimer: ReturnType<typeof setTimeout> | undefined
  private rumbleTimer: ReturnType<typeof setInterval> | undefined
  private btHandle: PluginListenerHandle | null = null
  private state: PadState = neutralState()
  private sent: PadState = neutralState()
  private lastSend = 0

  getInfo = () => this.info
  subscribe = (fn: () => void) => {
    this.listeners.add(fn)
    return () => {
      this.listeners.delete(fn)
    }
  }

  private set(patch: Partial<ConnInfo>) {
    this.info = { ...this.info, ...patch }
    this.listeners.forEach((l) => l())
  }

  private setBt(patch: Partial<ConnInfo['bt']>) {
    this.set({ bt: { ...this.info.bt, ...patch } })
  }

  // ----- WebSocket (USB via ADB, Wi-Fi, Internet, navigateur) -----

  connectWebSocket(address: string, transport: Transport) {
    this.disconnect()
    let url: string
    try {
      url = buildWsUrl(address)
    } catch {
      this.set({ status: 'error', transport, target: address, error: 'Adresse invalide' })
      return
    }
    this.manualClose = false
    this.retries = 0
    this.target = { url, transport, label: address }
    this.open()
  }

  private open() {
    const t = this.target
    if (!t) return
    this.set({ status: 'connecting', transport: t.transport, target: t.label, error: undefined, latency: undefined })
    let ws: WebSocket
    try {
      ws = new WebSocket(t.url)
    } catch {
      this.set({ status: 'error', error: 'Adresse invalide' })
      return
    }
    this.ws = ws
    const timeout = setTimeout(() => ws.readyState !== WebSocket.OPEN && ws.close(), 5000)
    ws.onopen = () => {
      clearTimeout(timeout)
      this.sendHello()
    }
    ws.onmessage = (ev) => this.onMessage(String(ev.data))
    ws.onerror = () => {}
    ws.onclose = () => {
      clearTimeout(timeout)
      if (this.ws !== ws) return
      this.ws = null
      this.stopTimers()
      if (this.manualClose) return
      if (this.retries < MAX_RETRIES) {
        this.retries++
        this.set({ status: 'connecting', error: 'Connexion perdue, nouvelle tentative…' })
        this.retryTimer = setTimeout(() => this.open(), Math.min(4000, 600 * this.retries))
      } else {
        this.set({ status: 'error', error: 'PC injoignable. Vérifiez que PocketPad Hub est ouvert.' })
      }
    }
  }

  private sendRaw(msg: ClientMessage) {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg))
  }

  private sendHello() {
    const s = getSettings()
    const model = getModel(s.modelId)
    this.sendRaw({
      t: 'hello',
      v: PROTOCOL_VERSION,
      name: s.playerName || 'Joueur',
      model: model.id,
      skin: s.skins[model.id] ?? model.skins[0].id,
      out: s.output === 'auto' ? model.out : s.output,
      via: this.target?.transport ?? 'wifi',
      pin: s.pin || undefined,
    })
  }

  /** À appeler quand le modèle, le coloris ou le pseudo changent pendant une session. */
  updateProfile() {
    if (this.info.status === 'connected' && this.ws) this.sendHello()
  }

  private onMessage(raw: string) {
    let msg: ServerMessage
    try {
      msg = JSON.parse(raw)
    } catch {
      return
    }
    switch (msg.t) {
      case 'welcome':
        this.retries = 0
        this.set({ status: 'connected', slot: msg.slot, driver: msg.driver, hub: msg.hub, error: undefined })
        this.startTimers()
        this.sendState(true)
        break
      case 'pong':
        this.set({ latency: Math.max(1, Math.round(performance.now() - msg.ts)) })
        break
      case 'rumble':
        this.rumble(Math.max(msg.l, msg.s))
        break
      case 'error':
        this.manualClose = true
        this.ws?.close()
        this.set({
          status: 'error',
          error:
            msg.code === 'pin'
              ? 'Code PIN incorrect. Il est affiché dans PocketPad Hub.'
              : msg.code === 'full'
                ? 'Le PC a déjà 4 manettes connectées.'
                : msg.code === 'kicked'
                  ? 'Déconnecté depuis le PC.'
                  : msg.msg,
        })
        break
    }
  }

  private startTimers() {
    this.stopTimers()
    const ping = () => this.sendRaw({ t: 'ping', ts: performance.now(), lat: this.info.latency })
    ping()
    this.pingTimer = setInterval(ping, 2000)
    // Renvoi périodique de l'état : le PC détecte ainsi une manette figée.
    this.keepTimer = setInterval(() => this.sendState(true), 1000)
  }

  private stopTimers() {
    clearInterval(this.pingTimer)
    clearInterval(this.keepTimer)
    clearTimeout(this.flushTimer)
    clearTimeout(this.retryTimer)
    this.rumble(0)
  }

  // ----- Bluetooth HID (Android uniquement) -----

  async btCheck() {
    if (!Capacitor.isNativePlatform()) {
      this.setBt({ supported: false, reason: 'Disponible uniquement dans l\'application Android.' })
      return
    }
    try {
      const r = await BluetoothGamepad.isSupported()
      this.setBt({ supported: r.supported, reason: r.reason })
    } catch (e) {
      this.setBt({ supported: false, reason: String(e) })
    }
  }

  async btEnable() {
    await this.btListen()
    const r = await BluetoothGamepad.enable()
    this.setBt({ registered: r.registered })
    return r.registered
  }

  private async btListen() {
    if (this.btHandle) return
    this.btHandle = await BluetoothGamepad.addListener('state', (s) => {
      this.setBt({ registered: s.registered, connected: s.connected, host: s.name })
      if (s.connected) {
        this.disconnectWs()
        this.set({ status: 'connected', transport: 'bluetooth', target: s.name ?? s.address, latency: undefined, error: undefined })
        this.sendState(true)
      } else if (this.info.transport === 'bluetooth') {
        this.set({ status: 'idle', transport: null, target: undefined })
      }
    })
  }

  async btConnect(address: string) {
    await this.btListen()
    this.set({ status: 'connecting', transport: 'bluetooth', target: address, error: undefined })
    try {
      await BluetoothGamepad.connect({ address })
    } catch (e) {
      this.set({ status: 'error', error: e instanceof Error ? e.message : String(e) })
    }
  }

  // ----- État de la manette -----

  setState(s: PadState) {
    this.state = s
    if (this.info.status !== 'connected') return
    const wait = 8 - (performance.now() - this.lastSend)
    if (wait <= 0) this.sendState()
    else if (!this.flushTimer) {
      this.flushTimer = setTimeout(() => {
        this.flushTimer = undefined
        this.sendState()
      }, wait)
    }
  }

  private sendState(force = false) {
    if (!force && sameState(this.state, this.sent)) return
    this.sent = { ...this.state }
    this.lastSend = performance.now()
    if (this.info.transport === 'bluetooth') {
      if (this.info.bt.connected) BluetoothGamepad.sendReport({ data: hidReport(this.state) }).catch(() => {})
    } else this.sendRaw(stateMessage(this.state))
  }

  private rumble(level: number) {
    if (level > 20) {
      if (this.rumbleTimer) return
      const buzz = () => Haptics.vibrate({ duration: 120 }).catch(() => {})
      buzz()
      this.rumbleTimer = setInterval(buzz, 110)
    } else if (this.rumbleTimer) {
      clearInterval(this.rumbleTimer)
      this.rumbleTimer = undefined
    }
  }

  private disconnectWs() {
    this.manualClose = true
    this.stopTimers()
    const ws = this.ws
    this.ws = null
    ws?.close()
  }

  disconnect() {
    this.disconnectWs()
    this.target = null
    if (this.info.transport === 'bluetooth' && this.info.bt.connected) BluetoothGamepad.disconnect().catch(() => {})
    this.set({ status: 'idle', transport: null, target: undefined, latency: undefined, error: undefined, slot: undefined })
  }
}

export const connection = new ConnectionManager()

export const useConnection = () => useSyncExternalStore(connection.subscribe, connection.getInfo)

/** Petite vibration au toucher d'un bouton. */
export function tick() {
  if (getSettings().haptics) Haptics.impact({ style: ImpactStyle.Light }).catch(() => {})
}
