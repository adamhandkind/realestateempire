import {
  BRAG_TEMPLATES,
  CRASH_BRAGS,
  LANDLORD_BRAGS,
  VRBO_BRAGS,
} from '../data/brags'
import {
  AP_PER_WEEK,
  COMMISSION_RATE,
  DESK_FEE,
  LOCKED_RANKS,
  LOSE_AT,
  RANKS,
  START_CASH,
} from '../data/ranks'
import { REP_MAX, REP_MIN, REP_THRESHOLDS } from '../data/reputation'
import { PRESET_SLOTS, SLOTS, SWAG } from '../data/swag'
import type {
  GameState,
  RankDef,
  RankId,
  RepThreshold,
  Stats,
  SwagItem,
} from '../state/types'
import {
  STAT_FLOOR,
  egoCapFor,
  getChar,
  statModifierDelta,
} from './characters'
import { P5 } from '../data/p5'
import { money, weightedPick } from './rand'

export {
  AP_PER_WEEK,
  COMMISSION_RATE,
  DESK_FEE,
  LOCKED_RANKS,
  LOSE_AT,
  PRESET_SLOTS,
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

export const clampRep = (n: number): number =>
  Math.max(REP_MIN, Math.min(REP_MAX, Math.round(n)))

/** True once reputation has reached `at`. Every rep gate goes through this. */
export const repUnlocked = (reputation: number, at: number): boolean =>
  reputation >= at

/** Thresholds strictly above `from` and at-or-below `to`. Empty when rep fell. */
export function crossedThresholds(from: number, to: number): RepThreshold[] {
  if (to <= from) return []
  return REP_THRESHOLDS.filter((t) => t.rep > from && t.rep <= to)
}

/** Seller's Agent sitting on six figures — the Phase 2 teaser. */
export const isPhase2Teaser = (state: GameState): boolean =>
  atLeastRank(state.rank, 'sellerAgent') && state.cash >= 100000

/** Base 1/1/0, plus every equipped item, plus permanent event bonuses, plus
 *  live stat modifiers, plus the character's own permanent statMods. The
 *  character's ego cap, when it has one, is applied on top of the global cap. */
export function deriveStats(state: GameState): Stats {
  const char = getChar(state)
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
  ego += state.permBonuses.ego
  hustle += statModifierDelta(state, 'hustle')
  swagger += statModifierDelta(state, 'swagger')
  ego += statModifierDelta(state, 'ego')
  hustle += char.statMods.hustle
  swagger += char.statMods.swagger
  ego += char.statMods.ego
  return {
    hustle: Math.max(STAT_FLOOR, Math.min(10, hustle)),
    swagger: Math.max(STAT_FLOOR, Math.min(10, swagger)),
    ego: Math.max(0, Math.min(egoCapFor(state, 15), ego)),
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

/** The earnings bar for a rank, after the character's promotion multiplier.
 *  Showings and deals requirements are never multiplied. */
export const reqEarningsFor = (state: GameState, rank: RankDef): number =>
  Math.round(rank.req.earnings * getChar(state).promotionEarningsMult)

/** True when every requirement EXCEPT the multiplied earnings bar is met —
 *  i.e. the character's own multiplier is the only thing in the way. */
export function gatedOnMultipliedEarnings(state: GameState): RankDef | null {
  const nxt = RANKS[rankIndex(state.rank) + 1]
  if (!nxt) return null
  const r = nxt.req
  const others =
    state.counters.showingsRun >= r.showings &&
    state.counters.dealsClosed >= r.deals &&
    state.reputation >= (r.rep ?? 0)
  const meetsBase = state.careerEarnings >= r.earnings
  const meetsMultiplied = state.careerEarnings >= reqEarningsFor(state, nxt)
  return others && meetsBase && !meetsMultiplied ? nxt : null
}

/** Both thresholds must be met; checked at end of week. */
export function nextRank(state: GameState): RankDef | null {
  const i = rankIndex(state.rank)
  const nxt = RANKS[i + 1]
  if (!nxt) return null
  const r = nxt.req
  const ok =
    state.careerEarnings >= reqEarningsFor(state, nxt) &&
    state.counters.showingsRun >= r.showings &&
    state.counters.dealsClosed >= r.deals &&
    state.reputation >= (r.rep ?? 0)
  return ok ? nxt : null
}

export function bragFor(state: GameState): string {
  const pool = BRAG_TEMPLATES[state.rank].map((text) => ({ text, weight: 1 }))
  const situational = (lines: string[]) =>
    lines.forEach((text) => pool.push({ text, weight: 1 }))
  if (state.properties.length > 0) situational(LANDLORD_BRAGS)
  if (state.milestonesUnlocked.includes('theMachine')) situational(VRBO_BRAGS)
  if (state.crash.weeksLeft > 0) situational(CRASH_BRAGS)
  /* Character brags join the rotation at every rank, at double weight. */
  getChar(state).brags.forEach((text) =>
    pool.push({ text, weight: P5.BRAG_CHAR_WEIGHT }),
  )
  const t = (weightedPick(pool, (b) => b.weight) ?? pool[0]).text
  return t
    .replace('{week}', String(state.week))
    .replace('{cash}', money(state.cash))
    .replace('{earnings}', money(state.careerEarnings))
    .replace('{deals}', String(state.counters.dealsClosed))
    .replace('{showings}', String(state.counters.showingsRun))
    .replace('{leads}', String(state.leads.length))
    .replace('{properties}', String(state.properties.length))
}
