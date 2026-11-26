import { Haptics } from '@capacitor/haptics'
import { PocketPad, isNativeApp, nativeInfo } from '../shared/native'
import { getSettings } from './store'

// Deux familles de vibrations, réglables séparément :
//  - touches : impulsion brève à chaque appui (intensité réglable)
//  - jeu     : moteurs de la manette pilotés par le jeu via PocketPad Hub (vibration continue dosée)

let amplitude = false
nativeInfo().then((i) => (amplitude = !!i?.amplitude))

const webVibrate = (p: number | number[]) => {
  try {
    navigator.vibrate?.(p)
  } catch {
    /* navigateur sans vibreur */
  }
}

function pulse(level: number, ms: number) {
  if (level <= 0) return
  if (isNativeApp) {
    // Sans réglage d'amplitude, l'intensité est rendue par la durée
    const dur = amplitude ? ms : Math.round(ms * (0.5 + level))
    PocketPad.vibrate({ ms: dur, amp: Math.round(30 + 225 * level) }).catch(() => Haptics.vibrate({ duration: dur }).catch(() => {}))
  } else webVibrate(Math.round(ms * (0.4 + level)))
}

/** Petite vibration au toucher d'un bouton. */
export function touchPulse() {
  const s = getSettings()
  if (s.vibeTouch) pulse(s.vibeTouchLevel, 14)
}

/** Essai depuis les réglages. */
export function testVibration(kind: 'touch' | 'game') {
  const s = getSettings()
  if (kind === 'touch') pulse(Math.max(0.15, s.vibeTouchLevel), 18)
  else {
    gameRumble(255, 255, true)
    setTimeout(() => gameRumble(0, 0, true), 450)
  }
}

let webTimer: ReturnType<typeof setInterval> | undefined
let current = 0

/** Moteurs du jeu : l = gros moteur, s = petit moteur (0..255). */
export function gameRumble(l: number, s: number, force = false) {
  const st = getSettings()
  const raw = Math.max(l, s * 0.8) / 255
  const level = (force || st.vibeGame ? raw : 0) * (force ? Math.max(0.3, st.vibeGameLevel) : st.vibeGameLevel)
  const amp = level < 0.04 ? 0 : Math.round(25 + 230 * Math.min(1, level))
  if (amp === current) return
  current = amp
  if (isNativeApp) {
    PocketPad.rumble({ amp }).catch(() => {
      // Ancien APK sans le plugin : vibration simple
      if (amp) Haptics.vibrate({ duration: 300 }).catch(() => {})
    })
    return
  }
  // Navigateur : intensité simulée par un motif marche / arrêt
  clearInterval(webTimer)
  webTimer = undefined
  if (!amp) return webVibrate(0)
  const on = Math.round(20 + 60 * level)
  const off = Math.round(60 * (1 - level))
  const run = () => webVibrate(off > 5 ? [on, off] : 120)
  run()
  webTimer = setInterval(run, off > 5 ? on + off : 110)
}

export function stopRumble() {
  gameRumble(0, 0, true)
}
