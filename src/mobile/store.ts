import { useSyncExternalStore } from 'react'
import { CONTROLLERS } from '../shared/catalog'
import type { OutputType } from '../shared/protocol'

export interface Settings {
  modelId: string
  /** Coloris choisi pour chaque modèle */
  skins: Record<string, string>
  playerName: string
  /** Vibration à chaque appui sur une touche */
  vibeTouch: boolean
  vibeTouchLevel: number
  /** Vibrations envoyées par le jeu (moteurs de la manette) */
  vibeGame: boolean
  vibeGameLevel: number
  output: OutputType | 'auto'
  recentHosts: string[]
  lastHost: string
  pin: string
}

const KEY = 'pocketpad.settings.v1'

const defaults: Settings = {
  modelId: CONTROLLERS[0].id,
  skins: Object.fromEntries(CONTROLLERS.map((m) => [m.id, m.skins[0].id])),
  playerName: 'Joueur 1',
  vibeTouch: true,
  vibeTouchLevel: 0.5,
  vibeGame: true,
  vibeGameLevel: 0.85,
  output: 'auto',
  recentHosts: [],
  lastHost: '',
  pin: '',
}

function load(): Settings {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return defaults
    const parsed = JSON.parse(raw) as Partial<Settings> & { haptics?: boolean }
    // Ancien réglage unique « haptics » (versions 1.0.x)
    if (parsed.haptics === false) {
      parsed.vibeTouch ??= false
      parsed.vibeGame ??= false
    }
    delete parsed.haptics
    return { ...defaults, ...parsed, skins: { ...defaults.skins, ...parsed.skins } }
  } catch {
    return defaults
  }
}

/** Lien direct : ?model=xbox&skin=xb-shock */
function fromUrl(s: Settings): Settings {
  try {
    const q = new URLSearchParams(location.search)
    const model = CONTROLLERS.find((m) => m.id === q.get('model'))
    if (!model) return s
    const skin = model.skins.find((k) => k.id === q.get('skin'))
    return { ...s, modelId: model.id, skins: skin ? { ...s.skins, [model.id]: skin.id } : s.skins }
  } catch {
    return s
  }
}

let state: Settings = fromUrl(load())
const listeners = new Set<() => void>()

export const getSettings = () => state

export function setSettings(patch: Partial<Settings> | ((s: Settings) => Partial<Settings>)) {
  const next = typeof patch === 'function' ? patch(state) : patch
  state = { ...state, ...next }
  try {
    localStorage.setItem(KEY, JSON.stringify(state))
  } catch {
    /* stockage indisponible : réglages conservés en mémoire */
  }
  listeners.forEach((l) => l())
}

export function rememberHost(host: string) {
  setSettings((s) => ({ lastHost: host, recentHosts: [host, ...s.recentHosts.filter((h) => h !== host)].slice(0, 5) }))
}

const subscribe = (fn: () => void) => {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

export const useSettings = () => useSyncExternalStore(subscribe, getSettings)
