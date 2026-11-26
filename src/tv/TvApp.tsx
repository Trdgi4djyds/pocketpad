import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Delete, Gamepad2, Keyboard, Loader2, Monitor, MousePointer2, RefreshCw, Tv, X } from 'lucide-react'
import bgHub from '../pc/assets/bg-hub.webp'
import demoFrame from './assets/demo-stream.webp'
import { findSkin } from '../shared/catalog'
import { BTN, DEFAULT_PORT, neutralState, type GameEntry, type PadState, type StreamPreset } from '../shared/protocol'
import { isWebPreview, servedByHub } from '../shared/platform'
import { PocketPad, isNativeApp, nativeInfo } from '../shared/native'
import { probe, scanSubnet, type FoundHub } from '../shared/discover'
import { cls } from '../shared/cls'
import { HubLink, useLink, type TvLink, type TvState } from './connection'
import { DEMO_HUBS, DemoLink } from './demo'
import { focusFirst, moveFocus, type Dir } from './focus'
import { REMOTE_INDEX, pads, type TvPad } from './pads'
import { StreamReceiver } from './receiver'

// PocketPad TV : trouve les PC du réseau, lance les jeux et affiche l'écran du PC en direct.

type Screen = 'home' | 'pc' | 'stream'
interface Target {
  mode: 'desktop' | 'game'
  game?: GameEntry
}

const KEY = 'pocketpad.tv.v1'
const loadPrefs = (): { lastHost?: string; preset: StreamPreset } => {
  try {
    return { preset: 'auto', ...JSON.parse(localStorage.getItem(KEY) || '{}') }
  } catch {
    return { preset: 'auto' }
  }
}
const savePrefs = (p: Partial<ReturnType<typeof loadPrefs>>) => {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...loadPrefs(), ...p }))
  } catch {
    /* stockage indisponible */
  }
}

const PRESETS: Array<{ id: StreamPreset; label: string; sub: string }> = [
  { id: 'auto', label: 'Auto', sub: 'Adaptatif' },
  { id: 'smooth', label: 'Fluide', sub: '720p · 60 i/s' },
  { id: 'quality', label: 'Qualité', sub: '1080p · max' },
  { id: 'eco', label: 'Éco', sub: 'Réseau faible' },
]

const focusRing = 'outline-none transition duration-150 focus:scale-[1.06] focus:ring-[0.2rem] focus:ring-white focus:shadow-[0_1.2rem_3rem_-1rem_rgba(0,0,0,0.85)]'

export function TvApp() {
  // Interface « à 3 mètres » : toutes les tailles suivent la largeur de l'écran
  useLayoutEffect(() => {
    const el = document.documentElement
    const prev = el.style.fontSize
    el.style.fontSize = '1.5625vw'
    return () => {
      el.style.fontSize = prev
    }
  }, [])

  const link = useMemo<TvLink>(() => (isWebPreview ? new DemoLink() : new HubLink()), [])
  const st = useLink(link)
  const [screen, setScreen] = useState<Screen>('home')
  const [target, setTarget] = useState<Target | null>(null)
  const [name, setName] = useState('TV')
  const back = useRef<() => void>(() => {})
  const forwarding = useRef(false)

  useEffect(() => {
    pads.start()
    nativeInfo().then((i) => i?.model && setName(i.model))
    if (servedByHub) {
      link.connect(location.host || `localhost:${DEFAULT_PORT}`, 'Navigateur TV')
      setScreen('pc')
    }
  }, [link])

  // Vibrations demandées par le jeu, rejouées sur la manette de la TV
  useEffect(
    () =>
      link.onRumble((i, l, s) => {
        const pad = pads.list().find((p) => p.index === i)
        if (!pad) return
        if (pad.key.startsWith('n')) PocketPad.padRumble({ id: Number(pad.key.slice(1)), amp: Math.max(l, s) }).catch(() => {})
        else {
          const gp = navigator.getGamepads?.()[Number(pad.key.slice(1))] as (Gamepad & { vibrationActuator?: { playEffect: (t: string, o: object) => Promise<unknown> } }) | null
          gp?.vibrationActuator?.playEffect('dual-rumble', { duration: 250, strongMagnitude: l / 255, weakMagnitude: s / 255 }).catch(() => {})
        }
      }),
    [link],
  )

  useTvInput(back, forwarding)

  const openPc = (h: FoundHub) => {
    savePrefs({ lastHost: h.host })
    link.connect(h.port === DEFAULT_PORT ? h.host : `${h.host}:${h.port}`, name)
    setScreen('pc')
  }
  const play = (t: Target) => {
    if (t.game) link.launch(t.game.id)
    setTarget(t)
    setScreen('stream')
  }
  const leavePc = useCallback(() => {
    link.disconnect()
    setScreen('home')
  }, [link])

  return (
    <div className="relative h-full w-full select-none overflow-hidden bg-[#05060a] font-sans text-white">
      {screen === 'home' && <HomeScreen onOpen={openPc} back={back} name={name} />}
      {screen === 'pc' && <PcScreen st={st} back={back} onPlay={play} onLeave={leavePc} />}
      {screen === 'stream' && target && <StreamScreen link={link} st={st} target={target} back={back} forwarding={forwarding} onExit={() => setScreen('pc')} />}
    </div>
  )
}

