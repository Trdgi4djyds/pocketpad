import { useEffect, useState } from 'react'
import { ChevronLeft, Maximize2 } from 'lucide-react'
import { PhotoPad } from '../PhotoPad'
import { getModel, getSkin } from '../../shared/catalog'
import { useSettings } from '../store'
import { connection, useConnection } from '../connection'
import { isNative } from '../../shared/platform'
import { StatusDot, statusText } from './common'

export function PlayScreen({ onExit, onConnect }: { onExit: () => void; onConnect: () => void }) {
  const settings = useSettings()
  const conn = useConnection()
  const model = getModel(settings.modelId)
  const skin = getSkin(model, settings.skins[model.id])
  const [portrait, setPortrait] = useState(false)
  const [fullscreen, setFullscreen] = useState(!!document.fullscreenElement)
  const light = skin.tone === 'light'

  useEffect(() => {
    const check = () => setPortrait(window.innerHeight > window.innerWidth * 1.1 && window.innerWidth < 900)
    const fs = () => setFullscreen(!!document.fullscreenElement)
    check()
    window.addEventListener('resize', check)
    document.addEventListener('fullscreenchange', fs)
    return () => {
      window.removeEventListener('resize', check)
      document.removeEventListener('fullscreenchange', fs)
    }
  }, [])

  const goFullscreen = async () => {
    try {
      await document.documentElement.requestFullscreen()
      await (screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> }).lock?.('landscape')
    } catch {
      /* le navigateur peut refuser : la manette reste utilisable */
    }
  }

  const chip = light ? 'border-black/10 bg-white/70 text-[#0d0e12]' : 'border-white/12 bg-black/45 text-white'

  return (
    <div className="fixed inset-0 bg-black">
      <PhotoPad
        model={model}
        skin={skin}
        onState={(s) => connection.setState(s)}
        center={
          <div className={`flex items-center gap-1 rounded-full border p-1 backdrop-blur-xl ${chip}`}>
            <button onClick={onExit} className="flex items-center gap-1 rounded-full py-1.5 pl-2 pr-3 text-xs font-medium hover:bg-black/5">
              <ChevronLeft className="size-4" /> Menu
            </button>
            <button onClick={onConnect} className={`flex items-center gap-2 rounded-full px-3 py-1.5 text-xs ${light ? 'bg-black/5' : 'bg-white/10'}`}>
              <StatusDot status={conn.status} />
              {conn.status === 'idle' ? 'Connecter' : statusText(conn)}
            </button>
            {!isNative && !fullscreen && (
              <button aria-label="Plein écran" onClick={goFullscreen} className="grid size-8 place-items-center rounded-full hover:bg-black/5">
                <Maximize2 className="size-3.5" />
              </button>
            )}
          </div>
        }
      />
      {portrait && (
        <div className="absolute inset-0 z-20 grid place-items-center bg-black/85 p-8 text-center text-white">
          <div>
            <div className="mx-auto h-16 w-10 rotate-90 rounded-lg border-2 border-white/70" />
            <p className="mt-6 font-display text-lg font-semibold">Tournez le téléphone</p>
            <p className="mt-1 text-sm text-white/60">La manette s'utilise en mode paysage.</p>
          </div>
        </div>
      )}
    </div>
  )
}
