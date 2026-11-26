// Détection des téléphones branchés en USB et création du tunnel `adb reverse`.
const { execFile } = require('child_process')
const fs = require('fs')
const path = require('path')
const { DEFAULT_PORT } = require('./protocol.cjs')

function adbPath() {
  const exe = process.platform === 'win32' ? 'adb.exe' : 'adb'
  const bundled = process.resourcesPath ? path.join(process.resourcesPath, 'vendor', 'platform-tools', exe) : ''
  return bundled && fs.existsSync(bundled) ? bundled : 'adb'
}

function run(args) {
  return new Promise((resolve, reject) => {
    execFile(adbPath(), args, { timeout: 6000, windowsHide: true }, (err, stdout, stderr) => {
      if (err) reject(Object.assign(err, { stderr }))
      else resolve(String(stdout))
    })
  })
}

class AdbWatcher {
  /**
   * @param {number} hostPort port réel du Hub sur le PC
   * @param {() => void} onChange
   * @param {(msg: string, level?: string) => void} log
   */
  constructor(hostPort, onChange, log) {
    this.hostPort = hostPort
    this.onChange = onChange
    this.log = log
    this.devices = new Map()
    this.available = true
    this.error = undefined
    this.timer = null
    this.busy = false
  }

  start() {
    this.poll()
    this.timer = setInterval(() => this.poll(), 2500)
  }

  stop() {
    clearInterval(this.timer)
  }

  state() {
    return { available: this.available, error: this.error, devices: [...this.devices.values()] }
  }

  async poll() {
    if (this.busy) return
    this.busy = true
    try {
      const out = await run(['devices', '-l'])
      const seen = new Set()
      for (const line of out.split(/\r?\n/).slice(1)) {
        const m = line.trim().match(/^(\S+)\s+(\S+)(.*)$/)
        if (!m) continue
        const [, serial, state, rest] = m
        seen.add(serial)
        const model = (rest.match(/model:(\S+)/) || [])[1]
        const prev = this.devices.get(serial)
        const dev = { serial, state, model: model ? model.replace(/_/g, ' ') : prev?.model, reversed: prev?.reversed && state === 'device' }
        if (!prev) this.log(`Téléphone USB détecté : ${dev.model || serial}`)
        if (state === 'device' && !dev.reversed) {
          try {
            await run(['-s', serial, 'reverse', `tcp:${DEFAULT_PORT}`, `tcp:${this.hostPort}`])
            dev.reversed = true
            this.log(`Tunnel USB actif sur ${dev.model || serial}`, 'success')
          } catch (e) {
            this.log(`Tunnel USB impossible : ${(e.stderr || e.message || '').trim()}`, 'warn')
          }
        }
        this.devices.set(serial, dev)
      }
      for (const serial of [...this.devices.keys()]) {
        if (!seen.has(serial)) {
          this.log(`Téléphone USB débranché : ${this.devices.get(serial).model || serial}`)
          this.devices.delete(serial)
        }
      }
      this.available = true
      this.error = undefined
    } catch (e) {
      this.available = false
      this.error = e.code === 'ENOENT' ? 'ADB introuvable. Il est fourni avec l\'installateur Windows.' : `ADB : ${(e.stderr || e.message || '').trim()}`
      this.devices.clear()
    } finally {
      this.busy = false
      this.onChange()
    }
  }
}

module.exports = { AdbWatcher }
