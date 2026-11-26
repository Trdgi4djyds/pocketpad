// Serveur PocketPad Hub : sert les interfaces web, reçoit les manettes (téléphones, TV) en WebSocket
// et relaie la diffusion d'écran (WebRTC) entre le diffuseur du PC et les applications TV.
const http = require('http')
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const { WebSocketServer } = require('ws')
const { BTN, MAX_PLAYERS, PROTOCOL_VERSION, neutralState, sanitizeState } = require('./protocol.cjs')

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
const PRESETS = new Set(['auto', 'smooth', 'quality', 'eco'])
const clean = (v, max) => String(v ?? '').replace(/[\u0000-\u001f]/g, '').slice(0, max)

/** Modèle affiché pour une manette physique branchée sur la TV, d'après son nom. */
function guessModel(name) {
  if (/xbox|x-?input|microsoft/i.test(name)) return { model: 'xbox', skin: 'xb-carbon' }
  if (/dualsense/i.test(name)) return { model: 'dualsense', skin: 'ds-white' }
  if (/wireless controller|dualshock|sony/i.test(name)) return { model: 'dualshock4', skin: 'ds4-black' }
  if (/pro controller|nintendo|joy-?con/i.test(name)) return { model: 'switchpro', skin: 'sw-black' }
  return { model: 'xbox', skin: 'xb-carbon' }
}

/**
 * @param {{
 *   staticDir: string,
 *   pin: string,
 *   hubName: string,
 *   createPad: (type: 'x360'|'ds4', onRumble: (l:number, s:number) => void) => { apply(s: any): void, destroy(): void },
 *   log: (msg: string, level?: string) => void,
 *   onChange: (inputOnly?: boolean) => void,
 *   games?: { list(): Promise<any[]>, launch(id: string): Promise<{ ok: boolean, msg?: string }> },
 *   ensureStreamer?: () => void,
 *   input?: { available(): boolean, move(dx:number, dy:number): void, button(w:string, d:boolean): void, wheel(dy:number, dx?:number): void, key(vk:number, d:boolean): void, VK: Record<string, number> },
 * }} opts
 */
