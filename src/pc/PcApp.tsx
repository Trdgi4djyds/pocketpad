import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import QRCode from 'qrcode'
import { Activity, Bluetooth, Cpu, Gamepad2, Globe, Plus, QrCode, RefreshCw, ShieldAlert, ShieldCheck, Usb, Wifi, X } from 'lucide-react'
import bgHub from './assets/bg-hub.webp'
import { ControllerPhoto } from '../shared/ControllerPhoto'
import { findSkin, getModel } from '../shared/catalog'
import { BTN } from '../shared/protocol'
import { alpha } from '../shared/color'
import { cls } from '../shared/cls'
import type { HubApi, HubPlayer, HubSnapshot } from './types'
import { useHub } from './useHub'

const REPO = 'https://github.com/Trdgi4djyds/pocketpad'
type Tab = 'players' | 'connect' | 'driver' | 'journal'

const TRANSPORT: Record<string, { label: string; icon: typeof Wifi }> = {
  usb: { label: 'Câble USB', icon: Usb },
  wifi: { label: 'Wi-Fi', icon: Wifi },
  browser: { label: 'Navigateur', icon: Wifi },
  internet: { label: 'Internet', icon: Globe },
  bluetooth: { label: 'Bluetooth', icon: Bluetooth },
}

/** Logiciel PC « PocketPad Hub » : reçoit les téléphones et crée de vraies manettes Windows. */
export function PcApp() {
  const { snap, api } = useHub()
  const [tab, setTab] = useState<Tab>(() => (['connect', 'driver', 'journal'].includes(location.hash.slice(1)) ? (location.hash.slice(1) as Tab) : 'players'))
  const [focus, setFocus] = useState<string | null>(null)
  if (!snap) return <div className="grid h-full place-items-center bg-[#06070a] text-white/50">Démarrage de PocketPad Hub…</div>

  const focused = snap.players.find((p) => p.id === focus) ?? snap.players[0] ?? null
  const accent = focused ? findSkin(focused.model, focused.skin).accent : '#8b5cf6'

  return (
    <div className="relative h-full w-full overflow-hidden bg-[#06070a] text-white">
      <img src={bgHub} alt="" className="pointer-events-none absolute inset-0 h-full w-full scale-110 object-cover opacity-45 blur-[6px]" />
      <div className="pointer-events-none absolute inset-0 transition-[background] duration-700" style={{ background: `radial-gradient(60% 70% at 72% 40%, ${alpha(accent, 0.3)}, transparent 70%)` }} />
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(90deg,rgba(6,7,10,0.92)_0%,rgba(6,7,10,0.55)_45%,rgba(6,7,10,0.25)_100%)]" />
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(6,7,10,0.65)_0%,transparent_22%,transparent_55%,rgba(6,7,10,0.96)_100%)]" />

      <div className="relative z-10 flex h-full flex-col px-10 pb-8 pt-7">
        <TopBar snap={snap} tab={tab} setTab={setTab} />
        <Toasts snap={snap} />
        <div className="relative min-h-0 flex-1">
          {tab === 'players' && <PlayersView snap={snap} api={api} focused={focused} setFocus={setFocus} goConnect={() => setTab('connect')} />}
          {tab === 'connect' && <ConnectView snap={snap} api={api} />}
          {tab === 'driver' && <DriverView snap={snap} api={api} />}
          {tab === 'journal' && <JournalView snap={snap} />}
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
  const tabs: Array<{ id: Tab; label: string }> = [
    { id: 'players', label: 'Joueurs' },
    { id: 'connect', label: 'Connexion' },
    { id: 'driver', label: 'Pilote' },
    { id: 'journal', label: 'Journal' },
  ]
  const usb = snap.adb.devices.filter((d) => d.reversed).length
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
      <nav className="flex items-center gap-1">
        {tabs.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)} className={cls('rounded-full px-5 py-1.5 text-[13px] font-medium transition', tab === t.id ? 'bg-white/20 text-white backdrop-blur-md' : 'text-white/60 hover:text-white')}>
            {t.label}
          </button>
        ))}
      </nav>
      <div className="flex items-center gap-4 text-white/80">
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
  const recent = snap.logs.slice(0, 2)
  return (
    <div className="pointer-events-none absolute left-10 top-24 z-20 flex w-80 flex-col gap-2">
      {recent.map((l, i) => (
        <div key={`${l.ts}-${i}`} className="animate-rise flex items-center gap-3 rounded-xl border border-white/10 bg-[#1b1d24]/85 px-3 py-2.5 shadow-xl backdrop-blur-xl" style={{ opacity: 1 - i * 0.25 }}>
          <span className={cls('grid size-8 shrink-0 place-items-center rounded-lg', l.level === 'success' ? 'bg-emerald-500/20 text-emerald-300' : l.level === 'warn' ? 'bg-amber-500/20 text-amber-200' : 'bg-white/10 text-white/80')}>
            <Gamepad2 className="size-4" />
          </span>
          <span className="min-w-0 flex-1 text-[12px] leading-snug text-white/85">{l.msg}</span>
          <span className="shrink-0 text-[10px] text-white/40">{ago(l.ts)}</span>
        </div>
      ))}
    </div>
  )
}

