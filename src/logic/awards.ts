/* The Golden Lockbox Awards. Scoring, the nominee AI, and the ceremony.

   Pure: nothing here mutates, nothing here logs. The reducer owns both. Every
   roll goes through logic/rand so a seeded run is reproducible.

   Resolution order is law (§6): the eight undercard awards resolve first, and
   Agent of the Year is computed from their results — including how many
   trophies each nominee already picked up tonight. */

import {
  AGENT_OF_THE_YEAR,
  AWARDS,
  UNDERCARD,
  awardOf,
} from '../data/awards'
import { FALLBACK_RIVAL_ROSTER, P7 } from '../data/p7'
import { RIVALS } from '../data/rivals'
import { DISTRICT_IDS } from '../data/districts'
import { rand } from './rand'
import type {
  AwardDef,
  AwardResult,
  GameState,
  SeasonStatKey,
  SeasonStats,
  TableTierId,
  Trophy,
} from '../state/types'

export const PLAYER_NOMINEE = 'player'

/* ------------------------------------------------------------ the roster */

export interface Nominee {
  id: string
  name: string
  color: string
}

/**
 * The three rivals the player is scored against. Territory's roster is the
 * real one; the §10.4 fallback exists so the awards never hard-depend on a map
 * that a given build may not have.
 */
export function rivalRoster(): Nominee[] {
  if (RIVALS && RIVALS.length >= 3)
    return RIVALS.slice(0, 3).map((r) => ({
      id: r.id,
      name: r.name,
      color: r.color,
    }))
  return FALLBACK_RIVAL_ROSTER
}

export const nomineeOf = (id: string): Nominee | undefined =>
  id === PLAYER_NOMINEE
    ? { id, name: 'You', color: '#c9a227' }
    : rivalRoster().find((r) => r.id === id)

/** Display name for a winner line. The player is never interpolated into one. */
export const nomineeName = (id: string): string => nomineeOf(id)?.name ?? id

/* ------------------------------------------------------------ the season */

/** 1-based week within the current season, 1..13. */
export const seasonWeek = (s: GameState): number =>
  s.week - s.seasonStartWeek + 1

/** Weeks until the next ceremony, from the current week. */
export const weeksToCeremony = (s: GameState): number =>
  Math.max(0, P7.SEASON_WEEKS - seasonWeek(s))

/** The one cross-cutting mutation. Every stat site is a one-liner through it. */
export function bumpSeason(
  s: GameState,
  key: SeasonStatKey,
  amount = 1,
): GameState {
  return { ...s, season: { ...s.season, [key]: s.season[key] + amount } }
}

/** `biggestSale` is a max, not a sum — it gets its own one-liner. */
export function recordSale(s: GameState, salePrice: number): GameState {
  return salePrice > s.season.biggestSale
    ? { ...s, season: { ...s.season, biggestSale: salePrice } }
    : s
}

/* ------------------------------------------------------------- trophies */

export const displayedTrophies = (s: GameState): Trophy[] =>
  (s.trophies ?? []).filter((t) => t.displayed)

export const displayedCount = (s: GameState): number =>
  displayedTrophies(s).length

/** True when the display shelf is full. A win past the cap still gets its
 *  trophy — it just arrives undisplayed. */
export const shelfFull = (s: GameState): boolean =>
  displayedCount(s) >= P7.TROPHY_DISPLAY_CAP

/* hasPerk and trophyEgo live in logic/perks.ts — the perk SITES are in modules
   the award data itself depends on, so they cannot import from here. */
export { hasPerk, trophyEgo } from './perks'

/* ------------------------------------------------------------- the table */

export const tierOf = (id: TableTierId): (typeof P7.TABLE_TIERS)[number] =>
  P7.TABLE_TIERS.find((t) => t.id === id) ?? P7.TABLE_TIERS[0]

export const tierIndex = (id: TableTierId): number =>
  P7.TABLE_TIERS.findIndex((t) => t.id === id)

/** What moving from the current tier to `to` costs. Upgrades only. */
export function upgradeCost(from: TableTierId, to: TableTierId): number {
  return Math.max(0, tierOf(to).cost - tierOf(from).cost)
}

export const isUpgrade = (from: TableTierId, to: TableTierId): boolean =>
  tierIndex(to) > tierIndex(from)

/* -------------------------------------------------------------- scoring */

/** ±12% on every final score, player and rival alike. */
const jitter = (n: number): number =>
  n * (1 + (rand() * (P7.SCORE_JITTER * 2) - P7.SCORE_JITTER))

/** §6.1 — one player score: raw, plus the table bonus, jittered, floored at 0. */
export function playerScore(
  s: GameState,
  season: SeasonStats,
  award: AwardDef,
): number {
  const raw = award.score(s, season)
  const withTable = raw + tierOf(s.tableTier ?? 'none').scoreBonus
  return Math.max(0, jitter(withTable))
}

/** The same score with no jitter and no table — what nominations read. */
export function provisionalPlayerScore(
  s: GameState,
  season: SeasonStats,
  award: AwardDef,
): number {
  return Math.max(0, award.score(s, season))
}

/** Total share a rival holds across the city. 0 without Territory. */
function rivalCityShare(s: GameState, rivalId: string): number {
  if (!s.territory) return 0
  return DISTRICT_IDS.reduce(
    (t, id) => t + (s.territory[id]?.shares[rivalId] ?? 0),
    0,
  )
}

