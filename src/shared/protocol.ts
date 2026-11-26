// Protocole PocketPad — partagé par l'app manette (Android / navigateur) et PocketPad Hub (PC).
// Les valeurs de boutons reprennent les masques XInput pour une conversion directe côté PC.

export const DEFAULT_PORT = 47800
export const PROTOCOL_VERSION = 1

export const BTN = {
  DPAD_UP: 0x0001,
  DPAD_DOWN: 0x0002,
  DPAD_LEFT: 0x0004,
  DPAD_RIGHT: 0x0008,
  START: 0x0010,
  BACK: 0x0020,
  LS: 0x0040,
  RS: 0x0080,
  LB: 0x0100,
  RB: 0x0200,
  GUIDE: 0x0400,
  TOUCHPAD: 0x0800,
  A: 0x1000,
  B: 0x2000,
  X: 0x4000,
  Y: 0x8000,
} as const

export type ButtonName = keyof typeof BTN
export type Transport = 'usb' | 'wifi' | 'internet' | 'bluetooth' | 'browser' | 'tv'
export type OutputType = 'x360' | 'ds4'

/** État complet d'une manette. Sticks : -1..1 (Y positif = haut). Gâchettes : 0..1. */
export interface PadState {
  b: number
  lx: number
  ly: number
  rx: number
  ry: number
  lt: number
  rt: number
}

export const neutralState = (): PadState => ({ b: 0, lx: 0, ly: 0, rx: 0, ry: 0, lt: 0, rt: 0 })

export const isPressed = (s: PadState, name: ButtonName) => (s.b & BTN[name]) !== 0

export function sameState(a: PadState, b: PadState) {
  return a.b === b.b && a.lx === b.lx && a.ly === b.ly && a.rx === b.rx && a.ry === b.ry && a.lt === b.lt && a.rt === b.rt
}

const r3 = (v: number) => Math.round(v * 1000) / 1000

export type ClientMessage =
  | { t: 'hello'; v: number; name: string; model: string; skin: string; out: OutputType; via: Transport; pin?: string }
  | ({ t: 's' } & PadState)
  | { t: 'ping'; ts: number; lat?: number }

export type ServerMessage =
  | { t: 'welcome'; slot: number; hub: string; driver: boolean; out: OutputType }
  | { t: 'pong'; ts: number }
  /** Moteurs de vibration demandés par le jeu (0..255) */
  | { t: 'rumble'; l: number; s: number }
  | { t: 'out'; out: OutputType }
  | { t: 'error'; code: 'pin' | 'full' | 'version' | 'kicked'; msg: string }

// --- Bibliothèque de jeux et diffusion vers la TV -----------------------------

export type GameSource = 'steam' | 'epic' | 'rockstar' | 'custom'

export interface GameEntry {
  id: string
  name: string
  source: GameSource
  /** Jaquette verticale (600×900) */
  art?: string
  /** Bannière horizontale */
  hero?: string
}

/** Qualité de diffusion : auto (adaptative), fluide (720p), qualité (débit élevé), éco (réseau faible). */
export type StreamPreset = 'auto' | 'smooth' | 'quality' | 'eco'

export interface StreamStats {
  w: number
  h: number
  fps: number
  /** Débit vidéo en kbit/s */
  kbps: number
  /** Aller-retour réseau en ms */
  rtt: number
  /** Pertes de paquets (%) */
  loss: number
  codec: string
  encoder?: string
}

/** Messages de l'application TV (rôle « viewer ») vers le Hub. */
export type ViewerMessage =
  | { t: 'viewer'; v: number; name: string; pin?: string }
  | { t: 'games' }
  | { t: 'launch'; id: string }
  | { t: 'watch'; preset: StreamPreset; mode: 'desktop' | 'game' }
  | { t: 'unwatch' }
  | { t: 'preset'; preset: StreamPreset }
  | { t: 'mode'; mode: 'desktop' | 'game' }
  | { t: 'sig'; data: SignalData }
  | ({ t: 'tvpad'; i: number; name: string } & PadState)
  | { t: 'tvpad-off'; i: number }
  | { t: 'ping'; ts: number; lat?: number }

export type SignalData = { sdp: RTCSessionDescriptionInit } | { ice: RTCIceCandidateInit | null }

/** Messages du Hub vers l'application TV. */
export type HubToViewer =
  | { t: 'hub'; name: string; streamer: boolean; players: Array<{ slot: number; name: string; model: string; skin: string; transport: Transport }> }
  | { t: 'games'; list: GameEntry[] }
  | { t: 'launched'; id: string; ok: boolean; msg?: string }
  | { t: 'sig'; data: SignalData }
  | { t: 'stream-error'; msg: string }
  /** Vibration demandée par le jeu pour la manette n°i de la TV */
  | { t: 'rumble'; i: number; l: number; s: number }
  | { t: 'pong'; ts: number }
  | { t: 'error'; code: 'pin' | 'version' | 'full'; msg: string }

export const stateMessage = (s: PadState): ClientMessage => ({
  t: 's',
  b: s.b,
  lx: r3(s.lx),
  ly: r3(s.ly),
  rx: r3(s.rx),
  ry: r3(s.ry),
  lt: r3(s.lt),
  rt: r3(s.rt),
})

// --- Bluetooth HID -----------------------------------------------------------
// Rapport n°1 de 9 octets, conforme au descripteur déclaré dans BluetoothGamepadPlugin.java :
// 16 boutons | hat (4 bits) + padding | X Y Z Rz (sticks) | Rx Ry (gâchettes)

const HID_BUTTON_ORDER: Array<ButtonName | 'LT' | 'RT'> = [
  'A', 'B', 'X', 'Y', 'LB', 'RB', 'LT', 'RT', 'BACK', 'START', 'LS', 'RS', 'GUIDE', 'TOUCHPAD',
]

function hat(s: PadState) {
  const u = isPressed(s, 'DPAD_UP')
  const d = isPressed(s, 'DPAD_DOWN')
  const l = isPressed(s, 'DPAD_LEFT')
  const r = isPressed(s, 'DPAD_RIGHT')
  if (u && r) return 1
  if (d && r) return 3
  if (d && l) return 5
  if (u && l) return 7
  if (u) return 0
  if (r) return 2
  if (d) return 4
  if (l) return 6
  return 8 // hors plage = position neutre
}

const axis = (v: number) => Math.max(0, Math.min(255, Math.round(((v + 1) / 2) * 255)))
const trigger = (v: number) => Math.max(0, Math.min(255, Math.round(v * 255)))

export function hidReport(s: PadState): number[] {
  let buttons = 0
  HID_BUTTON_ORDER.forEach((name, i) => {
    const on = name === 'LT' ? s.lt > 0.5 : name === 'RT' ? s.rt > 0.5 : isPressed(s, name)
    if (on) buttons |= 1 << i
  })
  return [
    buttons & 0xff,
    (buttons >> 8) & 0xff,
    hat(s) & 0x0f,
    axis(s.lx),
    axis(-s.ly),
    axis(s.rx),
    axis(-s.ry),
    trigger(s.lt),
    trigger(s.rt),
  ]
}