// ----- Entrées : télécommande et manettes -------------------------------------------

function useTvInput(back: React.MutableRefObject<() => void>, forwarding: React.MutableRefObject<boolean>) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Retour fonctionne toujours (pendant la partie, il ouvre le menu de diffusion)
      if (e.key === 'Escape' || e.key === 'GoBack' || e.key === 'BrowserBack' || (e.key === 'Backspace' && !(e.target instanceof HTMLInputElement))) {
        e.preventDefault()
        back.current()
        return
      }
      if (forwarding.current) return
      const dirs: Record<string, Dir> = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' }
      if (dirs[e.key]) {
        e.preventDefault()
        moveFocus(dirs[e.key])
      }
    }
    window.addEventListener('keydown', onKey)
    // Bouton Retour de la télécommande Android TV
    let handle: { remove: () => Promise<void> } | undefined
    if (isNativeApp) {
      PocketPad.setBackHandling({ enabled: true }).catch(() => {})
      PocketPad.addListener('back', () => back.current())
        .then((h) => (handle = h))
        .catch(() => {})
    }
    // Manettes : croix ou stick gauche pour se déplacer, A pour valider, B pour revenir
    const held = new Map<string, { dir: Dir | null; timer?: ReturnType<typeof setTimeout>; prev: number }>()
    const dirOf = (s: PadState): Dir | null => {
      if (s.b & BTN.DPAD_UP || s.ly > 0.6) return 'up'
      if (s.b & BTN.DPAD_DOWN || s.ly < -0.6) return 'down'
      if (s.b & BTN.DPAD_LEFT || s.lx < -0.6) return 'left'
      if (s.b & BTN.DPAD_RIGHT || s.lx > 0.6) return 'right'
      return null
    }
    const off = pads.onChange((p: TvPad) => {
      const h = held.get(p.key) ?? { dir: null, prev: 0 }
      held.set(p.key, h)
      if (forwarding.current) {
        clearTimeout(h.timer)
        h.dir = null
        h.prev = p.state.b
        return
      }
      const d = dirOf(p.state)
      if (d !== h.dir) {
        clearTimeout(h.timer)
        h.dir = d
        if (d) {
          moveFocus(d)
          const repeat = (delay: number) => (h.timer = setTimeout(() => {
            if (h.dir !== d || forwarding.current) return
            moveFocus(d)
            repeat(130)
          }, delay))
          repeat(380)
        }
      }
      const rising = p.state.b & ~h.prev
      if (rising & BTN.A) (document.activeElement as HTMLElement | null)?.click()
      if (rising & BTN.B) back.current()
      h.prev = p.state.b
    })
    return () => {
      window.removeEventListener('keydown', onKey)
      off()
      handle?.remove()
      held.forEach((h) => clearTimeout(h.timer))
    }
  }, [back, forwarding])
}

