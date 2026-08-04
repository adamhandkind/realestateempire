/* Phase 7 acceptance criteria (spec §12). These pin the awards system end to
   end: if one fails, the fix is in the implementation, never here. */

import { beforeEach, describe, expect, it } from 'vitest'
import {
  AGENT_OF_THE_YEAR,
  AWARDS,
  UNDERCARD,
  awardOf,
  emptySeasonStats,
} from '../../data/awards'
import { P7 } from '../../data/p7'
import { PERK_AWARD, hasPerk, trophyEgo } from '../perks'
import {
  computeNominations,
  displayedCount,
  normalize,
  playerScore,
  provisionalPlayerScore,
  playerWins,
  rivalRoster,
  rivalScore,
  runCeremony,
  seasonWeek,
  shelfFull,
  tierOf,
  upgradeCost,
  PLAYER_NOMINEE,
} from '../awards'
import { deriveStats } from '../economy'
import { closeChance } from '../leads'
import { channelCost, channelOf } from '../marketing'
import { badReviewWeight } from '../events'
import { applicantBonusFor } from '../portfolio'
import { setSeed } from '../rand'
import { initialState, reducer } from '../../state/reducer'
import type { GameState, Lead, Property, TableTierId } from '../../state/types'

beforeEach(() => setSeed(null))

/** A player parked at the end of a season, with room to act. */
const atSeasonWeek = (week: number, over: Partial<GameState> = {}): GameState => {
  const base = initialState()
  return {
    ...base,
    rank: 'topProducer',
    cash: 200000,
    week,
    seasonStartWeek: 1,
    ...over,
  }
}

const withTrophy = (
  s: GameState,
  awardId: string,
  displayed = true,
): GameState => ({
  ...s,
  trophies: [...s.trophies, { awardId, seasonIndex: 0, displayed }],
})

const leadAt = (salePrice: number): Lead => ({
  id: 'L1',
  archetypeId: 'firstTimer',
  clientName: 'Test Client',
  stage: 'ready',
  salePrice,
  patience: 3,
  maxPatience: 3,
  retriedClose: false,
  createdWeek: 1,
  intro: '…',
  districtId: 'northEnd',
  referralBonus: false,
})

/* --------------------------------------------------------------- §12.2 */

describe('the season clock', () => {
  it('is 1-based and correct across multiple seasons', () => {
    expect(seasonWeek(atSeasonWeek(1))).toBe(1)
    expect(seasonWeek(atSeasonWeek(13))).toBe(13)
    /* Season 2 starts at week 14 and its own week 1 is the game's week 14. */
    const s2 = atSeasonWeek(14, { seasonStartWeek: 14 })
    expect(seasonWeek(s2)).toBe(1)
    expect(seasonWeek({ ...s2, week: 26 })).toBe(13)
  })

  it('rolls the ledger to zero and advances the index at the ceremony', () => {
    setSeed(5)
    let s = atSeasonWeek(13, {
      nominations: ['topOnePercent'],
      season: { ...emptySeasonStats(0), dealsClosed: 9, showingsRun: 20 },
    })
    s = reducer(s, { type: 'END_WEEK' })
    expect(s.season.seasonIndex).toBe(1)
    expect(s.season.dealsClosed).toBe(0)
    expect(s.season.showingsRun).toBe(0)
    expect(s.seasonStartWeek).toBe(14)
    expect(seasonWeek(s)).toBe(1)
  })

  it('increments the ledger at its action sites', () => {
    const s = atSeasonWeek(3, { rank: 'receptionist' })
    expect(reducer(s, { type: 'ASSIST_SHOWING' }).season.showingsRun).toBe(1)
    const bought = reducer(
      { ...s, rank: 'topProducer' },
      { type: 'BUY_SWAG', itemId: 'discountSuit' },
    )
    expect(bought.season.swagSpend).toBeGreaterThan(0)
  })
})

/* --------------------------------------------------------------- §12.3 */