const ago = (ts: number) => {
  const m = Math.round((Date.now() - ts) / 60000)
  return m < 1 ? 'maintenant' : m < 60 ? `${m} min` : `${Math.round(m / 60)} h`
}

function PlayersView({ snap, api, focused, setFocus, goConnect }: { snap: HubSnapshot; api: HubApi; focused: HubPlayer | null; setFocus: (id: string) => void; goConnect: () => void }) {
  const slots = [1, 2, 3, 4].map((n) => snap.players.find((p) => p.slot === n) ?? null)
  return (
    <div className="flex h-full flex-col">
      {!snap.driver.connected && (
        <div className="relative z-20 mb-4 flex items-center gap-3 rounded-2xl border border-amber-300/30 bg-amber-400/10 px-4 py-3 text-sm text-amber-100 backdrop-blur-md">
          <ShieldAlert className="size-5 shrink-0" />
          <span className="flex-1">Pilote ViGEmBus absent : les jeux (GTA V…) ne verront pas la manette du téléphone.</span>
          {snap.platform === 'win32' && (
            <button onClick={() => api.installDriver()} className="rounded-full bg-amber-200 px-4 py-1.5 text-xs font-semibold text-[#1a1405]">
              Installer le pilote
            </button>
          )}
        </div>
      )}
      <div className="relative min-h-0 flex-1">{focused ? <Hero p={focused} api={api} /> : <EmptyHero snap={snap} api={api} onConnect={goConnect} />}</div>
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
  const minutes = Math.max(1, Math.round((Date.now() - p.connectedAt) / 60000))
  const s = p.state
  // La photo occupe la plus grande taille possible sans déborder (largeur et hauteur)
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
  return (
    <div className="absolute inset-0 flex items-center">
      <div className="relative z-10 w-[38%] min-w-[360px] self-end pb-2">
        <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-white/60">
          <span className="rounded px-1.5 py-0.5 text-[#0a0a10]" style={{ background: skin.accent }}>
            P{p.slot}
          </span>
          {model.family}
        </div>
        <h1 className="mt-3 font-display text-[64px] font-extrabold leading-[0.92] tracking-[-0.03em]">{p.name}</h1>
        <p className="mt-2 text-lg text-white/75">
          {model.name} · <span style={{ color: skin.accent }}>{skin.name}</span>
        </p>
        <dl className="mt-6 grid grid-cols-4 gap-6">
          {[
            ['Connexion', T.label],
            ['Latence', p.latency != null ? `${p.latency} ms` : '—'],
            ['Session', `${minutes} min`],
            ['Windows voit', p.virtual ? (p.out === 'ds4' ? 'DualShock 4' : 'Xbox 360') : p.transport === 'bluetooth' ? 'Manette HID' : 'Aucune'],
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
          <button onClick={() => api.kick(p.id)} className="flex items-center gap-1.5 whitespace-nowrap rounded-full border border-white/15 px-4 py-2 text-xs text-white/70 hover:bg-white/10 hover:text-white">
            <X className="size-3.5" /> Déconnecter
          </button>
          <button onClick={() => api.testController()} className="flex items-center gap-1.5 whitespace-nowrap rounded-full border border-white/15 px-4 py-2 text-xs text-white/70 hover:bg-white/10 hover:text-white">
            <Gamepad2 className="size-3.5" /> Tester dans Windows
          </button>
        </div>
        {!p.virtual && p.transport !== 'bluetooth' && <p className="mt-3 text-xs text-amber-200/85">Manette virtuelle inactive : installez le pilote ViGEmBus (onglet Pilote).</p>}
        {p.virtual && p.out === 'ds4' && <p className="mt-3 max-w-md text-xs text-amber-200/85">GTA V et la plupart des jeux PC attendent une manette Xbox : choisissez « Xbox 360 » ci-dessus.</p>}
        {p.transport === 'bluetooth' && <p className="mt-3 max-w-md text-xs text-amber-200/85">En Bluetooth, Windows voit une manette générique que GTA V ne reconnaît pas. Connectez-vous en USB ou en Wi-Fi.</p>}
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

function EmptyHero({ snap, api, onConnect }: { snap: HubSnapshot; api: HubApi; onConnect: () => void }) {
  const qr = useQr(snap)
  const steps = [
    { ok: snap.driver.connected, title: 'Pilote ViGEmBus', desc: snap.driver.connected ? 'Installé : Windows peut créer des manettes Xbox 360.' : 'À installer une fois (bouton ci-dessus).' },
    { ok: false, title: 'Téléphone connecté', desc: 'App PocketPad › Connecter au PC › USB ou Wi-Fi (pas Bluetooth pour GTA V).' },
    { ok: false, title: 'Test Windows puis jeu', desc: 'La manette « Controller (XBOX 360 For Windows) » apparaît : lancez le jeu.' },
  ]
  return (
    <div className="absolute inset-0 flex items-center justify-between gap-10">
      <div className="max-w-xl">
        <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/55">Prêt · {snap.addresses[0] ?? '127.0.0.1'}:{snap.port}</div>
        <h1 className="mt-3 font-display text-[60px] font-extrabold leading-[0.95] tracking-[-0.03em]">Branchez votre téléphone, il devient une manette.</h1>
        <ol className="mt-6 grid gap-3">
          {steps.map((st, i) => (
            <li key={st.title} className="flex items-start gap-3">
              <span className={cls('grid size-7 shrink-0 place-items-center rounded-full font-display text-xs font-bold', st.ok ? 'bg-emerald-400 text-[#06130c]' : 'border border-white/25 text-white/70')}>{st.ok ? '✓' : i + 1}</span>
              <span>
                <span className="block font-display text-[15px] font-semibold">{st.title}</span>
                <span className="block text-sm text-white/60">{st.desc}</span>
              </span>
            </li>
          ))}
        </ol>
        <div className="mt-6 flex gap-3">
          <button onClick={onConnect} className="rounded-full bg-white px-6 py-3 font-display text-sm font-semibold text-[#0a0a10]">
            Méthodes de connexion
          </button>
          <button onClick={() => api.testController()} className="rounded-full border border-white/20 px-6 py-3 text-sm font-medium text-white/85 hover:bg-white/10">
            Tester dans Windows
          </button>
        </div>
      </div>
      {qr && (
        <div className="rounded-3xl bg-white p-4 shadow-2xl">
          <img src={qr} alt="QR code de connexion" className="size-56" />
          <div className="mt-2 text-center text-xs font-medium text-black/60">Jouer depuis le navigateur du téléphone</div>
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
        <span className="mt-2 block font-display text-sm font-semibold text-white/70">Joueur {n}</span>
        <span className="block text-[11px] text-white/40">Emplacement libre</span>
      </span>
    </button>
  )
}

function ConnectTile({ snap, onClick }: { snap: HubSnapshot; onClick: () => void }) {
  return (
    <button onClick={onClick} className="relative ml-auto flex h-[150px] w-[300px] shrink-0 items-end overflow-hidden rounded-2xl bg-gradient-to-br from-[#2b2f3a] to-[#121419] p-4 text-left ring-1 ring-white/10 transition hover:ring-white/40">
      <QrCode className="absolute right-4 top-4 size-14 text-white/15" />
      <span>
        <span className="block text-[11px] uppercase tracking-[0.18em] text-white/50">Connecter un téléphone</span>
        <span className="mt-1 block font-display text-2xl font-bold">{snap.addresses[0] ?? '127.0.0.1'}</span>
        <span className="block text-xs text-white/55">
          Port {snap.port} · PIN {snap.pin}
        </span>
      </span>
    </button>
  )
}

function useQr(snap: HubSnapshot) {
  const url = `http://${snap.addresses[0] ?? '127.0.0.1'}:${snap.port}`
  const [qr, setQr] = useState('')
  useEffect(() => {
    QRCode.toDataURL(url, { margin: 1, width: 420, color: { dark: '#0a0a10', light: '#ffffff' } }).then(setQr).catch(() => setQr(''))
  }, [url])
  return qr
}

function Glass({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cls('rounded-3xl border border-white/10 bg-[#14161c]/70 p-6 backdrop-blur-2xl', className)}>{children}</div>
}

function ConnectView({ snap, api }: { snap: HubSnapshot; api: HubApi }) {
  const qr = useQr(snap)
  const ip = snap.addresses[0] ?? '127.0.0.1'
  const usbReady = snap.adb.devices.some((d) => d.reversed)
  const methods = [
    { icon: Usb, title: 'Câble USB', ok: usbReady, desc: usbReady ? 'Tunnel actif : touchez « Connecter par USB » dans l\'app.' : 'Activez le débogage USB sur le téléphone puis branchez le câble. Le tunnel ADB se crée tout seul.' },
    { icon: Wifi, title: 'Wi-Fi', ok: true, desc: `Même réseau : entrez ${ip} dans l'app, ou scannez le QR code. Si le téléphone ne se connecte pas, autorisez le Hub dans le pare-feu.`, action: { label: 'Autoriser dans le pare-feu', run: () => api.allowFirewall() } },
    { icon: Globe, title: 'Internet', ok: false, desc: `Redirigez le port TCP ${snap.port} de votre box vers ce PC, puis utilisez votre adresse publique et le PIN.` },
    { icon: Bluetooth, title: 'Bluetooth', ok: false, desc: 'Manette générique sans logiciel (Steam, émulateurs). Non reconnue par GTA V et les jeux Xbox : utilisez USB ou Wi-Fi.' },
  ]
  return (
    <div className="absolute inset-0 flex items-center gap-8 pt-4">
      <Glass className="flex w-[380px] shrink-0 flex-col items-center text-center">
        {qr ? <img src={qr} alt={`QR code http://${ip}:${snap.port}`} className="size-64 rounded-2xl bg-white p-3" /> : <div className="size-64" />}
        <div className="mt-5 font-display text-3xl font-bold">{ip}</div>
        <div className="text-sm text-white/55">port {snap.port}</div>
        <div className="mt-5 flex w-full items-center justify-between rounded-2xl border border-white/10 bg-black/30 px-5 py-3">
          <div className="text-left">
            <div className="text-[10px] uppercase tracking-[0.18em] text-white/45">Code PIN · Internet</div>
            <div className="font-display text-3xl font-bold tracking-[0.35em]">{snap.pin}</div>
          </div>
          <button aria-label="Nouveau code PIN" onClick={() => api.regeneratePin()} className="grid size-10 place-items-center rounded-full bg-white/10 hover:bg-white/20">
            <RefreshCw className="size-4" />
          </button>
        </div>
        {snap.addresses.length > 1 && <div className="mt-3 text-xs text-white/45">Autres adresses : {snap.addresses.slice(1).join(' · ')}</div>}
      </Glass>
      <div className="grid flex-1 grid-cols-2 gap-4">
        {methods.map((m) => (
          <Glass key={m.title} className="p-5">
            <div className="flex items-center gap-3">
              <span className={cls('grid size-11 place-items-center rounded-2xl', m.ok ? 'bg-emerald-400/15 text-emerald-300' : 'bg-white/10 text-white/75')}>
                <m.icon className="size-5" />
              </span>
              <span className="font-display text-xl font-semibold">{m.title}</span>
              {m.ok && <span className="ml-auto rounded-full bg-emerald-400/15 px-2.5 py-0.5 text-[11px] text-emerald-300">Prêt</span>}
            </div>
            <p className="mt-3 text-sm leading-relaxed text-white/65">{m.desc}</p>
            {'action' in m && m.action && (
              <button onClick={m.action.run} className="mt-3 rounded-full border border-white/20 px-4 py-1.5 text-xs font-medium text-white/85 hover:bg-white/10">
                {m.action.label}
              </button>
            )}
          </Glass>
        ))}
      </div>
    </div>
  )
}

function DriverView({ snap, api }: { snap: HubSnapshot; api: HubApi }) {
  const d = snap.driver
  return (
    <div className="absolute inset-0 flex items-center gap-8 pt-4">
      <Glass className="max-w-xl flex-1">
        <div className="flex items-center gap-4">
          <span className={cls('grid size-14 place-items-center rounded-2xl', d.connected ? 'bg-emerald-400/15 text-emerald-300' : 'bg-amber-400/15 text-amber-300')}>{d.connected ? <ShieldCheck className="size-7" /> : <ShieldAlert className="size-7" />}</span>
          <div>
            <div className="font-display text-3xl font-bold">{d.connected ? 'ViGEmBus actif' : snap.platform === 'win32' ? 'ViGEmBus non détecté' : 'Windows requis'}</div>
            <div className="text-sm text-white/55">Pilote de manettes virtuelles</div>
          </div>
        </div>
        <p className="mt-5 text-sm leading-relaxed text-white/70">
          {d.connected
            ? 'Chaque téléphone connecté apparaît dans Windows comme une vraie manette Xbox 360 ou DualShock 4 : Steam, les jeux et les émulateurs la reconnaissent directement.'
            : snap.platform === 'win32'
              ? 'Installez le pilote une seule fois (il est fourni avec PocketPad Hub), puis redémarrez le Hub.'
              : 'Les manettes virtuelles nécessitent Windows 10 ou 11. Le Hub affiche quand même les entrées reçues.'}
        </p>
        {!d.connected && snap.platform === 'win32' && (
          <button onClick={() => api.installDriver()} className="mt-5 rounded-full bg-white px-6 py-3 font-display text-sm font-semibold text-[#0a0a10]">
            {d.installer ? 'Installer le pilote' : 'Télécharger le pilote'}
          </button>
        )}
        {d.error && !d.connected && <p className="mt-3 text-xs text-white/40">{d.error}</p>}
      </Glass>
      <Glass className="w-[420px] shrink-0">
        <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-white/50">
          <Cpu className="size-4" /> Téléphones USB (ADB)
        </div>
        <div className="mt-4 grid gap-2">
          {!snap.adb.available && <p className="text-sm text-white/55">{snap.adb.error ?? 'ADB introuvable.'}</p>}
          {snap.adb.available && snap.adb.devices.length === 0 && <p className="text-sm text-white/55">Aucun téléphone branché. Activez le débogage USB puis branchez le câble.</p>}
          {snap.adb.devices.map((dev) => (
            <div key={dev.serial} className="flex items-center justify-between rounded-2xl bg-black/30 px-4 py-3">
              <div>
                <div className="text-sm font-medium">{dev.model ?? dev.serial}</div>
                <div className="text-[11px] text-white/40">{dev.serial}</div>
              </div>
              <span className={cls('rounded-full px-2.5 py-0.5 text-[11px]', dev.reversed ? 'bg-emerald-400/15 text-emerald-300' : dev.state === 'unauthorized' ? 'bg-amber-400/15 text-amber-200' : 'bg-white/10 text-white/60')}>
                {dev.reversed ? 'Tunnel actif' : dev.state === 'unauthorized' ? 'Autorisez sur le téléphone' : dev.state}
              </span>
            </div>
          ))}
        </div>
        <button onClick={() => api.openExternal(REPO)} className="mt-5 text-xs text-white/50 underline-offset-4 hover:text-white hover:underline">
          Aide et téléchargements sur GitHub
        </button>
      </Glass>
    </div>
  )
}

function JournalView({ snap }: { snap: HubSnapshot }) {
  const logs = useMemo(() => snap.logs.slice(0, 60), [snap.logs])
  return (
    <div className="absolute inset-0 pt-4">
      <Glass className="h-full overflow-y-auto">
        <div className="mb-4 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-white/50">
          <Activity className="size-4" /> Activité
        </div>
        <ul className="grid gap-2.5">
          {logs.map((l, i) => (
            <li key={`${l.ts}-${i}`} className="flex items-center gap-4 text-sm">
              <span className="w-12 shrink-0 tabular-nums text-white/40">{new Date(l.ts).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</span>
              <span className={cls('size-2 shrink-0 rounded-full', l.level === 'success' ? 'bg-emerald-400' : l.level === 'warn' ? 'bg-amber-400' : l.level === 'error' ? 'bg-rose-500' : 'bg-white/35')} />
              <span className="text-white/80">{l.msg}</span>
            </li>
          ))}
        </ul>
      </Glass>
    </div>
  )
}
