import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { Bluetooth, Check, ChevronDown, Globe, Loader2, Monitor, RefreshCw, Settings2, Unplug, Usb, Vibrate, Wifi, X } from 'lucide-react'
import { BluetoothGamepad, connection, useConnection, type BtDevice } from '../connection'
import { rememberHost, setSettings, useSettings } from '../store'
import { testVibration } from '../haptics'
import { cls, isLanAddress } from '../../shared/cls'
import { isNative, servedByHub } from '../../shared/platform'
import { nativeInfo } from '../../shared/native'
import { probe, scanSubnet, type FoundHub } from '../../shared/discover'
import { DEFAULT_PORT } from '../../shared/protocol'
import { StatusDot, statusText } from './common'

export type SheetTab = 'usb' | 'wifi' | 'bluetooth' | 'settings'

const TABS: Array<{ id: SheetTab; label: string; icon: typeof Usb }> = [
  { id: 'usb', label: 'USB', icon: Usb },
  { id: 'wifi', label: 'Wi-Fi', icon: Wifi },
  { id: 'bluetooth', label: 'Bluetooth', icon: Bluetooth },
  { id: 'settings', label: 'Réglages', icon: Settings2 },
]

export const APP_VERSION = '1.1.0'

export function ConnectSheet({ initial, onClose, accent }: { initial: SheetTab; onClose: () => void; accent: string }) {
  const [tab, setTab] = useState<SheetTab>(initial)
  const conn = useConnection()
  const wasConnected = useRef(conn.status === 'connected')

  // Fermeture automatique dès qu'une nouvelle connexion aboutit
  useEffect(() => {
    if (conn.status === 'connected' && !wasConnected.current) {
      const t = setTimeout(onClose, 650)
      return () => clearTimeout(t)
    }
    wasConnected.current = conn.status === 'connected'
  }, [conn.status, onClose])

  return (
    <div className="animate-fade fixed inset-0 z-50 grid place-items-center bg-black/55 p-4 backdrop-blur-md short:p-2" onClick={onClose}>
      <div
        className="animate-rise flex h-[min(560px,100%)] w-[min(860px,100%)] overflow-hidden rounded-[28px] border border-white/10 bg-[#0d0e13]/95 text-white shadow-[0_40px_120px_-20px_rgba(0,0,0,0.8)] short:rounded-2xl"
        style={{ ['--a' as string]: accent }}
        onClick={(e) => e.stopPropagation()}
      >
        <nav className="flex w-48 shrink-0 flex-col gap-1 border-r border-white/[0.07] bg-white/[0.02] p-3 short:w-40 short:p-2">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={cls('flex items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium transition short:py-1.5 short:text-xs', tab === t.id ? 'bg-white text-[#0a0a10]' : 'text-white/60 hover:bg-white/5 hover:text-white')}
            >
              <t.icon className="size-4" /> {t.label}
            </button>
          ))}
          <div className="mt-auto rounded-xl bg-white/[0.04] p-3 text-xs short:p-2 short:text-[10px]">
            <div className="flex items-center gap-2 font-medium">
              <StatusDot status={conn.status} /> <span className="truncate">{statusText(conn)}</span>
            </div>
            {conn.target && <div className="mt-1 truncate text-white/45">{conn.hub ?? conn.target}</div>}
            {conn.status !== 'idle' && (
              <button onClick={() => connection.disconnect()} className="mt-2 flex items-center gap-1.5 text-rose-300 hover:text-rose-200">
                <Unplug className="size-3.5" /> Déconnecter
              </button>
            )}
          </div>
        </nav>
        <div className="relative min-w-0 flex-1 overflow-y-auto p-7 short:p-4">
          <button aria-label="Fermer" onClick={onClose} className="absolute right-4 top-4 grid size-9 place-items-center rounded-full bg-white/5 text-white/70 hover:bg-white/10 short:right-2 short:top-2 short:size-7">
            <X className="size-4" />
          </button>
          {tab === 'usb' && <UsbTab />}
          {tab === 'wifi' && <WifiTab />}
          {tab === 'bluetooth' && <BluetoothTab />}
          {tab === 'settings' && <SettingsTab />}
          {conn.error && tab !== 'settings' && <p className="mt-5 rounded-xl bg-rose-500/10 px-4 py-3 text-sm text-rose-200 short:mt-3 short:py-2 short:text-xs">{conn.error}</p>}
        </div>
      </div>
    </div>
  )
}

function Title({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="pr-10">
      <h2 className="font-display text-2xl font-bold tracking-tight short:text-lg">{title}</h2>
      <p className="mt-1.5 text-sm text-white/55 short:text-xs">{children}</p>
    </div>
  )
}

