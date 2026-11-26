import type { OutputType } from './protocol'

// Catalogue des manettes : rendus studio neufs, vus parfaitement de face et détourés,
// avec la position mesurée de chaque bouton sur l'image.

const photos = import.meta.glob('./assets/controllers/*.webp', { eager: true, import: 'default' }) as Record<string, string>
const asset = (name: string) => photos[`./assets/controllers/${name}.webp`]

/** [x, y, r] — x et y en fraction de la largeur / hauteur de l'image, r en fraction de la largeur. */
export type Spot = [number, number, number]
/** [x, y, w, h] — centre et taille, en fractions de l'image. */
export type Rect = [number, number, number, number]

export interface Hotspots {
  /** Boutons d'action par position : sud, est, ouest, nord */
  a: Spot
  b: Spot
  x: Spot
  y: Spot
  dpad: Spot
  /** Sticks : r = rayon exact du capuchon */
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
  photo: string
  thumb: string
  /** Rapport hauteur / largeur de l'image */
  ratio: number
  spots: Hotspots
  /** Ambiance du studio dans l'interface */
  tone: 'light' | 'dark'
  /** Couleur d'accent (lueur, boutons actifs) */
  accent: string
  /** Couleur de fond du studio */
  studio: string
  /** Couleur de la pastille de sélection */
  swatch: string
  /** Teinte du puits sous les sticks (sinon déduite de l'ambiance) */
  well?: string
}