function createHubServer(opts) {
  const players = new Map()
  const viewers = new Map()
  let streamer = null
  let pin = opts.pin
  let port = 0

  const server = http.createServer((req, res) => serveStatic(req, res))
  const wss = new WebSocketServer({ noServer: true, maxPayload: 256 * 1024 })

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
    let urlPath = '/'
    try {
      urlPath = decodeURIComponent((req.url || '/').split('?')[0])
    } catch {
      res.writeHead(400)
      return res.end()
    }
    if (urlPath === '/pocketpad.json') {
      // Lu par les applications (téléphone, TV) pour trouver les PC du réseau
      res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*' })
      return res.end(JSON.stringify({ name: opts.hubName, port, version: PROTOCOL_VERSION, stream: !!(streamer || opts.ensureStreamer) }))
    }
    if (urlPath === '/tv' || urlPath === '/tv/') {
      res.writeHead(302, { Location: '/?app=tv' })
      return res.end()
    }
    // /hub/… → interface du logiciel PC ; le reste → manette (et TV) pour le navigateur
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
    try {
      if (fs.statSync(file).isDirectory()) file = path.join(file, 'index.html')
    } catch {
      // Application monopage : toute route inconnue renvoie l'index
      file = path.join(root, 'index.html')
    }
    const isIndex = path.basename(file) === 'index.html'
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
    if (ws && ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg))
  }

  function attachPad(p) {
    p.pad?.destroy()
    p.pad = null
    try {
      p.pad = opts.createPad(p.out, (l, s) => p.notify({ t: 'rumble', l, s }))
      p.pad.apply(p.state)
      p.padError = null
    } catch (e) {
      p.padError = e.message
    }
  }

  /** Crée un joueur (téléphone, manette de la TV, relais Bluetooth). */
  function addPlayer(fields) {
    const slot = freeSlot()
    if (!slot) return null
    const p = {
      id: crypto.randomUUID(),
      slot,
      out: 'x360',
      latency: null,
      state: neutralState(),
      connectedAt: Date.now(),
      lastInput: 0,
      pad: null,
      padError: null,
      notify: () => {},
      ...fields,
    }
    players.set(p.id, p)
    attachPad(p)
    return p
  }

  function removePlayer(p, reason) {
    if (!p || !players.has(p.id)) return
    p.pad?.destroy()
    players.delete(p.id)
    if (reason) opts.log(reason)
    opts.onChange()
  }

  function applyState(p, raw) {
    p.state = sanitizeState(raw)
    p.lastInput = Date.now()
    p.pad?.apply(p.state)
    opts.onChange(true)
  }

  // ----- Manettes de la TV -----------------------------------------------------

  function tvPad(viewer, i, name, raw) {
    const idx = Math.max(0, Math.min(7, Number(i) | 0))
    if (viewer.mode === 'desktop' && idx === viewer.mousePad) {
      viewer.mouse = sanitizeState(raw)
      return
    }
    let p = [...players.values()].find((x) => x.viewerId === viewer.id && x.padIndex === idx)
    if (!p) {
      const label = clean(name, 40) || 'Manette'
      p = addPlayer({
        viewerId: viewer.id,
        padIndex: idx,
        name: label.replace(/\s*\(.*\)$/, ''),
        ...guessModel(label),
        transport: 'tv',
        address: viewer.name,
        notify: (m) => send(viewer.ws, { ...m, i: idx }),
      })
      if (!p) return
      opts.log(`${p.name} branchée sur ${viewer.name} (P${p.slot})`, 'success')
    }
    applyState(p, raw)
  }

  function dropTvPads(viewer, idx) {
    for (const p of [...players.values()]) if (p.viewerId === viewer.id && (idx === undefined || p.padIndex === idx)) removePlayer(p, `${p.name} (TV) débranchée`)
  }

  // Mode bureau : la première manette de la TV pilote la souris et le clavier du PC
  let lastMouseTick = Date.now()
  const mouseTimer = setInterval(() => {
    const now = Date.now()
    const dt = Math.min(0.05, (now - lastMouseTick) / 1000)
    lastMouseTick = now
    const input = opts.input
    if (!input || !input.available()) return
    for (const v of viewers.values()) {
      if (v.mode !== 'desktop' || !v.mouse) continue
      const s = v.mouse
      const dz = (x) => (Math.abs(x) < 0.12 ? 0 : (x - Math.sign(x) * 0.12) / 0.88)
      const mx = dz(s.lx)
      const my = dz(-s.ly)
      const mag = Math.min(1, Math.hypot(mx, my))
      if (mag > 0) {
        const speed = 120 + 1900 * Math.pow(mag, 1.8)
        v.acc.x += (mx / mag) * speed * mag * dt
        v.acc.y += (my / mag) * speed * mag * dt
        const ix = Math.trunc(v.acc.x)
        const iy = Math.trunc(v.acc.y)
        v.acc.x -= ix
        v.acc.y -= iy
        input.move(ix, iy)
      }
      const sy = dz(s.ry)
      const sx = dz(s.rx)
      if (sy || sx) {
        v.acc.w += sy * 1400 * dt
        v.acc.h += sx * 1400 * dt
        const w = Math.trunc(v.acc.w)
        const h = Math.trunc(v.acc.h)
        v.acc.w -= w
        v.acc.h -= h
        if (w || h) input.wheel(w, h)
      }
      // Boutons : fronts montants / descendants
      const prev = v.mouseButtons
      const edge = (mask, down, up) => {
        const on = (s.b & mask) !== 0
        const was = (prev & mask) !== 0
        if (on && !was) down()
        if (!on && was) up?.()
      }
      const K = input.VK
      edge(BTN.A, () => input.button('left', true), () => input.button('left', false))
      edge(BTN.B, () => input.button('right', true), () => input.button('right', false))
      edge(BTN.X, () => input.key(K.RETURN, true), () => input.key(K.RETURN, false))
      edge(BTN.Y, () => input.key(K.ESCAPE, true), () => input.key(K.ESCAPE, false))
      edge(BTN.START, () => input.key(K.LWIN, true), () => input.key(K.LWIN, false))
      edge(BTN.DPAD_UP, () => input.key(0x26, true), () => input.key(0x26, false))
      edge(BTN.DPAD_DOWN, () => input.key(0x28, true), () => input.key(0x28, false))
      edge(BTN.DPAD_LEFT, () => input.key(0x25, true), () => input.key(0x25, false))
      edge(BTN.DPAD_RIGHT, () => input.key(0x27, true), () => input.key(0x27, false))
      edge(BTN.BACK, () => opts.onKeyboard?.())
      const lt = s.lt > 0.5
      if (lt !== v.mouseLt) {
        v.mouseLt = lt
        input.button('left', lt)
      }
      v.mouseButtons = s.b
    }
  }, 8)

  function releaseMouse(v) {
    if (!opts.input || !v.mouseButtons) return
    if (v.mouseButtons & BTN.A) opts.input.button('left', false)
    if (v.mouseButtons & BTN.B) opts.input.button('right', false)
    v.mouseButtons = 0
    v.mouse = null
  }

  // ----- Connexions ------------------------------------------------------------

  function viewerSummary() {
    return [...players.values()].sort((a, b) => a.slot - b.slot).map((p) => ({ slot: p.slot, name: p.name, model: p.model, skin: p.skin, transport: p.transport }))
  }

  function broadcastHub() {
    for (const v of viewers.values()) send(v.ws, { t: 'hub', name: opts.hubName, streamer: !!(streamer || opts.ensureStreamer), players: viewerSummary() })
  }

  function startWatch(v) {
    if (!v.watching) return
    if (!streamer) {
      opts.ensureStreamer?.()
      return
    }
    send(streamer, { t: 'watch', viewer: v.id, name: v.name, preset: v.preset, mode: v.mode })
  }

  function handleSocket(ws, req) {
    const addr = normalizeAddr(req.socket.remoteAddress)
    const local = isLoopback(addr)
    const lan = isPrivate(addr)
    let role = null
    let player = null
    let viewer = null
    ws.isAlive = true
    ws.on('pong', () => (ws.isAlive = true))

    ws.on('message', async (raw) => {
      ws.isAlive = true
      let msg
      try {
        msg = JSON.parse(String(raw))
      } catch {
        return
      }
      if (!msg || typeof msg !== 'object') return

      if (msg.t === 'ping') {
        send(ws, { t: 'pong', ts: msg.ts })
        if (player && Number.isFinite(msg.lat)) player.latency = Math.round(msg.lat)
        if (viewer && Number.isFinite(msg.lat)) viewer.latency = Math.round(msg.lat)
        return
      }

      // --- Téléphone manette ---
      if (role === 'pad' || (!role && msg.t === 'hello')) {
        if (msg.t === 's') {
          if (player) applyState(player, msg)
          return
        }
        if (msg.t !== 'hello') return
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
        role = 'pad'
        const out = OUTPUTS.has(msg.out) ? msg.out : 'x360'
        const profile = { name: clean(msg.name, 20) || 'Joueur', model: clean(msg.model, 24), skin: clean(msg.skin, 32) }
        if (!player) {
          const via = msg.via === 'browser' ? 'browser' : null
          player = addPlayer({ ws, ...profile, out, transport: via ?? (local ? 'usb' : lan ? 'wifi' : 'internet'), address: local && !via ? 'USB' : addr, notify: (m) => send(ws, m) })
          if (!player) {
            send(ws, { t: 'error', code: 'full', msg: 'Le Hub a déjà 4 manettes.' })
            return ws.close()
          }
          opts.log(`${player.name} a rejoint la partie (P${player.slot} · ${player.transport === 'usb' ? 'USB' : player.transport === 'internet' ? 'Internet' : 'Wi-Fi'})`, 'success')
        } else {
          Object.assign(player, profile)
          if (player.out !== out) {
            player.out = out
            attachPad(player)
          }
        }
        send(ws, { t: 'welcome', slot: player.slot, hub: opts.hubName, driver: !!player.pad, out: player.out })
        opts.onChange()
        broadcastHub()
        return
      }

      // --- Application TV ---
      if (role === 'viewer' || (!role && msg.t === 'viewer')) {
        if (!role) {
          if (msg.v !== PROTOCOL_VERSION) {
            send(ws, { t: 'error', code: 'version', msg: 'Version incompatible : mettez à jour PocketPad TV.' })
            return ws.close()
          }
          if (!lan && String(msg.pin ?? '') !== pin) {
            send(ws, { t: 'error', code: 'pin', msg: 'Code PIN incorrect' })
            return ws.close()
          }
          role = 'viewer'
          viewer = { id: crypto.randomUUID(), ws, name: clean(msg.name, 32) || 'TV', address: addr, watching: false, mode: 'game', preset: 'auto', stats: null, latency: null, connectedAt: Date.now(), mouse: null, mousePad: 0, mouseButtons: 0, mouseLt: false, acc: { x: 0, y: 0, w: 0, h: 0 } }
          viewers.set(viewer.id, viewer)
          opts.log(`${viewer.name} connectée`, 'success')
          send(ws, { t: 'hub', name: opts.hubName, streamer: !!(streamer || opts.ensureStreamer), players: viewerSummary() })
          opts.onChange()
          return
        }
        switch (msg.t) {
          case 'games':
            send(ws, { t: 'games', list: opts.games ? await opts.games.list() : [] })
            return
          case 'launch': {
            const r = opts.games ? await opts.games.launch(clean(msg.id, 200)) : { ok: false, msg: 'Bibliothèque indisponible' }
            send(ws, { t: 'launched', id: msg.id, ...r })
            return
          }
          case 'watch':
            viewer.watching = true
            viewer.preset = PRESETS.has(msg.preset) ? msg.preset : 'auto'
            viewer.mode = msg.mode === 'desktop' ? 'desktop' : 'game'
            viewer.stats = null
            startWatch(viewer)
            opts.onChange()
            return
          case 'preset':
            if (!PRESETS.has(msg.preset)) return
            viewer.preset = msg.preset
            send(streamer, { t: 'preset', viewer: viewer.id, preset: msg.preset })
            opts.onChange()
            return
          case 'mode':
            viewer.mode = msg.mode === 'desktop' ? 'desktop' : 'game'
            if (viewer.mode === 'desktop') dropTvPads(viewer, viewer.mousePad)
            else releaseMouse(viewer)
            send(streamer, { t: 'mode', viewer: viewer.id, mode: viewer.mode })
            opts.onChange()
            return
          case 'unwatch':
            viewer.watching = false
            viewer.stats = null
            releaseMouse(viewer)
            send(streamer, { t: 'left', viewer: viewer.id })
            opts.onChange()
            return
          case 'sig':
            send(streamer, { t: 'sig', from: viewer.id, data: msg.data })
            return
          case 'tvpad':
            tvPad(viewer, msg.i, msg.name, msg)
            return
          case 'tvpad-off':
            dropTvPads(viewer, Number(msg.i) | 0)
            return
        }
        return
      }

      // --- Diffuseur (fenêtre cachée du Hub, sur ce PC uniquement) ---
      if (role === 'streamer' || (!role && msg.t === 'streamer')) {
        if (!role) {
          if (!local) return ws.close()
          role = 'streamer'
          if (streamer && streamer !== ws) streamer.close()
          streamer = ws
          for (const v of viewers.values()) startWatch(v)
          broadcastHub()
          opts.onChange()
          return
        }
        const v = viewers.get(msg.viewer ?? msg.to)
        switch (msg.t) {
          case 'sig':
            if (v) send(v.ws, { t: 'sig', data: msg.data })
            return
          case 'stats':
            if (v) {
              v.stats = msg.stats
              opts.onChange(true)
            }
            return
          case 'tvpad':
            if (v) tvPad(v, msg.i, msg.name, msg)
            return
          case 'tvpad-off':
            if (v) dropTvPads(v, Number(msg.i) | 0)
            return
          case 'stream-error':
            if (v) send(v.ws, { t: 'stream-error', msg: clean(msg.msg, 200) })
            opts.log(`Diffusion : ${clean(msg.msg, 200)}`, 'error')
            return
        }
      }
    })

    ws.on('close', () => {
      if (role === 'pad' && player) {
        removePlayer(player, `${player.name} a quitté la partie`)
        player = null
        broadcastHub()
      } else if (role === 'viewer' && viewer) {
        releaseMouse(viewer)
        dropTvPads(viewer)
        if (viewer.watching) send(streamer, { t: 'left', viewer: viewer.id })
        viewers.delete(viewer.id)
        opts.log(`${viewer.name} déconnectée`)
        viewer = null
        opts.onChange()
      } else if (role === 'streamer' && streamer === ws) {
        streamer = null
        for (const v of viewers.values()) if (v.watching) send(v.ws, { t: 'stream-error', msg: 'Diffusion interrompue sur le PC, nouvelle tentative…' })
        opts.onChange()
      }
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

  // Joueurs externes (relais Bluetooth)
  const external = new Map()

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
      clearInterval(mouseTimer)
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
          latency: p.transport === 'tv' ? (viewers.get(p.viewerId)?.stats?.rtt ?? viewers.get(p.viewerId)?.latency ?? null) : p.latency,
          out: p.out,
          virtual: !!p.pad,
          state: p.state,
          connectedAt: p.connectedAt,
        }))
    },
    viewers() {
      return [...viewers.values()].map((v) => ({
        id: v.id,
        name: v.name,
        address: v.address,
        watching: v.watching,
        mode: v.mode,
        preset: v.preset,
        stats: v.stats,
        latency: v.latency,
        connectedAt: v.connectedAt,
        pads: [...players.values()].filter((p) => p.viewerId === v.id).length,
      }))
    },
    get streamerReady() {
      return !!streamer
    },
    setOutput(id, out) {
      const p = players.get(id)
      if (!p || !OUTPUTS.has(out) || p.out === out) return
      p.out = out
      attachPad(p)
      if (p.ws) send(p.ws, { t: 'out', out })
      opts.log(`${p.name} → manette ${out === 'ds4' ? 'DualShock 4' : 'Xbox 360'}`)
      opts.onChange()
    },
    kick(id) {
      const p = players.get(id)
      if (!p) return
      if (p.ws) {
        send(p.ws, { t: 'error', code: 'kicked', msg: 'Déconnecté depuis le PC' })
        p.ws.close()
      } else removePlayer(p, `${p.name} déconnecté`)
    },
    /** Vibration d'essai sur la manette du joueur. */
    testRumble(id) {
      const p = players.get(id)
      if (!p) return
      p.notify({ t: 'rumble', l: 255, s: 200 })
      setTimeout(() => p.notify({ t: 'rumble', l: 0, s: 0 }), 600)
      opts.log(`Test de vibration : ${p.name}`)
    },
    /** Relais Bluetooth : manette HID du téléphone rejouée en Xbox 360. */
    attachExternal(key, name) {
      if (external.has(key)) return
      const p = addPlayer({ name: name.replace(/pocketpad/i, '').trim() || 'Bluetooth', model: 'dualsense', skin: 'ds-white', transport: 'bluetooth', address: 'Bluetooth' })
      if (!p) return
      external.set(key, p.id)
      opts.onChange()
    },
    updateExternal(key, s) {
      const p = players.get(external.get(key))
      if (p) applyState(p, s)
    },
    detachExternal(key) {
      const p = players.get(external.get(key))
      external.delete(key)
      removePlayer(p, p ? `${p.name} (Bluetooth) déconnecté` : null)
    },
  }
}

module.exports = { createHubServer, isPrivate, guessModel }
