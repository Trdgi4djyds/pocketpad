import type { CSSProperties } from 'react'
import { Gamepad2 } from 'lucide-react'
import type { ConnInfo } from '../connection'
import type { Skin } from '../../shared/catalog'
import { cls } from '../../shared/cls'
import { mix } from '../../shared/color'

export const TRANSPORT_LABEL: Record<string, string> = {
  usb: 'USB',
  wifi: 'Wi-Fi',
  internet: 'Internet',
  bluetooth: 'Bluetooth',
  browser: 'Wi-Fi',
  tv: 'TV',
}

/** Variables de thème selon l'ambiance (claire / sombre) de la photo. */
export function toneVars(skin: Skin): CSSProperties {
  const light = skin.tone === 'light'
  return {
    ['--fg' as string]: light ? '#0d0e12' : '#ffffff',
    ['--muted' as string]: light ? 'rgba(13,14,18,0.58)' : 'rgba(255,255,255,0.62)',
    ['--faint' as string]: light ? 'rgba(13,14,18,0.38)' : 'rgba(255,255,255,0.4)',
    ['--glass' as string]: light ? 'rgba(255,255,255,0.55)' : 'rgba(255,255,255,0.06)',
    ['--glass-strong' as string]: light ? 'rgba(255,255,255,0.8)' : 'rgba(255,255,255,0.1)',
    ['--line' as string]: light ? 'rgba(13,14,18,0.1)' : 'rgba(255,255,255,0.13)',
    ['--solid' as string]: light ? '#0d0e12' : '#ffffff',
    ['--on-solid' as string]: light ? '#ffffff' : '#0a0a10',
    ['--accent' as string]: skin.accent,
    ['--studio' as string]: skin.studio,
    color: light ? '#0d0e12' : '#ffffff',
  }
}

export function studioBackground(skin: Skin) {
  return skin.tone === 'light'
    ? `radial-gradient(60% 70% at 54% 42%, #ffffff 0%, ${skin.studio} 58%, ${mix(skin.studio, '#000000', 0.16)} 100%)`
    : `radial-gradient(55% 65% at 54% 42%, ${mix(skin.studio, skin.accent, 0.2)} 0%, ${skin.studio} 55%, #030304 100%)`
}

export function Logo() {
  return (
    <div className="flex shrink-0 items-center gap-2.5">
      <div className="grid size-9 place-items-center rounded-xl bg-[var(--solid)] text-[var(--on-solid)] short:size-7 short:rounded-lg">
        <Gamepad2 className="size-5 short:size-4" strokeWidth={2.2} />
      </div>
      <span className="font-display text-[17px] font-bold tracking-tight max-lg:hidden">PocketPad</span>
    </div>
  )
}

export function statusText(conn: ConnInfo) {
  if (conn.status === 'connected') return `${TRANSPORT_LABEL[conn.transport ?? 'wifi']}${conn.latency ? ` · ${conn.latency} ms` : ''}`
  if (conn.status === 'connecting') return 'Connexion…'
  if (conn.status === 'error') return 'Échec'
  return 'Non connecté'
}

export function StatusDot({ status }: { status: ConnInfo['status'] }) {
  return (
    <span className="relative flex size-2">
      {status === 'connected' && <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-60" />}
      <span className={cls('relative inline-flex size-2 rounded-full', status === 'connected' ? 'bg-emerald-500' : status === 'connecting' ? 'bg-amber-400' : status === 'error' ? 'bg-rose-500' : 'bg-current opacity-40')} />
    </span>
  )
}
