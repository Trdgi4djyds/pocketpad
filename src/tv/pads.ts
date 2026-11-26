import { PocketPad, isNativeApp } from '../shared/native'
import { BTN, neutralState, sameState, type PadState } from '../shared/protocol'

// Manettes physiques branchées sur la TV (Bluetooth, USB) : capturées par Android (plugin natif)
// ou, dans un navigateur, par l'API Gamepad.

export interface TvPad {
  index: number
  key: string
  name: string
  state: PadState
}

type Fn = (pad: TvPad) => void

const r3 = (v: number) => Math.round(v * 1000) / 1000

function fromGamepad(gp: Gamepad): PadState {
  const on = (i: number) => !!gp.buttons[i]?.pressed
  const map: Array<[number, number]> = [
    [0, BTN.A], [1, BTN.B], [2, BTN.X], [3, BTN.Y], [4, BTN.LB], [5, BTN.RB], [8, BTN.BACK], [9, BTN.START],
    [10, BTN.LS], [11, BTN.RS], [12, BTN.DPAD_UP], [13, BTN.DPAD_DOWN], [14, BTN.DPAD_LEFT], [15, BTN.DPAD_RIGHT], [16, BTN.GUIDE],
  ]
  let b = 0
  for (const [i, m] of map) if (on(i)) b |= m
  const ax = (i: number) => {
    const v = gp.axes[i] ?? 0
    return Math.abs(v) < 0.06 ? 0 : r3(v)
  }
  return { b, lx: ax(0), ly: -ax(1), rx: ax(2), ry: -ax(3), lt: r3(gp.buttons[6]?.value ?? 0), rt: r3(gp.buttons[7]?.value ?? 0) }
}

const cleanName = (n: string) => n.replace(/\s*\(.*?vendor.*?\)\s*/i, '').replace(/\s*\(STANDARD GAMEPAD.*\)/i, '').trim() || 'Manette'

/** Index réservé à la télécommande quand elle sert de manette pendant la diffusion. */
export const REMOTE_INDEX = 7

class PadHub {
  private pads = new Map<string, TvPad>()
  private fns = new Set<Fn>()
  private listFns = new Set<() => void>()
  private started = false
  private snapshot: TvPad[] = []

  list = () => this.snapshot
  onChange(fn: Fn) {
    this.fns.add(fn)
    return () => {
      this.fns.delete(fn)
    }
  }
  onList = (fn: () => void) => {
    this.listFns.add(fn)
    return () => {
      this.listFns.delete(fn)
    }
  }

  private freeIndex() {
    const used = new Set([...this.pads.values()].map((p) => p.index))
    for (let i = 0; i < REMOTE_INDEX; i++) if (!used.has(i)) return i
    return REMOTE_INDEX - 1
  }

  private changedList() {
    this.snapshot = [...this.pads.values()].sort((a, b) => a.index - b.index)
    this.listFns.forEach((f) => f())
  }

  update(key: string, name: string, s: PadState) {
    let p = this.pads.get(key)
    if (!p) {
      p = { index: key === 'remote' ? REMOTE_INDEX : this.freeIndex(), key, name: cleanName(name), state: neutralState() }
      this.pads.set(key, p)
      this.changedList()
    }
    if (sameState(p.state, s)) return
    p.state = s
    this.fns.forEach((f) => f(p!))
  }

  remove(key: string) {
    const p = this.pads.get(key)
    if (!p) return
    this.pads.delete(key)
    this.changedList()
    this.fns.forEach((f) => f({ ...p, state: neutralState(), name: '' }))
  }

  start() {
    if (this.started) return
    this.started = true
    if (isNativeApp) {
      PocketPad.setPadCapture({ enabled: true }).catch(() => {})
      PocketPad.addListener('pad', (p) => this.update(`n${p.id}`, p.name, { b: p.b, lx: p.lx, ly: p.ly, rx: p.rx, ry: p.ry, lt: p.lt, rt: p.rt })).catch(() => {})
      PocketPad.addListener('pads', ({ pads }) => {
        const keep = new Set(pads.map((p) => `n${p.id}`))
        for (const k of [...this.pads.keys()]) if (k.startsWith('n') && !keep.has(k)) this.remove(k)
      }).catch(() => {})
      return
    }
    const poll = () => {
      for (const gp of navigator.getGamepads?.() ?? []) if (gp && gp.connected) this.update(`w${gp.index}`, gp.id, fromGamepad(gp))
      requestAnimationFrame(poll)
    }
    window.addEventListener('gamepaddisconnected', (e) => this.remove(`w${e.gamepad.index}`))
    requestAnimationFrame(poll)
  }
}

export const pads = new PadHub()
