import { Capacitor, registerPlugin, type PluginListenerHandle } from '@capacitor/core'

// Plugin natif « PocketPad » (MainActivity) : vibrations à amplitude réelle, manettes physiques
// branchées sur la TV, adresse IP locale pour retrouver les PC du réseau.

export interface NativeInfo {
  /** Appareil Android TV (ou saveur « tv » de l'APK) */
  tv: boolean
  flavor: string
  model: string
  /** Adresse IPv4 Wi-Fi / Ethernet et longueur du préfixe réseau */
  ip?: string
  prefix?: number
  /** Le vibreur sait doser l'intensité */
  amplitude: boolean
}

/** État d'une manette physique reçue par Android (mêmes conventions que PadState). */
export interface NativePad {
  id: number
  name: string
  b: number
  lx: number
  ly: number
  rx: number
  ry: number
  lt: number
  rt: number
}

export interface PocketPadPlugin {
  getInfo(): Promise<NativeInfo>
  /** Impulsion brève : ms, amplitude 1..255 */
  vibrate(o: { ms: number; amp: number }): Promise<void>
  /** Vibration continue (moteurs du jeu) ; amp = 0 arrête */
  rumble(o: { amp: number }): Promise<void>
  /** Capture des manettes physiques (application TV) */
  setPadCapture(o: { enabled: boolean }): Promise<void>
  /** Vibration d'une manette physique branchée sur la TV */
  padRumble(o: { id: number; amp: number }): Promise<void>
  /** Le bouton Retour est géré par l'application (événement « back ») */
  setBackHandling(o: { enabled: boolean }): Promise<void>
  exitApp(): Promise<void>
  addListener(event: 'pad', cb: (p: NativePad) => void): Promise<PluginListenerHandle>
  addListener(event: 'pads', cb: (p: { pads: Array<{ id: number; name: string }> }) => void): Promise<PluginListenerHandle>
  addListener(event: 'back', cb: () => void): Promise<PluginListenerHandle>
}

export const isNativeApp = Capacitor.isNativePlatform()
export const PocketPad = registerPlugin<PocketPadPlugin>('PocketPad')

let infoPromise: Promise<NativeInfo | null> | null = null
export function nativeInfo(): Promise<NativeInfo | null> {
  if (!isNativeApp) return Promise.resolve(null)
  infoPromise ??= PocketPad.getInfo().catch(() => null)
  return infoPromise
}
