/* What each playable agent looks like, as parts for AgentFace to draw: a
   haircut, an outfit, a mouth and one or two props. Every look comes
   straight out of the bio. */

export type Hair = 'short' | 'side' | 'bob' | 'sleek' | 'swoop' | 'fade' | 'quiff' | 'ring' | 'curls'
export type Mouth = 'smile' | 'smirk' | 'flat' | 'grin' | 'beam'
export type Prop =
  | 'tophat'
  | 'monocle'
  | 'moustache'
  | 'readers'
  | 'pearls'
  | 'mic'
  | 'eyebags'
  | 'shades'
  | 'collar'
  | 'popped'
  | 'earrings'
  | 'lipstick'
  | 'phone'
  | 'ringlight'
  | 'cateye'
  | 'tie'
  | 'cravat'
  | 'wrinkles'

export interface FaceLook {
  skin: string
  hair: Hair
  hairColor: string
  /** Blazer, sweater or tee. */
  outfit: string
  /** The shirt in the V of the outfit. */
  shirt: string
  mouth: Mouth
  props: Prop[]
  /** Terri's headshot is from 2011, and it shows. */
  sepia?: boolean
  /** Blaine exists exactly as much as his ad spend allows. */
  fade?: number
}

export const FACES: Record<string, FaceLook> = {
  you: {
    skin: '#e0b48c',
    hair: 'short',
    hairColor: '#4a2f1c',
    outfit: '#3d4a66',
    shirt: '#f5f2ea',
    mouth: 'smile',
    props: ['tie'],
  },
  nigel: {
    skin: '#f1c9a5',
    hair: 'side',
    hairColor: '#8a8478',
    outfit: '#4a3a66',
    shirt: '#f5f2ea',
    mouth: 'smirk',
    props: ['cravat', 'moustache', 'monocle', 'tophat'],
  },
  doreen: {
    skin: '#ecc3a0',
    hair: 'bob',
    hairColor: '#b9b6b0',
    outfit: '#c9b48a',
    shirt: '#f5f2ea',
    mouth: 'smirk',
    props: ['wrinkles', 'pearls', 'readers'],
  },
  hunter: {
    skin: '#d9a77e',
    hair: 'fade',
    hairColor: '#1d1b20',
    outfit: '#1f1f24',
    shirt: '#1f1f24',
    mouth: 'grin',
    props: ['eyebags', 'mic'],
  },
  chip: {
    skin: '#f5d6bd',
    hair: 'swoop',
    hairColor: '#e8c27a',
    outfit: '#d4af37',
    shirt: '#f2a6b8',
    mouth: 'smirk',
    props: ['popped', 'shades'],
  },
  dave: {
    skin: '#e8b994',
    hair: 'ring',
    hairColor: '#6b4a2e',
    outfit: '#5e8ba3',
    shirt: '#1d1b20',
    mouth: 'beam',
    props: ['collar'],
  },
  svetlana: {
    skin: '#f0d0b8',
    hair: 'sleek',
    hairColor: '#0e0e12',
    outfit: '#0e0e12',
    shirt: '#0e0e12',
    mouth: 'flat',
    props: ['lipstick', 'earrings'],
  },
  blaine: {
    skin: '#e6b48e',
    hair: 'quiff',
    hairColor: '#5a3a1c',
    outfit: '#d97706',
    shirt: '#f5f2ea',
    mouth: 'grin',
    props: ['ringlight', 'phone'],
    fade: 0.72,
  },
  terri: {
    skin: '#b07a52',
    hair: 'curls',
    hairColor: '#7a3b22',
    outfit: '#3f7a5e',
    shirt: '#f5f2ea',
    mouth: 'smile',
    props: ['cateye'],
    sepia: true,
  },
}

export const faceFor = (characterId: string): FaceLook => FACES[characterId] ?? FACES.you
