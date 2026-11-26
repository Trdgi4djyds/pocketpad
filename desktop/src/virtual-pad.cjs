// Manettes virtuelles Windows via le pilote ViGEmBus (Xbox 360 ou DualShock 4).
const { BTN } = require('./protocol.cjs')

let ViGEmClient = null
let loadError = null
try {
  ViGEmClient = require('vigemclient')
} catch (e) {
  loadError = process.platform === 'win32' ? `Module vigemclient indisponible : ${e.message}` : 'Les manettes virtuelles nécessitent Windows.'
}

let client = null
let connectError = null
let lastAttempt = 0

function ensureClient() {
  if (client) return client
  if (!ViGEmClient) return null
  // Évite de marteler le pilote quand il est absent
  if (Date.now() - lastAttempt < 3000) return null
  lastAttempt = Date.now()
  try {
    const c = new ViGEmClient()
    const err = c.connect()
    if (err) {
      connectError = `ViGEmBus : ${err.message || err}`
      return null
    }
    client = c
    connectError = null
    return client
  } catch (e) {
    connectError = `ViGEmBus : ${e.message}`
    return null
  }
}

function status() {
  const ok = !!ensureClient()
  return { available: !!ViGEmClient, connected: ok, error: ok ? undefined : connectError || loadError || undefined }
}

class VirtualPad {
  /**
   * @param {'x360'|'ds4'} type
   * @param {(large:number, small:number) => void} onRumble
   */
  constructor(type, onRumble) {
    const c = ensureClient()
    if (!c) throw new Error(connectError || loadError || 'Pilote ViGEmBus indisponible')
    this.type = type
    this.pad = type === 'ds4' ? c.createDS4Controller() : c.createX360Controller()
    const err = this.pad.connect()
    if (err) throw err
    this.pad.updateMode = 'manual'
    let large = 0
    let small = 0
    this.pad.on('large motor', (v) => {
      large = v
      onRumble(large, small)
    })
    this.pad.on('small motor', (v) => {
      small = v
      onRumble(large, small)
    })
  }

  apply(s) {
    const B = this.pad.button
    const A = this.pad.axis
    const on = (m) => (s.b & m) !== 0
    if (this.type === 'x360') {
      B.A.setValue(on(BTN.A))
      B.B.setValue(on(BTN.B))
      B.X.setValue(on(BTN.X))
      B.Y.setValue(on(BTN.Y))
      B.LEFT_SHOULDER.setValue(on(BTN.LB))
      B.RIGHT_SHOULDER.setValue(on(BTN.RB))
      B.BACK.setValue(on(BTN.BACK))
      B.START.setValue(on(BTN.START))
      B.GUIDE.setValue(on(BTN.GUIDE))
      B.LEFT_THUMB.setValue(on(BTN.LS))
      B.RIGHT_THUMB.setValue(on(BTN.RS))
    } else {
      B.CROSS.setValue(on(BTN.A))
      B.CIRCLE.setValue(on(BTN.B))
      B.SQUARE.setValue(on(BTN.X))
      B.TRIANGLE.setValue(on(BTN.Y))
      B.SHOULDER_LEFT.setValue(on(BTN.LB))
      B.SHOULDER_RIGHT.setValue(on(BTN.RB))
      B.SHARE.setValue(on(BTN.BACK))
      B.OPTIONS.setValue(on(BTN.START))
      B.SPECIAL_PS.setValue(on(BTN.GUIDE))
      B.SPECIAL_TOUCHPAD.setValue(on(BTN.TOUCHPAD))
      B.THUMB_LEFT.setValue(on(BTN.LS))
      B.THUMB_RIGHT.setValue(on(BTN.RS))
      B.TRIGGER_LEFT.setValue(s.lt > 0.5)
      B.TRIGGER_RIGHT.setValue(s.rt > 0.5)
    }
    A.leftX.setValue(s.lx)
    A.leftY.setValue(s.ly)
    A.rightX.setValue(s.rx)
    A.rightY.setValue(s.ry)
    A.leftTrigger.setValue(s.lt)
    A.rightTrigger.setValue(s.rt)
    A.dpadHorz.setValue(on(BTN.DPAD_RIGHT) ? 1 : on(BTN.DPAD_LEFT) ? -1 : 0)
    A.dpadVert.setValue(on(BTN.DPAD_UP) ? 1 : on(BTN.DPAD_DOWN) ? -1 : 0)
    this.pad.update()
  }

  destroy() {
    try {
      this.pad.resetInputs()
      this.pad.disconnect()
    } catch {
      /* déjà débranchée */
    }
  }
}

module.exports = { status, VirtualPad }
