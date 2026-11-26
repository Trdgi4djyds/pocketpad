import type { CSSProperties } from 'react'
import type { Skin, Spot } from './catalog'
import { BTN, type PadState } from './protocol'
import { alpha } from './color'
import { cls } from './cls'

interface Props {
  skin: Skin
  /** État en direct : allume les boutons pressés sur la photo */
  state?: PadState
  className?: string
  style?: CSSProperties
  /** Ombre portée de studio */
  shadow?: boolean
  /** Reflet sur le sol */
  reflect?: boolean
  alt?: string
}

/** Photo réelle de la manette, avec en option la visualisation des entrées. */
export function ControllerPhoto({ skin, state, className, style, shadow, reflect, alt }: Props) {
  const filter = shadow ? (skin.tone === 'light' ? 'drop-shadow(0 28px 26px rgba(20,22,30,0.28)) drop-shadow(0 6px 6px rgba(20,22,30,0.18))' : 'drop-shadow(0 30px 34px rgba(0,0,0,0.6)) drop-shadow(0 6px 8px rgba(0,0,0,0.5))') : undefined
  return (
    <div className={cls('relative', className)} style={{ aspectRatio: `1 / ${skin.ratio}`, ...style }}>
      <img
        src={skin.photo}
        alt={alt ?? skin.name}
        draggable={false}
        className="absolute inset-0 h-full w-full select-none object-contain"
        style={{
          filter,
          WebkitBoxReflect: reflect ? `below 2px linear-gradient(transparent 72%, ${skin.tone === 'light' ? 'rgba(255,255,255,0.22)' : 'rgba(255,255,255,0.09)'})` : undefined,
        }}
      />
      {state && <LiveOverlay skin={skin} state={state} />}
    </div>
  )
}

function Dot({ spot, ratio, on, accent, scale = 1, dx = 0, dy = 0 }: { spot: Spot; ratio: number; on: boolean; accent: string; scale?: number; dx?: number; dy?: number }) {
  const [x, y, r] = spot
  const size = r * 2 * scale * 100
  return (
    <span
      className="pointer-events-none absolute rounded-full transition-[opacity,transform] duration-75"
      style={{
        left: `${(x + dx) * 100}%`,
        top: `${(y + dy / ratio) * 100}%`,
        width: `${size}%`,
        aspectRatio: '1',
        transform: `translate(-50%, -50%) scale(${on ? 1 : 0.85})`,
        opacity: on ? 1 : 0,
        background: `radial-gradient(circle, ${alpha(accent, 0.55)} 0%, ${alpha(accent, 0.25)} 55%, transparent 72%)`,
        boxShadow: `0 0 0 2px ${alpha(accent, 0.9)}, 0 0 22px 4px ${alpha(accent, 0.65)}`,
      }}
    />
  )
}

function LiveOverlay({ skin, state }: { skin: Skin; state: PadState }) {
  const s = skin.spots
  const on = (m: number) => (state.b & m) !== 0
  const acc = skin.accent
  const R = skin.ratio
  const d = s.dpad
  const arm = d[2] * 0.62
  const dpadSpot: Spot = [d[0], d[1], d[2] * 0.36]
  return (
    <div className="pointer-events-none absolute inset-0">
      <Dot spot={s.a} ratio={R} on={on(BTN.A)} accent={acc} />
      <Dot spot={s.b} ratio={R} on={on(BTN.B)} accent={acc} />
      <Dot spot={s.x} ratio={R} on={on(BTN.X)} accent={acc} />
      <Dot spot={s.y} ratio={R} on={on(BTN.Y)} accent={acc} />
      <Dot spot={dpadSpot} ratio={R} on={on(BTN.DPAD_UP)} accent={acc} dy={-arm} />
      <Dot spot={dpadSpot} ratio={R} on={on(BTN.DPAD_DOWN)} accent={acc} dy={arm} />
      <Dot spot={dpadSpot} ratio={R} on={on(BTN.DPAD_LEFT)} accent={acc} dx={-arm} />
      <Dot spot={dpadSpot} ratio={R} on={on(BTN.DPAD_RIGHT)} accent={acc} dx={arm} />
      {s.back && <Dot spot={s.back} ratio={R} on={on(BTN.BACK)} accent={acc} scale={1.4} />}
      {s.start && <Dot spot={s.start} ratio={R} on={on(BTN.START)} accent={acc} scale={1.4} />}
      {s.guide && <Dot spot={s.guide} ratio={R} on={on(BTN.GUIDE)} accent={acc} scale={1.3} />}
      {s.capture && <Dot spot={s.capture} ratio={R} on={on(BTN.TOUCHPAD)} accent={acc} scale={1.4} />}
      {s.touchpad && on(BTN.TOUCHPAD) && (
        <span
          className="absolute rounded-[18%]"
          style={{
            left: `${(s.touchpad[0] - s.touchpad[2] / 2) * 100}%`,
            top: `${(s.touchpad[1] - s.touchpad[3] / 2) * 100}%`,
            width: `${s.touchpad[2] * 100}%`,
            height: `${s.touchpad[3] * 100}%`,
            background: alpha(acc, 0.25),
            boxShadow: `0 0 0 2px ${alpha(acc, 0.9)}, 0 0 24px ${alpha(acc, 0.6)}`,
          }}
        />
      )}
      {s.ls && <StickMarker spot={s.ls} ratio={R} vx={state.lx} vy={state.ly} click={on(BTN.LS)} accent={acc} />}
      {s.rs && <StickMarker spot={s.rs} ratio={R} vx={state.rx} vy={state.ry} click={on(BTN.RS)} accent={acc} />}
    </div>
  )
}

function StickMarker({ spot, ratio, vx, vy, click, accent }: { spot: Spot; ratio: number; vx: number; vy: number; click: boolean; accent: string }) {
  const active = click || Math.hypot(vx, vy) > 0.08
  const [x, y, r] = spot
  return (
    <>
      <span
        className="absolute rounded-full transition-opacity duration-100"
        style={{
          left: `${x * 100}%`,
          top: `${y * 100}%`,
          width: `${r * 2.3 * 100}%`,
          aspectRatio: '1',
          transform: 'translate(-50%, -50%)',
          opacity: active ? 1 : 0,
          border: `2px solid ${alpha(accent, click ? 1 : 0.6)}`,
          boxShadow: click ? `0 0 24px 4px ${alpha(accent, 0.7)}` : undefined,
        }}
      />
      <span
        className="absolute rounded-full transition-opacity duration-100"
        style={{
          left: `${(x + vx * r * 0.9) * 100}%`,
          top: `${(y - (vy * r * 0.9) / ratio) * 100}%`,
          width: `${r * 0.42 * 100}%`,
          aspectRatio: '1',
          transform: 'translate(-50%, -50%)',
          opacity: active ? 0.95 : 0,
          background: '#ffffff',
          boxShadow: `0 0 0 3px ${alpha(accent, 0.9)}, 0 0 16px 4px ${alpha(accent, 0.75)}`,
        }}
      />
    </>
  )
}
