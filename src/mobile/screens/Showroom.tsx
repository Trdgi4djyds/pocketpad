import { useRef, useState, type PointerEvent } from 'react'
import { Bluetooth, ChevronRight, Play, Settings2, Usb, Wifi } from 'lucide-react'
import { CONTROLLERS, getModel, getSkin, type ControllerModel, type Skin } from '../../shared/catalog'
import { ControllerPhoto } from '../../shared/ControllerPhoto'
import { setSettings, useSettings } from '../store'
import { connection, useConnection } from '../connection'
import { alpha } from '../../shared/color'
import { cls } from '../../shared/cls'
import { Logo, StatusDot, statusText, studioBackground, toneVars } from './common'
import type { SheetTab } from './ConnectSheet'

interface Props {
  onPlay: () => void
  onConnect: (tab?: SheetTab) => void
}

export function Showroom({ onPlay, onConnect }: Props) {
  const settings = useSettings()
  const conn = useConnection()
  const model = getModel(settings.modelId)
  const skin = getSkin(model, settings.skins[model.id])
  const [tilt, setTilt] = useState({ x: 0, y: 0 })
  const drag = useRef<{ x: number; y: number } | null>(null)

  const select = (m: ControllerModel, s?: Skin) => {
    setSettings((st) => ({ modelId: m.id, skins: s ? { ...st.skins, [m.id]: s.id } : st.skins }))
    connection.updateProfile()
  }

  // Coloris du modèle, complétés par d'autres manettes s'il y en a peu
  const others = CONTROLLERS.filter((m) => m.id !== model.id).map((m) => ({ m, s: getSkin(m, settings.skins[m.id]) }))
  const cards = [...model.skins.map((s) => ({ m: model, s })), ...others].slice(0, Math.max(3, model.skins.length))

  const onDown = (e: PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId)
    drag.current = { x: e.clientX - tilt.y / 0.12, y: e.clientY + tilt.x / 0.1 }
  }
  const onMove = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current
    if (!d) return
    setTilt({ y: Math.max(-14, Math.min(14, (e.clientX - d.x) * 0.12)), x: Math.max(-9, Math.min(9, -(e.clientY - d.y) * 0.1)) })
  }
  const onUp = () => {
    drag.current = null
    setTilt({ x: 0, y: 0 })
  }

  const modes = [
    { id: 'usb' as const, icon: Usb, title: 'Câble USB', sub: 'Latence minimale', match: ['usb'] },
    { id: 'wifi' as const, icon: Wifi, title: 'Wi-Fi · Internet', sub: 'Local ou à distance', match: ['wifi', 'internet', 'browser'] },
    { id: 'bluetooth' as const, icon: Bluetooth, title: 'Bluetooth', sub: 'Manette native', match: ['bluetooth'] },
  ]

  return (
    <div className="relative h-full w-full overflow-hidden transition-colors duration-700" style={{ ...toneVars(skin), background: studioBackground(skin) }}>
      {/* Sol du studio */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-[38%]" style={{ background: skin.tone === 'light' ? 'linear-gradient(180deg, transparent, rgba(255,255,255,0.35) 40%, rgba(0,0,0,0.05))' : 'linear-gradient(180deg, transparent, rgba(255,255,255,0.025) 40%, rgba(0,0,0,0.4))' }} />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-[13%] select-none overflow-hidden whitespace-nowrap text-center font-display text-[15.5vw] font-black uppercase leading-none tracking-[-0.045em] short:top-[10%]"
        style={{ color: 'transparent', WebkitTextStroke: `1.5px ${skin.tone === 'light' ? 'rgba(13,14,18,0.08)' : 'rgba(255,255,255,0.07)'}` }}
      >
        {model.name}
      </div>

      <div className="relative z-10 flex h-full flex-col">
        <header className="flex items-center justify-between gap-4 px-8 pt-5 short:gap-2 short:px-4 short:pt-2.5">
          <Logo />
          <nav className="no-scrollbar flex min-w-0 items-center gap-1 overflow-x-auto rounded-full border border-[var(--line)] bg-[var(--glass)] p-1 backdrop-blur-xl">
            {CONTROLLERS.map((m) => (
              <button
                key={m.id}
                onClick={() => select(m)}
                className={cls(
                  'shrink-0 rounded-full px-4 py-1.5 text-[13px] font-medium transition short:px-2.5 short:py-1 short:text-[11px]',
                  m.id === model.id ? 'bg-[var(--solid)] text-[var(--on-solid)]' : 'text-[var(--muted)] hover:text-[var(--fg)]',
                )}
              >
                {m.short}
              </button>
            ))}
          </nav>
          <div className="flex shrink-0 items-center gap-2">
            <button onClick={() => onConnect()} className="flex items-center gap-2.5 rounded-full border border-[var(--line)] bg-[var(--glass-strong)] py-1 pl-1 pr-4 text-left backdrop-blur-xl transition hover:scale-[1.02] short:gap-2 short:pr-3">
              <span className="grid size-8 place-items-center rounded-full font-display text-sm font-bold text-white short:size-6 short:text-[11px]" style={{ background: skin.accent }}>
                {(settings.playerName || 'J').slice(0, 1).toUpperCase()}
              </span>
              <span className="leading-tight">
                <span className="block max-w-28 truncate text-[13px] font-semibold short:text-[11px]">{settings.playerName || 'Joueur'}</span>
                <span className="flex items-center gap-1.5 text-[11px] text-[var(--muted)] short:text-[9px]">
                  <StatusDot status={conn.status} /> {statusText(conn)}
                </span>
              </span>
            </button>
            <button aria-label="Réglages" onClick={() => onConnect('settings')} className="grid size-10 place-items-center rounded-full border border-[var(--line)] bg-[var(--glass)] backdrop-blur-xl transition hover:bg-[var(--glass-strong)] short:size-8">
              <Settings2 className="size-[18px] short:size-4" />
            </button>
          </div>
        </header>

        <main className="grid min-h-0 flex-1 grid-cols-[minmax(0,0.92fr)_minmax(0,1.75fr)_minmax(0,0.62fr)] items-center gap-6 px-8 short:gap-3 short:px-4">
          <section className="min-w-0">
            <p className="truncate text-[12px] font-medium uppercase tracking-[0.2em] text-[var(--muted)] short:text-[9px] short:tracking-[0.16em]">{model.family} · sans fil</p>
            <h1 className="mt-2 font-display text-[clamp(2.4rem,5.4vw,5rem)] font-extrabold leading-[0.9] tracking-[-0.035em] short:mt-1 short:text-[clamp(1.6rem,4.4vw,2.6rem)]">
              {model.name}
            </h1>
            <p key={skin.id} className="animate-rise mt-2 font-display text-xl font-semibold short:mt-1 short:text-sm" style={{ color: skin.tone === 'light' ? skin.accent : skin.accent }}>
              {skin.name} <span className="font-sans text-sm font-normal text-[var(--muted)] short:text-[10px]">· {skin.edition}</span>
            </p>
            <p className="mt-3 max-w-sm text-sm leading-relaxed text-[var(--muted)] short:mt-1.5 short:line-clamp-2 short:text-[11px] short:leading-snug">{skin.description}</p>
            <div className="mt-6 flex items-center gap-3 short:mt-3 short:gap-2">
              <button
                onClick={onPlay}
                className="flex items-center gap-2.5 rounded-full bg-[var(--solid)] py-3.5 pl-5 pr-7 font-display text-base font-semibold text-[var(--on-solid)] transition hover:scale-[1.03] active:scale-95 short:py-2 short:pl-3.5 short:pr-4.5 short:text-sm"
                style={{ boxShadow: `0 16px 40px -12px ${alpha(skin.accent, 0.85)}` }}
              >
                <Play className="size-4 fill-current" /> Jouer
              </button>
              <button onClick={() => onConnect()} className="rounded-full border border-[var(--line)] bg-[var(--glass)] px-5 py-3.5 text-sm font-medium backdrop-blur-xl transition hover:bg-[var(--glass-strong)] short:px-3.5 short:py-2 short:text-xs">
                <span className="short:hidden">Connecter au PC</span>
                <span className="hidden short:inline">Connecter</span>
              </button>
            </div>
          </section>

          <section className="relative flex h-full min-h-0 items-center justify-center">
            {/* Ombre de contact sur le sol */}
            <div className="pointer-events-none absolute bottom-[9%] h-[9%] w-[62%] rounded-[50%] blur-2xl" style={{ background: skin.tone === 'light' ? 'rgba(20,22,30,0.28)' : 'rgba(0,0,0,0.75)' }} />
            <div className="pointer-events-none absolute bottom-[6%] h-[16%] w-[80%] rounded-[50%] border" style={{ borderColor: skin.tone === 'light' ? 'rgba(13,14,18,0.08)' : 'rgba(255,255,255,0.08)', boxShadow: `0 0 60px ${alpha(skin.accent, skin.tone === 'light' ? 0.12 : 0.25)}` }} />
            <div
              className="relative w-full max-w-[min(100%,calc(58vh/var(--r)))] cursor-grab touch-none active:cursor-grabbing short:max-w-[min(100%,calc(52vh/var(--r)))]"
              style={{ perspective: 1400, ['--r' as string]: skin.ratio }}
              onPointerDown={onDown}
              onPointerMove={onMove}
              onPointerUp={onUp}
              onPointerCancel={onUp}
            >
              <div className="animate-float">
                <div style={{ transform: `rotateX(${tilt.x}deg) rotateY(${tilt.y}deg)`, transition: drag.current ? 'none' : 'transform 0.6s cubic-bezier(.2,.8,.2,1)' }}>
                  <ControllerPhoto key={skin.id} skin={skin} shadow reflect className="animate-pop w-full" alt={`${model.name} ${skin.name}`} />
                  {/* Reflet spéculaire qui suit l'inclinaison, limité à la manette */}
                  <div
                    className="pointer-events-none absolute inset-0 mix-blend-soft-light"
                    style={{
                      background: `linear-gradient(${105 + tilt.y * 3}deg, transparent 30%, rgba(255,255,255,${0.25 + Math.abs(tilt.y) / 50}) 48%, transparent 64%)`,
                      WebkitMaskImage: `url(${skin.photo})`,
                      maskImage: `url(${skin.photo})`,
                      WebkitMaskSize: '100% 100%',
                      maskSize: '100% 100%',
                    }}
                  />
                </div>
              </div>
            </div>
          </section>

          <aside className="flex min-w-0 flex-col gap-2.5 short:gap-1.5">
            <div className="flex items-baseline justify-between text-[11px] font-medium uppercase tracking-[0.18em] text-[var(--muted)] short:text-[9px]">
              <span>Coloris</span>
              <span>{model.skins.length}</span>
            </div>
            {cards.map(({ m, s }, i) => {
              const active = s.id === skin.id
              const foreign = m.id !== model.id
              return (
                <button
                  key={`${m.id}-${s.id}`}
                  onClick={() => select(m, s)}
                  className={cls(
                    'group relative flex items-center gap-3 overflow-hidden rounded-2xl border p-2 text-left backdrop-blur-xl transition short:gap-2 short:rounded-xl short:p-1.5',
                    active ? 'border-[var(--accent)] bg-[var(--glass-strong)]' : 'border-[var(--line)] bg-[var(--glass)] hover:bg-[var(--glass-strong)]',
                    i > 2 && 'short:hidden',
                  )}
                >
                  <span className="grid h-14 w-20 shrink-0 place-items-center rounded-xl short:h-9 short:w-12" style={{ background: s.tone === 'light' ? '#f3f4f6' : '#1b1c22' }}>
                    <img src={s.thumb} alt="" draggable={false} className="max-h-[88%] max-w-[90%] object-contain transition group-hover:scale-105" />
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-[13px] font-semibold short:text-[11px]">{s.name}</span>
                    <span className="block truncate text-[11px] text-[var(--muted)] short:text-[9px]">{foreign ? m.name : s.edition}</span>
                  </span>
                  {foreign && <ChevronRight className="ml-auto size-4 shrink-0 text-[var(--faint)] short:hidden" />}
                </button>
              )
            })}
          </aside>
        </main>

        <footer className="grid grid-cols-3 gap-4 px-8 pb-6 short:gap-2 short:px-4 short:pb-2.5">
          {modes.map((m) => {
            const active = conn.transport !== null && m.match.includes(conn.transport)
            const Icon = m.icon
            const sub = active ? (conn.status === 'connected' ? `Connecté${conn.latency ? ` · ${conn.latency} ms` : ''}` : conn.status === 'connecting' ? 'Connexion…' : 'Échec') : m.sub
            return (
              <button
                key={m.id}
                onClick={() => onConnect(m.id)}
                className={cls(
                  'flex items-center gap-4 rounded-2xl border bg-[var(--glass)] px-6 py-4 text-left backdrop-blur-xl transition hover:bg-[var(--glass-strong)] short:gap-2.5 short:rounded-xl short:px-3 short:py-2',
                  active ? 'border-[var(--accent)]' : 'border-[var(--line)]',
                )}
                style={{ boxShadow: active ? `0 0 30px -8px ${skin.accent}` : undefined }}
              >
                <Icon className="size-8 shrink-0 stroke-[1.4] short:size-5" />
                <div className="min-w-0">
                  <div className="truncate font-display text-xl font-semibold tracking-tight short:text-[13px]">{m.title}</div>
                  <div className={cls('truncate text-sm tracking-wide short:text-[10px]', active && conn.status === 'connected' ? 'font-medium text-[var(--accent)]' : 'text-[var(--muted)]')}>{sub}</div>
                </div>
              </button>
            )
          })}
        </footer>
      </div>
    </div>
  )
}
