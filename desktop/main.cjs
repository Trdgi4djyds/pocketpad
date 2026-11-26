// PocketPad Hub — processus principal Electron.
const { app, BrowserWindow, ipcMain, shell, Menu, dialog, desktopCapturer, screen, session } = require('electron')
const { spawn } = require('child_process')
const fs = require('fs')
const os = require('os')
const path = require('path')
const crypto = require('crypto')
const { createHubServer } = require('./src/server.cjs')
const virtual = require('./src/virtual-pad.cjs')
const { AdbWatcher } = require('./src/adb.cjs')
const { GameLibrary } = require('./src/games.cjs')
const { BtBridge } = require('./src/bt-bridge.cjs')
const input = require('./src/input.cjs')
const { DEFAULT_PORT } = require('./src/protocol.cjs')

if (!app.requestSingleInstanceLock()) {
  app.quit()
  process.exit(0)
}

// Diffusion : adresses IP réelles dans WebRTC (réseau local) et aucune mise en veille de la fenêtre de capture
app.commandLine.appendSwitch('disable-features', 'WebRtcHideLocalIpsWithMdns,CalculateNativeWinOcclusion')
app.commandLine.appendSwitch('disable-renderer-backgrounding')
app.commandLine.appendSwitch('disable-background-timer-throttling')

let win = null
let streamWin = null
let hub = null
let adb = null
let games = null
let bt = null
let config = { pin: '', customGames: [], btBridge: true }
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
  if (!Array.isArray(config.customGames)) config.customGames = []
  saveConfig()
}