describe('nominations', () => {
  it('fires at season week 12 and always includes topOnePercent', () => {
    setSeed(3)
    const s = reducer(atSeasonWeek(12), { type: 'END_WEEK' })
    expect(s.nominations).not.toBeNull()
    expect(s.nominations).toContain('topOnePercent')
    expect(s.log.some((l) => l.text.includes('nominations'))).toBe(true)
  })

  it('never nominates for nothing — the minimum-one rule holds', () => {
    setSeed(9)
    /* A career with a completely empty season still gets the joke award. */
    const s = atSeasonWeek(12, { week: 400, reputation: 0 })
    expect(computeNominations(s).length).toBeGreaterThanOrEqual(1)
    expect(computeNominations(s)).toContain('topOnePercent')
  })

  it('does not fire outside week 12', () => {
    setSeed(3)
    expect(reducer(atSeasonWeek(11), { type: 'END_WEEK' }).nominations).toBeNull()
  })
})

/* --------------------------------------------------------------- §12.4 */

describe('the table', () => {
  const nominated = (over: Partial<GameState> = {}): GameState =>
    atSeasonWeek(12, { nominations: ['topOnePercent'], ...over })

  it('charges the tier and refuses outside the window', () => {
    const bought = reducer(nominated(), { type: 'BUY_TABLE', tierId: 'table' })
    expect(bought.tableTier).toBe('table')
    expect(bought.cash).toBe(200000 - 2500)
    /* Season week 5 is not the window. */
    const early = reducer(
      atSeasonWeek(5, { nominations: ['topOnePercent'] }),
      { type: 'BUY_TABLE', tierId: 'table' },
    )
    expect(early.tableTier).toBe('none')
  })

  it('prices an upgrade as the difference and refuses a downgrade', () => {
    expect(upgradeCost('seat', 'sponsor')).toBe(10000 - 500)
    let s = reducer(nominated(), { type: 'BUY_TABLE', tierId: 'seat' })
    s = reducer(s, { type: 'BUY_TABLE', tierId: 'table' })
    expect(s.tableTier).toBe('table')
    expect(s.cash).toBe(200000 - 2500)
    const down = reducer(s, { type: 'BUY_TABLE', tierId: 'seat' })
    expect(down.tableTier).toBe('table')
    expect(down.cash).toBe(s.cash)
    expect(down.log[0].text).toContain('never done refunds')
  })

  it('adds its scoreBonus to every player score', () => {
    const season = { ...emptySeasonStats(0), dealsClosed: 4 }
    const award = awardOf('topProducer')!
    setSeed(1)
    const none = playerScore(atSeasonWeek(13, { season }), season, award)
    setSeed(1)
    const sponsor = playerScore(
      atSeasonWeek(13, { season, tableTier: 'sponsor' }),
      season,
      award,
    )
    /* Same seed, same jitter — the whole gap is the table. */
    expect(sponsor).toBeGreaterThan(none)
  })

  it('pays repGain once and sets the sponsor penalty for exactly one season', () => {
    const night = (tier: TableTierId): GameState => {
      setSeed(11)
      return reducer(
        atSeasonWeek(13, {
          nominations: ['topOnePercent'],
          tableTier: tier,
          reputation: 40,
        }),
        { type: 'END_WEEK' },
      )
    }
    /* Same seed either way, so the whole gap is the tier's repGain. */
    const control = night('none')
    let s = night('sponsor')
    expect(s.reputation - control.reputation).toBe(tierOf('sponsor').repGain)
    expect(s.sponsorCringeSeasons).toBe(1)
    expect(s.tableTier).toBe('none')

    /* One more ceremony with no sponsorship clears it. */
    s = { ...s, week: s.seasonStartWeek + 12, nominations: ['topOnePercent'] }
    s = reducer(s, { type: 'END_WEEK' })
    expect(s.sponsorCringeSeasons).toBe(0)
  })
})

/* --------------------------------------------------------------- §12.5 */

