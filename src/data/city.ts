/* City-mode tuning: the shared, 52-week season. Single-player numbers are
   untouched; these only apply to a game with `cityMode` set, which is every
   game in a shared city. The balance test (citygame/__tests__/balance.test.ts)
   plays bots through whole seasons against these and pins the outcome. */

import type { MarketState, RankId } from '../state/types'

export const SEASON_WEEKS = 52
export const QUARTER_WEEKS = 13

export const CITY = {
  /** Multiplies every commission. The agent engine has to fund the jump to
   *  property inside a season, not a career. */
  COMMISSION_MULT: 1.8,
  /** Multiplies each rank's earnings bar (after the character's own mult). */
  PROMO_EARNINGS_MULT: {
    receptionist: 1,
    junior: 1,
    buyerAgent: 1,
    sellerAgent: 0.8,
    topProducer: 0.5,
  } as Record<RankId, number>,
  /** Replaces the deals bar per rank, where it differs. */
  PROMO_DEALS: { topProducer: 18 } as Partial<Record<RankId, number>>,
  /** Weekly baseValue growth on every property you hold. Over a season this
   *  is what turns holding into the second engine. */
  APPRECIATION_PER_WEEK: 0.005,
} as const

/** The market follows the calendar: spring warms up, summer is the peak,
 *  fall cools, winter is for bargains. */
export const QUARTER_MARKET: MarketState[] = ['normal', 'hot', 'normal', 'cold']

/** New supply. The pool grows with the city so nobody gets locked out. */
export const SUPPLY = {
  BASE: 6,
  PER_PLAYER: 2,
  MAX: 28,
  /** Unbid listings come down after this many weeks. */
  EXPIRE_WEEKS: 6,
  /** Chance a fresh listing is a bank auction: cheap, beaten up. */
  BANK_CHANCE: 0.15,
  BANK_PRICE_MULT: 0.82,
  BANK_CONDITION: [20, 50] as [number, number],
  FORECLOSURE_PRICE_MULT: 0.85,
  /** Each tick this many listings are swapped for fresh ones, so the board
   *  moves even when nobody buys. */
  CHURN: 2,
}

/** Offers and auctions. */
export const AUCTION = {
  /** Lowest offer the city will take to the seller, as a share of ask. */
  MIN_BID: 0.7,
  MAX_BID: 3,
  /** With two or more bidders, the best bid at or above this share of ask
   *  wins outright. Below it, the seller decides as for a lone offer. */
  RESERVE: 0.85,
  /** A lone offer under ask: acceptance = 1 − (1 − bid/ask) × this, per
   *  quarter. Summer sellers are proud; winter sellers are motivated. */
  LOWBALL_STRICTNESS: [5, 8, 4, 2.5] as [number, number, number, number],
}

/** What happens to players who stop checking in. Weeks are city weeks. */
export const ABSENCE = {
  /** After this many missed check-ins, properties wear faster. */
  NEGLECT_AFTER: 3,
  NEGLECT_WEAR: 3,
  /** After this many, the bank starts taking houses back, one a week. */
  FORECLOSE_AFTER: 7,
  /** The forced sale pays this share of value, minus the mortgage. */
  FORECLOSE_SALE: 0.75,
}

/** Bids, rivalry callouts and the feed's length. */
export const FEED_MAX = 300
export const GRUDGE_AT = [3, 5, 8, 12]
