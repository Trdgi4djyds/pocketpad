// Auto-test du serveur du Hub sans Electron : `node scripts/selftest.cjs` (après `pnpm build` à la racine).
const assert = require('assert')
const path = require('path')
const http = require('http')
const WebSocket = require('ws')
const { createHubServer, isPrivate, guessModel } = require('../src/server.cjs')
const { BTN } = require('../src/protocol.cjs')
const { parseReport, isPocketPad } = require('../src/bt-bridge.cjs')

const applied = []
const pads = []
const logs = []
const launched = []
const moves = []
const clicks = []
let streamerWanted = 0
const hub = createHubServer({
  staticDir: process.env.STATIC_DIR || path.join(__dirname, '..', '..', 'out'),
  pin: '1234',
  hubName: 'TEST-PC',
  createPad: (type, onRumble) => {
    const pad = { type, onRumble, destroyed: false, apply: (s) => applied.push({ type, s }), destroy: () => (pad.destroyed = true) }
    pads.push(pad)
    return pad
  },
  log: (m) => logs.push(m),
  onChange: () => {},
  games: {
    list: async () => [{ id: 'steam:271590', name: 'Grand Theft Auto V', source: 'steam', art: 'x.jpg' }],
    launch: async (id) => {
      launched.push(id)
      return { ok: true }
    },
  },
  ensureStreamer: () => streamerWanted++,
  input: {
    available: () => true,
    move: (dx, dy) => moves.push([dx, dy]),
    button: (w, d) => clicks.push([w, d]),
    wheel: () => {},
    key: () => {},
    VK: { RETURN: 13, ESCAPE: 27, LWIN: 91 },
  },
})

