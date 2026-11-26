const parse = (hex: string) => {
  const h = hex.replace('#', '')
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

const toHex = (rgb: number[]) => '#' + rgb.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('')

/** Mélange linéaire de deux couleurs hexadécimales. */
export function mix(a: string, b: string, t: number) {
  const ca = parse(a)
  const cb = parse(b)
  return toHex(ca.map((v, i) => v + (cb[i] - v) * t))
}

export function alpha(hex: string, a: number) {
  const [r, g, b] = parse(hex)
  return `rgba(${r}, ${g}, ${b}, ${a})`
}

export function luminance(hex: string) {
  const [r, g, b] = parse(hex).map((v) => {
    const c = v / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

export const isLight = (hex: string) => luminance(hex) > 0.45
