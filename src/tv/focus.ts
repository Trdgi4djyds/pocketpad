// Navigation spatiale à la télécommande ou à la manette : chaque élément [data-nav] peut recevoir le focus,
// les flèches déplacent le focus vers l'élément le plus proche dans la direction demandée.

export type Dir = 'up' | 'down' | 'left' | 'right'

const visible = (el: HTMLElement) => {
  const r = el.getBoundingClientRect()
  return r.width > 0 && r.height > 0 && !(el as HTMLButtonElement).disabled && getComputedStyle(el).visibility !== 'hidden'
}

export function navItems() {
  const trap = [...document.querySelectorAll<HTMLElement>('[data-nav-trap]')].pop()
  return [...(trap ?? document).querySelectorAll<HTMLElement>('[data-nav]')].filter(visible)
}

export function focusFirst(selector?: string) {
  const items = navItems()
  const el = (selector ? items.find((e) => e.matches(selector)) : undefined) ?? items.find((e) => e.dataset.navDefault !== undefined) ?? items[0]
  el?.focus({ preventScroll: true })
  el?.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' })
  return el
}

export function moveFocus(dir: Dir) {
  const items = navItems()
  const cur = document.activeElement as HTMLElement | null
  if (!cur || !items.includes(cur)) return focusFirst()
  const a = cur.getBoundingClientRect()
  const acx = a.left + a.width / 2
  const acy = a.top + a.height / 2
  let best: HTMLElement | null = null
  let bestScore = Infinity
  for (const el of items) {
    if (el === cur) continue
    const b = el.getBoundingClientRect()
    const bcx = b.left + b.width / 2
    const bcy = b.top + b.height / 2
    let main: number
    let cross: number
    if (dir === 'right' || dir === 'left') {
      main = dir === 'right' ? b.left - a.right : a.left - b.right
      if ((dir === 'right' ? bcx <= acx : bcx >= acx) || main < -a.width / 2) continue
      const overlap = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top)
      cross = overlap > 0 ? 0 : Math.abs(bcy - acy)
    } else {
      main = dir === 'down' ? b.top - a.bottom : a.top - b.bottom
      if ((dir === 'down' ? bcy <= acy : bcy >= acy) || main < -a.height / 2) continue
      const overlap = Math.min(a.right, b.right) - Math.max(a.left, b.left)
      cross = overlap > 0 ? 0 : Math.abs(bcx - acx)
    }
    const score = Math.max(0, main) + cross * 2.2
    if (score < bestScore) {
      bestScore = score
      best = el
    }
  }
  if (best) {
    best.focus({ preventScroll: true })
    best.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' })
  }
  return best
}
