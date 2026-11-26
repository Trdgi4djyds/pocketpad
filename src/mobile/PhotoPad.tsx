import { useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent as RPointerEvent, type ReactNode } from 'react'
import type { ControllerModel, Skin, Spot } from '../shared/catalog'
import { BTN, neutralState, type PadState } from '../shared/protocol'
import { alpha, mix } from '../shared/color'
import { tick } from './connection'

// Manette jouable construite sur la vraie photo : chaque zone tactile correspond à un bouton réel.
// Un seul gestionnaire de pointeurs attribue chaque doigt au contrôle le plus proche (multi-touch, glissement).

type Control =
  | { kind: 'stick'; side: 'L' | 'R'; x: number; y: number; r: number; zone: number }
  | { kind: 'dpad'; x: number; y: number; r: number; zone: number }
  | { kind: 'face'; x: number; y: number; zone: number; buttons: Array<{ mask: number; x: number; y: number; r: number }> }
  | { kind: 'button'; mask?: number; trigger?: 'lt' | 'rt'; x: number; y: number; w: number; h: number; round: boolean; label?: string; shoulder?: 'trigger' | 'bumper'; side?: 'L' | 'R' }

interface Geometry {
  img: { left: number; top: number; w: number; h: number }
  band: number
  controls: Control[]
}

function geometry(model: ControllerModel, skin: Skin, W: number, H: number): Geometry {
  const s = skin.spots
  const spots = [s.a, s.b, s.x, s.y, s.dpad, s.ls, s.rs, s.back, s.start, s.guide, s.capture].filter(Boolean) as Spot[]
  // Hauteur utile de la photo : jusqu'au bas du contrôle le plus bas
  const maxY = Math.min(1, Math.max(...spots.map((p) => p[1] + p[2] / skin.ratio)) + 0.045)
  const band = Math.round(Math.max(46, Math.min(96, H * 0.17)))
  const avail = H - band - 4
  const w = Math.min(W * 0.98, avail / (skin.ratio * maxY))
  const h = w * skin.ratio
  const left = (W - w) / 2
  const top = band + Math.max(0, (avail - h * maxY) / 2)
  const P = (p: Spot) => ({ x: left + p[0] * w, y: top + p[1] * h, r: p[2] * w })

  const c: Control[] = []
  if (s.ls) {
    const q = P(s.ls)
    c.push({ kind: 'stick', side: 'L', ...q, zone: Math.max(q.r * 2.4, 64) })
  }
  if (s.rs) {
    const q = P(s.rs)
    c.push({ kind: 'stick', side: 'R', ...q, zone: Math.max(q.r * 2.4, 64) })
  }
  {
    const q = P(s.dpad)
    c.push({ kind: 'dpad', ...q, zone: Math.max(q.r * 1.55, 56) })
  }
  {
    const buttons = ([
      [BTN.A, s.a],
      [BTN.B, s.b],
      [BTN.X, s.x],
      [BTN.Y, s.y],
    ] as const).map(([mask, spot]) => ({ mask, ...P(spot) }))
    const cx = buttons.reduce((t, b) => t + b.x, 0) / 4
    const cy = buttons.reduce((t, b) => t + b.y, 0) / 4
    const reach = Math.max(...buttons.map((b) => Math.hypot(b.x - cx, b.y - cy) + b.r))
    c.push({ kind: 'face', x: cx, y: cy, zone: reach * 1.35, buttons })
  }
  const small = (mask: number, spot: Spot | undefined) => {
    if (!spot) return
    const q = P(spot)
    const d = Math.max(q.r * 2, 30)
    c.push({ kind: 'button', mask, x: q.x, y: q.y, w: d, h: d, round: true })
  }
  small(BTN.BACK, s.back)
  small(BTN.START, s.start)
  small(BTN.GUIDE, s.guide)
  small(BTN.TOUCHPAD, s.capture)
  if (s.touchpad) {
    const [x, y, tw, th] = s.touchpad
    c.push({ kind: 'button', mask: BTN.TOUCHPAD, x: left + x * w, y: top + y * h, w: tw * w, h: th * h, round: false })
  }

  // Tranches et gâchettes, dans le bandeau supérieur
  const L = model.labels
  const pad = Math.max(8, W * 0.012)
  const sh = band - pad * 1.6
  const sw = Math.min(W * 0.15, 190)
  const y = pad + sh / 2
  const shoulder = (side: 'L' | 'R', i: number, ctrl: Partial<Extract<Control, { kind: 'button' }>>) => {
    const x = side === 'L' ? pad + sw / 2 + i * (sw + pad) : W - pad - sw / 2 - i * (sw + pad)
    c.push({ kind: 'button', x, y, w: sw, h: sh, round: false, side, ...ctrl })
  }
  if (model.noTriggers) {
    shoulder('L', 0, { mask: BTN.LB, label: L.lb, shoulder: 'bumper' })
    shoulder('R', 0, { mask: BTN.RB, label: L.rb, shoulder: 'bumper' })
  } else {
    shoulder('L', 0, { trigger: 'lt', label: L.lt, shoulder: 'trigger' })
    if (!model.noLB) shoulder('L', 1, { mask: BTN.LB, label: L.lb, shoulder: 'bumper' })
    shoulder('R', 0, { trigger: 'rt', label: L.rt, shoulder: 'trigger' })
    shoulder('R', 1, { mask: BTN.RB, label: L.rb, shoulder: 'bumper' })
  }
  return { img: { left, top, w, h }, band, controls: c }
}

