import { StrictMode, Suspense, lazy, type ComponentType } from 'react'
import ReactDOM from 'react-dom/client'
import './index.css'

// Trois applications sont compilées depuis ce dépôt :
//   pnpm build:mobile → les APK Android : la manette (téléphone) et PocketPad TV (même code, saveur « tv »)
//   pnpm build:pc     → l'interface de PocketPad Hub, le logiciel PC installable, et sa fenêtre de diffusion
// Sans cible (aperçu Figma Make), une page présente les trois applications dans leur appareil.

type Loader = () => Promise<{ default: ComponentType }>

const q = new URLSearchParams(location.search)
const mobile: Loader = () => import('./mobile/MobileApp').then((m) => ({ default: m.MobileApp }))
const tv: Loader = () => import('./tv/TvApp').then((m) => ({ default: m.TvApp }))
const pc: Loader = () => (q.has('streamer') ? import('./pc/Streamer').then((m) => ({ default: m.Streamer })) : import('./pc/PcApp').then((m) => ({ default: m.PcApp })))

/** L'APK Android contient la manette et l'application TV : le plugin natif indique s'il tourne sur une TV. */
const nativeOrMobile: Loader = async () => {
  const { nativeInfo } = await import('./shared/native')
  const info = await nativeInfo()
  return (info?.tv ? tv : mobile)()
}

function pickApp(): Loader {
  const app = q.get('app')
  if (import.meta.env.MODE === 'mobile') return app === 'tv' ? tv : nativeOrMobile
  if (import.meta.env.MODE === 'pc') return pc
  if (app === 'mobile') return mobile
  if (app === 'tv') return tv
  if (app === 'pc') return pc
  return () => import('./preview/PreviewShell').then((m) => ({ default: m.PreviewShell }))
}

const App = lazy(pickApp())

ReactDOM.createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Suspense fallback={<div className="h-full bg-[#06070a]" />}>
      <App />
    </Suspense>
  </StrictMode>,
)
