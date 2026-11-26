import type { GameEntry } from './protocol'

// Bibliothèque fictive pour l'aperçu (jaquettes publiques du CDN Steam).
const CDN = 'https://cdn.cloudflare.steamstatic.com/steam/apps'
const g = (appid: string, name: string, source: GameEntry['source'] = 'steam'): GameEntry => ({
  id: `${source}:${appid}`,
  name,
  source,
  art: `${CDN}/${appid}/library_600x900.jpg`,
  hero: `${CDN}/${appid}/library_hero.jpg`,
})

export const DEMO_GAMES: GameEntry[] = [
  g('271590', 'Grand Theft Auto V', 'rockstar'),
  g('1551360', 'Forza Horizon 5'),
  g('2669320', 'EA SPORTS FC 25'),
  g('1174180', 'Red Dead Redemption 2', 'rockstar'),
  g('1245620', 'ELDEN RING'),
  g('252950', 'Rocket League', 'epic'),
  g('1091500', 'Cyberpunk 2077'),
  g('1145350', 'Hades II'),
  g('1426210', 'It Takes Two'),
  g('1086940', "Baldur's Gate 3"),
  g('2050650', 'Resident Evil 4'),
  g('1172620', 'Sea of Thieves'),
]
