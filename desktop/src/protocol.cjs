// Doit rester aligné sur src/lib/protocol.ts (masques XInput).
const BTN = {
  DPAD_UP: 0x0001,
  DPAD_DOWN: 0x0002,
  DPAD_LEFT: 0x0004,
  DPAD_RIGHT: 0x0008,
  START: 0x0010,
  BACK: 0x0020,
  LS: 0x0040,
  RS: 0x0080,
  LB: 0x0100,
  RB: 0x0200,
  GUIDE: 0x0400,
  TOUCHPAD: 0x0800,
  A: 0x1000,
  B: 0x2000,
  X: 0x4000,
  Y: 0x8000,
}

const DEFAULT_PORT = 47800
const PROTOCOL_VERSION = 1
const MAX_PLAYERS = 4

const neutralState = () => ({ b: 0, lx: 0, ly: 0, rx: 0, ry: 0, lt: 0, rt: 0 })

const num = (v, min, max) => {
  const n = Number(v)
  if (!Number.isFinite(n)) return 0
  return Math.max(min, Math.min(max, n))
}

/** Nettoie un état reçu du réseau. */
function sanitizeState(m) {
  return {
    b: (Number(m.b) >>> 0) & 0xffff,
    lx: num(m.lx, -1, 1),
    ly: num(m.ly, -1, 1),
    rx: num(m.rx, -1, 1),
    ry: num(m.ry, -1, 1),
    lt: num(m.lt, 0, 1),
    rt: num(m.rt, 0, 1),
  }
}

module.exports = { BTN, DEFAULT_PORT, PROTOCOL_VERSION, MAX_PLAYERS, neutralState, sanitizeState }
