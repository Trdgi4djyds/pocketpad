// Relais Bluetooth : le téléphone appairé en Bluetooth apparaît dans Windows comme une manette HID générique,
// que GTA V et beaucoup de jeux ignorent. Le Hub lit ses rapports HID et les rejoue sur une manette Xbox 360 virtuelle.
let HID = null
try {
  HID = require('node-hid')
} catch {
  /* module optionnel */
}

const ORDER = ['A', 'B', 'X', 'Y', 'LB', 'RB', 'LT', 'RT', 'BACK', 'START', 'LS', 'RS', 'GUIDE', 'TOUCHPAD']

// Windows nomme en général la manette d'après le service Bluetooth « PocketPad ». À défaut, une manette HID
// annoncée par la pile Bluetooth d'Android (identifiants fabricant Google) est aussi reconnue.
const ANDROID_VENDORS = new Set([0x18d1, 0x00e0])

/** Appareil HID qui correspond au téléphone PocketPad appairé en Bluetooth. */
function isPocketPad(d) {
  if (d.usagePage !== undefined && d.usagePage !== 1) return false
  if (/pocketpad/i.test(`${d.product || ''} ${d.manufacturer || ''}`)) return true
  return ANDROID_VENDORS.has(d.vendorId) && (d.usage === 5 || d.usage === 4)
}
const BTN = require('./protocol.cjs').BTN
const HAT = [BTN.DPAD_UP, BTN.DPAD_UP | BTN.DPAD_RIGHT, BTN.DPAD_RIGHT, BTN.DPAD_DOWN | BTN.DPAD_RIGHT, BTN.DPAD_DOWN, BTN.DPAD_DOWN | BTN.DPAD_LEFT, BTN.DPAD_LEFT, BTN.DPAD_UP | BTN.DPAD_LEFT]

/** Décode le rapport n°1 de PocketPad (voir hidReport() dans src/shared/protocol.ts). */
function parseReport(buf) {
  let d = buf
  if (d.length >= 10 && d[0] === 1) d = d.subarray(1)
  if (d.length < 9) return null
  const bits = d[0] | (d[1] << 8)
  let b = 0
  let lt = 0
  let rt = 0
  ORDER.forEach((name, i) => {
    if (!(bits & (1 << i))) return
    if (name === 'LT') lt = 1
    else if (name === 'RT') rt = 1
    else b |= BTN[name]
  })
  const hat = d[2] & 0x0f
  if (hat < 8) b |= HAT[hat]
  const ax = (v) => Math.max(-1, Math.min(1, (v / 255) * 2 - 1))
  return { b, lx: ax(d[3]), ly: -ax(d[4]), rx: ax(d[5]), ry: -ax(d[6]), lt: Math.max(lt, d[7] / 255), rt: Math.max(rt, d[8] / 255) }
}

class BtBridge {
  /** @param {{ attach: (key: string, name: string) => any, update: (key: string, s: any) => void, detach: (key: string) => void, log: (m: string, l?: string) => void }} opts */
  constructor(opts) {
    this.opts = opts
    this.open = new Map()
    this.enabled = true
    this.timer = null
  }

  get available() {
    return !!HID
  }

  start() {
    if (!HID || this.timer) return
    this.timer = setInterval(() => this.scan(), 3000)
    this.scan()
  }

  stop() {
    clearInterval(this.timer)
    this.timer = null
    for (const key of [...this.open.keys()]) this.close(key)
  }

  setEnabled(on) {
    this.enabled = on
    if (on) this.start()
    else this.stop()
  }

  scan() {
    if (!this.enabled) return
    let list = []
    try {
      list = HID.devices()
    } catch {
      return
    }
    const found = list.filter(isPocketPad)
    for (const d of found) {
      if (!d.path || this.open.has(d.path)) continue
      try {
        const dev = new HID.HID(d.path)
        this.open.set(d.path, dev)
        this.opts.attach(d.path, d.product || 'PocketPad Bluetooth')
        this.opts.log('Manette Bluetooth relayée en Xbox 360', 'success')
        dev.on('data', (buf) => {
          const s = parseReport(buf)
          if (s) this.opts.update(d.path, s)
        })
        dev.on('error', () => this.close(d.path))
      } catch {
        /* appareil occupé ou en cours de connexion */
      }
    }
    for (const key of [...this.open.keys()]) if (!found.some((d) => d.path === key)) this.close(key)
  }

  close(key) {
    const dev = this.open.get(key)
    this.open.delete(key)
    try {
      dev?.close()
    } catch {
      /* déjà fermé */
    }
    this.opts.detach(key)
  }
}

module.exports = { BtBridge, parseReport, isPocketPad }
