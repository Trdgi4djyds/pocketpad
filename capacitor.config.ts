import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.pocketpad.app',
  appName: 'PocketPad',
  webDir: 'out/mobile',
  server: {
    // http : autorise les connexions ws:// vers le PC sur le réseau local
    androidScheme: 'http',
    cleartext: true,
  },
  android: {
    allowMixedContent: true,
    backgroundColor: '#06060a',
  },
}

export default config
