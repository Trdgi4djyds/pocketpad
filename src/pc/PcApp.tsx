import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import QRCode from 'qrcode'
import { Activity, Bluetooth, Cable, Download, Gamepad2, Globe, MousePointer2, Play, Plus, RefreshCw, ShieldAlert, ShieldCheck, Trash2, Tv, Usb, Vibrate, Wifi, X } from 'lucide-react'
import bgHub from './assets/bg-hub.webp'
import { ControllerPhoto } from '../shared/ControllerPhoto'
import { findSkin, getModel } from '../shared/catalog'
import { BTN, type GameEntry } from '../shared/protocol'
import { alpha } from '../shared/color'
import { cls } from '../shared/cls'
import type { HubApi, HubPlayer, HubSnapshot, HubViewer } from './types'
import { useHub } from './useHub'

const REPO = 'https://github.com/Trdgi4djyds/pocketpad'
const TV_APK = `${REPO}/releases/latest/download/PocketPad-TV.apk`
type Tab = 'players' | 'games' | 'tv' | 'connect'
const TABS: Array<{ id: Tab; label: string }> = [
  { id: 'players', label: 'Manettes' },
  { id: 'games', label: 'Jeux' },
  { id: 'tv', label: 'TV' },
  { id: 'connect', label: 'Connexion' },
]

const TRANSPORT: Record<string, { label: string; icon: typeof Wifi }> = {
  usb: { label: 'USB', icon: Usb },
  wifi: { label: 'Wi-Fi', icon: Wifi },
  browser: { label: 'Navigateur', icon: Wifi },
  internet: { label: 'Internet', icon: Globe },
  bluetooth: { label: 'Bluetooth', icon: Bluetooth },
  tv: { label: 'TV', icon: Tv },
}

const SOURCE: Record<string, string> = { steam: 'Steam', epic: 'Epic Games', rockstar: 'Rockstar', custom: 'Ajouté' }

/** Logiciel PC « PocketPad Hub » : manettes virtuelles, bibliothèque de jeux et diffusion vers la TV. */
export function PcApp() {
  const { snap, api } = useHub()
  const [tab, setTab] = useState<Tab>(() => (TABS.some((t) => t.id === location.hash.slice(1)) ? (location.hash.slice(1) as Tab) : 'players'))
  const [focus, setFocus] = useState<string | null>(null)
  const [game, setGame] = useState<string | null>(null)
  if (!snap) return <div className="grid h-full place-items-center bg-[#06070a] text-white/50">Démarrage de PocketPad Hub…</div>

  const focused = snap.players.find((p) => p.id === focus) ?? snap.players[0] ?? null
  const selectedGame = snap.games.find((g) => g.id === game) ?? snap.games[0] ?? null
  const accent = tab === 'players' && focused ? findSkin(focused.model, focused.skin).accent : '#8b5cf6'
  const backdrop = tab === 'games' && selectedGame?.hero ? selectedGame.hero : bgHub
  const go = (t: Tab) => {
    setTab(t)
    history.replaceState(null, '', `#${t}`)
  }

  return (
    <div className="relative h-full w-full overflow-hidden bg-[#06070a] text-white">
      <img key={backdrop} src={backdrop} alt="" className={cls('animate-fade pointer-events-none absolute inset-0 h-full w-full object-cover', tab === 'games' ? 'opacity-70' : 'scale-110 opacity-45 blur-[10px]')} />
      <div className="pointer-events-none absolute inset-0 transition-[background] duration-700" style={{ background: `radial-gradient(60% 70% at 72% 40%, ${alpha(accent, 0.28)}, transparent 70%)` }} />
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(90deg,rgba(6,7,10,0.92)_0%,rgba(6,7,10,0.55)_45%,rgba(6,7,10,0.3)_100%)]" />
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(6,7,10,0.7)_0%,transparent_22%,transparent_55%,rgba(6,7,10,0.96)_100%)]" />

      <div className="relative z-10 flex h-full flex-col px-10 pb-8 pt-7">
        <TopBar snap={snap} tab={tab} setTab={go} />
        <Toasts snap={snap} />
        <div className="relative mt-2 min-h-0 flex-1">
          {tab === 'players' && <PlayersView snap={snap} api={api} focused={focused} setFocus={setFocus} goConnect={() => go('connect')} />}
          {tab === 'games' && <GamesView snap={snap} api={api} selected={selectedGame} select={setGame} />}
          {tab === 'tv' && <TvView snap={snap} api={api} />}
          {tab === 'connect' && <ConnectView snap={snap} api={api} />}
        </div>
      </div>
    </div>
  )
}