interface Pointer { ctrl: number; x: number; y: number; t0: number; moved: number }
const clamp1 = (v: number) => Math.max(-1, Math.min(1, v))

function computeState(controls: Control[], pointers: Map<number, Pointer>, pulses: number): PadState {
  const s = neutralState()
  s.b |= pulses
  for (const p of pointers.values()) {
    const c = controls[p.ctrl]
    if (!c) continue
    if (c.kind === 'stick') {
      // Course du stick : 1,6 fois le rayon du capuchon
      const travel = c.r * 1.6
      let dx = (p.x - c.x) / travel
      let dy = (p.y - c.y) / travel
      const len = Math.hypot(dx, dy)
      if (len > 1) {
        dx /= len
        dy /= len
      }
      if (len < 0.08) dx = dy = 0
      if (c.side === 'L') {
        s.lx = clamp1(dx)
        s.ly = clamp1(-dy)
      } else {
        s.rx = clamp1(dx)
        s.ry = clamp1(-dy)
      }
    } else if (c.kind === 'dpad') {
      const dx = p.x - c.x
      const dy = p.y - c.y
      if (Math.hypot(dx, dy) < c.r * 0.2) continue
      const a = (Math.atan2(dy, dx) * 180) / Math.PI
      if (a > -67.5 && a < 67.5) s.b |= BTN.DPAD_RIGHT
      if (a > 22.5 && a < 157.5) s.b |= BTN.DPAD_DOWN
      if (a > 112.5 || a < -112.5) s.b |= BTN.DPAD_LEFT
      if (a > -157.5 && a < -22.5) s.b |= BTN.DPAD_UP
    } else if (c.kind === 'face') {
      let hit = 0
      let best = Infinity
      let nearest = 0
      for (const b of c.buttons) {
        const d = Math.hypot(p.x - b.x, p.y - b.y)
        if (d <= b.r * 1.45) hit |= b.mask
        if (d < best) {
          best = d
          nearest = b.mask
        }
      }
      s.b |= hit || nearest
    } else {
      if (c.trigger === 'lt') s.lt = 1
      else if (c.trigger === 'rt') s.rt = 1
      else if (c.mask) s.b |= c.mask
    }
  }
  return s
}

function pick(controls: Control[], x: number, y: number) {
  let best = -1
  let score = Infinity
  controls.forEach((c, i) => {
    let sc = Infinity
    if (c.kind === 'button') {
      const m = c.round ? 8 : 4
      if (Math.abs(x - c.x) <= c.w / 2 + m && Math.abs(y - c.y) <= c.h / 2 + m) sc = 0.25
    } else {
      const d = Math.hypot(x - c.x, y - c.y) / c.zone
      if (d <= 1) sc = d
    }
    if (sc < score) {
      score = sc
      best = i
    }
  })
  return best
}

