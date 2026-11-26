import { DEFAULT_PORT } from './protocol'

// Recherche des PC qui font tourner PocketPad Hub sur le réseau local :
// chaque Hub répond sur http://<ip>:47800/pocketpad.json.

export interface FoundHub {
  host: string
  port: number
  name: string
  /** Temps de réponse en millisecondes */
  ms: number
}

export async function probe(host: string, port = DEFAULT_PORT, timeout = 1200): Promise<FoundHub | null> {
  const t0 = performance.now()
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeout)
  try {
    const res = await fetch(`http://${host}:${port}/pocketpad.json`, { signal: ctrl.signal, cache: 'no-store' })
    if (!res.ok) return null
    const j = (await res.json()) as { name?: string; port?: number }
    return { host, port: j.port || port, name: j.name || host, ms: Math.max(1, Math.round(performance.now() - t0)) }
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

/** Balaye le sous-réseau /24 de l'appareil ; appelle onFound pour chaque Hub trouvé. */
export async function scanSubnet(ip: string, onFound: (h: FoundHub) => void, opts: { signal?: AbortSignal; known?: string[] } = {}) {
  const m = ip.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/)
  if (!m) return
  const base = `${m[1]}.${m[2]}.${m[3]}.`
  const seen = new Set<string>()
  const hosts = [...(opts.known ?? []).map((h) => h.replace(/:\d+$/, '')), ...Array.from({ length: 254 }, (_, i) => base + (i + 1))].filter((h) => {
    if (h === ip || seen.has(h)) return false
    seen.add(h)
    return true
  })
  let next = 0
  const worker = async () => {
    while (next < hosts.length && !opts.signal?.aborted) {
      const h = hosts[next++]
      const found = await probe(h, DEFAULT_PORT, 900)
      if (found && !opts.signal?.aborted) onFound(found)
    }
  }
  await Promise.all(Array.from({ length: 40 }, worker))
}
