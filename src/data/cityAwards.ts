/* Awards night (week 52) and the Champion's Kit. Constant data only.
   Placeholders in lines: {a} (the winner's name), {stat}. */

import type { AwardId } from '../citygame/types'

export const AWARDS: Record<AwardId, { title: string; line: string }> = {
  champion: {
    title: 'Champion of the City',
    line: '{a} takes the season and the blazer. The shoulder pads have been notified.',
  },
  outbid: {
    title: 'Always the Bridesmaid',
    line: '{a} bid on everything and went home with the centrepieces. {stat}.',
  },
  landlord: {
    title: 'Slumlord of the Year',
    line: '{a}’s tenants pooled their money for this one. {stat}.',
  },
  flop: {
    title: 'The Hindenburg Award',
    line: 'Up, up, and then, spectacularly, down. {a}: {stat}.',
  },
  lowball: {
    title: 'Lowballer of the Year',
    line: 'Sellers across the city have {a}’s number blocked. {stat}.',
  },
  warrior: {
    title: 'Bidding War Hero',
    line: '{a} never met a bidding war they didn’t overpay to win. {stat}.',
  },
}

/** The order awards are read out after the crown. */
export const ROAST_ORDER: AwardId[] = ['outbid', 'landlord', 'flop', 'lowball', 'warrior']

/** The champion's haircut. Big, sculpted, shiny, and it has a name. */
export const CHAMP_HAIRCUTS = [
  'The Closer',
  'The Commission',
  'The Open House',
  'The Escrow',
  'The Bidding War',
  'The Curb Appeal',
  'The Double-End',
  'The Pocket Listing',
  'The Cash Offer',
  'The Over Asking',
] as const

/** The kit itself, for the 3D agent and the Hall of Fame portraits. */
export const KIT = {
  BLAZER: '#7a1f2b',
  BLAZER_LIGHT: '#9b2c3a',
  LAPEL: '#5a1520',
  HAIR: '#3a2414',
  HAIR_SHINE: '#e8c27a',
  BOOTS: '#4f5a2e',
  BOOTS_SCALES: '#6b7a3c',
  GOLD: '#e9c94a',
} as const
