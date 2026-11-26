import { Capacitor } from '@capacitor/core'
import type { HubApi, StreamApi } from '../pc/types'

declare global {
  interface Window {
    /** Exposé par le preload Electron de PocketPad Hub */
    pocketpadHub?: HubApi
    /** Fenêtre de diffusion cachée du Hub */
    pocketpadStream?: StreamApi
    /** Injecté par le serveur du Hub quand la manette est ouverte dans le navigateur du téléphone */
    __POCKETPAD_HUB__?: { port: number; name: string }
  }
}

export const isNative = Capacitor.isNativePlatform()
export const isAndroid = Capacitor.getPlatform() === 'android'
export const hubApi = typeof window !== 'undefined' ? window.pocketpadHub : undefined
/** Fenêtre du logiciel PC (Electron) */
export const isHubWindow = !!hubApi
/** Manette ouverte dans le navigateur du téléphone, servie par le Hub */
export const servedByHub = !isNative && !isHubWindow && typeof window !== 'undefined' && !!window.__POCKETPAD_HUB__
/** Aperçu web (Figma Make, navigateur de bureau…) */
export const isWebPreview = !isNative && !isHubWindow && !servedByHub
