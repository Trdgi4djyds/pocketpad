import type { GameEntry, OutputType, PadState, StreamPreset, StreamStats, Transport } from '../shared/protocol'

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

/** Application PocketPad TV connectée au Hub */
export interface HubViewer {
  id: string
  name: string
  address: string
  watching: boolean
  mode: 'desktop' | 'game'
  preset: StreamPreset
  stats: StreamStats | null
  latency: number | null
  connectedAt: number
  pads: number
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
  viewers: HubViewer[]
  games: Array<GameEntry & { icon?: string }>
  stream: { ready: boolean; mouse: boolean }
  bt: { available: boolean; enabled: boolean }
  logs: HubLog[]
  demo?: boolean
}

export interface HubApi {
  getSnapshot(): Promise<HubSnapshot>
  onSnapshot(cb: (s: HubSnapshot) => void): () => void
  setOutput(id: string, out: OutputType): void
  kick(id: string): void
  /** Vibration d'essai sur la manette du joueur */
  testRumble(id: string): void
  regeneratePin(): void
  installDriver(): void
  openExternal(url: string): void
  /** Ouvre le panneau Windows « Contrôleurs de jeu » (joy.cpl) */
  testController(): void
  /** Ajoute les règles de pare-feu Windows (demande l'autorisation administrateur) */
  allowFirewall(): void
  refreshGames(): void
  launchGame(id: string): Promise<{ ok: boolean; msg?: string } | undefined>
  addGame(): void
  removeGame(id: string): void
  setBluetoothBridge(on: boolean): void
}

/** API de la fenêtre de diffusion (preload Electron) */
export interface StreamApi {
  getSource(): Promise<{ id: string; width: number; height: number } | null>
}