function TopBar({ snap, tab, setTab }: { snap: HubSnapshot; tab: Tab; setTab: (t: Tab) => void }) {
  const [time, setTime] = useState(() => new Date())
  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 10000)
    return () => clearInterval(t)
  }, [])
  const usb = snap.adb.devices.filter((d) => d.reversed).length
  const streaming = snap.viewers.filter((v) => v.watching).length
  return (
    <header className="flex items-center justify-between gap-6">
      <div className="flex items-center gap-3">
        <div className="grid size-11 place-items-center rounded-full bg-white text-[#0a0a10] shadow-[0_8px_30px_-8px_rgba(255,255,255,0.6)]">
          <Gamepad2 className="size-5" strokeWidth={2.2} />
        </div>
        <div className="leading-tight">
          <div className="flex items-center gap-2">
            <span className="font-display text-[15px] font-bold">PocketPad Hub</span>
            <span className="rounded-[4px] border border-white/40 px-1.5 text-[9px] font-bold uppercase tracking-[0.18em] text-white/80">{snap.demo ? 'Démo' : `v${snap.version}`}</span>
          </div>
          <div className="text-xs text-white/55">{snap.hostname}</div>
        </div>
      </div>
      <nav className="flex items-center gap-1 rounded-full bg-black/25 p-1 backdrop-blur-md">
        {TABS.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)} className={cls('rounded-full px-5 py-1.5 text-[13px] font-medium transition', tab === t.id ? 'bg-white text-[#0a0a10]' : 'text-white/65 hover:text-white')}>
            {t.label}
          </button>
        ))}
      </nav>
      <div className="flex items-center gap-4 text-white/80">
        {streaming > 0 && (
          <span title="Diffusion vers la TV" className="flex items-center gap-1.5 rounded-full bg-rose-500/90 px-2.5 py-0.5 text-[11px] font-semibold text-white">
            <span className="size-1.5 animate-pulse rounded-full bg-white" /> EN DIRECT
          </span>
        )}
        <span title="Téléphones USB" className="flex items-center gap-1.5 text-xs">
          <Usb className="size-4" /> {usb}
        </span>
        <span title="Serveur Wi-Fi" className="flex items-center gap-1.5 text-xs">
          <Wifi className="size-4" /> {snap.port}
        </span>
        <span title="Pilote ViGEmBus" className={cls('flex items-center gap-1.5 text-xs', snap.driver.connected ? 'text-emerald-300' : 'text-amber-300')}>
          {snap.driver.connected ? <ShieldCheck className="size-4" /> : <ShieldAlert className="size-4" />} ViGEm
        </span>
        <span className="font-display text-[15px] font-semibold tabular-nums text-white">{time.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</span>
      </div>
    </header>
  )
}

function Toasts({ snap }: { snap: HubSnapshot }) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])
  // Seulement les événements des 8 dernières secondes
  const recent = snap.logs.filter((l) => now - l.ts < 8000).slice(0, 2)
  return (
    <div className="pointer-events-none absolute right-10 top-24 z-30 flex w-80 flex-col gap-2">
      {recent.map((l, i) => (
        <div key={`${l.ts}-${i}`} className="animate-rise flex items-center gap-3 rounded-xl border border-white/10 bg-[#1b1d24]/90 px-3 py-2.5 shadow-xl backdrop-blur-xl">
          <span className={cls('grid size-8 shrink-0 place-items-center rounded-lg', l.level === 'success' ? 'bg-emerald-500/20 text-emerald-300' : l.level === 'warn' || l.level === 'error' ? 'bg-amber-500/20 text-amber-200' : 'bg-white/10 text-white/80')}>
            <Gamepad2 className="size-4" />
          </span>
          <span className="min-w-0 flex-1 text-[12px] leading-snug text-white/85">{l.msg}</span>
        </div>
      ))}
    </div>
  )
}

const ago = (ts: number) => {
  const m = Math.round((Date.now() - ts) / 60000)
  return m < 1 ? 'maintenant' : m < 60 ? `${m} min` : `${Math.round(m / 60)} h`
}

// ----- Manettes ------------------------------------------------------------------

