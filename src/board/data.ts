/* Land Grab's numbers and names. Constant data only. */

import type { BuildingKind, DealCard, Hand, Res, Terrain } from './types'

export const RESOURCES: Res[] = ['leads', 'lumber', 'brick', 'permits', 'cash']

export const RES_INFO: Record<Res, { name: string; icon: string }> = {
  leads: { name: 'Leads', icon: '📇' },
  lumber: { name: 'Lumber', icon: '🪵' },
  brick: { name: 'Brick', icon: '🧱' },
  permits: { name: 'Permits', icon: '📜' },
  cash: { name: 'Cash', icon: '💵' },
}

export const TERRAIN_INFO: Record<Terrain, { name: string; icon: string; fill: string }> = {
  leads: { name: 'Cul-de-sacs', icon: '🏡', fill: '#7bb661' },
  lumber: { name: 'Lumberyard', icon: '🌲', fill: '#3f7a4a' },
  brick: { name: 'Brickworks', icon: '🧱', fill: '#c06a45' },
  permits: { name: 'City Hall', icon: '🏛️', fill: '#7d8aa6' },
  cash: { name: 'Bank Row', icon: '🏦', fill: '#d9b54a' },
  river: { name: 'The Grand River', icon: '🌊', fill: '#4f8fc0' },
}

/** 19 tiles: 4 + 4 + 3 + 3 + 4 + the river. */
export const TERRAIN_BAG: Terrain[] = [
  'leads', 'leads', 'leads', 'leads',
  'lumber', 'lumber', 'lumber', 'lumber',
  'brick', 'brick', 'brick',
  'permits', 'permits', 'permits',
  'cash', 'cash', 'cash', 'cash',
  'river',
]

/** One per tile that isn't the river. */
export const NUMBER_BAG = [2, 3, 3, 4, 4, 5, 5, 6, 6, 8, 8, 9, 9, 10, 10, 11, 11, 12]

/** How often a number comes up, out of 36. */
export const PIPS: Record<number, number> = { 2: 1, 3: 2, 4: 3, 5: 4, 6: 5, 8: 5, 9: 4, 10: 3, 11: 2, 12: 1 }

const h = (p: Partial<Hand>): Hand => ({ leads: 0, lumber: 0, brick: 0, permits: 0, cash: 0, ...p })

export const COSTS = {
  street: h({ lumber: 1, brick: 1 }),
  house: h({ lumber: 1, brick: 1, leads: 1, cash: 1 }),
  duplex: h({ permits: 2, cash: 2 }),
  tower: h({ permits: 2, cash: 2, leads: 2 }),
  deal: h({ leads: 1, permits: 1, cash: 1 }),
} as const

export const LIMITS = { street: 15, house: 5, duplex: 4, tower: 3 }

export const BUILDING_INFO: Record<BuildingKind, { name: string; points: number; yield: number }> = {
  house: { name: 'House', points: 1, yield: 1 },
  duplex: { name: 'Duplex', points: 2, yield: 2 },
  tower: { name: 'Tower', points: 3, yield: 3 },
}

export const WIN_POINTS = 12
export const MAIN_STREET_MIN = 5
export const TOP_PRODUCER_MIN = 3
export const AWARD_POINTS = 2
/** More cards than this when a 7 comes up and you lose half. */
export const HAND_LIMIT = 7

export interface EraDef {
  name: string
  /** Leader's visible points that open this era. */
  at: number
  blurb: string
}

/** The game's stages. The leader drags everyone into the next one. */
export const ERAS: EraDef[] = [
  { name: 'Agent Era', at: 0, blurb: 'Streets, houses and deal cards. Everyone starts with a lanyard.' },
  { name: 'Landlord Era', at: 4, blurb: 'Duplexes unlocked: turn a house into a duplex. It pays double.' },
  { name: 'Developer Era', at: 7, blurb: 'Towers unlocked: turn a duplex into a tower. It pays triple.' },
  { name: 'Mogul Era', at: 10, blurb: 'The bank gets friendly: trade 3 of a kind for 1, not 4.' },
]

export const bankRatio = (era: number) => (era >= 3 ? 3 : 4)

export const DEAL_INFO: Record<DealCard, { name: string; text: string; icon: string }> = {
  openHouse: { name: 'Open House', icon: '🎈', text: 'Move the Market Crash and take a card from a neighbour. Three of these makes you Top Producer.' },
  zoning: { name: 'Zoning Variance', icon: '🛣️', text: 'Build two streets for free.' },
  hotMarket: { name: 'Hot Market', icon: '🔥', text: 'Take any two cards from the bank.' },
  biddingWar: { name: 'Bidding War', icon: '📣', text: 'Name a resource. Everyone hands you all of theirs.' },
  plaque: { name: 'Realtor of the Month', icon: '🏅', text: 'A secret Empire Point. Counts the moment you buy it.' },
}

export const DECK: DealCard[] = [
  ...Array<DealCard>(13).fill('openHouse'),
  ...Array<DealCard>(3).fill('zoning'),
  ...Array<DealCard>(3).fill('hotMarket'),
  ...Array<DealCard>(2).fill('biddingWar'),
  ...Array<DealCard>(5).fill('plaque'),
]

/** Bots take the rivals' names and colours, so they never clash with a
 *  player's colour. */
export const BOTS = [
  { name: 'Chadwick (bot)', color: '#8b1e3f' },
  { name: 'Krystal (bot)', color: '#b04fc9' },
  { name: 'Duke (bot)', color: '#27408b' },
  { name: 'Brenda (bot)', color: '#5d6b2f' },
]

export const MAX_SEATS = 4
export const MIN_SEATS = 2
export const LOG_MAX = 80
