/* v1/v2 -> v6 save migration. The localStorage key never changes
   (`res_save_v1`); only `GameState.version` moves. Every field added in a later
   phase gets a default here, so a player who refreshes mid-game lands in v6
   with their progress intact and nothing to re-earn. */

import { DEFAULT_CHARACTER_ID } from '../data/p5'
import { RANKS } from '../data/ranks'
import { PRESET_SLOTS } from '../data/swag'
import { fillPool } from '../logic/portfolio'
import { withLog } from '../logic/log'
import { districtForType, initialState } from './reducer'
import { gain, initialTerritory, pickLeadDistrict } from '../logic/territory'
import { P6, PLAYER } from '../data/p6'
import type { GameState } from './types'

interface AnySave {
  version?: number
  permBonuses?: { hustle?: number; swagger?: number; ego?: number }
  [k: string]: unknown
}

const num = (v: unknown, fallback: number): number =>
  typeof v === 'number' && Number.isFinite(v) ? v : fallback

/** Returns a fully-populated v6 state, or null if `raw` isn't one of ours. */
export function migrate(raw: unknown): GameState | null {
  if (!raw || typeof raw !== 'object') return null
  const s = raw as AnySave
  if (typeof s.version !== 'number' || s.version < 1 || s.version > 6)
    return null

  const base = initialState()
  const merged = { ...base, ...s } as GameState
  const gag = s.gagCounters as
    | {
        vrboOffers?: number
        nextVrboWeek?: number
        vrboOwned?: boolean
        vrboDeclinedForever?: boolean
        daveReviewLine?: boolean
        chipPromoRanks?: string[]
        blaineDrySpell?: boolean
      }
    | undefined
  const crash = s.crash as
    | { weeksLeft?: number; lastCrashWeek?: number }
    | undefined
  const week = num(s.week, base.week)
  const cash = num(s.cash, base.cash)

  const rivalEffects = s.rivalEffects as
    | {
        undercutWeeksLeft?: number
        lastDefense?: Record<string, number>
        lastLock?: Record<string, number>
      }
    | undefined

  const callStats = s.callStats as
    | { calls?: number; perfectCalls?: number; hangups?: number }
    | undefined

  const out: GameState = {
    ...merged,
    version: 6,
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
      daveReviewLine: gag?.daveReviewLine ?? false,
      chipPromoRanks: Array.isArray(gag?.chipPromoRanks)
        ? gag.chipPromoRanks
        : [],
      blaineDrySpell: gag?.blaineDrySpell ?? false,
    },
    /* ---- phase 5a ---- a save from before the roster played as 'you' ---- */
    characterId:
      typeof s.characterId === 'string'
        ? s.characterId
        : DEFAULT_CHARACTER_ID,
    statModifiers: Array.isArray(s.statModifiers)
      ? (s.statModifiers as GameState['statModifiers'])
      : [],
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
    /* ---- phase 6 ---- a pre-map save has never heard of a district ---- */
    territory:
      s.territory && typeof s.territory === 'object'
        ? (s.territory as GameState['territory'])
        : initialTerritory(),
    rivalEffects: {
      undercutWeeksLeft: num(rivalEffects?.undercutWeeksLeft, 0),
      lastDefense: rivalEffects?.lastDefense ?? {},
      lastLock: rivalEffects?.lastLock ?? {},
    },
    chadwickIntel:
      (s.chadwickIntel as GameState['chadwickIntel'] | undefined) ?? null,
    kingOfBrantford: s.kingOfBrantford === true,
    channelTargets:
      s.channelTargets && typeof s.channelTargets === 'object'
        ? (s.channelTargets as Record<string, string>)
        : {},
    weekDealDistricts: [],
    weekFarmedDistricts: [],
    /* ---- phase 8 ---- a pre-call save has never picked up the phone ---- */
    callsEnabled: s.callsEnabled !== false,
    callStats: {
      calls: num(callStats?.calls, 0),
      perfectCalls: num(callStats?.perfectCalls, 0),
      hangups: num(callStats?.hangups, 0),
    },
    /* A call is never restored. See dropInterruptedCall below. */
    call: null,
  }

  /* A v1/v2 save arrives with an empty pool; a v3 save keeps the one it had. */
  return dropInterruptedCall(
    fillPool(placeOnTheMap(out, typeof s.territory === 'object')),
    s.call as { leadId?: string } | null | undefined,
  )
}

/**
 * Gives every pre-Phase-6 entity a district, then pays the career its
 * retroactive credit: +1.0 where you already own a door, and the deals you have
 * already closed spread across the districts a career plausibly started in.
 * Skipped entirely for a save that already has territory.
 */
function placeOnTheMap(s: GameState, alreadyMapped: boolean): GameState {
  let out: GameState = {
    ...s,
    properties: s.properties.map((p) =>
      p.districtId
        ? p
        : { ...p, districtId: p.isVrbo ? 'downtown' : districtForType(p.typeId) },
    ),
    marketPool: s.marketPool.map((l) =>
      l.districtId ? l : { ...l, districtId: districtForType(l.typeId) },
    ),
  }
  /* Leads roll for a district the same way a new lead would. */
  out = {
    ...out,
    leads: out.leads.map((l) =>
      l.districtId ? l : { ...l, districtId: pickLeadDistrict(out, l.archetypeId) },
    ),
  }
  if (alreadyMapped) return out

  for (const p of out.properties)
    out = gain(out, p.districtId, PLAYER, P6.GAIN_PROPERTY_BUY)

  /* Deals have no stored district, so the credit lands where an early career
     plausibly happened, capped so a long save doesn't wake up as King. */
  const credit = Math.min(out.counters.dealsClosed * P6.GAIN_DEAL, 24)
  const early = ['northEnd', 'westBrant', 'downtown']
  for (const id of early) out = gain(out, id, PLAYER, credit / early.length)
  return out
}

/**
 * A save written mid-call is a crashed call. The call is discarded rather than
 * resumed: the lead keeps its state as of before the call, minus the AP already
 * spent. AP is never refunded and never double-charged, because ATTEMPT_CLOSE
 * spends it once before the call opens and the call itself never touches it.
 */
function dropInterruptedCall(
  s: GameState,
  saved: { leadId?: string } | null | undefined,
): GameState {
  if (!saved || typeof saved.leadId !== 'string') return s
  const lead = s.leads.find((l) => l.id === saved.leadId)
  return withLog(
    { ...s, call: null },
    'flavor',
    'The line dropped. ' +
      (lead ? lead.clientName : 'Someone') +
      ' is still in your pipeline, mercifully.',
  )
}
