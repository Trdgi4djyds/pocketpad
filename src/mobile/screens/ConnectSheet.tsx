import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Bluetooth, Check, Globe, Loader2, Radio, Settings2, Unplug, Usb, Wifi, X } from 'lucide-react'
import { BluetoothGamepad, connection, useConnection, type BtDevice } from '../connection'
import { rememberHost, setSettings, useSettings } from '../store'
import { getModel } from '../../shared/catalog'
import { cls, isLanAddress } from '../../shared/cls'
import { isNative, servedByHub } from '../../shared/platform'
import { DEFAULT_PORT } from '../../shared/protocol'
import { StatusDot, statusText } from './common'

export type SheetTab = 'usb' | 'wifi' | 'bluetooth' | 'settings'

const TABS: Array<{ id: SheetTab; label: string; icon: typeof Usb }> = [
  { id: 'usb', label: 'Câble USB', icon: Usb },
  { id: 'wifi', label: 'Wi-Fi · Internet', icon: Wifi },
  { id: 'bluetooth', label: 'Bluetooth', icon: Bluetooth },
  { id: 'settings', label: 'Réglages', icon: Settings2 },
]

export function ConnectSheet({ initial, onClose, accent }: { initial: SheetTab; onClose: () => void; accent: string }) {
  const [tab, setTab] = useState<SheetTab>(initial)
  const conn = useConnection()
  const wasConnected = useRef(conn.status === 'connected')

  // Fermeture automatique dès qu'une nouvelle connexion aboutit
  useEffect(() => {
    if (conn.status === 'connected' && !wasConnected.current) {
      const t = setTimeout(onClose, 700)
      return () => clearTimeout(t)
    }
    wasConnected.current = conn.status === 'connected'
  }, [conn.status, onClose])

  return (
    <div className="animate-fade fixed inset-0 z-50 grid place-items-center bg-black/55 p-4 backdrop-blur-md short:p-2" onClick={onClose}>
      <div
        className="animate-rise flex h-[min(640px,100%)] w-[min(940px,100%)] overflow-hidden rounded-[28px] border border-white/12 bg-[#0e0f14]/95 text-white shadow-[0_40px_120px_-20px_rgba(0,0,0,0.8)] short:rounded-2xl"
        style={{ ['--a' as string]: accent }}
        onClick={(e) => e.stopPropagation()}
      >
        <nav className="flex w-56 shrink-0 flex-col gap-1 border-r border-white/8 bg-white/[0.025] p-3 short:w-44 short:p-2">
          <div className="px-3 pb-3 pt-2 font-display text-lg font-bold short:pb-1.5 short:pt-1 short:text-sm">Connexion au PC</div>
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={cls('flex items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition short:py-1.5 short:text-xs', tab === t.id ? 'bg-white text-[#0a0a10]' : 'text-white/65 hover:bg-white/5 hover:text-white')}
            >
              <t.icon className="size-4" /> {t.label}
            </button>
          ))}
          <div className="mt-auto rounded-xl border border-white/8 p-3 text-xs text-white/60 short:p-2 short:text-[10px]">
            <div className="flex items-center gap-2 text-white">
              <StatusDot status={conn.status} /> {statusText(conn)}
            </div>
            {conn.target && <div className="mt-1 truncate">{conn.target}</div>}
            {conn.status === 'connected' && conn.slot !== undefined && <div className="mt-0.5">Manette n°{conn.slot}</div>}
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
          {conn.error && tab !== 'settings' && <p className="mt-5 rounded-xl border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200 short:mt-3 short:py-2 short:text-xs">{conn.error}</p>}
        </div>
      </div>
    </div>
  )
}

function Title({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <div className="pr-10">
      <div className="flex items-center gap-3">
        <span className="grid size-10 place-items-center rounded-2xl bg-[var(--a)]/15 text-[var(--a)] short:size-8">{icon}</span>
        <h2 className="font-display text-2xl font-bold tracking-tight short:text-lg">{title}</h2>
      </div>
      <p className="mt-3 max-w-xl text-sm leading-relaxed text-white/60 short:mt-2 short:text-xs">{children}</p>
    </div>
  )
}

function Steps({ items }: { items: ReactNode[] }) {
  return (
    <ol className="mt-5 space-y-3 short:mt-3 short:space-y-2">
      {items.map((it, i) => (
        <li key={i} className="flex gap-3 text-sm text-white/80 short:text-xs">
          <span className="grid size-6 shrink-0 place-items-center rounded-full border border-white/20 font-display text-xs font-semibold">{i + 1}</span>
          <span className="pt-0.5 leading-relaxed">{it}</span>
        </li>
      ))}
    </ol>
  )
}

function Primary({ children, onClick, busy, disabled }: { children: ReactNode; onClick: () => void; busy?: boolean; disabled?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled || busy}
      className="mt-6 inline-flex items-center gap-2 rounded-full bg-white px-6 py-3 font-display text-sm font-semibold text-[#0a0a10] transition hover:scale-[1.02] active:scale-95 disabled:opacity-50 short:mt-3 short:py-2"
    >
      {busy && <Loader2 className="size-4 animate-spin" />} {children}
    </button>
  )
}