/** §6.2 — one rival score for one award. Rivals grow with the season index so
 *  season 10 is still contested. */
export function rivalScore(
  s: GameState,
  seasonIndex: number,
  award: AwardDef,
  rivalId: string,
): number {
  const base =
    P7.RIVAL_BASE +
    rand() * P7.RIVAL_VARIANCE +
    seasonIndex * P7.RIVAL_GROWTH_PER_SEASON
  const affinity = award.rivalAffinity[rivalId] ?? 1
  const territoryMult = 1 + rivalCityShare(s, rivalId) / 200
  return Math.max(0, jitter(base * affinity * territoryMult))
}

/* ---------------------------------------------------------- nominations */

/**
 * §5 — the player is nominated for every award where their pre-jitter score is
 * above zero AND they'd land top-3 against provisional rival scores, plus
 * `topOnePercent`, which everybody is nominated for, always. Minimum one.
 */
export function computeNominations(s: GameState): string[] {
  const out: string[] = []
  for (const award of AWARDS) {
    if (award.id === 'topOnePercent') {
      out.push(award.id)
      continue
    }
    const mine =
      award.id === AGENT_OF_THE_YEAR
        ? provisionalAgentScore(s)
        : provisionalPlayerScore(s, s.season, award)
    if (mine <= 0) continue
    const rivals = rivalRoster().map((r) =>
      rivalScore(s, s.season.seasonIndex, award, r.id),
    )
    const beaten = rivals.filter((r) => r < mine).length
    /* Top-3 of four nominees means beating at least one rival. */
    if (beaten >= 1) out.push(award.id)
  }
  return out.length ? out : ['topOnePercent']
}

/** Agent of the Year has no standalone formula; nominations approximate it
 *  from the mean of the other eight, which is what §4.9 does at ceremony time
 *  minus the trophies nobody has won yet. */
function provisionalAgentScore(s: GameState): number {
  const mean =
    UNDERCARD.reduce((t, a) => t + provisionalPlayerScore(s, s.season, a), 0) /
    UNDERCARD.length
  return mean + (s.reputation ?? 0) / 2
}

/* ------------------------------------------------------------- ceremony */

/** §6.3 — sort descending, then let the upset take it away from the favourite. */
function pickWinner(scores: Record<string, number>): {
  winnerId: string
  upset: boolean
} {
  const ranked = Object.keys(scores).sort((a, b) => scores[b] - scores[a])
  if (ranked.length > 1 && rand() < P7.UPSET_CHANCE)
    return { winnerId: ranked[1], upset: true }
  return { winnerId: ranked[0], upset: false }
}

export interface CeremonyOutcome {
  results: AwardResult[]
  /** awardIds whose winner was the #2 score. Drives the upset line. */
  upsets: string[]
}

/**
 * §6.1–6.4 — the whole night. The eight undercard awards resolve in data
 * order, then Agent of the Year reads their results.
 */
export function runCeremony(s: GameState): CeremonyOutcome {
  const rivals = rivalRoster()
  const seasonIndex = s.season.seasonIndex
  const results: AwardResult[] = []
  const upsets: string[] = []

  for (const award of UNDERCARD) {
    const scores: Record<string, number> = {
      [PLAYER_NOMINEE]: playerScore(s, s.season, award),
    }
    for (const r of rivals)
      scores[r.id] = rivalScore(s, seasonIndex, award, r.id)
    const { winnerId, upset } = pickWinner(scores)
    if (upset) upsets.push(award.id)
    results.push({
      awardId: award.id,
      winnerId,
      playerScore: scores[PLAYER_NOMINEE],
      scores,
    })
  }

  /* §6.4 — the big one, from the mean of the eight plus tonight's hardware. */
  const bigOne = awardOf(AGENT_OF_THE_YEAR)!
  const wonSoFar = (id: string): number =>
    results.filter((r) => r.winnerId === id).length
  const meanFor = (id: string): number =>
    results.reduce((t, r) => t + (r.scores[id] ?? 0), 0) / results.length

  const agentScores: Record<string, number> = {
    [PLAYER_NOMINEE]: Math.max(
      0,
      jitter(
        meanFor(PLAYER_NOMINEE) +
          wonSoFar(PLAYER_NOMINEE) * 10 +
          (s.reputation ?? 0) / 2 +
          tierOf(s.tableTier ?? 'none').scoreBonus,
      ),
    ),
  }
  for (const r of rivals)
    agentScores[r.id] = Math.max(
      0,
      jitter(meanFor(r.id) + wonSoFar(r.id) * 10) *
        (bigOne.rivalAffinity[r.id] ?? 1),
    )

  const big = pickWinner(agentScores)
  if (big.upset) upsets.push(bigOne.id)
  results.push({
    awardId: bigOne.id,
    winnerId: big.winnerId,
    playerScore: agentScores[PLAYER_NOMINEE],
    scores: agentScores,
  })

  return { results, upsets }
}

/** Wins the player took tonight, in ceremony order. */
export const playerWins = (results: AwardResult[]): AwardResult[] =>
  results.filter((r) => r.winnerId === PLAYER_NOMINEE)