function Primary({ children, onClick, busy, disabled }: { children: ReactNode; onClick: () => void; busy?: boolean; disabled?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled || busy}
      className="inline-flex items-center gap-2 rounded-full bg-white px-6 py-3 font-display text-sm font-semibold text-[#0a0a10] transition hover:scale-[1.02] active:scale-95 disabled:opacity-45 short:py-2"
    >
      {busy && <Loader2 className="size-4 animate-spin" />} {children}
    </button>
  )
}

function Details({ label, children }: { label: string; children: ReactNode }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="mt-5 short:mt-3">
      <button onClick={() => setOpen(!open)} className="flex items-center gap-1.5 text-xs font-medium text-white/50 hover:text-white">
        <ChevronDown className={cls('size-3.5 transition', open && 'rotate-180')} /> {label}
      </button>
      {open && <div className="mt-2 space-y-1.5 text-xs leading-relaxed text-white/60">{children}</div>}
    </div>
  )
}

function UsbTab() {
  const conn = useConnection()
  const busy = conn.status === 'connecting' && conn.transport === 'usb'
  const done = conn.status === 'connected' && conn.transport === 'usb'
  return (
    <div>
      <Title title="Câble USB">La connexion la plus réactive. Laissez PocketPad Hub ouvert sur le PC.</Title>
      <div className="mt-6 short:mt-3">
        {servedByHub ? (
          <p className="text-sm text-white/50">Disponible dans l'application Android. Ici, utilisez le Wi-Fi.</p>
        ) : (
          <Primary busy={busy} onClick={() => connection.connectWebSocket(`127.0.0.1:${DEFAULT_PORT}`, 'usb')}>
            {done ? <><Check className="size-4" /> Connecté</> : 'Connecter par USB'}
          </Primary>
        )}
      </div>
      <Details label="Première connexion">
        <p>1. Paramètres › À propos du téléphone › touchez 7 fois « Numéro de build ».</p>
        <p>2. Options pour les développeurs › activez « Débogage USB ».</p>
        <p>3. Branchez le câble et acceptez l'autorisation affichée sur le téléphone.</p>
      </Details>
    </div>
  )
}

