// Bibliothèque des jeux installés sur le PC : Steam, Epic Games, Rockstar Games et jeux ajoutés à la main.
// Chaque jeu se lance depuis le Hub ou depuis l'application TV.
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const { execFile, spawn } = require('child_process')

const CDN = 'https://cdn.cloudflare.steamstatic.com/steam/apps'
const steamArt = (appid) => ({ art: `${CDN}/${appid}/library_600x900.jpg`, hero: `${CDN}/${appid}/library_hero.jpg` })

// Outils Steam qui ne sont pas des jeux (runtimes, redistribuables, Proton, SteamVR…)
const STEAM_TOOLS = new Set(['228980', '1070560', '1391110', '1628350', '1493710', '2180100', '1887720', '1826330', '250820', '1161040', '2348590', '961940', '1580130', '3658110'])

// Jeux Rockstar connus : exécutable de lancement et jaquette Steam correspondante
const ROCKSTAR = [
  { match: /grand theft auto v enhanced/i, exe: ['PlayGTAV.exe', 'GTA5_Enhanced.exe'], steam: '3240220' },
  { match: /grand theft auto v|gtav/i, exe: ['PlayGTAV.exe', 'GTA5.exe'], steam: '271590' },
  { match: /red dead redemption 2/i, exe: ['PlayRDR2.exe', 'RDR2.exe'], steam: '1174180' },
  { match: /red dead redemption$/i, exe: ['PlayRDR.exe', 'RDR.exe'], steam: '2668510' },
  { match: /grand theft auto iv/i, exe: ['PlayGTAIV.exe', 'GTAIV.exe'], steam: '12210' },
  { match: /l\.?a\.? noire/i, exe: ['LANoire.exe'], steam: '110800' },
  { match: /max payne 3/i, exe: ['MaxPayne3.exe', 'PlayMaxPayne3.exe'], steam: '204100' },
  { match: /bully/i, exe: ['Bully.exe'], steam: '12200' },
]

const exists = (p) => {
  try {
    return fs.existsSync(p)
  } catch {
    return false
  }
}
const read = (p) => {
  try {
    return fs.readFileSync(p, 'utf8')
  } catch {
    return ''
  }
}

function reg(args) {
  return new Promise((resolve) => {
    if (process.platform !== 'win32') return resolve('')
    execFile('reg', args, { windowsHide: true, timeout: 5000 }, (err, out) => resolve(err ? '' : String(out)))
  })
}

async function regValue(key, name) {
  const out = await reg(['query', key, '/v', name])
  const m = out.match(new RegExp(`${name}\\s+REG_\\w+\\s+(.+)`, 'i'))
  return m ? m[1].trim() : null
}

/** Valeurs simples d'un fichier VDF/ACF de Steam ("clé" "valeur"). */
const vdf = (text, key) => [...text.matchAll(new RegExp(`"${key}"\\s+"([^"]*)"`, 'gi'))].map((m) => m[1].replace(/\\\\/g, '\\'))

async function steamGames() {
  const root = (await regValue('HKCU\\Software\\Valve\\Steam', 'SteamPath')) || (process.platform === 'win32' ? 'C:\\Program Files (x86)\\Steam' : path.join(require('os').homedir(), '.steam', 'steam'))
  const libs = new Set([path.normalize(root)])
  for (const p of vdf(read(path.join(root, 'steamapps', 'libraryfolders.vdf')), 'path')) libs.add(path.normalize(p))
  const games = []
  for (const lib of libs) {
    const dir = path.join(lib, 'steamapps')
    let files = []
    try {
      files = fs.readdirSync(dir).filter((f) => /^appmanifest_\d+\.acf$/i.test(f))
    } catch {
      continue
    }
    for (const f of files) {
      const t = read(path.join(dir, f))
      const appid = vdf(t, 'appid')[0]
      const name = vdf(t, 'name')[0]
      const flags = Number(vdf(t, 'StateFlags')[0] || 4)
      if (!appid || !name || STEAM_TOOLS.has(appid) || /redistributable|runtime|proton|steamvr|dedicated server|soundtrack/i.test(name)) continue
      if (!(flags & 4)) continue // pas entièrement installé
      games.push({ id: `steam:${appid}`, name, source: 'steam', appid, ...steamArt(appid) })
    }
  }
  return games
}

