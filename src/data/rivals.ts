/* The three rivals. They are scripted share-movers, not agents: they never buy
   properties and never take listings out of the Phase 3 market pool. Everything
   they do is §7 of the Phase 6 spec, resolved once per week. */

import type { RivalDef } from '../state/types'

export const RIVALS: RivalDef[] = [
  {
    id: 'chadwick',
    name: 'Chadwick Sterling III',
    firm: 'Sterling & Sterling & Son',
    color: '#8b1e3f',
    swagger: 8,
    homeDistrict: 'dufferin',
    focusDistricts: ['dufferin', 'tutelaHeights', 'downtown'],
    aggression: { min: 2, max: 4 },
    lines: {
      gain: 'Sterling & Sterling & Son closed another one in {district}. The fruit basket is already en route.',
      defense:
        'Chadwick noticed you on Dufferin Avenue. He has begun parking his convertible NEAR your listings.',
      showdownWin:
        'Chadwick won the showdown, thanked “the little guys,” and gestured at everyone.',
      showdownLoss:
        'You out-closed Chadwick in front of everyone. He called it “a gentleman’s rebuilding year.”',
      locked:
        'Sterling & Sterling & Son has “chosen to refocus” out of {district}. The son took it badly.',
      poach:
        'Chadwick Sterling III closed {name}. The basket includes a pear and his headshot.',
    },
  },
  {
    id: 'zambonis',
    name: 'The Zamboni Brothers',
    firm: 'Zamboni Bros. Realty — FREE PIZZA AT EVERY OPEN HOUSE',
    color: '#2e5e8b',
    swagger: 4,
    homeDistrict: 'eaglePlace',
    focusDistricts: ['eaglePlace', 'northEnd', 'westBrant'],
    aggression: { min: 3, max: 5 },
    lines: {
      gain: 'The Zamboni Brothers moved 6 units in {district} this week. The pizza budget is unsustainable and unstoppable.',
      defense:
        'The Zambonis noticed you in Eagle Place. Open houses there now have TWO pizzas.',
      showdownWin: 'The Zambonis won on volume. And pizza. Mostly pizza.',
      showdownLoss:
        'You beat the Zambonis head-to-head. Tony shook your hand. Marco is “taking a lap.”',
      locked:
        'The Zamboni Brothers are out of {district}. A single pizza was left on the curb, ceremonially.',
      poach:
        'The Zamboni Brothers closed {name}. There was a punch card involved.',
    },
  },
  {
    id: 'krystal',
    name: 'Krystal Vibe',
    firm: 'Vibe Realty Collective',
    color: '#b0508b',
    swagger: 7,
    homeDistrict: 'downtown',
    focusDistricts: ['downtown', 'echoPlace', 'holmedale'],
    aggression: { min: 2, max: 4 },
    lines: {
      gain: 'Krystal with a K posted a door-opening transition video in {district}. 90k views. Some were buyers.',
      defense:
        'Krystal noticed you Downtown. Her next reel is filmed directly in front of your bench in Harmony Square.',
      showdownWin:
        'Krystal’s showdown recap got more views than your open house got visitors.',
      showdownLoss:
        'You won, and worse for her — someone filmed it. The comments are on your side.',
      locked:
        'Vibe Realty Collective has “consciously uncoupled” from {district}. The farewell reel is 3 minutes long.',
      poach: 'Krystal with a K closed {name} ✨. The signing was a livestream.',
    },
  },
]

export const RIVAL_IDS: string[] = RIVALS.map((r) => r.id)

export const rivalOf = (id: string): RivalDef | undefined =>
  RIVALS.find((r) => r.id === id)

/** Chadwick is the fallback whenever a line needs a rival and nobody qualifies —
 *  he has been the house villain since Phase 1's poach event. */
export const FALLBACK_RIVAL: RivalDef = RIVALS[0]

/** Her display name carries the K. Her `name` stays clean for interpolation. */
export const KRYSTAL_DISPLAY = 'Krystal with a K ✨'

/* --------------------------------------------------------- flavor events */

export const FRUIT_BASKET_LINE =
  "A Sterling fruit basket arrived. The card accidentally includes next week's farming schedule: {district}."
export const UNDERCUT_LINE =
  'The Zambonis are undercutting commissions in their turf. There is also a punch card now.'
export const UNDERCUT_SUFFIX = ' (the Zamboni discount, involuntarily)'
export const KRYSTAL_VIRAL_WIN =
  'Krystal tried to dunk on you in a reel. The algorithm sided with you. +3 Rep.'
export const KRYSTAL_VIRAL_LOSS =
  "Krystal's reel about 'agents who still cold call' did numbers. You felt that."

export const SHOWDOWN_TITLE = 'Open House Showdown — {district}'
export const SHOWDOWN_BODY =
  '{rival} scheduled an open house directly across from yours. Same day. Same hour. There are flyers.'