function WifiTab() {
  const settings = useSettings()
  const conn = useConnection()
  const [address, setAddress] = useState(settings.lastHost || (servedByHub ? location.host : ''))
  const [pin, setPin] = useState(settings.pin)
  const [found, setFound] = useState<FoundHub[]>([])
  const [scanning, setScanning] = useState(false)
  const lan = !address || isLanAddress(address)
  const busy = conn.status === 'connecting' && (conn.transport === 'wifi' || conn.transport === 'internet' || conn.transport === 'browser')

  const go = (target = address) => {
    if (!target.trim()) return
    setSettings({ pin })
    rememberHost(target.trim())
    connection.connectWebSocket(target, servedByHub ? 'browser' : isLanAddress(target) ? 'wifi' : 'internet')
  }

  const scan = useCallback(async (signal: AbortSignal) => {
    setScanning(true)
    setFound([])
    const add = (h: FoundHub) => setFound((l) => (l.some((x) => x.host === h.host) ? l : [...l, h].sort((a, b) => a.ms - b.ms)))
    try {
      const info = await nativeInfo()
      if (info?.ip) await scanSubnet(info.ip, add, { signal, known: settings.recentHosts })
      else await Promise.all(settings.recentHosts.map((h) => probe(h.replace(/:\d+$/, '')).then((r) => r && add(r))))
    } finally {
      if (!signal.aborted) setScanning(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const [round, setRound] = useState(0)
  useEffect(() => {
    if (servedByHub) return
    const ctrl = new AbortController()
    scan(ctrl.signal)
    return () => ctrl.abort()
  }, [scan, round])

  return (
    <div>
      <Title title="Wi-Fi">Les PC du même réseau qui ont PocketPad Hub ouvert apparaissent ici.</Title>
      {servedByHub ? (
        <div className="mt-6 short:mt-3">
          <Primary busy={busy} onClick={() => go(location.host)}>
            Connecter à {window.__POCKETPAD_HUB__?.name ?? location.hostname}
          </Primary>
        </div>
      ) : (
        <div className="mt-5 grid gap-2 short:mt-3">
          {found.map((h) => {
            const active = conn.status === 'connected' && conn.target === h.host
            return (
              <button key={h.host} onClick={() => go(h.host)} className={cls('flex items-center gap-3 rounded-2xl border px-4 py-3 text-left transition short:py-2', active ? 'border-[var(--a)] bg-white/[0.06]' : 'border-white/10 hover:border-white/30')}>
                <Monitor className="size-5 text-white/70" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">{h.name}</span>
                  <span className="block text-xs text-white/45">
                    {h.host} · {h.ms} ms
                  </span>
                </span>
                <span className="text-xs font-medium text-white/70">{active ? 'Connecté' : busy && conn.target === h.host ? 'Connexion…' : 'Connecter'}</span>
              </button>
            )
          })}
          <div className="flex items-center gap-2 text-xs text-white/45">
            {scanning ? (
              <>
                <Loader2 className="size-3.5 animate-spin" /> Recherche des PC…
              </>
            ) : (
              <>
                {found.length === 0 && 'Aucun PC trouvé.'}
                <button onClick={() => setRound((r) => r + 1)} className="flex items-center gap-1 font-medium text-white/70 hover:text-white">
                  <RefreshCw className="size-3.5" /> Relancer
                </button>
              </>
            )}
          </div>
        </div>
      )}
      <div className="mt-5 flex max-w-lg items-end gap-2 short:mt-3">
        <label className="block min-w-0 flex-1">
          <span className="text-[11px] font-medium uppercase tracking-[0.14em] text-white/40">Adresse</span>
          <div className="mt-1 flex items-center gap-2 rounded-xl border border-white/12 bg-white/5 px-3 focus-within:border-white/40">
            {lan ? <Wifi className="size-4 text-white/35" /> : <Globe className="size-4 text-white/35" />}
            <input
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && go()}
              placeholder="192.168.1.20"
              inputMode="url"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              className="w-full bg-transparent py-2.5 text-sm outline-none placeholder:text-white/25"
            />
          </div>
        </label>
        {!lan && (
          <label className="block w-24">
            <span className="text-[11px] font-medium uppercase tracking-[0.14em] text-white/40">PIN</span>
            <input
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="••••"
              inputMode="numeric"
              className="mt-1 w-full rounded-xl border border-white/12 bg-white/5 px-3 py-2.5 text-center font-display text-sm tracking-[0.3em] outline-none placeholder:text-white/25 focus:border-white/40"
            />
          </label>
        )}
        <button onClick={() => go()} disabled={!address.trim() || busy} className="rounded-xl bg-white/10 px-4 py-2.5 text-sm font-medium hover:bg-white/15 disabled:opacity-40">
          {busy && conn.target === address ? <Loader2 className="size-4 animate-spin" /> : 'Connecter'}
        </button>
      </div>
      {!lan && <p className="mt-2 text-xs text-white/40">Hors réseau local : port {DEFAULT_PORT} redirigé sur la box du PC, et code PIN affiché dans le Hub.</p>}
    </div>
  )
}

function BluetoothTab() {
  const conn = useConnection()
  const [devices, setDevices] = useState<BtDevice[]>([])
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')

  useEffect(() => {
    connection.btCheck()
  }, [])

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true)
    setMsg('')
    try {
      await fn()
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const enable = () =>
    run(async () => {
      await connection.btEnable()
      const r = await BluetoothGamepad.getPairedDevices()
      setDevices(r.devices)
    })

  return (
    <div>
      <Title title="Bluetooth">Sans câble ni réseau. Avec PocketPad Hub ouvert, le PC la voit comme une manette Xbox 360.</Title>
      {!isNative || conn.bt.supported === false ? (
        <p className="mt-6 text-sm text-white/50 short:mt-3">{conn.bt.reason ?? 'Disponible dans l\'application Android.'}</p>
      ) : (
        <>
          <div className="mt-6 flex flex-wrap gap-2 short:mt-3">
            <button onClick={enable} disabled={busy} className="inline-flex items-center gap-2 rounded-full bg-white px-5 py-2.5 font-display text-sm font-semibold text-[#0a0a10] disabled:opacity-50">
              {busy && <Loader2 className="size-4 animate-spin" />}
              {conn.bt.registered ? <><Check className="size-4" /> Manette active</> : 'Activer'}
            </button>
            <button onClick={() => run(() => BluetoothGamepad.makeDiscoverable())} disabled={!conn.bt.registered} className="rounded-full border border-white/20 px-5 py-2.5 text-sm disabled:opacity-35">
              Rendre visible
            </button>
          </div>
          {conn.bt.registered && (
            <div className="mt-5 grid gap-2">
              {devices.length === 0 && <p className="text-sm text-white/45">Associez ce téléphone depuis les paramètres Bluetooth du PC.</p>}
              {devices.map((d) => {
                const active = conn.bt.connected && conn.target === d.name
                return (
                  <button key={d.address} onClick={() => connection.btConnect(d.address)} className={cls('flex items-center gap-3 rounded-2xl border px-4 py-3 text-left text-sm', active ? 'border-[var(--a)]' : 'border-white/10 hover:border-white/30')}>
                    <Monitor className="size-5 text-white/70" />
                    <span className="min-w-0 flex-1 truncate">{d.name || d.address}</span>
                    <span className="text-xs text-white/60">{active ? 'Connecté' : 'Connecter'}</span>
                  </button>
                )
              })}
            </div>
          )}
          {msg && <p className="mt-4 text-sm text-rose-300">{msg}</p>}
        </>
      )}
    </div>
  )
}

function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button role="switch" aria-checked={on} aria-label={label} onClick={() => onChange(!on)} className={cls('relative h-6 w-11 shrink-0 rounded-full transition', on ? 'bg-[var(--a)]' : 'bg-white/15')}>
      <span className={cls('absolute top-0.5 size-5 rounded-full bg-white shadow transition-all', on ? 'left-[22px]' : 'left-0.5')} />
    </button>
  )
}

function VibeRow({ title, on, level, onToggle, onLevel, onTest }: { title: string; on: boolean; level: number; onToggle: (v: boolean) => void; onLevel: (v: number) => void; onTest: () => void }) {
  return (
    <div className="flex items-center gap-4 rounded-2xl bg-white/[0.04] px-4 py-3 short:py-2">
      <span className="w-20 shrink-0 text-sm font-medium">{title}</span>
      <input
        type="range"
        min={0}
        max={100}
        value={Math.round(level * 100)}
        disabled={!on}
        onChange={(e) => onLevel(Number(e.target.value) / 100)}
        onPointerUp={onTest}
        aria-label={`Intensité ${title}`}
        className="h-1.5 min-w-0 flex-1 cursor-pointer accent-[var(--a)] disabled:opacity-30"
      />
      <span className="w-9 text-right text-xs tabular-nums text-white/50">{on ? `${Math.round(level * 100)} %` : '—'}</span>
      <button aria-label={`Tester ${title}`} onClick={onTest} disabled={!on} className="grid size-8 place-items-center rounded-full bg-white/10 hover:bg-white/15 disabled:opacity-30">
        <Vibrate className="size-4" />
      </button>
      <Toggle on={on} onChange={onToggle} label={title} />
    </div>
  )
}

function SettingsTab() {
  const s = useSettings()
  const outputs = [
    { id: 'auto' as const, label: 'Auto' },
    { id: 'x360' as const, label: 'Xbox 360' },
    { id: 'ds4' as const, label: 'DualShock 4' },
  ]
  return (
    <div>
      <h2 className="pr-10 font-display text-2xl font-bold tracking-tight short:text-lg">Réglages</h2>
      <div className="mt-5 grid max-w-xl gap-4 short:mt-3 short:gap-3">
        <div className="grid grid-cols-[1fr_auto] items-end gap-3">
          <label className="block">
            <span className="text-[11px] font-medium uppercase tracking-[0.14em] text-white/40">Pseudo</span>
            <input
              value={s.playerName}
              maxLength={20}
              onChange={(e) => setSettings({ playerName: e.target.value })}
              onBlur={() => connection.updateProfile()}
              className="mt-1 w-full rounded-xl border border-white/12 bg-white/5 px-3 py-2.5 text-sm outline-none focus:border-white/40"
            />
          </label>
          <div>
            <span className="text-[11px] font-medium uppercase tracking-[0.14em] text-white/40">Manette sur le PC</span>
            <div className="mt-1 flex rounded-xl bg-white/[0.05] p-1">
              {outputs.map((o) => (
                <button
                  key={o.id}
                  onClick={() => {
                    setSettings({ output: o.id })
                    connection.updateProfile()
                  }}
                  className={cls('rounded-lg px-3 py-1.5 text-xs font-medium transition', s.output === o.id ? 'bg-white text-[#0a0a10]' : 'text-white/60 hover:text-white')}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="grid gap-2">
          <span className="text-[11px] font-medium uppercase tracking-[0.14em] text-white/40">Vibrations</span>
          <VibeRow title="Touches" on={s.vibeTouch} level={s.vibeTouchLevel} onToggle={(v) => setSettings({ vibeTouch: v })} onLevel={(v) => setSettings({ vibeTouchLevel: v })} onTest={() => testVibration('touch')} />
          <VibeRow title="Jeu" on={s.vibeGame} level={s.vibeGameLevel} onToggle={(v) => setSettings({ vibeGame: v })} onLevel={(v) => setSettings({ vibeGameLevel: v })} onTest={() => testVibration('game')} />
        </div>
        <p className="text-xs text-white/30">PocketPad {APP_VERSION}</p>
      </div>
    </div>
  )
}