describe('scoring', () => {
  it('ships all nine categories with unique ids and perks', () => {
    expect(AWARDS).toHaveLength(9)
    expect(new Set(AWARDS.map((a) => a.id)).size).toBe(9)
    expect(new Set(AWARDS.map((a) => a.perk.id)).size).toBe(9)
    expect(UNDERCARD).toHaveLength(8)
  })

  it('never returns a negative score, however bad the season was', () => {
    const grim = {
      ...emptySeasonStats(0),
      tenantsEvicted: 40,
      leadsLost: 30,
    }
    const s = atSeasonWeek(13, { week: 900, season: grim })
    for (const a of UNDERCARD)
      expect(playerScore(s, grim, a)).toBeGreaterThanOrEqual(0)
  })

  it('resolves Agent of the Year last, from the other eight plus tonight’s wins', () => {
    setSeed(4)
    const { results } = runCeremony(atSeasonWeek(13))
    expect(results).toHaveLength(9)
    expect(results[results.length - 1].awardId).toBe(AGENT_OF_THE_YEAR)
    /* Its score is derived, so it always lands in the same order of magnitude
       as the undercard mean rather than being an independent roll. */
    const mean =
      results
        .slice(0, 8)
        .reduce((t, r) => t + r.scores[PLAYER_NOMINEE], 0) / 8
    const big = results[8].scores[PLAYER_NOMINEE]
    expect(big).toBeGreaterThan(mean * 0.5)
  })

  it('gives every category exactly four nominees', () => {
    setSeed(6)
    const { results } = runCeremony(atSeasonWeek(13))
    for (const r of results)
      expect(Object.keys(r.scores)).toHaveLength(P7.NOMINEES_PER_CATEGORY)
  })
})

/* --------------------------------------------- §6 normalization + §13 */

describe('normalization puts all nine categories on one scale', () => {
  it('gives every award a positive reference', () => {
    for (const a of AWARDS) expect(a.reference).toBeGreaterThan(0)
  })

  it('maps a reference-sized raw score to 100', () => {
    for (const a of AWARDS) expect(normalize(a.reference, a)).toBeCloseTo(100, 6)
    expect(normalize(0, AWARDS[0])).toBe(0)
    /* Never negative, however grim the inputs. */
    expect(normalize(-500, AWARDS[0])).toBe(0)
  })

  it('lands every category within one order of magnitude of the rival base', () => {
    /* This is the whole point of normalizing: a single flat RIVAL_BASE has to
       be a meaningful bar in all nine categories at once. */
    const season = {
      ...emptySeasonStats(0),
      dealsClosed: 6,
      commissionEarned: 30000,
      showingsRun: 18,
      closeAttempts: 9,
      swagSpend: 3000,
      biggestSale: 380000,
    }
    const s = atSeasonWeek(13, { season, reputation: 12 })
    for (const a of UNDERCARD) {
      const score = provisionalPlayerScore(s, season, a)
      expect(score, a.id).toBeLessThan(P7.RIVAL_BASE * 10)
    }
  })
})

