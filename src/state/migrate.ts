/* v1/v2 -> v8 save migration. The localStorage key never changes
   (`res_save_v1`); only `GameState.version` moves. Every field added in a later
   phase gets a default here, so a player who refreshes mid-game lands in v8
   with their progress intact and nothing to re-earn.

   This is also the ONLY validation boundary for imported saves. The paste box
   accepts arbitrary text from a stranger's clipboard, so nothing that comes
   out of here may be a number the rest of the game can't do arithmetic on, an
   id that resolves to undefined, or a rank that isn't a rank. Anything that
   can be repaired is repaired; anything that can't is dropped; a save that
   isn't ours at all returns null and the current game is left untouched. */

import { DEFAULT_CHARACTER_ID } from '../data/p5'
import { AP_PER_WEEK, RANKS } from '../data/ranks'
import { PRESET_SLOTS } from '../data/swag'
import { fillPool } from '../logic/portfolio'
import { archOrNull } from '../logic/leads'
import { swagOf } from '../logic/economy'
import { randomSeed } from '../logic/rand'
import { withLog } from '../logic/log'
import { districtForType, initialState } from './reducer'
import { gain, initialTerritory, pickLeadDistrict } from '../logic/territory'
import { P6, PLAYER } from '../data/p6'
import { emptySeasonStats } from '../data/awards'
import { MIGRATION_LINE, P7 } from '../data/p7'
import { CONTENT_MIGRATION_LINE } from '../data/postLines'
import { unlockedCrewFor } from '../logic/content'
import type { ActiveModifier, GameState, Slot } from './types'

const TABLE_TIER_IDS: string[] = P7.TABLE_TIERS.map((t) => t.id)

interface AnySave {
  version?: number
  permBonuses?: { hustle?: number; swagger?: number; ego?: number }
  [k: string]: unknown
}

const num = (v: unknown, fallback: number): number =>
  typeof v === 'number' && Number.isFinite(v) ? v : fallback

const clampNum = (v: unknown, lo: number, hi: number, fallback: number): number =>
  Math.max(lo, Math.min(hi, num(v, fallback)))

/** Keeps only the ids that name a real item. A save naming swag that no longer
 *  exists is not a reason to refuse the save — it is a reason to drop the id,
 *  because every read of it downstream would silently resolve to undefined. */
const knownSwagIds = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((id) => typeof id === 'string' && !!swagOf(id)) : []

/** Equipped must be OWNED and in its OWN slot. A hand-edited save that equips
 *  an unowned tier-4 car, or files a jacket under `vehicle`, gets it removed
 *  rather than wearing something the shop never sold it. */
function validEquipped(v: unknown, owned: string[]): Partial<Record<Slot, string>> {
  const out: Partial<Record<Slot, string>> = {}
  if (!v || typeof v !== 'object') return out
  for (const [slot, id] of Object.entries(v as Record<string, unknown>)) {
    if (typeof id !== 'string' || !owned.includes(id)) continue
    const item = swagOf(id)
    if (item && item.slot === slot) out[item.slot] = id
  }
  return out
}

/** Drops leads whose archetype no longer exists, and repairs the numbers on
 *  the ones that survive. A lead with NaN patience never leaves the pipeline. */
function validLeads(v: unknown): GameState['leads'] {
  if (!Array.isArray(v)) return []
  return (v as GameState['leads'])
    .filter((l) => l && typeof l.id === 'string' && !!archOrNull(l.archetypeId))
    .map((l) => ({
      ...l,
      salePrice: Math.max(0, num(l.salePrice, 0)),
      maxPatience: Math.max(1, num(l.maxPatience, 1)),
      patience: clampNum(l.patience, 1, 99, 1),
    }))
}

/** Market modifiers gained an id and a label in v8. A v7 entry has neither, so
 *  it is reconstructed from the only thing it did carry: the sign. */
function validModifiers(v: unknown, week: number): GameState['activeModifiers'] {
  if (!Array.isArray(v)) return []
  const mapped = (v as Partial<ActiveModifier>[])
    .filter((m) => m && Number.isFinite(m.closeChanceDelta))
    .map((m) => {
      const delta = m.closeChanceDelta as number
      const hot = delta >= 0
      return {
        id: (m.id === 'hotMarket' ||
        m.id === 'rateSpike' ||
        m.id === 'viralMoment'
          ? m.id
          : hot
            ? 'hotMarket'
            : 'rateSpike') as ActiveModifier['id'],
        label: typeof m.label === 'string' ? m.label : hot ? 'Hot Market' : 'Rate Spike',
        closeChanceDelta: delta,
        expiresWeek: num(m.expiresWeek, week),
      }
    })
  /* Mutual exclusivity is retroactive for market swings only: a v7 save
     mid-stack keeps the newest hotMarket/rateSpike. viralMoment is a separate
     concern and every entry of it survives the round-trip. */
  const market = mapped
    .filter((m) => m.id === 'hotMarket' || m.id === 'rateSpike')
    .slice(-1)
  const viral = mapped.filter((m) => m.id === 'viralMoment')
  return [...market, ...viral]
}

