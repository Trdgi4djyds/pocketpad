import { StrictMode, Suspense, lazy, type ComponentType } from 'react'
import ReactDOM from 'react-dom/client'
import './index.css'

// Deux logiciels distincts sont compilés depuis ce dépôt :
//   pnpm build:mobile → l'APK Android (le téléphone devient la manette)
//   pnpm build:pc     → l'interface de PocketPad Hub, le logiciel PC installable
// Sans cible (aperçu Figma Make), une page présente les deux applications dans leur appareil.

type Loader = () => Promise<{ default: ComponentType }>

function pickApp(): Loader {
  if (import.meta.env.MODE === 'mobile') return () => import('./mobile/MobileApp').then((m) => ({ default: m.MobileApp }))
  if (import.meta.env.MODE === 'pc') return () => import('./pc/PcApp').then((m) => ({ default: m.PcApp }))
  const app = new URLSearchParams(location.search).get('app')
  if (app === 'mobile') return () => import('./mobile/MobileApp').then((m) => ({ default: m.MobileApp }))
  if (app === 'pc') return () => import('./pc/PcApp').then((m) => ({ default: m.PcApp }))
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