describe('§13 pacing intent', () => {
  /** Average player wins and sweep rate over many simulated nights. */
  const simulate = (
    seed: number,
    over: Partial<GameState>,
    runs = 300,
  ): { avg: number; sweeps: number; onePct: number } => {
    setSeed(seed)
    let total = 0
    let sweeps = 0
    let onePct = 0
    for (let i = 0; i < runs; i++) {
      const { results } = runCeremony(atSeasonWeek(13, over))
      const wins = playerWins(results).length
      total += wins
      if (wins >= 5) sweeps++
      if (
        results.find((r) => r.awardId === 'topOnePercent')!.winnerId ===
        PLAYER_NOMINEE
      )
        onePct++
    }
    setSeed(null)
    return { avg: total / runs, sweeps: sweeps / runs, onePct: onePct / runs }
  }

  const MODEST_S1 = {
    season: {
      ...emptySeasonStats(0),
      dealsClosed: 6,
      commissionEarned: 30000,
      showingsRun: 18,
      closeAttempts: 9,
      swagSpend: 3000,
      biggestSale: 380000,
    },
    reputation: 12,
  }

  const SOLID_S4 = {
    week: 52,
    season: {
      ...emptySeasonStats(3),
      dealsClosed: 14,
      commissionEarned: 120000,
      showingsRun: 40,
      closeAttempts: 20,
      swagSpend: 20000,
      marketingSpend: 12000,
      repGained: 25,
      biggestSale: 700000,
      tenantIssuesFixed: 6,
      renovationsCompleted: 2,
      districtsFarmed: 8,
    },
    reputation: 55,
    tableTier: 'table' as const,
  }

  it('wins a first-timer 1–3 Goldies, with topOnePercent nearly guaranteed', () => {
    const r = simulate(101, MODEST_S1)
    expect(r.avg).toBeGreaterThanOrEqual(1)
    expect(r.avg).toBeLessThanOrEqual(3)
    expect(r.onePct).toBeGreaterThan(0.8)
    expect(r.sweeps).toBeLessThan(0.02)
  })

  it('wins 3–5 by season 4 with a table, and still rarely sweeps', () => {
    const r = simulate(101, SOLID_S4)
    expect(r.avg).toBeGreaterThanOrEqual(3)
    expect(r.avg).toBeLessThanOrEqual(5)
    expect(r.sweeps).toBeLessThan(0.15)
  })

  it('still lets a genuinely dominant season sweep', () => {
    const r = simulate(101, {
      week: 52,
      season: {
        ...emptySeasonStats(3),
        dealsClosed: 40,
        commissionEarned: 400000,
        showingsRun: 90,
        closeAttempts: 55,
        swagSpend: 60000,
        marketingSpend: 40000,
        repGained: 60,
        biggestSale: 1200000,
        tenantIssuesFixed: 20,
        renovationsCompleted: 8,
        districtsFarmed: 25,
      },
      reputation: 95,
      tableTier: 'sponsor',
    })
    expect(r.sweeps).toBeGreaterThan(0.7)
  })
})

/* --------------------------------------------------------------- §12.6 */

describe('rivals scale', () => {
  it('scores meaningfully higher in season 10 than in season 1', () => {
    const award = awardOf('topProducer')!
    const s = atSeasonWeek(13)
    const avg = (seasonIndex: number): number => {
      setSeed(42)
      let t = 0
      for (let i = 0; i < 400; i++)
        t += rivalScore(s, seasonIndex, award, 'chadwick')
      return t / 400
    }
    const early = avg(0)
    const late = avg(9)
    expect(late).toBeGreaterThan(early)
    /* Nine seasons of growth at 6/season on a ~40-65 base is a real jump. */
    expect(late - early).toBeGreaterThan(9 * P7.RIVAL_GROWTH_PER_SEASON * 0.7)
  })

  it('keeps a late season contested — an idle player does not sweep', () => {
    setSeed(17)
    /* Season 10, nothing done all season. */
    const idle = atSeasonWeek(13, {
      week: 130,
      season: emptySeasonStats(9),
      reputation: 0,
    })
    let sweeps = 0
    for (let i = 0; i < 60; i++)
      if (playerWins(runCeremony(idle).results).length >= 5) sweeps++
    expect(sweeps).toBe(0)
  })
})

/* --------------------------------------------------------------- §12.7 */

describe('upsets', () => {
  it('fires near 10% and lets a nominee that is not top-scored win', () => {
    setSeed(23)
    let upsetCount = 0
    let total = 0
    for (let i = 0; i < 300; i++) {
      const { results, upsets } = runCeremony(atSeasonWeek(13))
      upsetCount += upsets.length
      total += results.length
    }
    const rate = upsetCount / total
    expect(rate).toBeGreaterThan(0.05)
    expect(rate).toBeLessThan(0.16)
  })

  it('logs its line when one happens', () => {
    setSeed(2)
    let s = atSeasonWeek(13, { nominations: ['topOnePercent'] })
    let found = false
    for (let i = 0; i < 30 && !found; i++) {
      const out = reducer({ ...s, week: 13, seasonStartWeek: 1 }, { type: 'END_WEEK' })
      found = out.log.some((l) => l.text.includes('the favourite lost'))
      s = out
    }
    expect(found).toBe(true)
  })
})

/* --------------------------------------------------------------- §12.8 */