function UsbTab() {
  const conn = useConnection()
  const busy = conn.status === 'connecting' && conn.transport === 'usb'
  return (
    <div>
      <Title icon={<Usb className="size-5" />} title="Câble USB">
        La connexion la plus réactive. Le logiciel PC PocketPad Hub crée automatiquement un tunnel ADB dès que le téléphone est branché : aucune configuration réseau.
      </Title>
      <Steps
        items={[
          <>Ouvrez <b>PocketPad Hub</b> sur le PC.</>,
          <>Sur le téléphone, activez le <b>débogage USB</b> : Paramètres › À propos › touchez 7 fois « Numéro de build », puis Options pour les développeurs › Débogage USB.</>,
          <>Branchez le câble et acceptez l'autorisation. Le Hub affiche « Tunnel actif ».</>,
        ]}
      />
      {servedByHub ? (
        <p className="mt-6 text-sm text-white/50">Le mode USB est réservé à l'application Android. Dans le navigateur, utilisez le Wi-Fi.</p>
      ) : (
        <Primary busy={busy} onClick={() => connection.connectWebSocket(`127.0.0.1:${DEFAULT_PORT}`, 'usb')}>
          {conn.status === 'connected' && conn.transport === 'usb' ? <><Check className="size-4" /> Connecté par USB</> : 'Connecter par USB'}
        </Primary>
      )}
    </div>
  )
}

function WifiTab() {
  const settings = useSettings()
  const conn = useConnection()
  const [address, setAddress] = useState(settings.lastHost || (servedByHub ? location.host : ''))
  const [pin, setPin] = useState(settings.pin)
  const lan = !address || isLanAddress(address)
  const busy = conn.status === 'connecting' && (conn.transport === 'wifi' || conn.transport === 'internet' || conn.transport === 'browser')

  const go = (target = address) => {
    if (!target.trim()) return
    setSettings({ pin })
    rememberHost(target.trim())
    connection.connectWebSocket(target, servedByHub ? 'browser' : isLanAddress(target) ? 'wifi' : 'internet')
  }

  return (
    <div>
      <Title icon={<Wifi className="size-5" />} title="Wi-Fi · Internet">
        Sur le même réseau, entrez l'adresse affichée dans PocketPad Hub. À distance, utilisez l'adresse publique du PC (port {DEFAULT_PORT} redirigé sur la box) et le code PIN.
      </Title>
      {servedByHub && (
        <Primary busy={busy} onClick={() => go(location.host)}>
          Connecter à ce PC ({location.hostname})
        </Primary>
      )}
      <div className="mt-6 grid max-w-xl grid-cols-[1fr_8rem] gap-3 short:mt-3 short:gap-2">
        <label className="block">
          <span className="text-xs uppercase tracking-[0.14em] text-white/45">Adresse du PC</span>
          <div className="mt-1.5 flex items-center gap-2 rounded-xl border border-white/12 bg-white/5 px-3 focus-within:border-white/40">
            {lan ? <Radio className="size-4 text-white/40" /> : <Globe className="size-4 text-white/40" />}
            <input
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && go()}
              placeholder="192.168.1.20"
              inputMode="url"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              className="w-full bg-transparent py-3 text-sm outline-none placeholder:text-white/25 short:py-2"
            />
          </div>
        </label>
        <label className="block">
          <span className="text-xs uppercase tracking-[0.14em] text-white/45">PIN {lan && <span className="normal-case tracking-normal text-white/30">(Internet)</span>}</span>
          <input
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
            placeholder="••••"
            inputMode="numeric"
            className="mt-1.5 w-full rounded-xl border border-white/12 bg-white/5 px-3 py-3 text-center font-display text-sm tracking-[0.3em] outline-none placeholder:text-white/25 focus:border-white/40 short:py-2"
          />
        </label>
      </div>
      {settings.recentHosts.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {settings.recentHosts.map((h) => (
            <button key={h} onClick={() => setAddress(h)} className="rounded-full border border-white/12 px-3 py-1 text-xs text-white/60 hover:border-white/30 hover:text-white">
              {h}
            </button>
          ))}
        </div>
      )}
      <Primary busy={busy} disabled={!address.trim()} onClick={() => go()}>
        {lan ? 'Connecter en Wi-Fi' : 'Connecter via Internet'}
      </Primary>
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
      <Title icon={<Bluetooth className="size-5" />} title="Bluetooth">
        Le téléphone devient une vraie manette Bluetooth : Windows la reconnaît sans logiciel. Compatible Steam, émulateurs et jeux DirectInput. Pour les jeux XInput uniquement, préférez USB ou Wi-Fi avec PocketPad Hub.
      </Title>
      {!isNative || conn.bt.supported === false ? (
        <p className="mt-6 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-white/60 short:mt-3 short:text-xs">
          {conn.bt.reason ?? 'Disponible dans l\'application Android.'}
        </p>
      ) : (
        <>
          <Steps
            items={[
              <>Activez la manette Bluetooth sur ce téléphone.</>,
              <>Rendez le téléphone visible, puis sur le PC : Paramètres › Bluetooth › Ajouter un appareil › choisissez ce téléphone.</>,
              <>Une fois associé, sélectionnez le PC ci-dessous.</>,
            ]}
          />
          <div className="mt-5 flex flex-wrap gap-2">
            <button onClick={enable} disabled={busy} className="inline-flex items-center gap-2 rounded-full bg-white px-5 py-2.5 font-display text-sm font-semibold text-[#0a0a10] disabled:opacity-50">
              {busy && <Loader2 className="size-4 animate-spin" />}
              {conn.bt.registered ? <><Check className="size-4" /> Manette active</> : 'Activer la manette Bluetooth'}
            </button>
            <button onClick={() => run(() => BluetoothGamepad.makeDiscoverable())} disabled={!conn.bt.registered} className="rounded-full border border-white/20 px-5 py-2.5 text-sm disabled:opacity-40">
              Rendre visible
            </button>
          </div>
          {conn.bt.registered && (
            <div className="mt-5">
              <div className="text-xs uppercase tracking-[0.14em] text-white/45">Appareils associés</div>
              <div className="mt-2 grid gap-2">
                {devices.length === 0 && <p className="text-sm text-white/45">Aucun appareil associé pour l'instant.</p>}
                {devices.map((d) => {
                  const active = conn.bt.connected && conn.target === d.name
                  return (
                    <button key={d.address} onClick={() => connection.btConnect(d.address)} className={cls('flex items-center justify-between rounded-xl border px-4 py-3 text-left text-sm', active ? 'border-[var(--a)]' : 'border-white/10 hover:border-white/30')}>
                      <span>
                        {d.name || 'Appareil'} <span className="text-white/35">{d.address}</span>
                      </span>
                      <span className="text-xs text-white/60">{active ? 'Connecté' : 'Connecter'}</span>
                    </button>
                  )
                })}
              </div>
            </div>
          )}
          {msg && <p className="mt-4 text-sm text-rose-300">{msg}</p>}
        </>
      )}
    </div>
  )
}