interface Props {
  model: ControllerModel
  skin: Skin
  onState: (s: PadState) => void
  /** Contenu du centre du bandeau supérieur (menu, état de connexion) */
  center?: ReactNode
}

export function PhotoPad({ model, skin, onState, center }: Props) {
  const root = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ w: 0, h: 0 })
  const [vis, setVis] = useState<PadState>(neutralState)
  const pointers = useRef(new Map<number, Pointer>())
  const pulses = useRef(0)
  const prev = useRef<PadState>(neutralState())

  useLayoutEffect(() => {
    const el = root.current
    if (!el) return
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }))
    ro.observe(el)
    setSize({ w: el.clientWidth, h: el.clientHeight })
    return () => ro.disconnect()
  }, [])

  const geo = useMemo(() => (size.w ? geometry(model, skin, size.w, size.h) : null), [model, skin, size])
  const geoRef = useRef(geo)
  geoRef.current = geo

  const update = () => {
    const g = geoRef.current
    if (!g) return
    const s = computeState(g.controls, pointers.current, pulses.current)
    const rising = s.b & ~prev.current.b & ~(BTN.LS | BTN.RS)
    if (rising || (s.lt && !prev.current.lt) || (s.rt && !prev.current.rt)) tick()
    prev.current = s
    setVis(s)
    onState(s)
  }

  // Tout relâcher si l'application passe en arrière-plan
  useEffect(() => {
    const release = () => {
      pointers.current.clear()
      pulses.current = 0
      update()
    }
    window.addEventListener('blur', release)
    document.addEventListener('visibilitychange', release)
    return () => {
      window.removeEventListener('blur', release)
      document.removeEventListener('visibilitychange', release)
      onState(neutralState())
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const local = (e: RPointerEvent) => {
    const r = root.current!.getBoundingClientRect()
    return { x: e.clientX - r.left, y: e.clientY - r.top }
  }

  const onDown = (e: RPointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('[data-ui]')) return
    const g = geoRef.current
    if (!g) return
    e.preventDefault()
    const { x, y } = local(e)
    const ctrl = pick(g.controls, x, y)
    if (ctrl < 0) return
    root.current?.setPointerCapture(e.pointerId)
    pointers.current.set(e.pointerId, { ctrl, x, y, t0: performance.now(), moved: 0 })
    update()
  }

  const onMove = (e: RPointerEvent<HTMLDivElement>) => {
    const p = pointers.current.get(e.pointerId)
    const g = geoRef.current
    if (!p || !g) return
    const { x, y } = local(e)
    const c = g.controls[p.ctrl]
    if (c?.kind === 'stick') p.moved = Math.max(p.moved, Math.hypot(x - c.x, y - c.y) / c.r)
    // Glissement d'une touche à l'autre (tranches, boutons centraux)
    if (c?.kind === 'button') {
      const next = pick(g.controls, x, y)
      if (next >= 0 && g.controls[next].kind === 'button') p.ctrl = next
    }
    p.x = x
    p.y = y
    update()
  }

  const onUp = (e: RPointerEvent<HTMLDivElement>) => {
    const p = pointers.current.get(e.pointerId)
    const g = geoRef.current
    if (!p || !g) return
    pointers.current.delete(e.pointerId)
    const c = g.controls[p.ctrl]
    // Appui bref sur un stick = clic L3 / R3
    if (c?.kind === 'stick' && performance.now() - p.t0 < 220 && p.moved < 0.35) {
      const mask = c.side === 'L' ? BTN.LS : BTN.RS
      pulses.current |= mask
      tick()
      setTimeout(() => {
        pulses.current &= ~mask
        update()
      }, 110)
    }
    update()
  }

  // Positions calculées des contrôles (utilisées par les tests automatisés)
  const layout = useMemo(() => {
    if (!geo) return undefined
    const out: Record<string, number[]> = {}
    for (const c of geo.controls) {
      if (c.kind === 'stick') out[c.side + 'S'] = [c.x, c.y, c.r]
      else if (c.kind === 'dpad') out.DPAD = [c.x, c.y, c.r]
      else if (c.kind === 'face') c.buttons.forEach((b) => (out[`F${b.mask}`] = [b.x, b.y, b.r]))
      else out[c.trigger ? c.trigger.toUpperCase() : `B${c.mask}`] = [c.x, c.y, c.w, c.h]
    }
    return JSON.stringify(out)
  }, [geo])

  const light = skin.tone === 'light'
  const plasticTop = light ? '#fbfbfd' : mix(skin.studio, '#ffffff', 0.16)
  const plasticBottom = light ? '#c9ccd4' : mix(skin.studio, '#000000', 0.35)
  const ink = light ? 'rgba(20,22,30,0.72)' : 'rgba(255,255,255,0.78)'

  return (
    <div
      ref={root}
      data-layout={layout}
      className="relative h-full w-full touch-none select-none overflow-hidden"
      style={{
        background: light
          ? `radial-gradient(90% 85% at 50% 55%, #ffffff 0%, ${skin.studio} 55%, ${mix(skin.studio, '#000000', 0.14)} 100%)`
          : `radial-gradient(90% 85% at 50% 55%, ${mix(skin.studio, skin.accent, 0.12)} 0%, ${skin.studio} 55%, #040405 100%)`,
      }}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
      onContextMenu={(e) => e.preventDefault()}
    >
      {geo && (
        <>
          <img
            src={skin.photo}
            alt={`${model.name} ${skin.name}`}
            draggable={false}
            className="pointer-events-none absolute max-w-none select-none"
            style={{
              left: geo.img.left,
              top: geo.img.top,
              width: geo.img.w,
              height: geo.img.h,
              filter: light ? 'drop-shadow(0 18px 22px rgba(20,22,30,0.25))' : 'drop-shadow(0 20px 26px rgba(0,0,0,0.55))',
            }}
          />
          {geo.controls.map((c, i) => {
            if (c.kind === 'stick') {
              const vx = c.side === 'L' ? vis.lx : vis.rx
              const vy = c.side === 'L' ? vis.ly : vis.ry
              const clicked = (vis.b & (c.side === 'L' ? BTN.LS : BTN.RS)) !== 0
              const moving = clicked || Math.hypot(vx, vy) > 0.02
              const cap = c.r * 1.06
              const ox = vx * c.r * 0.55
              const oy = -vy * c.r * 0.55
              return (
                <div key={i} className="pointer-events-none absolute" style={{ left: c.x - cap, top: c.y - cap, width: cap * 2, height: cap * 2 }}>
                  {moving && (
                    <>
                      {/* Puits sombre sous le capuchon déplacé */}
                      <div className="absolute inset-0 rounded-full" style={{ background: 'radial-gradient(circle at 50% 45%, #050506, #17181c 70%, #2a2b31)', boxShadow: 'inset 0 6px 14px rgba(0,0,0,0.85)' }} />
                      {/* Capuchon découpé dans la photo, qui suit le doigt */}
                      <div
                        className="absolute inset-0 rounded-full"
                        style={{
                          transform: `translate(${ox}px, ${oy}px) scale(${clicked ? 0.94 : 1})`,
                          backgroundImage: `url(${skin.photo})`,
                          backgroundSize: `${geo.img.w}px ${geo.img.h}px`,
                          backgroundPosition: `${-(c.x - cap - geo.img.left)}px ${-(c.y - cap - geo.img.top)}px`,
                          boxShadow: `0 8px 14px rgba(0,0,0,0.5)${clicked ? `, 0 0 0 3px ${alpha(skin.accent, 0.9)}, 0 0 22px ${skin.accent}` : ''}`,
                        }}
                      />
                    </>
                  )}
                </div>
              )
            }
            if (c.kind === 'dpad') {
              const arms: Array<[number, number, number]> = [
                [BTN.DPAD_UP, 0, -1],
                [BTN.DPAD_DOWN, 0, 1],
                [BTN.DPAD_LEFT, -1, 0],
                [BTN.DPAD_RIGHT, 1, 0],
              ]
              return arms.map(([mask, ax, ay]) =>
                (vis.b & mask) !== 0 ? <Press key={`${i}-${mask}`} x={c.x + ax * c.r * 0.6} y={c.y + ay * c.r * 0.6} r={c.r * 0.42} accent={skin.accent} /> : null,
              )
            }
            if (c.kind === 'face') return c.buttons.map((b) => ((vis.b & b.mask) !== 0 ? <Press key={`${i}-${b.mask}`} x={b.x} y={b.y} r={b.r} accent={skin.accent} /> : null))
            if (c.shoulder) {
              const on = c.trigger ? (c.trigger === 'lt' ? vis.lt : vis.rt) > 0 : c.mask ? (vis.b & c.mask) !== 0 : false
              const outer = c.side === 'L' ? 'left' : 'right'
              const radius =
                c.shoulder === 'trigger'
                  ? outer === 'left'
                    ? `${c.h * 0.9}px ${c.h * 0.45}px ${c.h * 0.22}px ${c.h * 0.22}px`
                    : `${c.h * 0.45}px ${c.h * 0.9}px ${c.h * 0.22}px ${c.h * 0.22}px`
                  : `${c.h * 0.5}px`
              return (
                <div
                  key={i}
                  className="pointer-events-none absolute flex items-center justify-center font-display font-semibold tracking-wide transition-[transform,filter] duration-75"
                  style={{
                    left: c.x - c.w / 2,
                    top: c.y - c.h / 2,
                    width: c.w,
                    height: c.h,
                    borderRadius: radius,
                    background: `linear-gradient(180deg, ${plasticTop} 0%, ${plasticBottom} 100%)`,
                    boxShadow: on
                      ? `inset 0 3px 10px rgba(0,0,0,0.45), 0 0 0 2px ${alpha(skin.accent, 0.9)}, 0 0 20px ${alpha(skin.accent, 0.7)}`
                      : `inset 0 1px 0 rgba(255,255,255,${light ? 0.9 : 0.25}), inset 0 -2px 4px rgba(0,0,0,0.25), 0 6px 14px rgba(0,0,0,${light ? 0.18 : 0.5})`,
                    transform: on ? 'translateY(2px) scale(0.985)' : undefined,
                    filter: on ? 'brightness(0.88)' : undefined,
                    color: ink,
                    fontSize: Math.max(12, c.h * 0.32),
                  }}
                >
                  {c.label}
                </div>
              )
            }
            const on = c.mask ? (vis.b & c.mask) !== 0 : false
            if (!on) return null
            if (c.round) return <Press key={i} x={c.x} y={c.y} r={c.w / 2} accent={skin.accent} />
            return (
              <div
                key={i}
                className="pointer-events-none absolute rounded-[14%]"
                style={{ left: c.x - c.w / 2, top: c.y - c.h / 2, width: c.w, height: c.h, background: 'rgba(0,0,0,0.14)', boxShadow: `inset 0 4px 14px rgba(0,0,0,0.45), 0 0 0 2px ${alpha(skin.accent, 0.85)}, 0 0 26px ${alpha(skin.accent, 0.55)}` }}
              />
            )
          })}
          <div data-ui className="absolute left-1/2 flex items-center" style={{ top: geo.band / 2, transform: 'translate(-50%, -50%)' }}>
            {center}
          </div>
        </>
      )}
    </div>
  )
}

/** Bouton enfoncé : ombre intérieure + lueur de la couleur d'accent. */
function Press({ x, y, r, accent }: { x: number; y: number; r: number; accent: string }) {
  return (
    <div
      className="pointer-events-none absolute rounded-full"
      style={{
        left: x - r,
        top: y - r,
        width: r * 2,
        height: r * 2,
        background: 'radial-gradient(circle at 50% 40%, rgba(0,0,0,0.38), rgba(0,0,0,0.18) 60%, rgba(0,0,0,0.05) 100%)',
        boxShadow: `inset 0 4px 10px rgba(0,0,0,0.55), 0 0 0 2px ${alpha(accent, 0.9)}, 0 0 20px 2px ${alpha(accent, 0.65)}`,
      }}
    />
  )
}
