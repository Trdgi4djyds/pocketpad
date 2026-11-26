import { useRef, useState, type PointerEvent } from 'react'
import { Bluetooth, Play, Settings2, Usb, Wifi } from 'lucide-react'
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

const MODES = [
  { id: 'usb' as const, icon: Usb, label: 'USB', match: ['usb'] },
  { id: 'wifi' as const, icon: Wifi, label: 'Wi-Fi', match: ['wifi', 'internet', 'browser'] },
  { id: 'bluetooth' as const, icon: Bluetooth, label: 'Bluetooth', match: ['bluetooth'] },
]

/** Écran d'accueil : la manette en vitrine, le choix du modèle et du coloris, et « Jouer ». */
export function Showroom({ onPlay, onConnect }: Props) {
  const settings = useSettings()
  const conn = useConnection()
  const model = getModel(settings.modelId)
  const skin = getSkin(model, settings.skins[model.id])
  const light = skin.tone === 'light'
  const [tilt, setTilt] = useState({ x: 0, y: 0 })
  const drag = useRef<{ x: number; y: number } | null>(null)

  const select = (m: ControllerModel, s?: Skin) => {
    setSettings((st) => ({ modelId: m.id, skins: s ? { ...st.skins, [m.id]: s.id } : st.skins }))
    connection.updateProfile()
  }

  const onDown = (e: PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId)
    drag.current = { x: e.clientX, y: e.clientY }
  }
  const onMove = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current
    if (!d) return
    setTilt({ y: Math.max(-12, Math.min(12, (e.clientX - d.x) * 0.1)), x: Math.max(-8, Math.min(8, -(e.clientY - d.y) * 0.08)) })
  }
  const onUp = () => {
    drag.current = null
    setTilt({ x: 0, y: 0 })
  }

  return (
    <div className="relative h-full w-full overflow-hidden transition-colors duration-700" style={{ ...toneVars(skin), background: studioBackground(skin) }}>
      {/* Sol du studio */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-[34%]" style={{ background: light ? 'linear-gradient(180deg, transparent, rgba(255,255,255,0.4) 45%, rgba(0,0,0,0.04))' : 'linear-gradient(180deg, transparent, rgba(255,255,255,0.025) 45%, rgba(0,0,0,0.45))' }} />

      <div className="relative z-10 flex h-full flex-col">
        <header className="flex items-center justify-between gap-3 px-7 pt-5 short:px-4 short:pt-3">
          <Logo />
          <nav className="no-scrollbar flex min-w-0 items-center gap-0.5 overflow-x-auto rounded-full border border-[var(--line)] bg-[var(--glass)] p-1 backdrop-blur-xl">
            {CONTROLLERS.map((m) => (
              <button
                key={m.id}
                onClick={() => select(m)}
                className={cls(
                  'shrink-0 rounded-full px-4 py-1.5 text-[13px] font-medium transition short:px-3 short:py-1 short:text-[11px]',
                  m.id === model.id ? 'bg-[var(--solid)] text-[var(--on-solid)]' : 'text-[var(--muted)] hover:text-[var(--fg)]',
                )}
              >
                {m.short}
              </button>
            ))}
          </nav>
          <div className="flex shrink-0 items-center gap-2">
            <button onClick={() => onConnect()} className="flex items-center gap-2 rounded-full border border-[var(--line)] bg-[var(--glass)] px-3.5 py-2 text-[12px] font-medium backdrop-blur-xl transition hover:bg-[var(--glass-strong)] short:px-3 short:py-1.5 short:text-[11px]">
              <StatusDot status={conn.status} />
              <span className="max-w-36 truncate">{statusText(conn)}</span>
            </button>
            <button aria-label="Réglages" onClick={() => onConnect('settings')} className="grid size-9 place-items-center rounded-full border border-[var(--line)] bg-[var(--glass)] backdrop-blur-xl transition hover:bg-[var(--glass-strong)] short:size-8">
              <Settings2 className="size-4" />
            </button>
          </div>
        </header>

        <main className="grid min-h-0 flex-1 grid-cols-[minmax(0,0.72fr)_minmax(0,1.6fr)] items-center gap-4 px-7 pb-5 short:px-4 short:pb-3">
          <section className="min-w-0">
            <p className="truncate text-[11px] font-semibold uppercase tracking-[0.24em] text-[var(--faint)] short:text-[9px]">{model.family}</p>
            <h1 className="mt-1.5 font-display text-[clamp(2.2rem,5vw,4.6rem)] font-extrabold leading-[0.9] tracking-[-0.04em] short:text-[clamp(1.7rem,4.6vw,2.6rem)]">{model.name}</h1>
            <p key={skin.id} className="animate-rise mt-2 font-display text-lg font-semibold short:mt-1 short:text-sm" style={{ color: light ? alpha(skin.accent, 0.95) : skin.accent }}>
              {skin.name}
            </p>
            <div className="mt-3 flex items-center gap-2.5 short:mt-2 short:gap-2">
              {model.skins.map((s) => (
                <button
                  key={s.id}
                  aria-label={s.name}
                  onClick={() => select(model, s)}
                  className={cls('grid size-8 place-items-center rounded-full transition short:size-6', s.id === skin.id ? 'ring-2 ring-[var(--fg)] ring-offset-2 ring-offset-transparent' : 'hover:scale-110')}
                >
                  <span className="size-6 rounded-full shadow-[inset_0_1px_1px_rgba(255,255,255,0.45),inset_0_-2px_3px_rgba(0,0,0,0.3),0_2px_6px_rgba(0,0,0,0.35)] short:size-[18px]" style={{ background: s.swatch }} />
                </button>
              ))}
            </div>
            <div className="mt-6 flex items-center gap-2 short:mt-3">
              <button
                onClick={onPlay}
                className="flex items-center gap-2.5 rounded-full bg-[var(--solid)] py-3.5 pl-5 pr-7 font-display text-base font-semibold text-[var(--on-solid)] transition hover:scale-[1.03] active:scale-95 short:py-2.5 short:pl-4 short:pr-5 short:text-sm"
                style={{ boxShadow: `0 16px 40px -14px ${alpha(skin.accent, 0.9)}` }}
              >
                <Play className="size-4 fill-current" /> Jouer
              </button>
              {MODES.map((m) => {
                const active = conn.transport !== null && m.match.includes(conn.transport)
                return (
                  <button
                    key={m.id}
                    aria-label={m.label}
                    title={m.label}
                    onClick={() => onConnect(m.id)}
                    className={cls('relative grid size-12 place-items-center rounded-full border bg-[var(--glass)] backdrop-blur-xl transition hover:bg-[var(--glass-strong)] short:size-10', active ? 'border-[var(--accent)]' : 'border-[var(--line)]')}
                    style={{ boxShadow: active && conn.status === 'connected' ? `0 0 22px -6px ${skin.accent}` : undefined }}
                  >
                    <m.icon className="size-[18px] short:size-4" />
                    {active && (
                      <span className="absolute right-0.5 top-0.5">
                        <StatusDot status={conn.status} />
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
          </section>

          <section className="relative flex h-full min-h-0 items-center justify-center">
            <div className="pointer-events-none absolute bottom-[8%] h-[10%] w-[60%] rounded-[50%] blur-2xl" style={{ background: light ? 'rgba(20,22,30,0.26)' : 'rgba(0,0,0,0.7)' }} />
            <div
              className="relative w-full max-w-[min(100%,calc(66vh/var(--r)))] cursor-grab touch-none active:cursor-grabbing"
              style={{ perspective: 1400, ['--r' as string]: skin.ratio }}
              onPointerDown={onDown}
              onPointerMove={onMove}
              onPointerUp={onUp}
              onPointerCancel={onUp}
            >
              <div className="animate-float">
                <div style={{ transform: `rotateX(${tilt.x}deg) rotateY(${tilt.y}deg)`, transition: drag.current ? 'none' : 'transform 0.6s cubic-bezier(.2,.8,.2,1)' }}>
                  <ControllerPhoto key={skin.id} skin={skin} shadow className="animate-pop w-full" alt={`${model.name} ${skin.name}`} />
                  <div
                    className="pointer-events-none absolute inset-0 mix-blend-soft-light"
                    style={{
                      background: `linear-gradient(${105 + tilt.y * 3}deg, transparent 32%, rgba(255,255,255,${0.2 + Math.abs(tilt.y) / 50}) 48%, transparent 62%)`,
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
        </main>
      </div>
    </div>
  )
}
