import type { OutputType } from './protocol'

// Catalogue des manettes : vraies photos (Wikimedia Commons, licences libres) détourées,
// avec la position mesurée de chaque bouton sur la photo.

const photos = import.meta.glob('./assets/controllers/*.webp', { eager: true, import: 'default' }) as Record<string, string>
const asset = (name: string) => photos[`./assets/controllers/${name}.webp`]

/** [x, y, r] — x et y en fraction de la largeur / hauteur de la photo, r en fraction de la largeur. */
export type Spot = [number, number, number]
/** [x, y, w, h] — centre et taille, en fractions de la photo. */
export type Rect = [number, number, number, number]

export interface Hotspots {
  /** Boutons d'action par position : sud, est, ouest, nord */
  a: Spot
  b: Spot
  x: Spot
  y: Spot
  dpad: Spot
  ls?: Spot
  rs?: Spot
  back?: Spot
  start?: Spot
  guide?: Spot
  capture?: Spot
  touchpad?: Rect
}

export type Glyphs = 'ps' | 'xbox' | 'nintendo' | 'gc' | 'snes'

export interface Skin {
  id: string
  name: string
  edition: string
  description: string
  photo: string
  thumb: string
  /** Rapport hauteur / largeur de la photo */
  ratio: number
  spots: Hotspots
  /** Ambiance du studio photo dans l'interface */
  tone: 'light' | 'dark'
  /** Couleur d'accent (lueur, boutons actifs) */
  accent: string
  /** Couleur de fond du studio */
  studio: string
  credit: { author: string; license: string; url: string }
}

export interface ControllerModel {
  id: string
  name: string
  family: string
  short: string
  tagline: string
  glyphs: Glyphs
  out: OutputType
  labels: { back: string; start: string; guide: string; lb: string; rb: string; lt: string; rt: string }
  /** Pas de gâchettes analogiques (Super Nintendo) */
  noTriggers?: boolean
  /** Pas de bouton de tranche gauche (GameCube : uniquement Z à droite) */
  noLB?: boolean
  skins: Skin[]
}

const skin = (id: string, ratio: number, data: Omit<Skin, 'id' | 'photo' | 'thumb' | 'ratio'>): Skin => ({
  id,
  photo: asset(id),
  thumb: asset(`${id}-thumb`),
  ratio,
  ...data,
})

const p = (x: number, y: number, r: number): Spot => [x / 100, y / 100, r / 100]
const rect = (x: number, y: number, w: number, h: number): Rect => [x / 100, y / 100, w / 100, h / 100]