const wait = (ms) => new Promise((r) => setTimeout(r, ms))
function client(port) {
  const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`)
  ws.inbox = []
  ws.on('message', (d) => ws.inbox.push(JSON.parse(String(d))))
  ws.next = async (t, timeout = 1500) => {
    const end = Date.now() + timeout
    while (Date.now() < end) {
      const i = ws.inbox.findIndex((m) => m.t === t)
      if (i >= 0) return ws.inbox.splice(i, 1)[0]
      await wait(10)
    }
    throw new Error(`message ${t} non reçu`)
  }
  return new Promise((res, rej) => ws.on('open', () => res(ws)).on('error', rej))
}
const hello = (ws, extra = {}) => ws.send(JSON.stringify({ t: 'hello', v: 1, name: 'Alex', model: 'dualsense', skin: 'vice-night', out: 'x360', via: 'usb', ...extra }))
const get = (port, p) => new Promise((res) => http.get(`http://127.0.0.1:${port}${p}`, (r) => { let b = ''; r.on('data', (c) => (b += c)).on('end', () => res({ status: r.statusCode, body: b, headers: r.headers })) }))

;(async () => {
  const port = await hub.start(47890)
  let ok = 0
  const check = (name, fn) => Promise.resolve(fn()).then(() => { ok++; console.log('  ✓', name) })

  await check('sert l\'interface avec l\'injection du Hub', async () => {
    const r = await get(port, '/')
    assert.equal(r.status, 200)
    assert.match(r.body, /__POCKETPAD_HUB__/)
    const spa = await get(port, '/une/route/inconnue')
    assert.match(spa.body, /<div id="root">/)
    const hubUi = await get(port, '/hub/')
    assert.equal(hubUi.status, 200)
    assert.match(hubUi.body, /\/hub\/assets\//)
    assert.equal((await get(port, '/hub')).status, 302)
    assert.equal((await get(port, '/../../etc/passwd')).status !== 500, true)
  })

  const a = await client(port)
  await check('accueille un joueur USB (P1)', async () => {
    hello(a)
    const w = await a.next('welcome')
    assert.equal(w.slot, 1)
    assert.equal(w.driver, true)
    const [p] = hub.players()
    assert.equal(p.transport, 'usb')
    assert.equal(p.address, 'USB')
  })

  await check('transmet l\'état à la manette virtuelle', async () => {
    a.send(JSON.stringify({ t: 's', b: BTN.A | BTN.DPAD_UP, lx: 0.5, ly: -1.7, rx: 0, ry: 0, lt: 1, rt: 'x' }))
    await wait(50)
    const last = applied.at(-1).s
    assert.equal(last.b, BTN.A | BTN.DPAD_UP)
    assert.equal(last.ly, -1)
    assert.equal(last.rt, 0)
    assert.equal(hub.players()[0].state.lx, 0.5)
  })

  await check('répond au ping et enregistre la latence', async () => {
    a.send(JSON.stringify({ t: 'ping', ts: 42, lat: 7 }))
    assert.equal((await a.next('pong')).ts, 42)
    await wait(20)
    assert.equal(hub.players()[0].latency, 7)
  })

  await check('relaie les vibrations du jeu', async () => {
    pads[0].onRumble(200, 30)
    const r = await a.next('rumble')
    assert.deepEqual([r.l, r.s], [200, 30])
  })

  await check('change le type de manette virtuelle', async () => {
    hub.setOutput(hub.players()[0].id, 'ds4')
    assert.equal((await a.next('out')).out, 'ds4')
    assert.equal(pads[0].destroyed, true)
    assert.equal(pads.at(-1).type, 'ds4')
  })

  const others = []
  await check('limite à 4 manettes', async () => {
    for (let i = 0; i < 3; i++) {
      const c = await client(port)
      hello(c, { name: `J${i + 2}` })
      assert.equal((await c.next('welcome')).slot, i + 2)
      others.push(c)
    }
    const extra = await client(port)
    hello(extra)
    assert.equal((await extra.next('error')).code, 'full')
  })

  await check('libère l\'emplacement à la déconnexion', async () => {
    others[0].close()
    await wait(100)
    assert.equal(hub.players().length, 3)
    const c = await client(port)
    hello(c)
    assert.equal((await c.next('welcome')).slot, 2)
    others[0] = c
  })

  await check('déconnecte un joueur depuis le PC', async () => {
    const id = hub.players().find((p) => p.slot === 3).id
    hub.kick(id)
    assert.equal((await others[1].next('error')).code, 'kicked')
  })

  await check('rejette une version incompatible', async () => {
    const c = await client(port)
    c.send(JSON.stringify({ t: 'hello', v: 99 }))
    assert.equal((await c.next('error')).code, 'version')
  })

  await check('classe les adresses (PIN exigé hors réseau local)', () => {
    assert.equal(isPrivate('192.168.1.20'), true)
    assert.equal(isPrivate('10.0.0.3'), true)
    assert.equal(isPrivate('172.20.1.1'), true)
    assert.equal(isPrivate('127.0.0.1'), true)
    assert.equal(isPrivate('82.64.10.1'), false)
  })

  await check('vibration d\'essai envoyée au téléphone', async () => {
    const p = hub.players().find((x) => x.slot === 1)
    a.inbox.length = 0
    hub.testRumble(p.id)
    const r = await a.next('rumble')
    assert.equal(r.l, 255)
    const stop = await a.next('rumble', 1500)
    assert.equal(stop.l, 0)
  })

  // Libère les emplacements pour les tests de la TV
  for (const c of others) c.close()
  a.close()
  await wait(150)

  await check('découverte : /pocketpad.json lisible depuis une autre origine', async () => {
    const r = await get(port, '/pocketpad.json')
    assert.equal(r.headers['access-control-allow-origin'], '*')
    const j = JSON.parse(r.body)
    assert.equal(j.name, 'TEST-PC')
    assert.equal(j.stream, true)
  })

  const tv = await client(port)
  await check('accueille l\'application TV et envoie la bibliothèque', async () => {
    tv.send(JSON.stringify({ t: 'viewer', v: 1, name: 'Salon TV' }))
    const h = await tv.next('hub')
    assert.equal(h.name, 'TEST-PC')
    tv.send(JSON.stringify({ t: 'games' }))
    const g = await tv.next('games')
    assert.equal(g.list[0].name, 'Grand Theft Auto V')
    assert.equal(hub.viewers()[0].name, 'Salon TV')
  })

  await check('lance un jeu depuis la TV', async () => {
    tv.send(JSON.stringify({ t: 'launch', id: 'steam:271590' }))
    const r = await tv.next('launched')
    assert.equal(r.ok, true)
    assert.deepEqual(launched, ['steam:271590'])
  })

  await check('demande la diffusion et prépare le diffuseur', async () => {
    tv.send(JSON.stringify({ t: 'watch', preset: 'smooth', mode: 'game' }))
    await wait(50)
    assert.equal(streamerWanted > 0, true)
    assert.equal(hub.viewers()[0].watching, true)
    assert.equal(hub.viewers()[0].preset, 'smooth')
  })

  const streamer = await client(port)
  let viewerId
  await check('relaie la signalisation WebRTC entre PC et TV', async () => {
    streamer.send(JSON.stringify({ t: 'streamer', v: 1 }))
    const w = await streamer.next('watch')
    viewerId = w.viewer
    assert.equal(w.preset, 'smooth')
    streamer.send(JSON.stringify({ t: 'sig', to: viewerId, data: { sdp: { type: 'offer', sdp: 'v=0' } } }))
    assert.equal((await tv.next('sig')).data.sdp.type, 'offer')
    tv.send(JSON.stringify({ t: 'sig', data: { ice: { candidate: 'candidate:1' } } }))
    const back = await streamer.next('sig')
    assert.equal(back.from, viewerId)
    assert.equal(back.data.ice.candidate, 'candidate:1')
  })

  await check('affiche les statistiques de diffusion', async () => {
    streamer.send(JSON.stringify({ t: 'stats', viewer: viewerId, stats: { w: 1280, h: 720, fps: 60, kbps: 7000, rtt: 8, loss: 0, codec: 'H264' } }))
    await wait(50)
    assert.equal(hub.viewers()[0].stats.h, 720)
  })

  await check('manette de la TV → manette Xbox 360 virtuelle', async () => {
    streamer.send(JSON.stringify({ t: 'tvpad', viewer: viewerId, i: 0, name: 'Xbox Wireless Controller', b: BTN.A, lx: 0.4, ly: 0, rx: 0, ry: 0, lt: 0, rt: 1 }))
    await wait(50)
    const p = hub.players().find((x) => x.transport === 'tv')
    assert.ok(p)
    assert.equal(p.model, 'xbox')
    assert.equal(p.address, 'Salon TV')
    assert.equal(applied.at(-1).s.b, BTN.A)
    assert.equal(applied.at(-1).s.rt, 1)
  })

  await check('vibrations du jeu renvoyées à la manette de la TV', async () => {
    pads.at(-1).onRumble(120, 60)
    const r = await tv.next('rumble')
    assert.deepEqual([r.i, r.l, r.s], [0, 120, 60])
  })

  await check('repli WebSocket et débranchement d\'une manette TV', async () => {
    tv.send(JSON.stringify({ t: 'tvpad', i: 1, name: 'DualSense Wireless Controller', b: 0, lx: 0, ly: 0, rx: 0, ry: 0, lt: 0, rt: 0 }))
    await wait(50)
    assert.equal(hub.players().filter((x) => x.transport === 'tv').length, 2)
    assert.equal(hub.players().find((x) => x.model === 'dualsense').transport, 'tv')
    tv.send(JSON.stringify({ t: 'tvpad-off', i: 1 }))
    await wait(50)
    assert.equal(hub.players().filter((x) => x.transport === 'tv').length, 1)
  })

  await check('mode bureau : la manette de la TV pilote la souris', async () => {
    tv.send(JSON.stringify({ t: 'mode', mode: 'desktop' }))
    assert.equal((await streamer.next('mode')).mode, 'desktop')
    streamer.send(JSON.stringify({ t: 'tvpad', viewer: viewerId, i: 0, name: 'Xbox', b: BTN.A, lx: 1, ly: 0, rx: 0, ry: 0, lt: 0, rt: 0 }))
    await wait(120)
    assert.ok(moves.length > 0 && moves.some(([dx]) => dx > 0))
    assert.deepEqual(clicks[0], ['left', true])
    assert.equal(hub.players().filter((x) => x.transport === 'tv').length, 0)
  })

  await check('fin de diffusion quand la TV se déconnecte', async () => {
    tv.close()
    const l = await streamer.next('left')
    assert.equal(l.viewer, viewerId)
    await wait(50)
    assert.equal(hub.viewers().length, 0)
    assert.equal(clicks.at(-1)[1], false)
  })

  await check('relais Bluetooth : rapport HID rejoué en Xbox 360', async () => {
    const s = parseReport(Buffer.from([1, 0x01 | 0x08, 0x00, 2, 255, 0, 128, 128, 0, 255]))
    assert.equal((s.b & BTN.A) !== 0 && (s.b & BTN.Y) !== 0 && (s.b & BTN.DPAD_RIGHT) !== 0, true)
    assert.equal(s.lx, 1)
    assert.equal(s.ly, 1)
    assert.equal(s.rt, 1)
    hub.attachExternal('bt1', 'PocketPad')
    hub.updateExternal('bt1', s)
    const p = hub.players().find((x) => x.transport === 'bluetooth')
    assert.ok(p)
    assert.equal(applied.at(-1).s.b, s.b)
    hub.detachExternal('bt1')
    assert.equal(hub.players().some((x) => x.transport === 'bluetooth'), false)
  })

  await check('relais Bluetooth : reconnaît le téléphone parmi les manettes HID', () => {
    assert.equal(isPocketPad({ product: 'PocketPad', usagePage: 1, usage: 5, vendorId: 0 }), true)
    assert.equal(isPocketPad({ product: 'Galaxy S23', usagePage: 1, usage: 5, vendorId: 0x00e0 }), true)
    assert.equal(isPocketPad({ product: 'Wireless Controller', usagePage: 1, usage: 5, vendorId: 0x054c }), false)
    assert.equal(isPocketPad({ product: 'Xbox Controller', usagePage: 1, usage: 5, vendorId: 0x045e }), false)
    assert.equal(isPocketPad({ product: 'PocketPad', usagePage: 12, usage: 1, vendorId: 0 }), false)
  })

  await check('reconnaît le modèle des manettes de la TV', () => {
    assert.equal(guessModel('Wireless Controller').model, 'dualshock4')
    assert.equal(guessModel('DualSense Wireless Controller').model, 'dualsense')
    assert.equal(guessModel('Pro Controller').model, 'switchpro')
    assert.equal(guessModel('Xbox Wireless Controller').model, 'xbox')
  })

  streamer.close()
  hub.stop()
  console.log(`\n${ok} tests réussis`)
  process.exit(0)
})().catch((e) => {
  console.error('ÉCHEC :', e)
  process.exit(1)
})
