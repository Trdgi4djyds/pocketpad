// Serveur PocketPad Hub : sert l'interface web (manette navigateur + Hub) et reçoit les manettes en WebSocket.
const http = require('http')
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const { WebSocketServer } = require('ws')
const { MAX_PLAYERS, PROTOCOL_VERSION, neutralState, sanitizeState } = require('./protocol.cjs')

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.json': 'application/json',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.webmanifest': 'application/manifest+json',
}

const normalizeAddr = (a = '') => a.replace(/^::ffff:/, '')
const isLoopback = (a) => a === '127.0.0.1' || a === '::1'
const isPrivate = (a) =>
  isLoopback(a) || /^10\./.test(a) || /^192\.168\./.test(a) || /^172\.(1[6-9]|2\d|3[01])\./.test(a) || /^169\.254\./.test(a) || /^f[cd]/i.test(a) || /^fe80:/i.test(a)

const OUTPUTS = new Set(['x360', 'ds4'])
const clean = (v, max) => String(v ?? '').replace(/[\u0000-\u001f]/g, '').slice(0, max)

/**
 * @param {{
 *   staticDir: string,
 *   pin: string,
 *   hubName: string,
 *   createPad: (type: 'x360'|'ds4', onRumble: (l:number, s:number) => void) => { apply(s: any): void, destroy(): void },
 *   log: (msg: string, level?: string) => void,
 *   onChange: (inputOnly?: boolean) => void,
 * }} opts
 */