function PlayersView({ snap, api, focused, setFocus, goConnect }: { snap: HubSnapshot; api: HubApi; focused: HubPlayer | null; setFocus: (id: string) => void; goConnect: () => void }) {
  const slots = [1, 2, 3, 4].map((n) => snap.players.find((p) => p.slot === n) ?? null)
  return (
    <div className="flex h-full flex-col">
      {!snap.driver.connected && (
        <div className="relative z-20 mb-4 flex items-center gap-3 rounded-2xl border border-amber-300/30 bg-amber-400/10 px-4 py-3 text-sm text-amber-100 backdrop-blur-md">
          <ShieldAlert className="size-5 shrink-0" />
          <span className="flex-1">Pilote ViGEmBus absent : les jeux ne verront pas les manettes.</span>
          {snap.platform === 'win32' && (
            <button onClick={() => api.installDriver()} className="rounded-full bg-amber-200 px-4 py-1.5 text-xs font-semibold text-[#1a1405]">
              Installer
            </button>
          )}
        </div>
      )}
      <div className="relative min-h-0 flex-1">{focused ? <Hero p={focused} api={api} /> : <EmptyHero snap={snap} />}</div>
      <div className="mt-6 flex items-end gap-4">
        {slots.map((p, i) => (p ? <PlayerTile key={p.id} p={p} active={focused?.id === p.id} onClick={() => setFocus(p.id)} /> : <EmptyTile key={i} n={i + 1} onClick={goConnect} />))}
        <ConnectTile snap={snap} onClick={goConnect} />
      </div>
    </div>
  )
}

