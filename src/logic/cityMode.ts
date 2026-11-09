/* The handful of places where a shared-city game plays differently from
   single player. Every rule reads `state.cityMode`; nothing here touches a
   game without it. */

import { CITY, QUARTER_MARKET, QUARTER_WEEKS, SEASON_WEEKS } from '../data/city'
import type { GameState, MarketState, RankId } from '../state/types'

export const inCity = (s: Pick<GameState, 'cityMode'>): boolean => s.cityMode === true

/** 0..3 for the city week (1-based, looping every 52). */
export function quarterOf(week: number): number {
  const w = Number.isFinite(week) ? Math.floor(week) : 1
  const inYear = (((w - 1) % SEASON_WEEKS) + SEASON_WEEKS) % SEASON_WEEKS
  return Math.floor(inYear / QUARTER_WEEKS)
}

export const calendarMarket = (week: number): MarketState => QUARTER_MARKET[quarterOf(week)]

/** The first week of the quarter `week` sits in. */
export const quarterStart = (week: number): number => week - ((((week - 1) % QUARTER_WEEKS) + QUARTER_WEEKS) % QUARTER_WEEKS)

export const commissionMult = (s: GameState): number => (inCity(s) ? CITY.COMMISSION_MULT : 1)

export const promoEarningsMult = (s: GameState, rank: RankId): number =>
  inCity(s) ? CITY.PROMO_EARNINGS_MULT[rank] : 1

export const promoDeals = (s: GameState, rank: RankId, base: number): number =>
  inCity(s) ? (CITY.PROMO_DEALS[rank] ?? base) : base

export const appreciation = (s: GameState): number => (inCity(s) ? CITY.APPRECIATION_PER_WEEK : 0)
