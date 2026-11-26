// PocketPad Hub — processus principal Electron.
const { app, BrowserWindow, ipcMain, shell, Menu } = require('electron')
const fs = require('fs')
const os = require('os')
const path = require('path')
const crypto = require('crypto')
const { createHubServer } = require('./src/server.cjs')
const virtual = require('./src/virtual-pad.cjs')
const { AdbWatcher } = require('./src/adb.cjs')
const { DEFAULT_PORT } = require('./src/protocol.cjs')

if (!app.requestSingleInstanceLock()) {
  app.quit()
  process.exit(0)
}

let win = null
let hub = null
let adb = null
let config = { pin: '' }
const logs = []

const configFile = () => path.join(app.getPath('userData'), 'config.json')
const newPin = () => String(crypto.randomInt(1000, 10000))

function loadConfig() {
  try {
    config = { ...config, ...JSON.parse(fs.readFileSync(configFile(), 'utf8')) }
  } catch {
    /* premier lancement */
  }
  if (!/^\d{4,6}$/.test(config.pin)) config.pin = newPin()
  saveConfig()
}

function saveConfig() {
  try {
    fs.mkdirSync(path.dirname(configFile()), { recursive: true })
    fs.writeFileSync(configFile(), JSON.stringify(config, null, 2))
  } catch {
    /* lecture seule : le PIN reste valable pour la session */
  }
}

function lanAddresses() {
  const out = []
  for (const [name, list] of Object.entries(os.networkInterfaces())) {
    if (/vEthernet|VirtualBox|VMware|docker|WSL|Hyper-V/i.test(name)) continue
    for (const a of list || []) if (a.family === 'IPv4' && !a.internal) out.push(a.address)
  }
  // Les réseaux domestiques classiques d'abord
  return out.sort((a, b) => Number(!a.startsWith('192.168.')) - Number(!b.startsWith('192.168.')))
}

function driverInstaller() {
  const dir = path.join(process.resourcesPath || '', 'vendor')
  try {
    const f = fs.readdirSync(dir).find((n) => /^ViGEmBus.*\.exe$/i.test(n))
    return f ? path.join(dir, f) : null
  } catch {
    return null
  }
}

function log(msg, level = 'info') {
  logs.unshift({ ts: Date.now(), level, msg })
  if (logs.length > 100) logs.length = 100
  push()
}

let driverCache = { at: 0, value: null }
function driverStatus() {
  if (!driverCache.value || Date.now() - driverCache.at > 4000) driverCache = { at: Date.now(), value: virtual.status() }
  return { ...driverCache.value, installer: !!driverInstaller() }
}

function snapshot() {
  return {
    version: app.getVersion(),
    port: hub ? hub.port : DEFAULT_PORT,
    pin: config.pin,
    hostname: os.hostname(),
    addresses: lanAddresses(),
    platform: process.platform,
    driver: driverStatus(),
    adb: adb ? adb.state() : { available: false, devices: [] },
    players: hub ? hub.players() : [],
    logs,
  }
}

// Envoi groupé vers l'interface (30 images/s max)
let pushTimer = null
function push() {
  if (pushTimer || !win) return
  pushTimer = setTimeout(() => {
    pushTimer = null
    if (win && !win.isDestroyed()) win.webContents.send('hub:snapshot', snapshot())
  }, 33)
}

ipcMain.handle('hub:get', () => snapshot())
ipcMain.on('hub:setOutput', (_e, id, out) => hub?.setOutput(id, out))
ipcMain.on('hub:kick', (_e, id) => hub?.kick(id))
ipcMain.on('hub:pin', () => {
  config.pin = newPin()
  saveConfig()
  hub?.setPin(config.pin)
  log('Nouveau code PIN généré')
})
ipcMain.on('hub:installDriver', () => {
  const f = driverInstaller()
  if (f) {
    shell.openPath(f)
    log('Installation du pilote ViGEmBus lancée. Redémarrez le Hub ensuite.')
  } else shell.openExternal('https://github.com/nefarius/ViGEmBus/releases/latest')
  driverCache.at = 0
})
ipcMain.on('hub:open', (_e, url) => {
  if (/^https?:\/\//i.test(String(url))) shell.openExternal(url)
})

function createWindow(port) {
  win = new BrowserWindow({
    width: 1380,
    height: 880,
    minWidth: 1100,
    minHeight: 720,
    title: 'PocketPad Hub',
    backgroundColor: '#07070c',
    autoHideMenuBar: true,
    icon: path.join(__dirname, 'build', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) shell.openExternal(url)
    return { action: 'deny' }
  })
  win.on('closed', () => (win = null))
  win.loadURL(`http://127.0.0.1:${port}/hub/`)
}

app.on('second-instance', () => {
  if (win) {
    if (win.isMinimized()) win.restore()
    win.focus()
  }
})

app.whenReady().then(async () => {
  Menu.setApplicationMenu(null)
  loadConfig()
  hub = createHubServer({
    staticDir: path.join(__dirname, 'app'),
    pin: config.pin,
    hubName: os.hostname(),
    createPad: (type, onRumble) => new virtual.VirtualPad(type, onRumble),
    log,
    onChange: push,
  })
  try {
    const port = await hub.start(DEFAULT_PORT)
    log(`Serveur prêt sur ${lanAddresses()[0] || '127.0.0.1'}:${port}`)
    const st = driverStatus()
    log(st.connected ? 'Pilote ViGEmBus connecté' : 'Pilote ViGEmBus non détecté', st.connected ? 'info' : 'warn')
    adb = new AdbWatcher(port, push, log)
    adb.start()
    createWindow(port)
  } catch (e) {
    const { dialog } = require('electron')
    dialog.showErrorBox('PocketPad Hub', `Impossible de démarrer le serveur : ${e.message}`)
    app.quit()
  }
})

app.on('window-all-closed', () => {
  adb?.stop()
  hub?.stop()
  app.quit()
})
