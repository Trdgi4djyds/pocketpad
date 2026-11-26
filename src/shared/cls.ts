export const cls = (...parts: Array<string | false | null | undefined>) => parts.filter(Boolean).join(' ')

/** Adresse locale (réseau domestique) ou distante (Internet) ? */
export function isLanAddress(input: string) {
  const host = input.trim().replace(/^[a-z]+:\/\//i, '').replace(/[:/].*$/, '').toLowerCase()
  return (
    host === 'localhost' ||
    host.endsWith('.local') ||
    /^127\./.test(host) ||
    /^10\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host) ||
    /^169\.254\./.test(host)
  )
}
