import { DEFAULT_PORT } from './protocol'

/** Convertit une saisie libre (« 192.168.1.20 », « monpc.fr:47800 », « ws://… ») en URL WebSocket. */
export function buildWsUrl(input: string) {
  const raw = input.trim()
  if (/^wss?:\/\//i.test(raw)) {
    const u = new URL(raw)
    if (!u.pathname || u.pathname === '/') u.pathname = '/ws'
    return u.toString()
  }
  const host = raw.replace(/^https?:\/\//i, '').replace(/\/.*$/, '')
  const hasPort = /^\[.*\]:\d+$/.test(host) || (/:\d+$/.test(host) && host.split(':').length === 2)
  return `ws://${hasPort ? host : `${host}:${DEFAULT_PORT}`}/ws`
}