function saveConfig() {
  try {
    fs.mkdirSync(path.dirname(configFile()), { recursive: true })
    fs.writeFileSync(configFile(), JSON.stringify(config, null, 2))
  } catch {
    /* lecture seule : réglages valables pour la session */
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

let gameList = []
async function refreshGames() {
  if (!games) return
  await games.scan()
  gameList = await games.list()
  push()
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
    viewers: hub ? hub.viewers() : [],
    games: gameList,
    stream: { ready: !!hub?.streamerReady, mouse: input.available() },
    bt: { available: !!bt?.available, enabled: !!config.btBridge },
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
ipcMain.on('hub:rumble', (_e, id) => hub?.testRumble(id))
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
ipcMain.on('hub:joycpl', () => {
  if (process.platform !== 'win32') return log('Le test des manettes utilise le panneau de Windows.', 'warn')
  // Panneau « Configurer les contrôleurs de jeu USB » : la manette virtuelle doit y apparaître
  spawn('control.exe', ['joy.cpl'], { detached: true, stdio: 'ignore', windowsHide: false }).unref()
  log('Panneau Windows « Contrôleurs de jeu » ouvert')
})
ipcMain.on('hub:firewall', () => {
  if (process.platform !== 'win32') return
  // Règle par ports (47800 à 47809) : fonctionne aussi pour la version portable
  const rule = 'advfirewall firewall add rule name=PocketPadHub dir=in action=allow protocol=TCP localport=47800-47809'
  // Règle par programme (TCP et UDP) : la diffusion vers la TV utilise des ports UDP dynamiques
  const udp = `advfirewall firewall add rule name=PocketPadHubApp dir=in action=allow enable=yes program="${process.execPath}"`
  const ps = spawn('powershell.exe', ['-NoProfile', '-Command', `Start-Process netsh -Verb RunAs -WindowStyle Hidden -Wait -ArgumentList '${rule}'; Start-Process netsh -Verb RunAs -WindowStyle Hidden -Wait -ArgumentList '${udp}'`], { windowsHide: true })
  ps.on('exit', (code) => log(code === 0 ? 'Pare-feu Windows : PocketPad Hub autorisé (manettes et diffusion)' : 'Autorisation du pare-feu annulée', code === 0 ? 'success' : 'warn'))
})
ipcMain.on('hub:open', (_e, url) => {
  if (/^https?:\/\//i.test(String(url))) shell.openExternal(url)
})
ipcMain.on('hub:games:refresh', () => refreshGames())
ipcMain.handle('hub:launch', (_e, id) => games?.launch(String(id)))
ipcMain.on('hub:games:add', async () => {
  const r = await dialog.showOpenDialog(win, { title: 'Ajouter un jeu', properties: ['openFile'], filters: [{ name: 'Jeux', extensions: ['exe', 'lnk', 'url', 'bat'] }] })
  if (r.canceled || !r.filePaths[0]) return
  let icon
  try {
    icon = (await app.getFileIcon(r.filePaths[0], { size: 'large' })).toDataURL()
  } catch {
    /* pas d'icône */
  }
  games.addCustom(r.filePaths[0], icon)
  log(`${path.basename(r.filePaths[0])} ajouté à la bibliothèque`, 'success')
  refreshGames()
})
ipcMain.on('hub:games:remove', (_e, id) => {
  games.removeCustom(String(id))
  refreshGames()
})
ipcMain.on('hub:bt', (_e, on) => {
  config.btBridge = !!on
  saveConfig()
  bt?.setEnabled(config.btBridge)
  push()
})

// Source de capture pour la fenêtre de diffusion : l'écran principal
ipcMain.handle('stream:source', async () => {
  const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: 0, height: 0 } })
  const primary = String(screen.getPrimaryDisplay().id)
  const src = sources.find((s) => s.display_id === primary) || sources[0]
  const { width, height } = screen.getPrimaryDisplay().size
  const scale = screen.getPrimaryDisplay().scaleFactor
  return src ? { id: src.id, width: Math.round(width * scale), height: Math.round(height * scale) } : null
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

/** Fenêtre invisible qui capture l'écran et le son du PC et les diffuse vers les TV (WebRTC). */
function ensureStreamer() {
  if (streamWin && !streamWin.isDestroyed()) return
  streamWin = new BrowserWindow({
    show: false,
    width: 480,
    height: 270,
    skipTaskbar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: false,
    },
  })
  streamWin.webContents.on('render-process-gone', () => {
    streamWin?.destroy()
    streamWin = null
    setTimeout(ensureStreamer, 1500)
  })
  streamWin.on('closed', () => (streamWin = null))
  streamWin.loadURL(`http://127.0.0.1:${hub.port}/hub/?streamer=1`)
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
  // Autorise la capture d'écran et du son pour la fenêtre de diffusion locale
  session.defaultSession.setPermissionRequestHandler((wc, permission, cb, details) => cb(/^http:\/\/127\.0\.0\.1:\d+\//.test(details.requestingUrl || wc.getURL()) && ['media', 'display-capture'].includes(permission)))
  games = new GameLibrary({
    getCustom: () => config.customGames,
    setCustom: (list) => {
      config.customGames = list
      saveConfig()
    },
    openUrl: (url) => shell.openExternal(url),
    log,
  })
  hub = createHubServer({
    staticDir: path.join(__dirname, 'app'),
    pin: config.pin,
    hubName: os.hostname(),
    createPad: (type, onRumble) => new virtual.VirtualPad(type, onRumble),
    log,
    onChange: push,
    games,
    ensureStreamer: () => ensureStreamer(),
    input,
    onKeyboard: () => process.platform === 'win32' && spawn('osk.exe', [], { detached: true, stdio: 'ignore' }).unref(),
  })
  try {
    const port = await hub.start(DEFAULT_PORT)
    log(`Serveur prêt sur ${lanAddresses()[0] || '127.0.0.1'}:${port}`)
    const st = driverStatus()
    log(st.connected ? 'Pilote ViGEmBus connecté' : 'Pilote ViGEmBus non détecté', st.connected ? 'info' : 'warn')
    adb = new AdbWatcher(port, push, log)
    adb.start()
    bt = new BtBridge({
      attach: (key, name) => hub.attachExternal(key, name),
      update: (key, s) => hub.updateExternal(key, s),
      detach: (key) => hub.detachExternal(key),
      log,
    })
    if (config.btBridge) bt.start()
    createWindow(port)
    refreshGames()
    setTimeout(ensureStreamer, 1500)
  } catch (e) {
    dialog.showErrorBox('PocketPad Hub', `Impossible de démarrer le serveur : ${e.message}`)
    app.quit()
  }
})

app.on('window-all-closed', () => {
  adb?.stop()
  bt?.stop()
  hub?.stop()
  app.quit()
})
