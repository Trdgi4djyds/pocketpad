import type { OutputType, PadState, Transport } from '../shared/protocol'

export interface HubPlayer {
  id: string
  slot: number
  name: string
  model: string
  skin: string
  transport: Transport
  address: string
  latency: number | null
  out: OutputType
  /** Manette virtuelle branchée côté Windows (ViGEm) */
  virtual: boolean
  state: PadState
  connectedAt: number
}

export interface HubDevice {
  serial: string
  model?: string
  state: string
  reversed: boolean
}

export interface HubLog {
  ts: number
  level: 'info' | 'warn' | 'error' | 'success'
  msg: string
}

export interface HubSnapshot {
  version: string
  port: number
  pin: string
  hostname: string
  addresses: string[]
  platform: string
  driver: { available: boolean; connected: boolean; error?: string; installer: boolean }
  adb: { available: boolean; devices: HubDevice[]; error?: string }
  players: HubPlayer[]
  logs: HubLog[]
  demo?: boolean
}

export interface HubApi {
  getSnapshot(): Promise<HubSnapshot>
  onSnapshot(cb: (s: HubSnapshot) => void): () => void
  setOutput(id: string, out: OutputType): void
  kick(id: string): void
  regeneratePin(): void
  installDriver(): void
  openExternal(url: string): void
  /** Ouvre le panneau Windows « Contrôleurs de jeu » (joy.cpl) */
  testController(): void
  /** Ajoute la règle de pare-feu Windows pour le Wi-Fi (demande l'autorisation administrateur) */
  allowFirewall(): void
}
