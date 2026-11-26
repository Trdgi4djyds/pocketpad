// Auto-test du serveur du Hub sans Electron : `node scripts/selftest.cjs` (après `pnpm build` à la racine).
const assert = require('assert')
const path = require('path')
const http = require('http')
const WebSocket = require('ws')
const { createHubServer, isPrivate } = require('../src/server.cjs')
const { BTN } = require('../src/protocol.cjs')

const applied = []
const pads = []
const logs = []
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
const get = (port, p) => new Promise((res) => http.get(`http://127.0.0.1:${port}${p}`, (r) => { let b = ''; r.on('data', (c) => (b += c)).on('end', () => res({ status: r.statusCode, body: b })) }))

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

  hub.stop()
  console.log(`\n${ok} tests réussis`)
  process.exit(0)
})().catch((e) => {
  console.error('ÉCHEC :', e)
  process.exit(1)
})