describe('trophies and their perks', () => {
  it('enforces the display cap of six', () => {
    let s = atSeasonWeek(5)
    for (const a of AWARDS)
      s = reducer(s, { type: 'DEBUG_GRANT_TROPHY', awardId: a.id })
    expect(s.trophies).toHaveLength(9)
    expect(displayedCount(s)).toBe(P7.TROPHY_DISPLAY_CAP)
    expect(shelfFull(s)).toBe(true)

    /* A seventh cannot be raised until something comes down. */
    const hidden = s.trophies.find((t) => !t.displayed)!
    const blocked = reducer(s, {
      type: 'TOGGLE_TROPHY',
      awardId: hidden.awardId,
      seasonIndex: hidden.seasonIndex,
    })
    expect(displayedCount(blocked)).toBe(P7.TROPHY_DISPLAY_CAP)

    const shown = s.trophies.find((t) => t.displayed)!
    let freed = reducer(s, {
      type: 'TOGGLE_TROPHY',
      awardId: shown.awardId,
      seasonIndex: shown.seasonIndex,
    })
    expect(displayedCount(freed)).toBe(5)
    freed = reducer(freed, {
      type: 'TOGGLE_TROPHY',
      awardId: hidden.awardId,
      seasonIndex: hidden.seasonIndex,
    })
    expect(displayedCount(freed)).toBe(6)
  })

  it('maps every perk to a real award and only to a displayed trophy', () => {
    for (const [perkId, awardId] of Object.entries(PERK_AWARD)) {
      const award = awardOf(awardId)
      expect(award, perkId).toBeDefined()
      expect(award!.perk.id).toBe(perkId)
    }
    /* And the map is complete: nine perks, nine awards. */
    expect(Object.keys(PERK_AWARD)).toHaveLength(AWARDS.length)

    const s = atSeasonWeek(5)
    expect(hasPerk(withTrophy(s, 'topProducer'), 'topProducerAura')).toBe(true)
    expect(hasPerk(withTrophy(s, 'topProducer', false), 'topProducerAura')).toBe(
      false,
    )
  })

  it('wires the three close-chance perks at their sites', () => {
    const s = atSeasonWeek(5)
    const cheap = leadAt(300000)
    const lux = leadAt(600000)
    /* Every displayed trophy also adds Ego, and Ego moves close chance through
       the archetype's egoAffinity. The control therefore carries a trophy too —
       the purely decorative one — so the gap is the close perk alone. */
    const control = withTrophy(s, 'topOnePercent')

    expect(
      closeChance(withTrophy(s, 'topProducer'), cheap) -
        closeChance(control, cheap),
    ).toBeCloseTo(0.03, 5)
    expect(
      closeChance(withTrophy(s, AGENT_OF_THE_YEAR), cheap) -
        closeChance(control, cheap),
    ).toBeCloseTo(0.05, 5)
    /* Luxury only pays above $450,000. */
    const luxS = withTrophy(s, 'luxuryPortfolio')
    expect(closeChance(luxS, lux) - closeChance(control, lux)).toBeCloseTo(
      0.06,
      5,
    )
    expect(closeChance(luxS, cheap) - closeChance(control, cheap)).toBeCloseTo(
      0,
      5,
    )
  })

  it('wires hustle, ego, signage, good-neighbour, and rookie AP', () => {
    const s = atSeasonWeek(5)
    expect(
      deriveStats(withTrophy(s, 'hustleAward')).hustle -
        deriveStats(s).hustle,
    ).toBe(1)

    /* One Ego per displayed trophy, undisplayed contributing nothing. */
    expect(trophyEgo(withTrophy(s, 'topOnePercent'))).toBe(P7.TROPHY_EGO)
    expect(trophyEgo(withTrophy(s, 'topOnePercent', false))).toBe(0)
    expect(
      deriveStats(withTrophy(s, 'topOnePercent')).ego - deriveStats(s).ego,
    ).toBe(P7.TROPHY_EGO)

    const channel = channelOf('benchDomination')!
    expect(channelCost(withTrophy(s, 'mostImprovedSignage'), channel)).toBe(
      Math.round(channelCost(s, channel) * 0.95),
    )

    const good = withTrophy(s, 'communityService')
    expect(badReviewWeight(good)).toBe(badReviewWeight(s) * 0.5)
    const prop = { districtId: 'northEnd' } as Property
    expect(applicantBonusFor(good, prop) - applicantBonusFor(s, prop)).toBeCloseTo(
      0.05,
      5,
    )

    /* Rookie Energy pays out on weeks divisible by four and no others. */
    setSeed(31)
    const rookie = withTrophy(atSeasonWeek(3), 'rookieOfTheYear')
    const w4 = reducer(rookie, { type: 'END_WEEK' })
    expect(w4.week).toBe(4)
    expect(w4.ap).toBe(6)
    const w5 = reducer({ ...rookie, week: 4 }, { type: 'END_WEEK' })
    expect(w5.week).toBe(5)
    expect(w5.ap).toBe(5)
  })
})