function Hero({ p, api }: { p: HubPlayer; api: HubApi }) {
  const model = getModel(p.model)
  const skin = findSkin(p.model, p.skin)
  const T = TRANSPORT[p.transport] ?? TRANSPORT.wifi
  const s = p.state
  const fitRef = useRef<HTMLDivElement>(null)
  const [box, setBox] = useState({ w: 0, h: 0 })
  useLayoutEffect(() => {
    const el = fitRef.current
    if (!el) return
    const ro = new ResizeObserver(() => setBox({ w: el.clientWidth, h: el.clientHeight }))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const photoW = Math.max(0, Math.min(box.w, (box.h - 44) / skin.ratio))
  const chip = (on: boolean, label: string) => (
    <span className={cls('rounded-md px-2 py-0.5 font-display text-[11px] font-semibold transition', on ? 'text-[#0a0a10]' : 'bg-white/10 text-white/55')} style={on ? { background: skin.accent, boxShadow: `0 0 16px ${skin.accent}` } : undefined}>
      {label}
    </span>
  )
  const action = 'flex items-center gap-1.5 whitespace-nowrap rounded-full border border-white/15 px-4 py-2 text-xs text-white/75 transition hover:bg-white/10 hover:text-white'
  return (
    <div className="absolute inset-0 flex items-center">
      <div className="relative z-10 w-[40%] min-w-[540px] self-end pb-2">
        <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-white/60">
          <span className="rounded px-1.5 py-0.5 text-[#0a0a10]" style={{ background: skin.accent }}>
            P{p.slot}
          </span>
          {model.family}
        </div>
        <h1 className="mt-3 line-clamp-2 font-display text-[60px] font-extrabold leading-[0.92] tracking-[-0.03em]">{p.name}</h1>
        <p className="mt-2 text-lg text-white/75">
          {model.name} · <span style={{ color: skin.accent }}>{skin.name}</span>
        </p>
        <dl className="mt-6 flex gap-8">
          {[
            ['Connexion', T.label],
            ['Latence', p.latency != null ? `${p.latency} ms` : '—'],
            ['Windows voit', p.virtual ? (p.out === 'ds4' ? 'DualShock 4' : 'Xbox 360') : 'Aucune'],
          ].map(([k, v]) => (
            <div key={k}>
              <dt className="text-[11px] text-white/50">{k}</dt>
              <dd className="mt-0.5 font-display text-[17px] font-semibold">{v}</dd>
            </div>
          ))}
        </dl>
        <div className="mt-6 flex flex-wrap items-center gap-2.5">
          <div className="flex rounded-full border border-white/15 bg-black/35 p-1 text-xs backdrop-blur-md">
            {(['x360', 'ds4'] as const).map((o) => (
              <button key={o} onClick={() => api.setOutput(p.id, o)} className={cls('whitespace-nowrap rounded-full px-4 py-1.5 transition', p.out === o ? 'bg-white text-[#0a0a10]' : 'text-white/65 hover:text-white')}>
                {o === 'x360' ? 'Xbox 360' : 'DualShock 4'}
              </button>
            ))}
          </div>
          <button onClick={() => api.testRumble(p.id)} className={action}>
            <Vibrate className="size-3.5" /> Vibrer
          </button>
          <button onClick={() => api.testController()} className={action}>
            <Gamepad2 className="size-3.5" /> Tester
          </button>
          <button onClick={() => api.kick(p.id)} className={action}>
            <X className="size-3.5" /> Déconnecter
          </button>
        </div>
        {!p.virtual && <p className="mt-3 text-xs text-amber-200/85">Manette virtuelle inactive : installez le pilote ViGEmBus.</p>}
        {p.virtual && p.out === 'ds4' && <p className="mt-3 max-w-md text-xs text-amber-200/85">La plupart des jeux PC attendent une manette Xbox : préférez « Xbox 360 ».</p>}
      </div>
      <div ref={fitRef} className="absolute bottom-[2%] right-[1%] flex h-[88%] w-[58%] flex-col items-center justify-end">
        <div className="relative" style={{ width: photoW }}>
          <div className="pointer-events-none absolute bottom-[-4%] left-1/2 h-[14%] w-[70%] -translate-x-1/2 rounded-[50%] bg-black/70 blur-2xl" />
          <ControllerPhoto key={skin.id} skin={skin} state={p.state} shadow className="animate-pop relative w-full" alt={`${model.name} ${skin.name}`} />
        </div>
        <div className="mt-4 flex shrink-0 justify-center gap-2">
          {!model.noTriggers && chip(s.lt > 0.5, model.labels.lt)}
          {!model.noLB && chip((s.b & BTN.LB) !== 0, model.labels.lb)}
          {chip((s.b & BTN.RB) !== 0, model.labels.rb)}
          {!model.noTriggers && chip(s.rt > 0.5, model.labels.rt)}
        </div>
      </div>
    </div>
  )
}

function EmptyHero({ snap }: { snap: HubSnapshot }) {
  const qr = useQr(`http://${snap.addresses[0] ?? '127.0.0.1'}:${snap.port}`)
  return (
    <div className="absolute inset-0 flex items-center justify-between gap-10">
      <div className="max-w-xl">
        <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-white/55">
          <span className="size-2 rounded-full bg-emerald-400" /> Prêt · {snap.addresses[0] ?? '127.0.0.1'}
        </div>
        <h1 className="mt-3 font-display text-[64px] font-extrabold leading-[0.94] tracking-[-0.035em]">Votre téléphone devient une manette.</h1>
        <p className="mt-4 text-lg text-white/60">Ouvrez PocketPad : ce PC apparaît tout seul en Wi-Fi, ou branchez le câble USB.</p>
      </div>
      {qr && (
        <div className="shrink-0 rounded-3xl bg-white p-4 shadow-2xl">
          <img src={qr} alt="QR code de connexion" className="size-52" />
          <div className="mt-2 text-center text-xs font-medium text-black/55">Jouer depuis le navigateur</div>
        </div>
      )}
    </div>
  )
}

function PlayerTile({ p, active, onClick }: { p: HubPlayer; active: boolean; onClick: () => void }) {
  const skin = findSkin(p.model, p.skin)
  const T = TRANSPORT[p.transport] ?? TRANSPORT.wifi
  return (
    <button
      onClick={onClick}
      className={cls('group relative h-[150px] w-[220px] shrink-0 overflow-hidden rounded-2xl text-left transition duration-200', active ? 'scale-[1.06] ring-[3px] ring-white' : 'ring-1 ring-white/10 hover:ring-white/40')}
      style={{ background: skin.tone === 'light' ? `radial-gradient(80% 90% at 50% 40%, #ffffff, ${skin.studio})` : `radial-gradient(80% 90% at 50% 40%, ${alpha(skin.accent, 0.35)}, ${skin.studio} 70%)` }}
    >
      <ControllerPhoto skin={skin} state={p.state} className="absolute left-1/2 top-[44%] w-[82%] -translate-x-1/2 -translate-y-1/2 transition group-hover:scale-105" />
      <div className="absolute inset-x-0 bottom-0 flex items-center justify-between bg-gradient-to-t from-black/85 via-black/55 to-transparent px-3 pb-2 pt-6">
        <span className="min-w-0">
          <span className="block truncate font-display text-sm font-semibold text-white">{p.name}</span>
          <span className="flex items-center gap-1 text-[10px] text-white/70">
            <T.icon className="size-3" /> {T.label}
            {p.latency != null && ` · ${p.latency} ms`}
          </span>
        </span>
        <span className="rounded px-1.5 py-0.5 font-display text-[10px] font-bold text-[#0a0a10]" style={{ background: skin.accent }}>
          P{p.slot}
        </span>
      </div>
    </button>
  )
}

function EmptyTile({ n, onClick }: { n: number; onClick: () => void }) {
  return (
    <button onClick={onClick} className="grid h-[150px] w-[220px] shrink-0 place-items-center rounded-2xl border border-dashed border-white/20 bg-black/25 text-center backdrop-blur-md transition hover:border-white/50">
      <span>
        <Plus className="mx-auto size-6 text-white/45" />
        <span className="mt-2 block font-display text-sm font-semibold text-white/60">P{n}</span>
      </span>
    </button>
  )
}

function ConnectTile({ snap, onClick }: { snap: HubSnapshot; onClick: () => void }) {
  return (
    <button onClick={onClick} className="relative ml-auto flex h-[150px] w-[280px] shrink-0 items-end overflow-hidden rounded-2xl bg-gradient-to-br from-[#2b2f3a] to-[#121419] p-4 text-left ring-1 ring-white/10 transition hover:ring-white/40">
      <Wifi className="absolute right-4 top-4 size-12 text-white/12" />
      <span>
        <span className="block text-[11px] uppercase tracking-[0.18em] text-white/50">Adresse du PC</span>
        <span className="mt-1 block font-display text-2xl font-bold">{snap.addresses[0] ?? '127.0.0.1'}</span>
        <span className="block text-xs text-white/55">PIN {snap.pin}</span>
      </span>
    </button>
  )
}

function useQr(url: string) {
  const [qr, setQr] = useState('')
  useEffect(() => {
    QRCode.toDataURL(url, { margin: 1, width: 420, color: { dark: '#0a0a10', light: '#ffffff' } }).then(setQr).catch(() => setQr(''))
  }, [url])
  return qr
}

function Glass({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cls('rounded-3xl border border-white/10 bg-[#14161c]/72 p-6 backdrop-blur-2xl', className)}>{children}</div>
}

// ----- Jeux ----------------------------------------------------------------------

function Cover({ g, className }: { g: GameEntry & { icon?: string }; className?: string }) {
  const [failed, setFailed] = useState(false)
  if (g.art && !failed) return <img src={g.art} alt={g.name} draggable={false} onError={() => setFailed(true)} className={cls('h-full w-full object-cover', className)} />
  // Jeu sans jaquette : tuile générée
  const hue = [...g.name].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7)
  return (
    <div className={cls('flex h-full w-full flex-col items-center justify-center gap-3 p-4 text-center', className)} style={{ background: `linear-gradient(160deg, hsl(${hue} 55% 34%), hsl(${(hue + 40) % 360} 60% 14%))` }}>
      {g.icon ? <img src={g.icon} alt="" className="size-12" /> : <Gamepad2 className="size-10 text-white/70" />}
      <span className="font-display text-base font-bold leading-tight">{g.name}</span>
    </div>
  )
}

function GamesView({ snap, api, selected, select }: { snap: HubSnapshot; api: HubApi; selected: (GameEntry & { icon?: string }) | null; select: (id: string) => void }) {
  const [launching, setLaunching] = useState<string | null>(null)
  const launch = async (g: GameEntry) => {
    setLaunching(g.id)
    await api.launchGame(g.id)
    setTimeout(() => setLaunching(null), 2500)
  }
  if (!snap.games.length)
    return (
      <div className="absolute inset-0 grid place-items-center text-center">
        <div>
          <Gamepad2 className="mx-auto size-12 text-white/30" />
          <h2 className="mt-4 font-display text-3xl font-bold">Aucun jeu trouvé</h2>
          <p className="mt-2 text-white/55">Steam, Epic Games et Rockstar sont détectés automatiquement.</p>
          <div className="mt-6 flex justify-center gap-3">
            <button onClick={() => api.addGame()} className="flex items-center gap-2 rounded-full bg-white px-6 py-3 font-display text-sm font-semibold text-[#0a0a10]">
              <Plus className="size-4" /> Ajouter un jeu
            </button>
            <button onClick={() => api.refreshGames()} className="flex items-center gap-2 rounded-full border border-white/20 px-6 py-3 text-sm">
              <RefreshCw className="size-4" /> Actualiser
            </button>
          </div>
        </div>
      </div>
    )
  return (
    <div className="absolute inset-0 flex flex-col">
      {selected && (
        <section className="relative flex min-h-0 flex-1 items-end pb-8">
          <div key={selected.id} className="animate-rise max-w-2xl">
            <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/55">{SOURCE[selected.source] ?? 'Jeu'}</div>
            <h1 className="mt-2 font-display text-[64px] font-extrabold leading-[0.92] tracking-[-0.035em] [text-wrap:balance]">{selected.name}</h1>
            <div className="mt-6 flex items-center gap-3">
              <button onClick={() => launch(selected)} className="flex items-center gap-2.5 rounded-full bg-white py-3.5 pl-6 pr-8 font-display text-base font-semibold text-[#0a0a10] shadow-[0_16px_40px_-14px_rgba(255,255,255,0.7)] transition hover:scale-[1.03] active:scale-95">
                <Play className="size-4 fill-current" /> {launching === selected.id ? 'Lancement…' : 'Jouer'}
              </button>
              {selected.source === 'custom' && (
                <button aria-label="Retirer" onClick={() => api.removeGame(selected.id)} className="grid size-12 place-items-center rounded-full border border-white/20 text-white/70 hover:bg-white/10">
                  <Trash2 className="size-4" />
                </button>
              )}
              <span className="ml-2 text-sm text-white/50">Ou depuis la TV, avec PocketPad TV.</span>
            </div>
          </div>
        </section>
      )}
      <div className="flex items-center justify-between pb-3">
        <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-white/50">Bibliothèque · {snap.games.length}</span>
        <div className="flex gap-2">
          <button onClick={() => api.addGame()} className="flex items-center gap-1.5 rounded-full border border-white/15 px-4 py-1.5 text-xs text-white/80 hover:bg-white/10">
            <Plus className="size-3.5" /> Ajouter
          </button>
          <button aria-label="Actualiser" onClick={() => api.refreshGames()} className="grid size-8 place-items-center rounded-full border border-white/15 text-white/80 hover:bg-white/10">
            <RefreshCw className="size-3.5" />
          </button>
        </div>
      </div>
      <div className="no-scrollbar -mx-2 flex gap-4 overflow-x-auto px-2 pb-2 pt-2">
        {snap.games.map((g) => {
          const active = selected?.id === g.id
          return (
            <button
              key={g.id}
              onClick={() => select(g.id)}
              onDoubleClick={() => launch(g)}
              className={cls('group relative aspect-[2/3] h-[248px] shrink-0 overflow-hidden rounded-2xl bg-white/5 transition duration-200', active ? 'scale-[1.05] ring-[3px] ring-white shadow-[0_20px_50px_-15px_rgba(0,0,0,0.9)]' : 'ring-1 ring-white/10 hover:ring-white/40')}
            >
              <Cover g={g} className="transition duration-300 group-hover:scale-105" />
              {active && (
                <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-3 pt-10 text-left font-display text-sm font-semibold">{g.name}</span>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ----- TV ------------------------------------------------------------------------

const PRESET_LABEL: Record<string, string> = { auto: 'Auto', smooth: 'Fluide', quality: 'Qualité', eco: 'Réseau faible' }

function TvView({ snap, api }: { snap: HubSnapshot; api: HubApi }) {
  const qr = useQr(TV_APK)
  return (
    <div className="absolute inset-0 flex items-center gap-8">
      <div className="w-[440px] shrink-0">
        <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/55">PocketPad TV</div>
        <h1 className="mt-3 font-display text-[56px] font-extrabold leading-[0.94] tracking-[-0.035em] [text-wrap:balance]">Vos jeux PC, sur la TV.</h1>
        <p className="mt-4 text-lg text-white/60">Installez l'application sur Android TV ou Google TV : elle trouve ce PC et diffuse l'écran en direct.</p>
        <div className="mt-6 flex items-center gap-4">
          {qr && <img src={qr} alt="QR code de téléchargement de PocketPad TV" className="size-28 rounded-2xl bg-white p-2" />}
          <div className="grid gap-2">
            <button onClick={() => api.openExternal(TV_APK)} className="flex items-center gap-2 rounded-full bg-white px-5 py-2.5 font-display text-sm font-semibold text-[#0a0a10]">
              <Download className="size-4" /> PocketPad-TV.apk
            </button>
            <span className={cls('flex items-center gap-2 text-xs', snap.stream.ready ? 'text-emerald-300' : 'text-white/45')}>
              <span className={cls('size-1.5 rounded-full', snap.stream.ready ? 'bg-emerald-400' : 'bg-white/30')} /> {snap.stream.ready ? 'Diffusion prête' : 'Diffusion en préparation…'}
            </span>
          </div>
        </div>
      </div>
      <div className="grid min-w-0 flex-1 gap-4">
        {snap.viewers.length === 0 && (
          <Glass className="grid h-64 place-items-center text-center">
            <div>
              <Tv className="mx-auto size-10 text-white/30" />
              <div className="mt-3 font-display text-xl font-semibold text-white/80">Aucune TV connectée</div>
              <div className="mt-1 text-sm text-white/45">Même réseau Wi-Fi que ce PC.</div>
            </div>
          </Glass>
        )}
        {snap.viewers.map((v) => (
          <ViewerCard key={v.id} v={v} />
        ))}
      </div>
    </div>
  )
}

function ViewerCard({ v }: { v: HubViewer }) {
  const st = v.stats
  const stats: Array<[string, string]> = st
    ? [
        ['Image', `${st.h}p · ${Math.round(st.fps)} i/s`],
        ['Débit', `${(st.kbps / 1000).toFixed(1)} Mb/s`],
        ['Latence', `${Math.round(st.rtt)} ms`],
        ['Codec', st.codec],
      ]
    : []
  return (
    <Glass className="p-5">
      <div className="flex items-center gap-4">
        <span className="grid size-12 place-items-center rounded-2xl bg-white/10">
          <Tv className="size-6" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate font-display text-xl font-semibold">{v.name}</div>
          <div className="text-xs text-white/50">
            {v.address} · connectée depuis {ago(v.connectedAt)}
          </div>
        </div>
        {v.watching ? (
          <span className="flex items-center gap-1.5 rounded-full bg-rose-500/90 px-3 py-1 text-[11px] font-semibold">
            <span className="size-1.5 animate-pulse rounded-full bg-white" /> En direct
          </span>
        ) : (
          <span className="rounded-full bg-white/10 px-3 py-1 text-[11px] text-white/70">Connectée</span>
        )}
      </div>
      {v.watching && (
        <div className="mt-5 flex flex-wrap items-end gap-x-8 gap-y-3">
          {stats.map(([k, val]) => (
            <div key={k}>
              <div className="text-[11px] text-white/45">{k}</div>
              <div className="font-display text-lg font-semibold tabular-nums">{val}</div>
            </div>
          ))}
          <div className="ml-auto flex items-center gap-2 text-xs text-white/60">
            {v.mode === 'desktop' ? <MousePointer2 className="size-4" /> : <Gamepad2 className="size-4" />}
            {v.mode === 'desktop' ? 'Bureau (souris)' : `Jeu · ${v.pads} manette${v.pads > 1 ? 's' : ''}`} · {PRESET_LABEL[v.preset] ?? v.preset}
          </div>
        </div>
      )}
    </Glass>
  )
}

// ----- Connexion -----------------------------------------------------------------

function ConnectView({ snap, api }: { snap: HubSnapshot; api: HubApi }) {
  const ip = snap.addresses[0] ?? '127.0.0.1'
  const qr = useQr(`http://${ip}:${snap.port}`)
  const d = snap.driver
  const logs = useMemo(() => snap.logs.slice(0, 6), [snap.logs])
  return (
    <div className="absolute inset-0 flex items-center gap-6 py-2">
      <Glass className="flex w-[360px] shrink-0 flex-col items-center justify-center py-8 text-center">
        {qr ? <img src={qr} alt={`QR code http://${ip}:${snap.port}`} className="size-56 rounded-2xl bg-white p-3" /> : <div className="size-56" />}
        <div className="mt-5 font-display text-3xl font-bold">{ip}</div>
        <div className="text-sm text-white/55">port {snap.port}</div>
        <div className="mt-5 flex w-full items-center justify-between rounded-2xl bg-black/30 px-5 py-3">
          <div className="text-left">
            <div className="text-[10px] uppercase tracking-[0.18em] text-white/45">PIN · Internet</div>
            <div className="font-display text-3xl font-bold tracking-[0.35em]">{snap.pin}</div>
          </div>
          <button aria-label="Nouveau code PIN" onClick={() => api.regeneratePin()} className="grid size-10 place-items-center rounded-full bg-white/10 hover:bg-white/20">
            <RefreshCw className="size-4" />
          </button>
        </div>
        <button onClick={() => api.allowFirewall()} className="mt-4 rounded-full border border-white/20 px-4 py-2 text-xs font-medium text-white/85 hover:bg-white/10">
          Autoriser dans le pare-feu
        </button>
      </Glass>
      <div className="grid min-w-0 flex-1 grid-cols-2 content-center gap-4">
        <Glass className="p-5">
          <CardTitle icon={d.connected ? ShieldCheck : ShieldAlert} ok={d.connected} title="Pilote ViGEmBus" status={d.connected ? 'Actif' : 'Absent'} />
          <p className="mt-3 text-sm text-white/60">{d.connected ? 'Chaque manette apparaît dans Windows comme une vraie Xbox 360 : tous les jeux la reconnaissent.' : 'Indispensable pour que les jeux voient les manettes.'}</p>
          <div className="mt-4 flex gap-2">
            {!d.connected && snap.platform === 'win32' && (
              <button onClick={() => api.installDriver()} className="rounded-full bg-white px-4 py-1.5 text-xs font-semibold text-[#0a0a10]">
                Installer
              </button>
            )}
            <button onClick={() => api.testController()} className="rounded-full border border-white/20 px-4 py-1.5 text-xs text-white/85 hover:bg-white/10">
              Tester dans Windows
            </button>
          </div>
        </Glass>
        <Glass className="p-5">
          <CardTitle icon={Cable} ok={snap.adb.devices.some((x) => x.reversed)} title="Câble USB" status={snap.adb.devices.some((x) => x.reversed) ? 'Tunnel actif' : snap.adb.available ? 'En attente' : 'ADB absent'} />
          <div className="mt-3 grid gap-2">
            {snap.adb.devices.length === 0 && <p className="text-sm text-white/55">Activez le débogage USB sur le téléphone, puis branchez-le.</p>}
            {snap.adb.devices.slice(0, 2).map((dev) => (
              <div key={dev.serial} className="flex items-center justify-between rounded-xl bg-black/30 px-3 py-2 text-sm">
                <span className="truncate">{dev.model ?? dev.serial}</span>
                <span className={cls('text-[11px]', dev.reversed ? 'text-emerald-300' : 'text-amber-200')}>{dev.reversed ? 'Actif' : dev.state === 'unauthorized' ? 'Autorisez sur le téléphone' : dev.state}</span>
              </div>
            ))}
          </div>
        </Glass>
        <Glass className="p-5">
          <CardTitle icon={Bluetooth} ok={snap.bt.enabled && snap.bt.available} title="Relais Bluetooth" status={!snap.bt.available ? 'Indisponible' : snap.bt.enabled ? 'Activé' : 'Désactivé'} />
          <p className="mt-3 text-sm text-white/60">Le téléphone appairé en Bluetooth devient aussi une manette Xbox 360, reconnue par tous les jeux.</p>
          <button
            disabled={!snap.bt.available}
            onClick={() => api.setBluetoothBridge(!snap.bt.enabled)}
            className={cls('mt-4 rounded-full px-4 py-1.5 text-xs font-semibold disabled:opacity-40', snap.bt.enabled ? 'border border-white/20 text-white/85 hover:bg-white/10' : 'bg-white text-[#0a0a10]')}
          >
            {snap.bt.enabled ? 'Désactiver' : 'Activer'}
          </button>
        </Glass>
        <Glass className="overflow-hidden p-5">
          <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-white/50">
            <Activity className="size-4" /> Activité
          </div>
          <ul className="mt-3 grid gap-2">
            {logs.map((l, i) => (
              <li key={`${l.ts}-${i}`} className="flex items-center gap-3 text-[13px]">
                <span className="w-11 shrink-0 tabular-nums text-white/40">{new Date(l.ts).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</span>
                <span className={cls('size-1.5 shrink-0 rounded-full', l.level === 'success' ? 'bg-emerald-400' : l.level === 'warn' ? 'bg-amber-400' : l.level === 'error' ? 'bg-rose-500' : 'bg-white/35')} />
                <span className="truncate text-white/80">{l.msg}</span>
              </li>
            ))}
          </ul>
        </Glass>
      </div>
    </div>
  )
}

function CardTitle({ icon: Icon, ok, title, status }: { icon: typeof Wifi; ok: boolean; title: string; status: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className={cls('grid size-10 place-items-center rounded-2xl', ok ? 'bg-emerald-400/15 text-emerald-300' : 'bg-white/10 text-white/75')}>
        <Icon className="size-5" />
      </span>
      <span className="font-display text-lg font-semibold">{title}</span>
      <span className={cls('ml-auto rounded-full px-2.5 py-0.5 text-[11px]', ok ? 'bg-emerald-400/15 text-emerald-300' : 'bg-white/10 text-white/60')}>{status}</span>
    </div>
  )
}

