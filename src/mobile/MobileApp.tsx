import { useCallback, useEffect, useRef, useState } from 'react'
import { Showroom } from './screens/Showroom'
import { PlayScreen } from './screens/PlayScreen'
import { ConnectSheet, type SheetTab } from './screens/ConnectSheet'
import { connection, useConnection } from './connection'
import { getModel, getSkin } from '../shared/catalog'
import { useSettings } from './store'
import { servedByHub } from '../shared/platform'
import { DEFAULT_PORT } from '../shared/protocol'
import { PocketPad, isNativeApp } from '../shared/native'

type Screen = 'showroom' | 'play'

const initialScreen = (): Screen => (location.hash.startsWith('#/play') ? 'play' : 'showroom')
const initialSheet = (): SheetTab | null => {
  const m = location.hash.match(/^#\/connect(?:\/(usb|wifi|bluetooth|settings))?/)
  return m ? ((m[1] as SheetTab) ?? 'usb') : null
}

/** APK Android « PocketPad » : transforme le téléphone en manette. */
export function MobileApp() {
  const [screen, setScreen] = useState<Screen>(initialScreen)
  const [sheet, setSheet] = useState<SheetTab | null>(initialSheet)
  const settings = useSettings()
  const conn = useConnection()
  const skin = getSkin(getModel(settings.modelId), settings.skins[settings.modelId])

  // Ouverte depuis le QR code du Hub (navigateur du téléphone) : connexion directe au PC.
  useEffect(() => {
    if (servedByHub && connection.getInfo().status === 'idle') connection.connectWebSocket(location.host || `localhost:${DEFAULT_PORT}`, 'browser')
  }, [])

  const closeSheet = useCallback(() => setSheet(null), [])

  // Bouton Retour d'Android : ferme la feuille, quitte la manette, puis l'application
  const back = useRef(() => {})
  back.current = () => {
    if (sheet) setSheet(null)
    else if (screen === 'play') setScreen('showroom')
    else PocketPad.exitApp().catch(() => {})
  }
  useEffect(() => {
    if (!isNativeApp) return
    PocketPad.setBackHandling({ enabled: true }).catch(() => {})
    const h = PocketPad.addListener('back', () => back.current())
    return () => {
      h.then((x) => x.remove()).catch(() => {})
    }
  }, [])

  return (
    <div className="h-full w-full">
      {screen === 'showroom' ? (
        <Showroom onPlay={() => setScreen('play')} onConnect={(t) => setSheet(t ?? (conn.transport === 'bluetooth' ? 'bluetooth' : conn.transport === 'usb' ? 'usb' : 'wifi'))} />
      ) : (
        <PlayScreen onExit={() => setScreen('showroom')} onConnect={() => setSheet('wifi')} />
      )}
      {sheet && <ConnectSheet initial={sheet} onClose={closeSheet} accent={skin.accent} />}
    </div>
  )
}