/** Returns a fully-populated v8 state, or null if `raw` isn't one of ours. */
export function migrate(raw: unknown): GameState | null {
  if (!raw || typeof raw !== 'object') return null
  const s = raw as AnySave
  if (typeof s.version !== 'number' || s.version < 1 || s.version > 9)
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

  /* Ownership is resolved before equipment, because equipment is checked
     against it. */
  const ownedSwagIds = knownSwagIds(s.ownedSwagIds)

  const out: GameState = {
    ...merged,
    version: 9,
    /* --- the scalars. `merged` spread these straight off the file; a hostile
       or hand-edited save could put NaN, Infinity, or a string in any of them
       and the arithmetic downstream would quietly turn the whole game to NaN.
       Every one of them is re-derived here instead. --- */
    week: Math.max(1, Math.round(num(s.week, base.week))),
    cash,
    careerEarnings: Math.max(0, num(s.careerEarnings, 0)),
    /* The ceiling is deliberately loose, not AP_PER_WEEK: characters carry
       their own apPerWeek (Blaine gets 7) and Rookie Energy pays a bonus point
       on top of that. This is here to reject 9999, not to referee the roster. */
    ap: Math.round(clampNum(s.ap, 0, 12, AP_PER_WEEK)),
    gameOver: s.gameOver === true,
    ownedSwagIds,
    equipped: validEquipped(s.equipped, ownedSwagIds),
    activeModifiers: validModifiers(s.activeModifiers, week),
    /* v8. A save from before the seed existed gets a fresh one — its old rolls
       are already spent, and nothing about them was reproducible anyway. */
    rngSeed: Number.isFinite(s.rngSeed as number)
      ? (s.rngSeed as number)
      : randomSeed(),
    sideHustlesThisWeek: Math.max(0, num(s.sideHustlesThisWeek, 0)),
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
    leads: validLeads(s.leads),
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
    /* ---- phase 7 ---- a pre-Goldies save has no season and no hardware.
       Season 1 begins at the week the save is on: no retroactive trophies,
       and the first ceremony is a full thirteen weeks away. */
    season:
      s.season && typeof s.season === 'object'
        ? { ...emptySeasonStats(0), ...(s.season as object) }
        : emptySeasonStats(0),
    seasonStartWeek: num(s.seasonStartWeek, week),
    nominations: Array.isArray(s.nominations) ? (s.nominations as string[]) : null,
    tableTier: TABLE_TIER_IDS.includes(s.tableTier as string)
      ? (s.tableTier as GameState['tableTier'])
      : 'none',
    ceremony: (s.ceremony as GameState['ceremony'] | undefined) ?? null,
    trophies: Array.isArray(s.trophies)
      ? (s.trophies as GameState['trophies'])
      : [],
    awardHistory: Array.isArray(s.awardHistory)
      ? (s.awardHistory as GameState['awardHistory'])
      : [],
    sponsorCringeSeasons: num(s.sponsorCringeSeasons, 0),
    /* ---- phase 8 ---- a pre-call save has never picked up the phone ---- */
    /* Note the `!== false`, not the `=== true` used by propCoActive and
       kingOfBrantford above. Calls are opt-OUT: a save that has never heard of
       them should arrive with them on, so only an explicit false disables. */
    callsEnabled: s.callsEnabled !== false,
    callStats: {
      calls: num(callStats?.calls, 0),
      perfectCalls: num(callStats?.perfectCalls, 0),
      hangups: num(callStats?.hangups, 0),
    },
    /* A call is never restored. See dropInterruptedCall below. */
    call: null,
    /* ---- phase 9 ---- a pre-post save has never touched the composer ---- */
    postEgo: num(s.postEgo, 0),
    pendingLeadBias: Array.isArray(s.pendingLeadBias)
      ? (s.pendingLeadBias as GameState['pendingLeadBias'])
      : [],
    contentHistory: Array.isArray(s.contentHistory)
      ? (s.contentHistory as GameState['contentHistory'])
      : [],
    lastPost: (s.lastPost as GameState['lastPost'] | undefined) ?? null,
    contentStats:
      s.contentStats && typeof s.contentStats === 'object'
        ? {
            posts: num((s.contentStats as { posts?: unknown }).posts, 0),
            viral: num((s.contentStats as { viral?: unknown }).viral, 0),
            embarrassed: num(
              (s.contentStats as { embarrassed?: unknown }).embarrassed,
              0,
            ),
            skipStreak: num(
              (s.contentStats as { skipStreak?: unknown }).skipStreak,
              0,
            ),
          }
        : { posts: 0, viral: 0, embarrassed: 0, skipStreak: 0 },
    contentEnabled: s.contentEnabled !== false,
    unlockedCrew: 'none', // recomputed just below
    postComposerPending: false,
    postComposerWeek: num(s.postComposerWeek, 0),
    debugForcedPostOutcome: null,
  }
  out.unlockedCrew = unlockedCrewFor(out)

  const mapped = fillPool(placeOnTheMap(out, typeof s.territory === 'object'))
  /* A v1/v2 save arrives with an empty pool; a v3-or-later save keeps the one
     it had. A pre-Goldies save is told the Board has noticed it. */
  const withGoldies =
    typeof s.season === 'object'
      ? mapped
      : withLog(mapped, 'event', MIGRATION_LINE)
  /* A pre-Phase-9 save (no contentStats) is told it has decided to post. */
  const withPost =
    typeof s.contentStats === 'object'
      ? withGoldies
      : withLog(withGoldies, 'flavor', CONTENT_MIGRATION_LINE)
  /* A call open at save time never survives — see dropInterruptedCall. */
  return dropInterruptedCall(
    withPost,
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
