// Souris et clavier Windows (SendInput via user32) pour piloter le bureau depuis la manette de la TV.
let mouse_event = null
let keybd_event = null
let error = null
if (process.platform === 'win32') {
  try {
    const koffi = require('koffi')
    const user32 = koffi.load('user32.dll')
    mouse_event = user32.func('void __stdcall mouse_event(uint32 dwFlags, int32 dx, int32 dy, int32 dwData, uintptr dwExtraInfo)')
    keybd_event = user32.func('void __stdcall keybd_event(uint8 bVk, uint8 bScan, uint32 dwFlags, uintptr dwExtraInfo)')
  } catch (e) {
    error = e.message
  }
} else error = 'Windows requis'

const F = { MOVE: 0x1, LEFTDOWN: 0x2, LEFTUP: 0x4, RIGHTDOWN: 0x8, RIGHTUP: 0x10, WHEEL: 0x800, HWHEEL: 0x1000 }
const VK = { RETURN: 0x0d, ESCAPE: 0x1b, LWIN: 0x5b, TAB: 0x09, MENU: 0x12, F11: 0x7a, SPACE: 0x20, BACK: 0x08 }

const available = () => !!mouse_event
const move = (dx, dy) => mouse_event && (dx || dy) && mouse_event(F.MOVE, Math.round(dx), Math.round(dy), 0, 0)
const button = (which, down) => mouse_event && mouse_event(which === 'right' ? (down ? F.RIGHTDOWN : F.RIGHTUP) : down ? F.LEFTDOWN : F.LEFTUP, 0, 0, 0, 0)
const wheel = (dy, dx = 0) => {
  if (!mouse_event) return
  if (dy) mouse_event(F.WHEEL, 0, 0, Math.round(dy), 0)
  if (dx) mouse_event(F.HWHEEL, 0, 0, Math.round(dx), 0)
}
const key = (vk, down) => keybd_event && keybd_event(vk, 0, down ? 0 : 2, 0)
const tap = (...vks) => {
  vks.forEach((v) => key(v, true))
  vks.reverse().forEach((v) => key(v, false))
}

module.exports = { available, move, button, wheel, key, tap, VK, error: () => error }