// ----- Éléments communs -----------------------------------------------------------

function Clock() {
  const [t, setT] = useState(() => new Date())
  useEffect(() => {
    const i = setInterval(() => setT(new Date()), 10000)
    return () => clearInterval(i)
  }, [])
  return <span className="font-display text-[1.3rem] font-semibold tabular-nums">{t.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</span>
}

function Brand({ right }: { right?: ReactNode }) {
  return (
    <header className="relative z-10 flex items-center justify-between px-[3.4rem] pt-[2.2rem]">
      <div className="flex items-center gap-[0.8rem]">
        <span className="grid size-[2.6rem] place-items-center rounded-full bg-white text-[#0a0a10]">
          <Gamepad2 className="size-[1.4rem]" strokeWidth={2.2} />
        </span>
        <span className="font-display text-[1.3rem] font-bold">PocketPad TV</span>
      </div>
      <div className="flex items-center gap-[1.6rem] text-white/85">
        {right}
        <Clock />
      </div>
    </header>
  )
}

function Backdrop({ src, dim = 0.5 }: { src: string; dim?: number }) {
  return (
    <>
      <img key={src} src={src} alt="" className="animate-fade pointer-events-none absolute inset-0 h-full w-full object-cover" style={{ opacity: 1 - dim }} />
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(90deg,rgba(5,6,10,0.95)_0%,rgba(5,6,10,0.6)_45%,rgba(5,6,10,0.15)_100%)]" />
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(5,6,10,0.65)_0%,transparent_25%,transparent_50%,rgba(5,6,10,0.97)_100%)]" />
    </>
  )
}

// ----- Accueil : choix du PC --------------------------------------------------------