function SettingsTab() {
  const s = useSettings()
  const model = getModel(s.modelId)
  const outputs = [
    { id: 'auto' as const, label: `Auto (${model.out === 'ds4' ? 'DualShock 4' : 'Xbox 360'})` },
    { id: 'x360' as const, label: 'Xbox 360' },
    { id: 'ds4' as const, label: 'DualShock 4' },
  ]
  return (
    <div>
      <Title icon={<Settings2 className="size-5" />} title="Réglages">
        Ces réglages sont envoyés au PC à chaque connexion.
      </Title>
      <div className="mt-6 grid max-w-xl gap-5 short:mt-3 short:gap-3">
        <label className="block">
          <span className="text-xs uppercase tracking-[0.14em] text-white/45">Pseudo</span>
          <input
            value={s.playerName}
            maxLength={20}
            onChange={(e) => setSettings({ playerName: e.target.value })}
            onBlur={() => connection.updateProfile()}
            className="mt-1.5 w-full rounded-xl border border-white/12 bg-white/5 px-3 py-3 text-sm outline-none focus:border-white/40 short:py-2"
          />
        </label>
        <div>
          <span className="text-xs uppercase tracking-[0.14em] text-white/45">Manette virtuelle côté PC</span>
          <div className="mt-1.5 flex flex-wrap gap-1 rounded-2xl border border-white/10 bg-white/[0.03] p-1">
            {outputs.map((o) => (
              <button
                key={o.id}
                onClick={() => {
                  setSettings({ output: o.id })
                  connection.updateProfile()
                }}
                className={cls('flex-1 rounded-xl px-3 py-2 text-xs transition', s.output === o.id ? 'bg-white text-[#0a0a10]' : 'text-white/65 hover:text-white')}
              >
                {o.label}
              </button>
            ))}
          </div>
        </div>
        <button onClick={() => setSettings({ haptics: !s.haptics })} className="flex items-center justify-between rounded-xl border border-white/10 px-4 py-3 text-left text-sm">
          <span>
            Vibrations
            <span className="block text-xs text-white/45">Retour haptique au toucher et vibrations envoyées par le jeu</span>
          </span>
          <span className={cls('relative h-6 w-11 shrink-0 rounded-full transition', s.haptics ? 'bg-[var(--a)]' : 'bg-white/15')}>
            <span className={cls('absolute top-0.5 size-5 rounded-full bg-white transition-all', s.haptics ? 'left-[22px]' : 'left-0.5')} />
          </span>
        </button>
        <p className="text-xs text-white/35">PocketPad 1.0 · Photos des manettes : Wikimedia Commons (licences libres, voir CREDITS.md). Les sticks se cliquent (L3/R3) d'une pression brève.</p>
      </div>
    </div>
  )
}
