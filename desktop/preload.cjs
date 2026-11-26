// Pont sécurisé entre l'interface du Hub (et sa fenêtre de diffusion) et le processus principal.
const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('pocketpadHub', {
  getSnapshot: () => ipcRenderer.invoke('hub:get'),
  onSnapshot: (cb) => {
    const handler = (_e, snap) => cb(snap)
    ipcRenderer.on('hub:snapshot', handler)
    return () => ipcRenderer.removeListener('hub:snapshot', handler)
  },
  setOutput: (id, out) => ipcRenderer.send('hub:setOutput', id, out),
  kick: (id) => ipcRenderer.send('hub:kick', id),
  testRumble: (id) => ipcRenderer.send('hub:rumble', id),
  regeneratePin: () => ipcRenderer.send('hub:pin'),
  installDriver: () => ipcRenderer.send('hub:installDriver'),
  openExternal: (url) => ipcRenderer.send('hub:open', url),
  testController: () => ipcRenderer.send('hub:joycpl'),
  allowFirewall: () => ipcRenderer.send('hub:firewall'),
  refreshGames: () => ipcRenderer.send('hub:games:refresh'),
  launchGame: (id) => ipcRenderer.invoke('hub:launch', id),
  addGame: () => ipcRenderer.send('hub:games:add'),
  removeGame: (id) => ipcRenderer.send('hub:games:remove', id),
  setBluetoothBridge: (on) => ipcRenderer.send('hub:bt', on),
})

contextBridge.exposeInMainWorld('pocketpadStream', {
  getSource: () => ipcRenderer.invoke('stream:source'),
})