function HomeScreen({ onOpen, back, name }: { onOpen: (h: FoundHub) => void; back: React.MutableRefObject<() => void>; name: string }) {
  const prefs = loadPrefs()
  const [found, setFound] = useState<FoundHub[]>(isWebPreview ? DEMO_HUBS : [])
  const [scanning, setScanning] = useState(!isWebPreview)
  const [round, setRound] = useState(0)
  const [keypad, setKeypad] = useState(false)

  useEffect(() => {
    if (isWebPreview) return
    const ctrl = new AbortController()
    setScanning(true)
    setFound([])
    const add = (h: FoundHub) => setFound((l) => (l.some((x) => x.host === h.host) ? l : [...l, h]))
    ;(async () => {
      const info = await nativeInfo()
      if (prefs.lastHost) probe(prefs.lastHost).then((h) => h && add(h))
      if (info?.ip) await scanSubnet(info.ip, add, { signal: ctrl.signal, known: prefs.lastHost ? [prefs.lastHost] : [] })
      if (!ctrl.signal.aborted) setScanning(false)
    })()
    return () => ctrl.abort()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [round])

  useEffect(() => {
    back.current = () => (keypad ? setKeypad(false) : isNativeApp && PocketPad.exitApp().catch(() => {}))
  }, [back, keypad])

  const sorted = [...found].sort((a, b) => Number(b.host === prefs.lastHost) - Number(a.host === prefs.lastHost) || a.ms - b.ms)
  useEffect(() => {
    if (!keypad) focusFirst()
  }, [sorted.length, keypad])

  return (
    <div className="absolute inset-0">
      <Backdrop src={bgHub} dim={0.55} />
      <Brand right={<span className="text-[0.95rem] text-white/55">{name}</span>} />
      <main className="relative z-10 px-[3.4rem] pt-[5.5rem]">
        <p className="text-[0.85rem] font-semibold uppercase tracking-[0.3em] text-white/55">Jouer sur la TV</p>
        <h1 className="mt-[0.8rem] font-display text-[4.2rem] font-extrabold leading-[0.95] tracking-[-0.035em]">Choisissez votre PC</h1>
        <div className="no-scrollbar -mx-[1rem] mt-[2.6rem] flex gap-[1.4rem] overflow-x-auto px-[1rem] py-[1rem]">
          {sorted.map((h, i) => (
            <button key={h.host} data-nav data-nav-default={i === 0 ? '' : undefined} onClick={() => onOpen(h)} className={cls('relative flex h-[10.5rem] w-[16rem] shrink-0 flex-col justify-between rounded-[1.4rem] bg-white/[0.1] p-[1.3rem] text-left backdrop-blur-xl focus:bg-white focus:text-[#0a0a10]', focusRing)}>
              <span className="flex items-center justify-between">
                <Monitor className="size-[2.2rem]" />
                {h.host === prefs.lastHost && <span className="rounded-full bg-emerald-400/90 px-[0.7rem] py-[0.15rem] text-[0.7rem] font-bold uppercase tracking-wider text-[#04140b]">Dernier</span>}
              </span>
              <span>
                <span className="block truncate font-display text-[1.5rem] font-bold">{h.name}</span>
                <span className="mt-[0.2rem] block text-[0.95rem] opacity-60">
                  {h.host} · {h.ms} ms
                </span>
              </span>
            </button>
          ))}
          <button data-nav onClick={() => setKeypad(true)} className={cls('flex h-[10.5rem] w-[11rem] shrink-0 flex-col justify-between rounded-[1.4rem] border border-white/15 bg-black/20 p-[1.3rem] text-left backdrop-blur-xl focus:bg-white focus:text-[#0a0a10]', focusRing)}>
            <Keyboard className="size-[2rem]" />
            <span className="font-display text-[1.2rem] font-semibold leading-tight">Saisir une adresse</span>
          </button>
          <button data-nav onClick={() => setRound((r) => r + 1)} className={cls('flex h-[10.5rem] w-[10rem] shrink-0 flex-col justify-between rounded-[1.4rem] border border-white/15 bg-black/20 p-[1.3rem] text-left backdrop-blur-xl focus:bg-white focus:text-[#0a0a10]', focusRing)}>
            <RefreshCw className={cls('size-[2rem]', scanning && 'animate-spin')} />
            <span className="font-display text-[1.2rem] font-semibold leading-tight">{scanning ? 'Recherche…' : 'Actualiser'}</span>
          </button>
        </div>
        <p className="mt-[1.6rem] flex items-center gap-[0.6rem] text-[1rem] text-white/55">
          {scanning && <Loader2 className="size-[1.1rem] animate-spin" />}
          {found.length === 0 && !scanning ? 'Aucun PC trouvé. Ouvrez PocketPad Hub sur le PC, sur le même réseau.' : 'PocketPad Hub doit être ouvert sur le PC.'}
        </p>
      </main>
      {keypad && <Keypad onCancel={() => setKeypad(false)} onDone={(host) => onOpen({ host, port: DEFAULT_PORT, name: host, ms: 0 })} initial={prefs.lastHost ?? '192.168.1.'} />}
    </div>
  )
}

function Keypad({ initial, onDone, onCancel }: { initial: string; onDone: (h: string) => void; onCancel: () => void }) {
  const [v, setV] = useState(initial)
  useEffect(() => {
    focusFirst()
  }, [])
  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', '⌫']
  const press = (k: string) => setV((x) => (k === '⌫' ? x.slice(0, -1) : (x + k).slice(0, 21)))
  return (
    <div data-nav-trap className="animate-fade absolute inset-0 z-30 grid place-items-center bg-black/70 backdrop-blur-md">
      <div className="w-[30rem] rounded-[1.8rem] bg-[#15171e] p-[2rem]">
        <div className="text-[0.85rem] font-semibold uppercase tracking-[0.25em] text-white/50">Adresse du PC</div>
        <div className="mt-[0.6rem] rounded-[1rem] bg-black/40 px-[1.2rem] py-[0.9rem] font-display text-[2.2rem] font-bold tabular-nums">{v || ' '}</div>
        <div className="mt-[1.2rem] grid grid-cols-3 gap-[0.7rem]">
          {keys.map((k, i) => (
            <button key={k} data-nav data-nav-default={i === 0 ? '' : undefined} onClick={() => press(k)} className={cls('h-[3.6rem] rounded-[0.9rem] bg-white/[0.07] font-display text-[1.6rem] font-semibold focus:bg-white focus:text-[#0a0a10]', focusRing)}>
              {k === '⌫' ? <Delete className="mx-auto size-[1.6rem]" /> : k}
            </button>
          ))}
        </div>
        <div className="mt-[1.2rem] grid grid-cols-2 gap-[0.7rem]">
          <button data-nav onClick={onCancel} className={cls('h-[3.4rem] rounded-full border border-white/20 text-[1.1rem] focus:bg-white focus:text-[#0a0a10]', focusRing)}>
            Annuler
          </button>
          <button data-nav onClick={() => /^\d+\.\d+\.\d+\.\d+$/.test(v) && onDone(v)} className={cls('h-[3.4rem] rounded-full bg-white font-display text-[1.1rem] font-semibold text-[#0a0a10]', focusRing)}>
            Se connecter
          </button>
        </div>
      </div>
    </div>
  )
}

// ----- Écran du PC : bureau et bibliothèque ------------------------------------------

function PcScreen({ st, back, onPlay, onLeave }: { st: TvState; back: React.MutableRefObject<() => void>; onPlay: (t: Target) => void; onLeave: () => void }) {
  const [focusId, setFocusId] = useState<string>('desktop')
  const [tvPads, setTvPads] = useState(pads.list())
  useEffect(() => pads.onList(() => setTvPads(pads.list())), [])
  useEffect(() => {
    back.current = onLeave
  }, [back, onLeave])
  useEffect(() => {
    if (st.status === 'connected') setTimeout(() => focusFirst(), 50)
  }, [st.status])

  const game = st.games.find((g) => g.id === focusId)
  const backdrop = game?.hero ?? bgHub

  if (st.status !== 'connected')
    return (
      <div className="absolute inset-0">
        <Backdrop src={bgHub} dim={0.6} />
        <Brand />
        <div className="relative z-10 grid h-[75%] place-items-center text-center">
          <div>
            {st.status === 'error' ? <X className="mx-auto size-[3rem] text-rose-300" /> : <Loader2 className="mx-auto size-[3rem] animate-spin text-white/70" />}
            <div className="mt-[1.4rem] font-display text-[2.2rem] font-bold">{st.status === 'error' ? 'Connexion impossible' : 'Connexion au PC…'}</div>
            <div className="mt-[0.5rem] text-[1.1rem] text-white/55">{st.error ?? st.host}</div>
            <button data-nav data-nav-default onClick={onLeave} className={cls('mt-[2rem] rounded-full bg-white/10 px-[2rem] py-[0.9rem] text-[1.1rem] focus:bg-white focus:text-[#0a0a10]', focusRing)}>
              Choisir un autre PC
            </button>
          </div>
        </div>
      </div>
    )

  return (
    <div className="absolute inset-0 flex flex-col">
      <Backdrop src={backdrop} dim={game ? 0.25 : 0.55} />
      <Brand
        right={
          <span className="flex items-center gap-[0.8rem]">
            {st.players.map((p) => (
              <span key={p.slot} title={p.name} className="grid size-[2rem] place-items-center rounded-full font-display text-[0.8rem] font-bold text-[#0a0a10]" style={{ background: findSkin(p.model, p.skin).accent }}>
                {p.slot}
              </span>
            ))}
            <span className="flex items-center gap-[0.5rem] text-[1rem]">
              <span className="size-[0.55rem] rounded-full bg-emerald-400" /> {st.hubName}
              {st.latency ? <span className="text-white/50"> · {st.latency} ms</span> : null}
            </span>
          </span>
        }
      />
      <section className="relative z-10 min-h-0 flex-1 px-[3.4rem] pt-[2.6rem]">
        <p className="text-[0.85rem] font-semibold uppercase tracking-[0.3em] text-white/60">{game ? ({ steam: 'Steam', epic: 'Epic Games', rockstar: 'Rockstar Games', custom: 'Jeu' } as const)[game.source] : 'Écran du PC'}</p>
        <h1 key={focusId} className="animate-rise mt-[0.6rem] line-clamp-2 max-w-[42rem] font-display text-[3.6rem] font-extrabold leading-[0.95] tracking-[-0.035em] [text-wrap:balance]">{game ? game.name : 'Bureau'}</h1>
        <p className="mt-[0.8rem] text-[1.1rem] text-white/65">{game ? 'OK pour lancer le jeu et l\'afficher ici' : 'Tout l\'écran du PC, la manette pilote la souris'}</p>
      </section>
      <div className="relative z-10 pb-[1.6rem]">
        <div className="flex items-center justify-between px-[3.4rem] text-[0.85rem] font-semibold uppercase tracking-[0.25em] text-white/55">
          <span>Bibliothèque · {st.games.length}</span>
          <span className="flex items-center gap-[0.6rem] normal-case tracking-normal">
            <Gamepad2 className="size-[1.1rem]" /> {tvPads.filter((p) => p.index !== REMOTE_INDEX).length ? tvPads.filter((p) => p.index !== REMOTE_INDEX).map((p) => p.name).join(' · ') : 'Aucune manette sur la TV'}
          </span>
        </div>
        <div className="no-scrollbar flex items-end gap-[1.1rem] overflow-x-auto px-[3.4rem] py-[1.1rem]">
          <button data-nav data-nav-default onFocus={() => setFocusId('desktop')} onClick={() => onPlay({ mode: 'desktop' })} className={cls('relative flex h-[13rem] w-[19rem] shrink-0 flex-col justify-between overflow-hidden rounded-[1.2rem] bg-[linear-gradient(140deg,#2c3140,#11131a)] p-[1.3rem] text-left', focusRing)}>
            <Monitor className="size-[2.4rem]" />
            <span>
              <span className="block font-display text-[1.5rem] font-bold">Bureau</span>
              <span className="text-[0.9rem] text-white/60">Écran entier du PC</span>
            </span>
          </button>
          {st.games.map((g) => (
            <button key={g.id} data-nav onFocus={() => setFocusId(g.id)} onClick={() => onPlay({ mode: 'game', game: g })} className={cls('relative aspect-[2/3] h-[13rem] shrink-0 overflow-hidden rounded-[1.2rem] bg-white/5', focusRing)}>
              {g.art ? <img src={g.art} alt={g.name} className="h-full w-full object-cover" /> : <span className="grid h-full place-items-center p-[1rem] text-center font-display text-[1.1rem] font-bold">{g.name}</span>}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

// ----- Diffusion ------------------------------------------------------------------

function StreamScreen({ link, st, target, back, forwarding, onExit }: { link: TvLink; st: TvState; target: Target; back: React.MutableRefObject<() => void>; forwarding: React.MutableRefObject<boolean>; onExit: () => void }) {
  const video = useRef<HTMLVideoElement>(null)
  const rx = useRef<StreamReceiver | null>(null)
  const [conn, setConn] = useState<string>('waiting')
  const [hud, setHud] = useState(false)
  const [preset, setPreset] = useState<StreamPreset>(loadPrefs().preset)
  const [mode, setMode] = useState(target.mode)
  const hudRef = useRef(hud)
  hudRef.current = hud
  const live = link.demo || conn === 'connected'

  useEffect(() => {
    if (link.demo) {
      link.watch(preset, target.mode)
      return () => link.unwatch()
    }
    const r = new StreamReceiver(link, video.current!, setConn)
    rx.current = r
    r.start(preset, target.mode)
    return () => r.stop()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [link])

  // La manette joue (HUD fermé) ou navigue dans le HUD (HUD ouvert)
  useEffect(() => {
    forwarding.current = !hud
    if (hud) setTimeout(() => focusFirst(), 30)
    return () => {
      forwarding.current = false
    }
  }, [hud, forwarding])

  useEffect(() => {
    back.current = () => setHud((h) => !h)
  }, [back])

  // Envoi des manettes au PC + combinaison Start + Select (maintenue) pour ouvrir le HUD
  useEffect(() => {
    const combo = new Map<string, ReturnType<typeof setTimeout>>()
    const send = (p: TvPad) => {
      if (!p.name) return rx.current?.padOff(p.index)
      const both = (p.state.b & (BTN.START | BTN.BACK)) === (BTN.START | BTN.BACK)
      if (both && !combo.has(p.key)) combo.set(p.key, setTimeout(() => setHud(true), 800))
      if (!both && combo.has(p.key)) {
        clearTimeout(combo.get(p.key))
        combo.delete(p.key)
      }
      rx.current?.sendPad(p.index, p.name, hudRef.current ? neutralState() : p.state)
    }
    const off = pads.onChange((p) => {
      if (!hudRef.current || p.state.b === 0) send(p)
    })
    // Renvoi régulier : un paquet perdu ne laisse jamais une touche bloquée
    const keep = setInterval(() => pads.list().forEach((p) => !hudRef.current && send(p)), 100)
    return () => {
      off()
      clearInterval(keep)
      combo.forEach((t) => clearTimeout(t))
    }
  }, [])

  // Télécommande pendant la partie : croix et OK servent de manette, Retour ouvre le HUD
  useEffect(() => {
    const keys = new Set<string>()
    const map: Record<string, number> = { ArrowUp: BTN.DPAD_UP, ArrowDown: BTN.DPAD_DOWN, ArrowLeft: BTN.DPAD_LEFT, ArrowRight: BTN.DPAD_RIGHT, Enter: BTN.A }
    const emit = () => {
      let b = 0
      keys.forEach((k) => (b |= map[k]))
      pads.update('remote', 'Télécommande', { ...neutralState(), b })
    }
    const down = (e: KeyboardEvent) => {
      if (hudRef.current || !(e.key in map)) return
      e.preventDefault()
      keys.add(e.key)
      emit()
    }
    const up = (e: KeyboardEvent) => {
      // Seulement les touches enfoncées pendant la partie (pas le OK qui a lancé la diffusion)
      if (keys.delete(e.key)) emit()
    }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
      pads.remove('remote')
    }
  }, [])

  const choosePreset = (p: StreamPreset) => {
    setPreset(p)
    savePrefs({ preset: p })
    link.setPreset(p)
  }
  const toggleMode = () => {
    const m = mode === 'desktop' ? 'game' : 'desktop'
    setMode(m)
    link.setMode(m)
  }
  const s = st.stats
  const weak = !!s && (s.rtt > 80 || s.loss > 3 || (s.fps > 0 && s.fps < 24))
  const art = target.game?.hero ?? bgHub

  return (
    <div className="absolute inset-0 bg-black">
      <video ref={video} autoPlay playsInline disablePictureInPicture className="absolute inset-0 h-full w-full object-contain" />
      {link.demo && <img src={demoFrame} alt="" className="absolute inset-0 h-full w-full object-cover" />}

      {!live && (
        <div className="absolute inset-0">
          <img src={art} alt="" className="absolute inset-0 h-full w-full scale-110 object-cover opacity-40 blur-xl" />
          <div className="relative grid h-full place-items-center text-center">
            <div>
              <Loader2 className="mx-auto size-[3rem] animate-spin text-white/80" />
              <div className="mt-[1.4rem] font-display text-[2.4rem] font-bold">{target.game ? target.game.name : 'Bureau du PC'}</div>
              <div className="mt-[0.4rem] text-[1.15rem] text-white/60">{st.streamError ?? (target.game ? `Lancement sur ${st.hubName ?? 'le PC'}…` : `Connexion à ${st.hubName ?? 'le PC'}…`)}</div>
            </div>
          </div>
        </div>
      )}

      {weak && !hud && (
        <div className="absolute right-[1.6rem] top-[1.4rem] flex items-center gap-[0.5rem] rounded-full bg-black/60 px-[0.9rem] py-[0.35rem] text-[0.85rem] text-amber-200 backdrop-blur">
          <span className="size-[0.5rem] rounded-full bg-amber-300" /> Réseau faible
        </div>
      )}

      {hud && (
        <div data-nav-trap className="animate-fade absolute inset-0 bg-[linear-gradient(180deg,rgba(0,0,0,0.75)_0%,transparent_30%,transparent_45%,rgba(0,0,0,0.9)_100%)]">
          <div className="flex items-start justify-between px-[3rem] pt-[2.2rem]">
            <div>
              <div className="text-[0.85rem] font-semibold uppercase tracking-[0.3em] text-white/60">{st.hubName}</div>
              <div className="mt-[0.3rem] font-display text-[2.4rem] font-extrabold">{target.game ? target.game.name : 'Bureau'}</div>
            </div>
            {s && (
              <div className="flex gap-[2rem] text-right">
                {[
                  ['Image', `${s.h}p · ${Math.round(s.fps)} i/s`],
                  ['Débit', `${(s.kbps / 1000).toFixed(1)} Mb/s`],
                  ['Latence', `${s.rtt} ms`],
                ].map(([k, v]) => (
                  <div key={k}>
                    <div className="text-[0.8rem] text-white/50">{k}</div>
                    <div className="font-display text-[1.4rem] font-semibold tabular-nums">{v}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="absolute inset-x-0 bottom-[2.6rem] px-[3rem]">
            <div className="text-[0.85rem] font-semibold uppercase tracking-[0.25em] text-white/55">Qualité</div>
            <div className="mt-[0.8rem] flex items-stretch gap-[0.9rem]">
              {PRESETS.map((p) => (
                <button key={p.id} data-nav data-nav-default={p.id === preset ? '' : undefined} onClick={() => choosePreset(p.id)} className={cls('w-[10.5rem] rounded-[1.1rem] px-[1.2rem] py-[0.9rem] text-left', focusRing, p.id === preset ? 'bg-white text-[#0a0a10]' : 'bg-white/10 focus:bg-white/25')}>
                  <span className="block font-display text-[1.25rem] font-bold">{p.label}</span>
                  <span className="block whitespace-nowrap text-[0.85rem] opacity-60">{p.sub}</span>
                </button>
              ))}
              <span className="mx-[0.6rem] w-px self-center bg-white/20 py-[1.6rem]" />
              <button data-nav onClick={toggleMode} className={cls('flex items-center gap-[0.7rem] rounded-[1.1rem] bg-white/10 px-[1.4rem] text-[1.1rem] focus:bg-white/25', focusRing)}>
                {mode === 'desktop' ? <MousePointer2 className="size-[1.4rem]" /> : <Gamepad2 className="size-[1.4rem]" />}
                {mode === 'desktop' ? 'Souris' : 'Manette'}
              </button>
              <button data-nav onClick={onExit} className={cls('ml-auto flex items-center gap-[0.6rem] self-center rounded-full bg-rose-500 px-[1.6rem] py-[1rem] font-display text-[1.1rem] font-semibold', focusRing)}>
                <Tv className="size-[1.3rem]" /> Quitter
              </button>
            </div>
            <p className="mt-[1.2rem] text-[0.95rem] text-white/50">
              {mode === 'desktop' ? 'Souris : stick gauche pour déplacer, A clic, B clic droit, stick droit pour défiler.' : 'Retour pour reprendre · Start + Select maintenus pour ce menu.'}
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