/* --------------------------------------------------------------- §12.9 */

describe('sweep and shutout', () => {
  it('pays the sweep bonus once when five or more land', () => {
    setSeed(8)
    /* A monstrous season: enough to win most of the room. */
    const monster = {
      ...emptySeasonStats(0),
      dealsClosed: 200,
      commissionEarned: 4000000,
      showingsRun: 300,
      closeAttempts: 300,
      swagSpend: 200000,
      marketingSpend: 200000,
      biggestSale: 4000000,
      tenantIssuesFixed: 200,
      renovationsCompleted: 100,
      repGained: 100,
      districtsFarmed: 100,
    }
    const s = reducer(
      atSeasonWeek(13, {
        season: monster,
        reputation: 100,
        nominations: ['topOnePercent'],
        tableTier: 'sponsor',
      }),
      { type: 'END_WEEK' },
    )
    const wins = playerWins(s.ceremony!.results).length
    expect(wins).toBeGreaterThanOrEqual(5)
    const sweepLines = s.log.filter((l) => l.text.includes('You swept'))
    expect(sweepLines).toHaveLength(1)
  })

  it('pays spite when nominated three or more and winning none', () => {
    setSeed(13)
    /* Late season, empty ledger, but nominated wide by hand. */
    const noms = AWARDS.slice(0, 4).map((a) => a.id)
    const s = reducer(
      atSeasonWeek(13, {
        week: 200,
        season: emptySeasonStats(12),
        nominations: noms,
      }),
      { type: 'END_WEEK' },
    )
    expect(playerWins(s.ceremony!.results)).toHaveLength(0)
    /* Random events can also hand out permanent Hustle, so the acceptance
       criterion is that the shutout fires exactly once and pays at least its
       point — not that nothing else touched the stat this week. */
    expect(s.permBonuses.hustle).toBeGreaterThanOrEqual(P7.SHUTOUT_HUSTLE)
    expect(s.log.filter((l) => l.text.includes('Spite is'))).toHaveLength(1)
  })
})

/* -------------------------------------------------------------- §12.10 */

