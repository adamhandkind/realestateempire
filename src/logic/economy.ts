import { BRAG_TEMPLATES } from '../data/brags'
import {
  AP_PER_WEEK,
  COMMISSION_RATE,
  DESK_FEE,
  LOCKED_RANKS,
  LOSE_AT,
  RANKS,
  START_CASH,
} from '../data/ranks'
import { SLOTS, SWAG } from '../data/swag'
import type { GameState, RankDef, RankId, Stats, SwagItem } from '../state/types'
import { money, pick } from './rand'

export {
  AP_PER_WEEK,
  COMMISSION_RATE,
  DESK_FEE,
  LOCKED_RANKS,
  LOSE_AT,
  RANKS,
  SLOTS,
  START_CASH,
  SWAG,
}

export const swagOf = (id: string | undefined): SwagItem | undefined =>
  SWAG.find((s) => s.id === id)
export const rankIndex = (id: RankId): number =>
  RANKS.findIndex((r) => r.id === id)
export const rankOf = (id: RankId): RankDef => RANKS[rankIndex(id)]

/* --- rank/shop predicates. Moved out of the single-file component so no
       component has to compute a game rule for itself. --- */

/** True once the player has reached `target` or better. */
export const atLeastRank = (current: RankId, target: RankId): boolean =>
  rankIndex(current) >= rankIndex(target)

export const isSwagLocked = (item: SwagItem, rank: RankId): boolean =>
  rankIndex(rank) < rankIndex(item.unlockRank)

export const canAfford = (state: GameState, item: SwagItem): boolean =>
  state.cash >= item.price

export const isOwned = (state: GameState, item: SwagItem): boolean =>
  state.ownedSwagIds.includes(item.id)

export const isEquipped = (state: GameState, item: SwagItem): boolean =>
  state.equipped[item.slot] === item.id

/** Ego gets loud enough to start costing you deals. */
export const isEgoDangerous = (stats: Stats): boolean => stats.ego >= 8

/** Seller's Agent sitting on six figures — the Phase 2 teaser. */
export const isPhase2Teaser = (state: GameState): boolean =>
  atLeastRank(state.rank, 'sellerAgent') && state.cash >= 100000

/** Base 1/1/0, plus every equipped item, plus permanent event bonuses. */
export function deriveStats(state: GameState): Stats {
  let hustle = 1,
    swagger = 1,
    ego = 0
  SLOTS.forEach((s) => {
    const id = state.equipped[s.id]
    if (!id) return
    const it = swagOf(id)
    if (!it) return
    hustle += it.hustle
    swagger += it.swagger
    ego += it.ego
  })
  hustle += state.permBonuses.hustle
  swagger += state.permBonuses.swagger
  return {
    hustle: Math.max(1, Math.min(10, hustle)),
    swagger: Math.max(1, Math.min(10, swagger)),
    ego: Math.max(0, Math.min(15, ego)),
  }
}

export function weeklyUpkeep(state: GameState): number {
  let u = 0
  SLOTS.forEach((s) => {
    const it = swagOf(state.equipped[s.id])
    if (it) u += it.upkeep
  })
  return u
}

/** Desk fee is waived at Receptionist. */
export function weeklyExpenses(state: GameState): number {
  return (state.rank === 'receptionist' ? 0 : DESK_FEE) + weeklyUpkeep(state)
}

export function activeModifierDelta(state: GameState): number {
  return state.activeModifiers.reduce(
    (t, m) => (m.expiresWeek > state.week ? t + m.closeChanceDelta : t),
    0,
  )
}

export function splitFor(rankId: RankId): number {
  return rankOf(rankId).split
}

export function commissionFor(
  salePrice: number,
  rankId: RankId,
): { gross: number; earnings: number } {
  const gross = Math.round(salePrice * COMMISSION_RATE)
  return { gross, earnings: Math.round(gross * splitFor(rankId)) }
}

/** Both thresholds must be met; checked at end of week. */
export function nextRank(state: GameState): RankDef | null {
  const i = rankIndex(state.rank)
  const nxt = RANKS[i + 1]
  if (!nxt) return null
  const r = nxt.req
  const ok =
    state.careerEarnings >= r.earnings &&
    state.counters.showingsRun >= r.showings &&
    state.counters.dealsClosed >= r.deals
  return ok ? nxt : null
}

export function bragFor(state: GameState): string {
  const t = pick(BRAG_TEMPLATES[state.rank])
  return t
    .replace('{week}', String(state.week))
    .replace('{cash}', money(state.cash))
    .replace('{earnings}', money(state.careerEarnings))
    .replace('{deals}', String(state.counters.dealsClosed))
    .replace('{showings}', String(state.counters.showingsRun))
    .replace('{leads}', String(state.leads.length))
}