function createHubServer(opts) {
  const players = new Map()
  let pin = opts.pin
  let port = 0

  const server = http.createServer((req, res) => serveStatic(req, res))
  const wss = new WebSocketServer({ noServer: true, maxPayload: 8 * 1024 })

  server.on('upgrade', (req, socket, head) => {
    if (!req.url || !req.url.startsWith('/ws')) return socket.destroy()
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req))
  })
  wss.on('connection', (ws, req) => handleSocket(ws, req))

  // Détection des connexions mortes (Wi-Fi coupé, téléphone en veille)
  const heartbeat = setInterval(() => {
    for (const ws of wss.clients) {
      if (ws.isAlive === false) {
        ws.terminate()
        continue
      }
      ws.isAlive = false
      ws.ping()
    }
  }, 5000)

  function serveStatic(req, res) {
    let urlPath = decodeURIComponent((req.url || '/').split('?')[0])
    if (urlPath === '/pocketpad.json') {
      res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' })
      return res.end(JSON.stringify({ name: opts.hubName, port, version: PROTOCOL_VERSION }))
    }
    // /hub/… → interface du logiciel PC ; le reste → manette pour le navigateur du téléphone
    const isHub = urlPath === '/hub' || urlPath.startsWith('/hub/')
    if (urlPath === '/hub') {
      res.writeHead(302, { Location: '/hub/' })
      return res.end()
    }
    const root = path.resolve(opts.staticDir, isHub ? 'pc' : 'mobile')
    const rel = isHub ? urlPath.slice('/hub'.length) || '/' : urlPath
    let file = path.resolve(root, '.' + path.posix.normalize(rel))
    if (!file.startsWith(root)) {
      res.writeHead(403)
      return res.end()
    }
    let isIndex = false
    try {
      if (fs.statSync(file).isDirectory()) file = path.join(file, 'index.html')
    } catch {
      // Application monopage : toute route inconnue renvoie l'index
      file = path.join(root, 'index.html')
    }
    isIndex = path.basename(file) === 'index.html'
    fs.readFile(file, (err, data) => {
      if (err) {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
        return res.end('PocketPad : interface introuvable.')
      }
      const type = MIME[path.extname(file).toLowerCase()] || 'application/octet-stream'
      if (isIndex) {
        const inject = `<script>window.__POCKETPAD_HUB__=${JSON.stringify({ port, name: opts.hubName })}</script>`
        data = Buffer.from(String(data).replace('</head>', `${inject}</head>`))
      }
      res.writeHead(200, { 'Content-Type': type, 'Cache-Control': isIndex ? 'no-cache' : 'public, max-age=86400' })
      res.end(data)
    })
  }

  function freeSlot() {
    const used = new Set([...players.values()].map((p) => p.slot))
    for (let i = 1; i <= MAX_PLAYERS; i++) if (!used.has(i)) return i
    return 0
  }

  function send(ws, msg) {
    if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg))
  }

  function attachPad(p) {
    p.pad?.destroy()
    p.pad = null
    try {
      p.pad = opts.createPad(p.out, (l, s) => send(p.ws, { t: 'rumble', l, s }))
      p.pad.apply(p.state)
    } catch (e) {
      p.padError = e.message
    }
  }

  function handleSocket(ws, req) {
    const addr = normalizeAddr(req.socket.remoteAddress)
    const local = isLoopback(addr)
    const lan = isPrivate(addr)
    let player = null
    ws.isAlive = true
    ws.on('pong', () => (ws.isAlive = true))

    ws.on('message', (raw) => {
      ws.isAlive = true
      let msg
      try {
        msg = JSON.parse(String(raw))
      } catch {
        return
      }
      if (!msg || typeof msg !== 'object') return

      if (msg.t === 's') {
        if (!player) return
        player.state = sanitizeState(msg)
        player.lastInput = Date.now()
        player.pad?.apply(player.state)
        opts.onChange(true)
        return
      }

      if (msg.t === 'ping') {
        send(ws, { t: 'pong', ts: msg.ts })
        if (player && Number.isFinite(msg.lat)) player.latency = Math.round(msg.lat)
        return
      }

      if (msg.t === 'hello') {
        if (msg.v !== PROTOCOL_VERSION) {
          send(ws, { t: 'error', code: 'version', msg: 'Version incompatible : mettez à jour PocketPad.' })
          return ws.close()
        }
        // L'accès depuis Internet exige le code PIN
        if (!lan && String(msg.pin ?? '') !== pin) {
          opts.log(`Connexion refusée depuis ${addr} (PIN incorrect)`, 'warn')
          send(ws, { t: 'error', code: 'pin', msg: 'Code PIN incorrect' })
          return ws.close()
        }
        const out = OUTPUTS.has(msg.out) ? msg.out : 'x360'
        const profile = { name: clean(msg.name, 20) || 'Joueur', model: clean(msg.model, 24), skin: clean(msg.skin, 32) }
        if (!player) {
          const slot = freeSlot()
          if (!slot) {
            send(ws, { t: 'error', code: 'full', msg: 'Le Hub a déjà 4 manettes.' })
            return ws.close()
          }
          const via = msg.via === 'browser' ? 'browser' : null
          player = {
            id: crypto.randomUUID(),
            slot,
            ws,
            ...profile,
            out,
            transport: via ?? (local ? 'usb' : lan ? 'wifi' : 'internet'),
            address: local && !via ? 'USB' : addr,
            latency: null,
            state: neutralState(),
            connectedAt: Date.now(),
            lastInput: 0,
            pad: null,
            padError: null,
          }
          players.set(player.id, player)
          attachPad(player)
          opts.log(`${player.name} a rejoint la partie (P${slot} · ${player.transport === 'usb' ? 'USB' : player.transport === 'internet' ? 'Internet' : 'Wi-Fi'})`, 'success')
        } else {
          Object.assign(player, profile)
          if (player.out !== out) {
            player.out = out
            attachPad(player)
          }
        }
        send(ws, { t: 'welcome', slot: player.slot, hub: opts.hubName, driver: !!player.pad, out: player.out })
        opts.onChange()
      }
    })

    ws.on('close', () => {
      if (!player) return
      player.pad?.destroy()
      players.delete(player.id)
      opts.log(`${player.name} a quitté la partie`)
      player = null
      opts.onChange()
    })
    ws.on('error', () => {})
  }

  function listen(p) {
    return new Promise((resolve, reject) => {
      const onError = (e) => {
        server.off('listening', onListening)
        reject(e)
      }
      const onListening = () => {
        server.off('error', onError)
        resolve(server.address().port)
      }
      server.once('error', onError)
      server.once('listening', onListening)
      server.listen(p, '0.0.0.0')
    })
  }

  return {
    get port() {
      return port
    },
    /** Démarre sur le port demandé, ou le suivant libre. */
    async start(preferred) {
      for (let p = preferred; p < preferred + 10; p++) {
        try {
          port = await listen(p)
          return port
        } catch (e) {
          if (e.code !== 'EADDRINUSE') throw e
        }
      }
      throw new Error(`Aucun port libre entre ${preferred} et ${preferred + 9}`)
    },
    stop() {
      clearInterval(heartbeat)
      for (const p of players.values()) p.pad?.destroy()
      for (const ws of wss.clients) ws.terminate()
      server.close()
    },
    setPin(next) {
      pin = next
    },
    players() {
      return [...players.values()]
        .sort((a, b) => a.slot - b.slot)
        .map((p) => ({
          id: p.id,
          slot: p.slot,
          name: p.name,
          model: p.model,
          skin: p.skin,
          transport: p.transport,
          address: p.address,
          latency: p.latency,
          out: p.out,
          virtual: !!p.pad,
          state: p.state,
          connectedAt: p.connectedAt,
        }))
    },
    setOutput(id, out) {
      const p = players.get(id)
      if (!p || !OUTPUTS.has(out) || p.out === out) return
      p.out = out
      attachPad(p)
      send(p.ws, { t: 'out', out })
      opts.log(`${p.name} → manette ${out === 'ds4' ? 'DualShock 4' : 'Xbox 360'}`)
      opts.onChange()
    },
    kick(id) {
      const p = players.get(id)
      if (!p) return
      send(p.ws, { t: 'error', code: 'kicked', msg: 'Déconnecté depuis le PC' })
      p.ws.close()
    },
  }
}

module.exports = { createHubServer, isPrivate }