export const CONTROLLERS: ControllerModel[] = [
  {
    id: 'dualsense',
    name: 'DualSense',
    family: 'PlayStation 5',
    short: 'PS5',
    tagline: 'Retour haptique, gâchettes adaptatives et pavé tactile.',
    glyphs: 'ps',
    out: 'x360',
    labels: { back: 'Create', start: 'Options', guide: 'PS', lb: 'L1', rb: 'R1', lt: 'L2', rt: 'R2' },
    skins: [
      skin('ds-black', 1265 / 1800, {
        name: 'Midnight Black',
        edition: 'Édition Midnight Black',
        description: 'Deux noirs profonds, des touches gris lunaire et la barre lumineuse bleue autour du pavé tactile.',
        tone: 'dark',
        accent: '#5b8cff',
        studio: '#16171d',
        spots: {
          a: p(82.0, 31.3, 3.3), b: p(88.9, 21.7, 3.3), x: p(74.7, 21.4, 3.3), y: p(81.4, 11.9, 3.3),
          dpad: p(20.2, 20.6, 8.3), ls: p(35.3, 38.0, 5.8), rs: p(66.7, 38.0, 5.8),
          back: p(27.6, 7.1, 1.8), start: p(73.6, 7.1, 1.8), guide: p(50.9, 38.8, 2.4), touchpad: rect(50.4, 13.4, 39.7, 24),
        },
        credit: { author: 'Chris Woodrich', license: 'CC BY-SA 4.0', url: 'https://commons.wikimedia.org/wiki/File:Playstation_5_DualSense_controller_in_Midnight_Black,_2026-02-07_(front).jpg' },
      }),
      skin('ds-white', 1219 / 1800, {
        name: 'Blanc',
        edition: 'Édition standard',
        description: 'La DualSense d\'origine : coque blanche bicolore, cœur noir laqué et touches translucides.',
        tone: 'light',
        accent: '#2f6bff',
        studio: '#e7e8ec',
        spots: {
          a: p(85.2, 38.1, 3.8), b: p(92.9, 26.3, 3.8), x: p(76.7, 25.8, 3.8), y: p(84.7, 14.0, 3.8),
          dpad: p(14.3, 26.6, 9.4), ls: p(30.6, 50.4, 6.7), rs: p(69.7, 49.6, 6.7),
          back: p(23.6, 8.2, 1.9), start: p(75.3, 7.7, 1.9), guide: p(50.0, 48.8, 2.6), touchpad: rect(49.2, 17.2, 43.9, 32),
        },
        credit: { author: 'Xephuwu', license: 'CC BY-SA 4.0', url: 'https://commons.wikimedia.org/wiki/File:KontrolerDualSense.jpg' },
      }),
      skin('ds-pearl', 663 / 948, {
        name: 'Chroma Pearl',
        edition: 'Chroma Collection',
        description: 'Une finition nacrée aux reflets irisés qui changent avec la lumière.',
        tone: 'light',
        accent: '#8f9bd6',
        studio: '#e9eaf0',
        spots: {
          a: p(81.7, 31.8, 3.4), b: p(88.9, 21.9, 3.4), x: p(74.2, 21.8, 3.4), y: p(82.0, 11.9, 3.4),
          dpad: p(18.3, 21.5, 8.0), ls: p(32.2, 40.5, 5.8), rs: p(66.4, 40.5, 5.8),
          back: p(26.4, 7.2, 1.8), start: p(73.3, 7.2, 1.8), guide: p(50.2, 40.5, 2.4), touchpad: rect(50.3, 13.4, 39.4, 25.7),
        },
        credit: { author: 'Sonson2', license: 'CC BY-SA 4.0', url: 'https://commons.wikimedia.org/wiki/File:DualSense_Controller_Chroma_Pearl.jpg' },
      }),
    ],
  },
  {
    id: 'dualshock4',
    name: 'DualShock 4',
    family: 'PlayStation 4',
    short: 'PS4',
    tagline: 'L\'iconique : pavé tactile cliquable et barre lumineuse.',
    glyphs: 'ps',
    out: 'x360',
    labels: { back: 'Share', start: 'Options', guide: 'PS', lb: 'L1', rb: 'R1', lt: 'L2', rt: 'R2' },
    skins: [
      skin('ds4-black', 1165 / 1800, {
        name: 'Jet Black',
        edition: 'Édition standard',
        description: 'Le noir original, texture granitée et symboles colorés d\'époque.',
        tone: 'dark',
        accent: '#3b82f6',
        studio: '#141519',
        spots: {
          a: p(81.7, 34.0, 3.4), b: p(88.6, 23.2, 3.4), x: p(73.9, 22.9, 3.4), y: p(81.7, 11.2, 3.4),
          dpad: p(18.0, 22.9, 8.0), ls: p(33.9, 43.0, 6.1), rs: p(63.9, 42.6, 6.1),
          back: p(29.4, 8.6, 1.8), start: p(70.2, 8.6, 1.8), guide: p(49.8, 45.2, 2.4), touchpad: rect(50, 15.9, 33.4, 25),
        },
        credit: { author: 'ITEagle Europe - Sebastiaan Broekhoven', license: 'CC BY-SA 4.0', url: 'https://commons.wikimedia.org/wiki/File:Sony_DualShock_4_wireless_controller_for_PlayStation_4_(black)_-_top_view.jpg' },
      }),
    ],
  },
  {
    id: 'xbox',
    name: 'Xbox Wireless',
    family: 'Xbox Series X|S · One',
    short: 'Xbox',
    tagline: 'L\'ergonomie de référence sur PC, reconnue partout.',
    glyphs: 'xbox',
    out: 'x360',
    labels: { back: 'View', start: 'Menu', guide: 'Xbox', lb: 'LB', rb: 'RB', lt: 'LT', rt: 'RT' },
    skins: [
      skin('xb-series-black', 1301 / 1800, {
        name: 'Carbon Black',
        edition: 'Xbox Series X|S',
        description: 'Surface texturée antidérapante, croix hybride et bouton Partager.',
        tone: 'dark',
        accent: '#22c55e',
        studio: '#131416',
        spots: {
          a: p(80.9, 36.6, 3.3), b: p(87.2, 27.4, 3.3), x: p(73.6, 26.9, 3.3), y: p(80.2, 16.6, 3.3),
          dpad: p(38.9, 52.3, 7.8), ls: p(23.7, 26.5, 6.1), rs: p(68.3, 50.0, 6.1),
          back: p(45.0, 26.5, 2.2), start: p(61.1, 26.5, 2.2), guide: p(52.8, 11.5, 4.0), capture: p(53.3, 35.1, 2.0),
        },
        credit: { author: 'uKER', license: 'CC BY-SA 4.0', url: 'https://commons.wikimedia.org/wiki/File:Xbox_Series_Controller_Carbon_Black.jpg' },
      }),
      skin('xb-phantom-white', 1264 / 1800, {
        name: 'Phantom White',
        edition: 'Xbox One · Édition spéciale',
        description: 'Coque translucide dégradée qui laisse deviner l\'intérieur de la manette.',
        tone: 'light',
        accent: '#16a34a',
        studio: '#e6e7ea',
        spots: {
          a: p(76.7, 32.3, 3.3), b: p(83.1, 22.8, 3.3), x: p(69.8, 22.0, 3.3), y: p(76.1, 12.2, 3.3),
          dpad: p(36.7, 46.5, 8.2), ls: p(24.4, 19.6, 6.3), rs: p(64.4, 40.2, 6.0),
          back: p(42.8, 22.0, 2.1), start: p(57.8, 22.0, 2.1), guide: p(50.0, 10.1, 3.6),
        },
        credit: { author: 'Luzankia', license: 'CC BY-SA 4.0', url: 'https://commons.wikimedia.org/wiki/File:Xbox_One_Controller,_Phantom_White.jpg' },
      }),
    ],
  },
  {
    id: 'switchpro',
    name: 'Pro Controller',
    family: 'Nintendo Switch',
    short: 'Switch',
    tagline: 'Poignées pleines, gyroscope et disposition Nintendo.',
    glyphs: 'nintendo',
    out: 'x360',
    labels: { back: '−', start: '+', guide: 'Home', lb: 'L', rb: 'R', lt: 'ZL', rt: 'ZR' },
    skins: [
      skin('sw-black', 1282 / 1800, {
        name: 'Noir fumé',
        edition: 'Édition standard',
        description: 'La coque noire translucide qui dévoile l\'électronique, poignées texturées.',
        tone: 'dark',
        accent: '#e60012',
        studio: '#121317',
        spots: {
          a: p(76.1, 33.5, 3.9), b: p(84.4, 23.1, 3.9), x: p(66.3, 23.4, 3.9), y: p(75.0, 13.3, 3.9),
          dpad: p(28.3, 45.2, 8.7), ls: p(16.1, 25.7, 7.0), rs: p(60.0, 46.8, 7.0),
          back: p(32.8, 15.3, 2.2), start: p(58.9, 13.7, 2.2), guide: p(53.1, 25.0, 2.4), capture: p(38.1, 25.0, 2.1),
        },
        credit: { author: 'Tim Whitehouse', license: 'CC0', url: 'https://commons.wikimedia.org/wiki/File:Nintendo.Swtich.Pro.Controller.Black.jpg' },
      }),
      skin('sw-zelda', 1294 / 1800, {
        name: 'Tears of the Kingdom',
        edition: 'Édition Zelda',
        description: 'Gravures dorées de Hyrule et poignée droite blanche, une pièce de collection.',
        tone: 'dark',
        accent: '#d8b45a',
        studio: '#17150f',
        spots: {
          a: p(77.4, 34.5, 3.9), b: p(85.3, 25.2, 3.9), x: p(69.1, 25.2, 3.9), y: p(77.4, 15.5, 3.9),
          dpad: p(32.8, 43.7, 8.3), ls: p(19.8, 22.9, 7.0), rs: p(63.1, 46.1, 7.0),
          back: p(37.2, 15.9, 2.2), start: p(62.4, 15.9, 2.2), guide: p(57.2, 24.9, 2.4), capture: p(42.6, 25.2, 2.1),
        },
        credit: { author: 'TaurusEmerald', license: 'CC BY-SA 4.0', url: 'https://commons.wikimedia.org/wiki/File:Nintendo_Switch_Pro_Controller_Zelda.jpg' },
      }),
    ],
  },
  {
    id: 'gamecube',
    name: 'GameCube',
    family: 'Nintendo GameCube',
    short: 'GameCube',
    tagline: 'Le grand bouton A, le C-stick et des gâchettes analogiques.',
    glyphs: 'gc',
    out: 'x360',
    labels: { back: '', start: 'Start', guide: '', lb: '', rb: 'Z', lt: 'L', rt: 'R' },
    noLB: true,
    skins: [
      skin('gc-indigo', 1278 / 1515, {
        name: 'Indigo',
        edition: 'Coloris d\'origine',
        description: 'Le violet indigo culte de 2001, avec son dessous translucide.',
        tone: 'dark',
        accent: '#7c6cf0',
        studio: '#15132a',
        spots: {
          a: p(79.7, 36.9, 5.8), b: p(90.2, 34.0, 3.4), x: p(68.6, 43.5, 3.7), y: p(76.7, 24.4, 3.5),
          dpad: p(32.8, 61.9, 6.2), ls: p(19.1, 35.3, 7.0), rs: p(65.6, 63.2, 6.0), start: p(49.4, 38.2, 2.2),
        },
        credit: { author: 'Evan-Amos / Alphathon', license: 'CC BY-SA 3.0', url: 'https://commons.wikimedia.org/wiki/File:GameCube_controller.png' },
      }),
      skin('gc-orange', 735 / 975, {
        name: 'Spice Orange',
        edition: 'Édition limitée',
        description: 'L\'orange épicé, rareté japonaise devenue l\'emblème des collectionneurs.',
        tone: 'light',
        accent: '#f08a24',
        studio: '#efe6dc',
        spots: {
          a: p(79.4, 24.3, 5.8), b: p(89.8, 21.4, 3.4), x: p(68.9, 30.2, 3.7), y: p(76.4, 11.8, 3.5),
          dpad: p(33.3, 50.9, 6.1), ls: p(19.4, 22.9, 7.0), rs: p(66.7, 48.7, 6.0), start: p(49.7, 27.3, 2.2),
        },
        credit: { author: 'Monathephantom', license: 'CC BY-SA 4.0', url: 'https://commons.wikimedia.org/wiki/File:GameCube_Controller_in_Orange_(Transparent)_01.png' },
      }),
      skin('gc-turquoise', 951 / 1295, {
        name: 'Emerald Blue',
        edition: 'Édition Japon',
        description: 'Le bleu émeraude, sorti uniquement au Japon.',
        tone: 'dark',
        accent: '#14b8a6',
        studio: '#0e1c1d',
        spots: {
          a: p(82.8, 37.5, 6.0), b: p(93.3, 33.3, 3.4), x: p(71.3, 46.1, 3.9), y: p(79.2, 21.9, 3.6),
          dpad: p(33.9, 71.1, 6.8), ls: p(17.8, 40.5, 7.4), rs: p(68.3, 69.6, 6.4), start: p(50.9, 38.6, 2.3),
        },
        credit: { author: 'Monathephantom', license: 'CC BY-SA 4.0', url: 'https://commons.wikimedia.org/wiki/File:Gamecube_Controller_in_Turquoise_(Transparent).png' },
      }),
      skin('gc-smash', 495 / 589, {
        name: 'Smash Bros. Ultimate',
        edition: 'Édition spéciale',
        description: 'Noir satiné frappé du logo Smash, la référence des tournois.',
        tone: 'dark',
        accent: '#ef4444',
        studio: '#141416',
        spots: {
          a: p(82.0, 37.8, 6.2), b: p(93.1, 36.1, 3.4), x: p(70.2, 46.3, 3.9), y: p(78.3, 25.5, 3.6),
          dpad: p(32.0, 65.2, 7.0), ls: p(18.0, 38.8, 7.3), rs: p(67.6, 65.9, 6.6), start: p(49.8, 40.1, 2.4),
        },
        credit: { author: 'Monathephantom', license: 'CC BY-SA 4.0', url: 'https://commons.wikimedia.org/wiki/File:Super_Smash_Bros_Ultimate_GameCube_Controller_(Transparent)_01.png' },
      }),
    ],
  },
  {
    id: 'snes',
    name: 'Super Nintendo',
    family: 'Super Nintendo',
    short: 'SNES',
    tagline: 'La croix, quatre boutons et deux tranches : l\'essentiel.',
    glyphs: 'snes',
    out: 'x360',
    labels: { back: 'Select', start: 'Start', guide: '', lb: 'L', rb: 'R', lt: '', rt: '' },
    noTriggers: true,
    skins: [
      skin('snes-pal', 685 / 1391, {
        name: 'Super Nintendo',
        edition: 'Version européenne',
        description: 'Le gris PAL et les quatre couleurs iconiques, comme en 1992.',
        tone: 'light',
        accent: '#e43d4f',
        studio: '#e4e3df',
        spots: {
          a: p(78.9, 70.4, 3.8), b: p(88.3, 55.1, 3.8), x: p(69.1, 55.1, 3.8), y: p(78.9, 40.4, 3.8),
          dpad: p(21.1, 55.8, 8.9), back: p(40.9, 61.9, 3.0), start: p(51.7, 61.9, 3.0),
        },
        credit: { author: 'Skia', license: 'CC BY 2.5', url: 'https://commons.wikimedia.org/wiki/File:SNES_Controller.jpg' },
      }),
      skin('snes-us', 890 / 1800, {
        name: 'Super NES',
        edition: 'Version américaine',
        description: 'Les boutons violet lavande de l\'édition nord-américaine.',
        tone: 'light',
        accent: '#6d5bd0',
        studio: '#e6e5ea',
        spots: {
          a: p(78.7, 71.5, 3.8), b: p(88.3, 56.6, 3.8), x: p(69.1, 57.3, 3.8), y: p(78.7, 42.2, 3.8),
          dpad: p(20.9, 57.3, 8.9), back: p(40.6, 62.9, 3.0), start: p(51.4, 62.9, 3.0),
        },
        credit: { author: 'Evan-Amos', license: 'Domaine public', url: 'https://commons.wikimedia.org/wiki/File:SNES-Controller-Flat.jpg' },
      }),
    ],
  },
]

export const getModel = (id: string) => CONTROLLERS.find((m) => m.id === id) ?? CONTROLLERS[0]
export const getSkin = (model: ControllerModel, id?: string) => model.skins.find((s) => s.id === id) ?? model.skins[0]
export const findSkin = (modelId: string, skinId: string) => getSkin(getModel(modelId), skinId)

/** Étiquettes des boutons d'action par position (sud, est, ouest, nord). */
export const FACE_LABELS: Record<Glyphs, [string, string, string, string]> = {
  ps: ['Croix', 'Rond', 'Carré', 'Triangle'],
  xbox: ['A', 'B', 'X', 'Y'],
  nintendo: ['B', 'A', 'Y', 'X'],
  gc: ['A', 'X', 'B', 'Y'],
  snes: ['B', 'A', 'Y', 'X'],
}
