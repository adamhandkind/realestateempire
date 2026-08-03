/* v1/v2 -> v3 save migration. The localStorage key never changes
   (`res_save_v1`); only `GameState.version` moves. Every field added in a later
   phase gets a default here, so a player who refreshes mid-game lands in v3
   with their progress intact and nothing to re-earn. */

import { RANKS } from '../data/ranks'
import { PRESET_SLOTS } from '../data/swag'
import { fillPool } from '../logic/portfolio'
import { initialState } from './reducer'
import type { GameState } from './types'

interface AnySave {
  version?: number
  permBonuses?: { hustle?: number; swagger?: number; ego?: number }
  [k: string]: unknown
}

const num = (v: unknown, fallback: number): number =>
  typeof v === 'number' && Number.isFinite(v) ? v : fallback

/** Returns a fully-populated v3 state, or null if `raw` isn't one of ours. */
export function migrate(raw: unknown): GameState | null {
  if (!raw || typeof raw !== 'object') return null
  const s = raw as AnySave
  if (s.version !== 1 && s.version !== 2 && s.version !== 3) return null

  const base = initialState()
  const merged = { ...base, ...s } as GameState
  const gag = s.gagCounters as
    | {
        vrboOffers?: number
        nextVrboWeek?: number
        vrboOwned?: boolean
        vrboDeclinedForever?: boolean
      }
    | undefined
  const crash = s.crash as
    | { weeksLeft?: number; lastCrashWeek?: number }
    | undefined
  const week = num(s.week, base.week)
  const cash = num(s.cash, base.cash)

  const out: GameState = {
    ...merged,
    version: 3,
    permBonuses: {
      hustle: s.permBonuses?.hustle ?? base.permBonuses.hustle,
      swagger: s.permBonuses?.swagger ?? base.permBonuses.swagger,
      ego: s.permBonuses?.ego ?? base.permBonuses.ego,
    },
    reputation: num(s.reputation, base.reputation),
    activeChannelIds: Array.isArray(s.activeChannelIds)
      ? (s.activeChannelIds as string[])
      : base.activeChannelIds,
    outfitPresets: Array.isArray(s.outfitPresets)
      ? Array.from(
          { length: PRESET_SLOTS },
          (_, i) => (s.outfitPresets as GameState['outfitPresets'])[i] ?? null,
        )
      : base.outfitPresets,
    gagCounters: {
      vrboOffers: gag?.vrboOffers ?? base.gagCounters.vrboOffers,
      nextVrboWeek: gag?.nextVrboWeek ?? week + 2,
      vrboOwned: gag?.vrboOwned ?? false,
      vrboDeclinedForever: gag?.vrboDeclinedForever ?? false,
    },
    channelMuteUntil:
      s.channelMuteUntil && typeof s.channelMuteUntil === 'object'
        ? (s.channelMuteUntil as Record<string, number>)
        : base.channelMuteUntil,
    pendingChoice:
      (s.pendingChoice as GameState['pendingChoice'] | undefined) ??
      base.pendingChoice,
    /* transient UI fields never come back from disk */
    summary: null,
    promo: null,
    leads: Array.isArray(s.leads) ? (s.leads as GameState['leads']) : base.leads,
    counters:
      s.counters && typeof s.counters === 'object'
        ? { ...base.counters, ...(s.counters as object) }
        : base.counters,
    rank: RANKS.some((r) => r.id === s.rank)
      ? (s.rank as GameState['rank'])
      : base.rank,
    /* ---- phase 3 ---- */
    properties: Array.isArray(s.properties)
      ? (s.properties as GameState['properties'])
      : [],
    marketPool: Array.isArray(s.marketPool)
      ? (s.marketPool as GameState['marketPool'])
      : [],
    marketState:
      (s.marketState as GameState['marketState'] | undefined) ?? 'normal',
    nextMarketState:
      (s.nextMarketState as GameState['marketState'] | undefined) ?? 'normal',
    crash: {
      weeksLeft: num(crash?.weeksLeft, 0),
      lastCrashWeek: num(crash?.lastCrashWeek, -999),
    },
    milestonesUnlocked: Array.isArray(s.milestonesUnlocked)
      ? (s.milestonesUnlocked as string[])
      : [],
    propCoActive: s.propCoActive === true,
    pendingChoices: Array.isArray(s.pendingChoices)
      ? (s.pendingChoices as GameState['pendingChoices'])
      : [],
    nextPropertyId: num(s.nextPropertyId, 1),
    nextListingId: num(s.nextListingId, 1),
    nextChoiceId: num(s.nextChoiceId, 1),
    peakNetWorth: num(s.peakNetWorth, cash),
    firstP3Week: num(s.firstP3Week, week),
  }

  /* A v1/v2 save arrives with an empty pool; a v3 save keeps the one it had. */
  return fillPool(out)
}
