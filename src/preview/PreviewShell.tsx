import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { Download, Monitor, Smartphone } from 'lucide-react'
import { cls } from '../shared/cls'

const RELEASES = 'https://github.com/Trdgi4djyds/pocketpad/releases/latest'

type Product = 'mobile' | 'pc'

const PRODUCTS: Record<Product, { label: string; name: string; file: string; desc: string; w: number; h: number; icon: typeof Monitor }> = {
  mobile: {
    label: 'APK Android',
    name: 'PocketPad — la manette',
    file: 'PocketPad-Android.apk',
    desc: 'S\'installe sur le téléphone. Choisissez une vraie manette (DualSense, Xbox, Switch Pro, GameCube…) puis jouez en tactile : les touches sont celles de la photo réelle.',
    w: 844,
    h: 390,
    icon: Smartphone,
  },
  pc: {
    label: 'Logiciel PC',
    name: 'PocketPad Hub — le récepteur Windows',
    file: 'PocketPad-Hub-Setup.exe',
    desc: 'S\'installe sur le PC. Il reçoit les téléphones par USB, Wi-Fi ou Internet et crée de vraies manettes Xbox 360 / DualShock 4 que les jeux reconnaissent.',
    w: 1440,
    h: 900,
    icon: Monitor,
  },
}

/** Aperçu uniquement : présente les deux logiciels, chacun dans son appareil. */
export function PreviewShell() {
  const [tab, setTab] = useState<Product>(location.hash === '#pc' ? 'pc' : 'mobile')
  const P = PRODUCTS[tab]
  const choose = (t: Product) => {
    setTab(t)
    history.replaceState(null, '', t === 'pc' ? '#pc' : '#mobile')
  }
  return (
    <div className="flex h-full flex-col overflow-hidden bg-[radial-gradient(80%_70%_at_50%_45%,#23252d,#0b0c10_70%)] text-white">
      <header className="flex items-center justify-between gap-6 px-8 pt-6">
        <div>
          <div className="font-display text-xl font-extrabold tracking-tight">PocketPad</div>
          <div className="text-xs text-white/50">Deux logiciels qui fonctionnent ensemble</div>
        </div>
        <div className="flex rounded-full border border-white/12 bg-white/5 p-1">
          {(Object.keys(PRODUCTS) as Product[]).map((k) => {
            const I = PRODUCTS[k].icon
            return (
              <button key={k} onClick={() => choose(k)} className={cls('flex items-center gap-2 rounded-full px-5 py-2 text-sm font-medium transition', tab === k ? 'bg-white text-[#0a0a10]' : 'text-white/65 hover:text-white')}>
                <I className="size-4" /> {PRODUCTS[k].label}
              </button>
            )
          })}
        </div>
        <a href={RELEASES} target="_blank" rel="noreferrer" className="flex items-center gap-2 rounded-full border border-white/15 px-4 py-2 text-xs font-medium text-white/80 hover:bg-white/10">
          <Download className="size-4" /> {P.file}
        </a>
      </header>
      <main className="min-h-0 flex-1 px-8 py-6">
        <Stage product={tab} />
      </main>
      <footer className="mx-auto max-w-3xl px-8 pb-6 text-center">
        <div className="font-display text-lg font-semibold">{P.name}</div>
        <p className="mt-1 text-sm text-white/55">{P.desc}</p>
      </footer>
    </div>
  )
}

function Stage({ product }: { product: Product }) {
  const ref = useRef<HTMLDivElement>(null)
  const [box, setBox] = useState({ w: 0, h: 0 })
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(() => setBox({ w: el.clientWidth, h: el.clientHeight }))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const P = PRODUCTS[product]
  const bezel = product === 'mobile' ? 16 : 14
  const extraH = product === 'mobile' ? 0 : 80
  const scale = box.w ? Math.min(product === 'mobile' ? 1.35 : 1, (box.w - 20) / (P.w + bezel * 2), (box.h - 10) / (P.h + bezel * 2 + extraH)) : 0
  return (
    <div ref={ref} className="grid h-full w-full place-items-center">
      {scale > 0 && (product === 'mobile' ? <Phone scale={scale} /> : <Desktop scale={scale} />)}
    </div>
  )
}

function Screen({ app, w, h, scale }: { app: Product; w: number; h: number; scale: number }) {
  return (
    <div className="relative overflow-hidden" style={{ width: w * scale, height: h * scale }}>
      <iframe title={app} src={`${location.pathname}?app=${app}`} className="absolute left-0 top-0 origin-top-left border-0" style={{ width: w, height: h, transform: `scale(${scale})` }} />
    </div>
  )
}

function Phone({ scale }: { scale: number }) {
  const { w, h } = PRODUCTS.mobile
  const b = 16 * scale
  return (
    <Frame>
      <div className="relative rounded-[calc(var(--s)*54px)] p-[var(--b)] shadow-[0_40px_100px_-20px_rgba(0,0,0,0.9)]" style={{ ['--s' as string]: scale, ['--b' as string]: `${b}px`, background: 'linear-gradient(145deg,#3a3c44,#121317 40%,#2a2c33)' }}>
        <div className="absolute inset-[2px] rounded-[calc(var(--s)*52px)] bg-black" />
        {/* Boutons latéraux (téléphone tenu en paysage) */}
        <span className="absolute -top-[3px] left-[22%] h-[4px] w-[9%] rounded-t bg-[#2a2c33]" />
        <span className="absolute -top-[3px] left-[34%] h-[4px] w-[6%] rounded-t bg-[#2a2c33]" />
        <div className="relative overflow-hidden rounded-[calc(var(--s)*40px)]">
          <Screen app="mobile" w={w} h={h} scale={scale} />
          <span className="pointer-events-none absolute left-[calc(var(--s)*14px)] top-1/2 size-[calc(var(--s)*12px)] -translate-y-1/2 rounded-full bg-black ring-1 ring-white/10" />
        </div>
      </div>
    </Frame>
  )
}

function Desktop({ scale }: { scale: number }) {
  const { w, h } = PRODUCTS.pc
  return (
    <Frame>
      <div className="flex flex-col items-center">
        <div className="rounded-[calc(var(--s)*22px)] bg-[linear-gradient(180deg,#2c2e35,#141519)] p-[calc(var(--s)*14px)] shadow-[0_40px_100px_-20px_rgba(0,0,0,0.9)]" style={{ ['--s' as string]: scale }}>
          <div className="overflow-hidden rounded-[calc(var(--s)*8px)] bg-black">
            <Screen app="pc" w={w} h={h} scale={scale} />
          </div>
        </div>
        <div className="h-[calc(var(--s)*56px)] w-[calc(var(--s)*150px)] bg-[linear-gradient(180deg,#1b1c21,#2a2c33)] [clip-path:polygon(18%_0,82%_0,100%_100%,0_100%)]" style={{ ['--s' as string]: scale }} />
        <div className="h-[calc(var(--s)*10px)] w-[calc(var(--s)*360px)] rounded-full bg-[#2a2c33]" style={{ ['--s' as string]: scale }} />
      </div>
    </Frame>
  )
}

function Frame({ children }: { children: ReactNode }) {
  return <div className="animate-pop">{children}</div>
}