describe('the ceremony state machine', () => {
  const opened = (): GameState => {
    setSeed(19)
    return reducer(
      atSeasonWeek(13, { nominations: ['topOnePercent'] }),
      { type: 'END_WEEK' },
    )
  }

  it('opens with a ceremony to page through and clears cleanly', () => {
    let s = opened()
    expect(s.ceremony).not.toBeNull()
    expect(s.ceremony!.revealIndex).toBe(0)
    for (let i = 0; i < 9; i++) s = reducer(s, { type: 'ADVANCE_CEREMONY' })
    expect(s.ceremony!.revealIndex).toBe(9)
    /* Advancing past the end is a no-op, not an overflow. */
    s = reducer(s, { type: 'ADVANCE_CEREMONY' })
    expect(s.ceremony!.revealIndex).toBe(9)

    s = reducer(s, { type: 'CLOSE_CEREMONY' })
    expect(s.ceremony).toBeNull()
    expect(s.log[0].text).toContain('Goldies is over')
  })

  it('records the night in awardHistory', () => {
    const s = opened()
    expect(s.awardHistory).toHaveLength(1)
    expect(s.awardHistory[0].results).toHaveLength(9)
    expect(s.awardHistory[0].seasonIndex).toBe(0)
  })

  it('only takes a speech after a win, and exactly once', () => {
    let s = opened()
    const won = playerWins(s.ceremony!.results).length > 0
    const before = s.reputation
    s = reducer(s, { type: 'GIVE_SPEECH', key: 'humble' })
    if (won) {
      expect(s.ceremony!.speechGiven).toBe(true)
      expect(s.reputation).toBe(before + 2)
      /* A second speech is refused. */
      const again = reducer(s, { type: 'GIVE_SPEECH', key: 'fullEgo' })
      expect(again.reputation).toBe(s.reputation)
    } else {
      expect(s.ceremony!.speechGiven).toBe(false)
      expect(s.reputation).toBe(before)
    }
  })

  it('buys a season of cringe for a Full Ego speech', () => {
    let s = opened()
    if (playerWins(s.ceremony!.results).length === 0) return
    s = reducer(s, { type: 'GIVE_SPEECH', key: 'fullEgo' })
    expect(s.sponsorCringeSeasons).toBe(1)
    expect(s.permBonuses.ego).toBe(2)
  })

  it('skips the ceremony entirely when the career ends the same week', () => {
    setSeed(7)
    const broke = reducer(
      atSeasonWeek(13, { cash: -60000, nominations: ['topOnePercent'] }),
      { type: 'END_WEEK' },
    )
    expect(broke.ceremony).toBeNull()
    expect(broke.log.some((l) => l.text.includes('without you'))).toBe(true)
    /* The season still rolls — no ceremony does not mean no next season. */
    expect(broke.season.seasonIndex).toBe(1)
  })
})

/* -------------------------------------------------------------- §12.11 */

describe('optional-dependency guards', () => {
  const stripped = (over: Partial<GameState>): GameState =>
    ({ ...atSeasonWeek(13), ...over }) as GameState

  it('scores all nine with Phase 2, Phase 3, and Territory absent', () => {
    setSeed(29)
    /* Reputation zeroed, no properties, no map, no channels. */
    const bare = stripped({
      reputation: 0,
      properties: [],
      activeChannelIds: [],
      trophies: [],
      season: emptySeasonStats(0),
    })
    const { results } = runCeremony(bare)
    expect(results).toHaveLength(9)
    for (const r of results) {
      expect(Number.isFinite(r.playerScore)).toBe(true)
      expect(r.playerScore).toBeGreaterThanOrEqual(0)
    }
    expect(computeNominations(bare).length).toBeGreaterThanOrEqual(1)
  })

  it('carries a rival roster even when the map is not there', () => {
    const roster = rivalRoster()
    expect(roster).toHaveLength(3)
    expect(roster.map((r) => r.id)).toEqual(['chadwick', 'zambonis', 'krystal'])
  })

  it('reads perks safely on a state with no trophies field at all', () => {
    const legacy = { ...atSeasonWeek(3) } as GameState
    delete (legacy as Partial<GameState>).trophies
    expect(hasPerk(legacy, 'topProducerAura')).toBe(false)
    expect(trophyEgo(legacy)).toBe(0)
  })
})

/* -------------------------------------------------------------- §12.12 */

describe('content ships verbatim', () => {
  it('gives every award a subtitle, both lines, and a perk', () => {
    for (const a of AWARDS) {
      expect(a.name.length).toBeGreaterThan(0)
      expect(a.subtitle.length).toBeGreaterThan(0)
      expect(a.winLine.length).toBeGreaterThan(0)
      expect(a.loseLine.length).toBeGreaterThan(0)
      expect(a.perk.text.length).toBeGreaterThan(0)
      /* Every rival in the roster has an affinity on every award. */
      for (const r of rivalRoster())
        expect(typeof a.rivalAffinity[r.id]).toBe('number')
    }
  })

  it('ships four table tiers at the specced prices', () => {
    const ids: TableTierId[] = ['none', 'seat', 'table', 'sponsor']
    expect(P7.TABLE_TIERS.map((t) => t.id)).toEqual(ids)
    expect(tierOf('sponsor').cost).toBe(10000)
    expect(tierOf('table').scoreBonus).toBe(8)
    expect(tierOf('none').cost).toBe(0)
  })
})