function epicGames() {
  const dir = path.join(process.env.ProgramData || 'C:\\ProgramData', 'Epic', 'EpicGamesLauncher', 'Data', 'Manifests')
  let files = []
  try {
    files = fs.readdirSync(dir).filter((f) => f.endsWith('.item'))
  } catch {
    return []
  }
  const games = []
  for (const f of files) {
    try {
      const j = JSON.parse(read(path.join(dir, f)))
      if (j.bIsApplication === false) continue
      if (Array.isArray(j.AppCategories) && j.AppCategories.length && !j.AppCategories.includes('games')) continue
      if (!j.DisplayName || !j.AppName || (j.InstallLocation && !exists(j.InstallLocation))) continue
      games.push({
        id: `epic:${j.AppName}`,
        name: j.DisplayName,
        source: 'epic',
        url: `com.epicgames.launcher://apps/${encodeURIComponent(j.CatalogNamespace || '')}%3A${encodeURIComponent(j.CatalogItemId || '')}%3A${encodeURIComponent(j.AppName)}?action=launch&silent=true`,
      })
    } catch {
      /* manifeste illisible */
    }
  }
  return games
}

async function rockstarGames() {
  const out = await reg(['query', 'HKLM\\SOFTWARE\\WOW6432Node\\Rockstar Games', '/s', '/v', 'InstallFolder'])
  const games = []
  let key = null
  for (const line of out.split(/\r?\n/)) {
    if (/^HKEY_/i.test(line)) key = line.split('\\').pop()
    const m = line.match(/InstallFolder\s+REG_\w+\s+(.+)/i)
    if (!m || !key || /launcher|social club/i.test(key)) continue
    const dir = m[1].trim()
    const known = ROCKSTAR.find((k) => k.match.test(key))
    const exe = (known?.exe ?? []).map((e) => path.join(dir, e)).find(exists) || findPlayExe(dir)
    if (!exe) continue
    games.push({ id: `rockstar:${key}`, name: key, source: 'rockstar', exe, steam: known?.steam, ...(known?.steam ? steamArt(known.steam) : {}) })
  }
  return games
}

function findPlayExe(dir) {
  try {
    const f = fs.readdirSync(dir).find((n) => /^play.*\.exe$/i.test(n))
    return f ? path.join(dir, f) : null
  } catch {
    return null
  }
}

class GameLibrary {
  /** @param {{ getCustom: () => any[], setCustom: (list: any[]) => void, openUrl: (url: string) => Promise<void> | void, log: (m: string, l?: string) => void }} opts */
  constructor(opts) {
    this.opts = opts
    this.cache = null
    this.scanning = null
  }

  async scan() {
    if (this.scanning) return this.scanning
    this.scanning = (async () => {
      const [steam, epic, rockstar] = await Promise.all([steamGames().catch(() => []), Promise.resolve().then(epicGames).catch(() => []), rockstarGames().catch(() => [])])
      // Un jeu Rockstar acheté sur Steam apparaît déjà dans Steam
      const steamIds = new Set(steam.map((g) => g.appid))
      const custom = this.opts.getCustom().map((c) => ({ ...c, source: 'custom' }))
      const all = [...steam, ...epic, ...rockstar.filter((g) => !g.steam || !steamIds.has(g.steam)), ...custom]
      all.sort((a, b) => a.name.localeCompare(b.name, 'fr'))
      this.cache = all
      this.scanning = null
      return all
    })()
    return this.scanning
  }

  async list() {
    return (this.cache ?? (await this.scan())).map(({ id, name, source, art, hero, icon }) => ({ id, name, source, art, hero, icon }))
  }

  async launch(id) {
    const g = (this.cache ?? (await this.scan())).find((x) => x.id === id)
    if (!g) return { ok: false, msg: 'Jeu introuvable' }
    try {
      if (g.source === 'steam') await this.opts.openUrl(`steam://rungameid/${g.appid}`)
      else if (g.source === 'epic') await this.opts.openUrl(g.url)
      else {
        if (!exists(g.exe)) return { ok: false, msg: 'Fichier du jeu introuvable' }
        spawn(g.exe, [], { cwd: path.dirname(g.exe), detached: true, stdio: 'ignore', windowsHide: false }).unref()
      }
      this.opts.log(`Lancement de ${g.name}`, 'success')
      return { ok: true }
    } catch (e) {
      this.opts.log(`Impossible de lancer ${g.name} : ${e.message}`, 'error')
      return { ok: false, msg: e.message }
    }
  }

  /** Ajoute un exécutable choisi par l'utilisateur. */
  addCustom(exe, icon) {
    const list = this.opts.getCustom().filter((c) => c.exe !== exe)
    const name = path.basename(exe, path.extname(exe)).replace(/[_-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
    list.push({ id: `custom:${crypto.createHash('sha1').update(exe).digest('hex').slice(0, 12)}`, name, exe, icon })
    this.opts.setCustom(list)
    this.cache = null
  }

  removeCustom(id) {
    this.opts.setCustom(this.opts.getCustom().filter((c) => c.id !== id))
    this.cache = null
  }
}

module.exports = { GameLibrary }