export interface ControllerModel {
  id: string
  name: string
  family: string
  short: string
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
    glyphs: 'ps',
    out: 'x360',
    labels: { back: 'Create', start: 'Options', guide: 'PS', lb: 'L1', rb: 'R1', lt: 'L2', rt: 'R2' },
    skins: [
      skin('ds-white', 884 / 1309, {
        name: 'Blanc',
        tone: 'light',
        accent: '#2f6bff',
        studio: '#e9eaee',
        swatch: '#f4f5f7',
        well: '#0b0b0e',
        spots: {
          a: p(80.5, 37.7, 3.0), b: p(87.3, 27.6, 3.0), x: p(73.5, 27.6, 3.0), y: p(80.5, 18.2, 3.0),
          dpad: p(18.9, 27.6, 8.1), ls: p(34.1, 48.7, 5.8), rs: p(65.6, 48.7, 5.8),
          back: p(27.1, 12.4, 1.6), start: p(72.7, 12.4, 1.6), guide: p(49.1, 47.4, 2.4), touchpad: rect(50, 18.8, 39, 27.9),
        },
      }),
      skin('ds-black', 909 / 1408, {
        name: 'Midnight Black',
        tone: 'dark',
        accent: '#5b8cff',
        studio: '#14151b',
        swatch: '#202127',
        spots: {
          a: p(80.0, 39.4, 3.1), b: p(86.8, 28.5, 3.1), x: p(72.9, 28.5, 3.1), y: p(80.0, 18.0, 3.1),
          dpad: p(20.0, 28.2, 7.7), ls: p(34.4, 48.6, 5.6), rs: p(65.6, 48.6, 5.6),
          back: p(27.5, 12.3, 1.6), start: p(72.5, 12.3, 1.6), guide: p(49.8, 47.9, 2.4), touchpad: rect(50, 19.6, 39, 28.5),
        },
      }),
      skin('ds-red', 907 / 1358, {
        name: 'Cosmic Red',
        tone: 'dark',
        accent: '#ff3b5c',
        studio: '#1a0c10',
        swatch: '#b8142f',
        spots: {
          a: p(80.2, 37.1, 3.0), b: p(87.1, 26.9, 3.0), x: p(73.3, 26.9, 3.0), y: p(80.2, 16.6, 3.0),
          dpad: p(19.7, 26.9, 7.9), ls: p(34.3, 47.9, 5.6), rs: p(65.6, 47.9, 5.6),
          back: p(27.3, 12.2, 1.6), start: p(72.7, 12.2, 1.6), guide: p(49.8, 46.3, 2.4), touchpad: rect(50, 18.8, 39, 28),
        },
      }),
    ],
  },
  {
    id: 'dualshock4',
    name: 'DualShock 4',
    family: 'PlayStation 4',
    short: 'PS4',
    glyphs: 'ps',
    out: 'x360',
    labels: { back: 'Share', start: 'Options', guide: 'PS', lb: 'L1', rb: 'R1', lt: 'L2', rt: 'R2' },
    skins: [
      skin('ds4-black', 893 / 1444, {
        name: 'Jet Black',
        tone: 'dark',
        accent: '#3b82f6',
        studio: '#131418',
        swatch: '#1d1e22',
        spots: {
          a: p(80.6, 40.9, 3.2), b: p(87.8, 29.4, 3.2), x: p(73.5, 29.4, 3.2), y: p(80.7, 17.9, 3.2),
          dpad: p(19.3, 29.4, 8.2), ls: p(34.3, 50.6, 6.0), rs: p(65.6, 50.6, 6.0),
          back: p(29.3, 14.3, 1.8), start: p(70.5, 14.3, 1.8), guide: p(49.8, 51.8, 2.5), touchpad: rect(49.8, 20.6, 32.7, 28),
        },
      }),
      skin('ds4-white', 952 / 1483, {
        name: 'Glacier White',
        tone: 'light',
        accent: '#2563eb',
        studio: '#e8e9ed',
        swatch: '#eef0f3',
        well: '#4f525a',
        spots: {
          a: p(80.3, 40.1, 3.2), b: p(87.7, 28.9, 3.2), x: p(73.0, 28.9, 3.2), y: p(80.3, 17.3, 3.2),
          dpad: p(19.5, 28.9, 8.2), ls: p(34.5, 49.6, 6.1), rs: p(65.5, 49.6, 6.1),
          back: p(30.3, 14.2, 1.8), start: p(69.8, 14.2, 1.8), guide: p(49.8, 50.3, 2.5), touchpad: rect(50, 20.4, 32.4, 26.6),
        },
      }),
    ],
  },
  {
    id: 'xbox',
    name: 'Xbox Wireless',
    family: 'Xbox Series X|S',
    short: 'Xbox',
    glyphs: 'xbox',
    out: 'x360',
    labels: { back: 'View', start: 'Menu', guide: 'Xbox', lb: 'LB', rb: 'RB', lt: 'LT', rt: 'RT' },
    skins: [
      skin('xb-carbon', 917 / 1304, {
        name: 'Carbon Black',
        tone: 'dark',
        accent: '#22c55e',
        studio: '#121315',
        swatch: '#24262a',
        spots: {
          a: p(75.7, 38.2, 3.4), b: p(82.4, 28.7, 3.4), x: p(69.1, 28.7, 3.4), y: p(75.7, 19.1, 3.4),
          dpad: p(36.5, 51.0, 7.7), ls: p(24.5, 27.9, 5.9), rs: p(62.5, 49.6, 5.9),
          back: p(42.4, 28.2, 2.2), start: p(57.5, 28.2, 2.2), guide: p(49.8, 14.5, 3.8), capture: p(49.9, 36.3, 2.0),
        },
      }),
      skin('xb-robot', 873 / 1262, {
        name: 'Robot White',
        tone: 'light',
        accent: '#16a34a',
        studio: '#e7e8eb',
        swatch: '#f3f4f6',
        well: '#8a8e96',
        spots: {
          a: p(76.2, 38.9, 3.6), b: p(83.0, 29.6, 3.6), x: p(69.2, 28.9, 3.6), y: p(76.2, 19.4, 3.6),
          dpad: p(36.4, 51.0, 7.9), ls: p(24.1, 28.4, 5.9), rs: p(62.5, 50.1, 6.0),
          back: p(42.9, 28.3, 2.2), start: p(57.3, 28.3, 2.2), guide: p(50, 14.5, 3.9), capture: p(50, 35.7, 2.0),
        },
      }),
      skin('xb-shock', 906 / 1328, {
        name: 'Shock Blue',
        tone: 'dark',
        accent: '#3b82f6',
        studio: '#0a1330',
        swatch: '#1f5fd6',
        well: '#0b1430',
        spots: {
          a: p(75.7, 38.7, 3.5), b: p(82.5, 29.1, 3.5), x: p(68.9, 28.8, 3.5), y: p(75.7, 19.3, 3.5),
          dpad: p(36.8, 50.7, 7.6), ls: p(24.5, 27.7, 5.9), rs: p(62.4, 49.9, 6.0),
          back: p(42.5, 28.0, 2.2), start: p(57.1, 28.0, 2.2), guide: p(49.8, 14.4, 3.8), capture: p(49.8, 35.7, 2.0),
        },
      }),
    ],
  },
  {
    id: 'switchpro',
    name: 'Pro Controller',
    family: 'Nintendo Switch',
    short: 'Switch',
    glyphs: 'nintendo',
    out: 'x360',
    labels: { back: '−', start: '+', guide: 'Home', lb: 'L', rb: 'R', lt: 'ZL', rt: 'ZR' },
    skins: [
      skin('sw-black', 915 / 1323, {
        name: 'Noir fumé',
        tone: 'dark',
        accent: '#e60012',
        studio: '#121317',
        swatch: '#2b2c31',
        spots: {
          a: p(76.2, 38.9, 3.5), b: p(83.5, 29.7, 3.5), x: p(68.8, 29.3, 3.5), y: p(76.2, 20.0, 3.5),
          dpad: p(35.9, 48.0, 7.3), ls: p(23.4, 28.4, 6.0), rs: p(63.4, 48.2, 6.0),
          back: p(38.0, 18.8, 2.3), start: p(62.1, 18.8, 2.3), guide: p(56.4, 30.0, 2.6), capture: p(43.2, 29.7, 2.2),
        },
      }),
    ],
  },
  {
    id: 'gamecube',
    name: 'GameCube',
    family: 'Nintendo GameCube',
    short: 'GameCube',
    glyphs: 'gc',
    out: 'x360',
    labels: { back: '', start: 'Start', guide: '', lb: '', rb: 'Z', lt: 'L', rt: 'R' },
    noLB: true,
    skins: [
      skin('gc-indigo', 912 / 1256, {
        name: 'Indigo',
        tone: 'dark',
        accent: '#8b7cf6',
        studio: '#15132a',
        swatch: '#4b3fa8',
        well: '#1b1546',
        spots: {
          a: p(78.0, 34.0, 5.9), b: p(88.2, 31.5, 3.6), x: p(67.3, 40.9, 3.5), y: p(75.1, 19.4, 3.8),
          dpad: p(34.4, 61.0, 6.6), ls: p(21.6, 32.5, 6.2), rs: p(65.1, 61.7, 5.2), start: p(49.9, 33.2, 2.5),
        },
      }),
    ],
  },
  {
    id: 'snes',
    name: 'Super Nintendo',
    family: 'Super Nintendo',
    short: 'SNES',
    glyphs: 'snes',
    out: 'x360',
    labels: { back: 'Select', start: 'Start', guide: '', lb: 'L', rb: 'R', lt: '', rt: '' },
    noTriggers: true,
    skins: [
      skin('snes-pal', 628 / 1403, {
        name: 'Gris PAL',
        tone: 'light',
        accent: '#e43d4f',
        studio: '#e4e3df',
        swatch: '#c9c9cc',
        spots: {
          a: p(78.9, 70.1, 3.6), b: p(87.3, 54.1, 3.6), x: p(70.5, 54.1, 3.6), y: p(78.9, 38.2, 3.6),
          dpad: p(20.5, 53.5, 8.2), back: p(41.8, 56.3, 3.0), start: p(52.5, 56.3, 3.0),
        },
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
