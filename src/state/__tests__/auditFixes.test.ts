/* The six findings from the Phase 1 spec audit that were still live in the
   shipped code. One describe per finding, each pinning the RULE rather than
   the current numbers where it can, so a later balance pass moves the
   constants without having to rewrite the intent. */

import { beforeEach, describe, expect, it } from 'vitest'
import { RANKS } from '../../data/ranks'
import { MARKET_MODIFIER_WEEKS, applyEvent } from '../../logic/events'
import {
  activeMarketModifier,
  activeModifierDelta,
  nextRank,
  sideHustleBand,
} from '../../logic/economy'
import { setSeed } from '../../logic/rand'
import { endWeek, initialState, reducer } from '../reducer'
import { migrate } from '../migrate'
import { serialize } from '../save'
import type { GameState } from '../types'

const base = (over: Partial<GameState> = {}): GameState => ({
  ...initialState(),
  rngSeed: 12345,
  ...over,
})

beforeEach(() => setSeed(null))

/* ------------------------------------------------ #16 modifier identity */

describe('market modifiers carry their own identity', () => {
  it('names itself instead of leaving the banner to guess from the sign', () => {
    const hot = applyEvent(base({ week: 4 }), 'hotMarket').state
    expect(hot.activeModifiers[0]).toMatchObject({
      id: 'hotMarket',
      label: 'Hot Market',
    })
    const cold = applyEvent(base({ week: 4 }), 'rateSpike').state
    expect(cold.activeModifiers[0]).toMatchObject({
      id: 'rateSpike',
      label: 'Rate Spike',
    })
  })

  it('is live for exactly two playable weeks after the week it fires in', () => {
    /* Fires while week 4 is being resolved. Week 4 is over, so the window it
       is paid for is weeks 5 and 6. */
    const fired = applyEvent(base({ week: 4 }), 'hotMarket').state
    const at = (week: number) => activeModifierDelta({ ...fired, week })
    expect(at(5)).toBeCloseTo(0.1, 5)
    expect(at(6)).toBeCloseTo(0.1, 5)
    expect(at(7)).toBe(0)
    expect(MARKET_MODIFIER_WEEKS).toBe(2)
  })

  it('stops counting the moment its window closes, then is swept', () => {
    let s = applyEvent(base({ week: 4, rank: 'buyerAgent' }), 'hotMarket').state
    setSeed(7)
    s = endWeek(s) /* -> week 5, first paid week */
    expect(activeModifierDelta(s)).toBeCloseTo(0.1, 5)
    s = endWeek(s) /* -> week 6, second paid week */
    expect(activeModifierDelta(s)).toBeCloseTo(0.1, 5)
    /* Week 7 is past the window. The entry is inert here and collected on the
       following roll — the sweep trails expiry by one week by design, and what
       matters is that it stops COUNTING on time. */
    s = endWeek(s)
    expect(activeModifierDelta(s)).toBe(0)
    expect(endWeek(s).activeModifiers).toHaveLength(0)
  })
})

/* --------------------------------------------- #17 mutual exclusivity */

describe('market modifiers do not stack', () => {
  it('replaces a running swing rather than adding to it', () => {
    let s = applyEvent(base({ week: 4 }), 'hotMarket').state
    s = applyEvent(s, 'hotMarket').state
    expect(s.activeModifiers).toHaveLength(1)
    expect(activeModifierDelta({ ...s, week: 5 })).toBeCloseTo(0.1, 5)
  })

  it('lets a rate spike take over from a hot market outright', () => {
    let s = applyEvent(base({ week: 4 }), 'hotMarket').state
    s = applyEvent({ ...s, week: 5 }, 'rateSpike').state
    expect(s.activeModifiers).toHaveLength(1)
    /* Not a cancellation into a silent zero — the banner has something to say. */
    expect(activeMarketModifier({ ...s, week: 6 })?.id).toBe('rateSpike')
    expect(activeModifierDelta({ ...s, week: 6 })).toBeCloseTo(-0.1, 5)
  })
})

/* ------------------------------------------------------- #7 pure reducer */

describe('the reducer is pure', () => {
  it('gives the same answer twice for the same state and action', () => {
    const s = base({ rank: 'junior', ap: 5, cash: 1000 })
    const a = reducer(s, { type: 'SIDE_HUSTLE' })
    const b = reducer(s, { type: 'SIDE_HUSTLE' })
    expect(a.cash).toBe(b.cash)
    expect(a.rngSeed).toBe(b.rngSeed)
    expect(a.log[0].text).toBe(b.log[0].text)
  })

  it('advances the cursor, so a repeated action is not a repeated roll', () => {
    const s = base({ rank: 'junior', ap: 5 })
    const first = reducer(s, { type: 'SIDE_HUSTLE' })
    expect(first.rngSeed).not.toBe(s.rngSeed)
  })

  it('does not spend luck on an action it refuses', () => {
    const s = base({ ap: 0 })
    expect(reducer(s, { type: 'SIDE_HUSTLE' })).toBe(s)
  })

  it('carries the cursor through a save round-trip', () => {
    const s = base({ rank: 'junior', ap: 5 })
    const reloaded = migrate(JSON.parse(serialize(s)))!
    expect(reloaded.rngSeed).toBe(s.rngSeed)
    /* Same seed in, same week out — a refresh cannot be used to re-roll. */
    expect(reducer(reloaded, { type: 'SIDE_HUSTLE' }).cash).toBe(
      reducer(s, { type: 'SIDE_HUSTLE' }).cash,
    )
  })

  it('mints a fresh cursor for a new game rather than inheriting one', () => {
    const a = initialState()
    const b = initialState()
    expect(a.rngSeed).not.toBe(b.rngSeed)
  })
})

/* ------------------------------------------------ #4 Junior progression */

describe('the Junior promotion cannot be bought with gig work alone', () => {
  const junior = RANKS.find((r) => r.id === 'junior')!

  it('asks for showings, not just money', () => {
    expect(junior.req.showings).toBeGreaterThan(0)
  })

  it('refuses the promotion on earnings alone', () => {
    const rich = base({
      careerEarnings: junior.req.earnings * 10,
      counters: { showingsRun: 0, dealsClosed: 0, leadsLost: 0 },
    })
    expect(nextRank(rich)).toBeNull()
  })

  it('is out of reach of a single week of maximum Side Hustling', () => {
    /* Five AP, all of them the best band available, and every dollar of it
       counted toward the career. Still short. */
    const bestWeek = sideHustleBand(0)[1] * 5
    expect(bestWeek).toBeLessThan(junior.req.earnings)
  })

  it('grants it once both bars are met', () => {
    const earned = base({
      careerEarnings: junior.req.earnings,
      counters: {
        showingsRun: junior.req.showings,
        dealsClosed: 0,
        leadsLost: 0,
      },
    })
    expect(nextRank(earned)?.id).toBe('junior')
  })
})

/* ------------------------------------------------- #26 Side Hustle taper */

describe('Side Hustle pays less the harder you lean on it', () => {
  it('drops band by band and then floors', () => {
    const [lo0, hi0] = sideHustleBand(0)
    const [lo1, hi1] = sideHustleBand(1)
    const [lo2, hi2] = sideHustleBand(2)
    expect(lo1).toBeLessThan(lo0)
    expect(hi1).toBeLessThan(hi0)
    expect(lo2).toBeLessThan(lo1)
    expect(hi2).toBeLessThan(hi1)
    expect(sideHustleBand(9)).toEqual([lo2, hi2])
  })

  it('counts them within the week', () => {
    let s = base({ ap: 5 })
    expect(s.sideHustlesThisWeek).toBe(0)
    s = reducer(s, { type: 'SIDE_HUSTLE' })
    s = reducer(s, { type: 'SIDE_HUSTLE' })
    expect(s.sideHustlesThisWeek).toBe(2)
  })

  it('never pays a later hustle more than the first one could have', () => {
    let s = base({ ap: 5 })
    const first = reducer(s, { type: 'SIDE_HUSTLE' })
    const firstPay = first.cash - s.cash
    s = first
    s = reducer(s, { type: 'SIDE_HUSTLE' })
    const thirdIn = s
    const third = reducer(thirdIn, { type: 'SIDE_HUSTLE' })
    expect(third.cash - thirdIn.cash).toBeLessThanOrEqual(sideHustleBand(2)[1])
    expect(firstPay).toBeGreaterThanOrEqual(sideHustleBand(0)[0])
  })

  it('resets with the week', () => {
    setSeed(5)
    let s = base({ ap: 5, rank: 'buyerAgent' })
    s = reducer(s, { type: 'SIDE_HUSTLE' })
    expect(s.sideHustlesThisWeek).toBe(1)
    expect(endWeek(s).sideHustlesThisWeek).toBe(0)
  })
})

/* -------------------------------------------------- #25 import validation */

describe('an imported save cannot poison the game', () => {
  const imported = (over: Record<string, unknown>) =>
    migrate({ ...JSON.parse(serialize(initialState())), ...over })

  it('still refuses something that is not one of ours', () => {
    expect(migrate(null)).toBeNull()
    expect(migrate({ hello: 'world' })).toBeNull()
    expect(migrate({ version: 99 })).toBeNull()
  })

  it('repairs non-finite money and week values', () => {
    const out = imported({ cash: NaN, careerEarnings: 'lots', week: Infinity })!
    expect(Number.isFinite(out.cash)).toBe(true)
    expect(Number.isFinite(out.careerEarnings)).toBe(true)
    expect(Number.isFinite(out.week)).toBe(true)
    expect(out.week).toBeGreaterThanOrEqual(1)
  })

  it('clamps a hand-edited action point count', () => {
    expect(imported({ ap: 9999 })!.ap).toBeLessThanOrEqual(12)
    expect(imported({ ap: -5 })!.ap).toBe(0)
  })

  it('drops swag ids that name nothing', () => {
    const out = imported({ ownedSwagIds: ['goldBlazer', 'notAThing'] })!
    expect(out.ownedSwagIds).toEqual(['goldBlazer'])
  })

  it('refuses to equip something unowned, or filed in the wrong slot', () => {
    expect(imported({ ownedSwagIds: [], equipped: { outfit: 'goldBlazer' } })!
      .equipped.outfit).toBeUndefined()
    expect(imported({
      ownedSwagIds: ['goldBlazer'],
      equipped: { vehicle: 'goldBlazer' },
    })!.equipped.vehicle).toBeUndefined()
    expect(imported({
      ownedSwagIds: ['goldBlazer'],
      equipped: { outfit: 'goldBlazer' },
    })!.equipped.outfit).toBe('goldBlazer')
  })

  it('drops leads whose archetype no longer exists', () => {
    const lead = {
      id: 'L1',
      archetypeId: 'ghostArchetype',
      clientName: 'Nobody',
      stage: 'new',
      salePrice: 1,
      patience: 1,
      maxPatience: 1,
      retriedClose: false,
      createdWeek: 1,
      intro: '…',
      districtId: 'northEnd',
      referralBonus: false,
    }
    expect(imported({ leads: [lead] })!.leads).toHaveLength(0)
    expect(
      imported({ leads: [{ ...lead, archetypeId: 'firstTimer' }] })!.leads,
    ).toHaveLength(1)
  })

  it('repairs a lead with unusable patience', () => {
    const out = imported({
      leads: [
        {
          id: 'L1',
          archetypeId: 'firstTimer',
          clientName: 'Test',
          stage: 'new',
          salePrice: 300000,
          patience: NaN,
          maxPatience: NaN,
          retriedClose: false,
          createdWeek: 1,
          intro: '…',
          districtId: 'northEnd',
          referralBonus: false,
        },
      ],
    })!
    expect(Number.isFinite(out.leads[0].patience)).toBe(true)
    expect(out.leads[0].patience).toBeGreaterThan(0)
  })

  it('reconstructs a v7 modifier that has no id, and unstacks it', () => {
    const out = imported({
      version: 7,
      week: 4,
      activeModifiers: [
        { closeChanceDelta: 0.1, expiresWeek: 6 },
        { closeChanceDelta: -0.1, expiresWeek: 6 },
      ],
    })!
    expect(out.activeModifiers).toHaveLength(1)
    expect(out.activeModifiers[0].id).toBe('rateSpike')
    expect(out.activeModifiers[0].label).toBe('Rate Spike')
  })

  it('gives a seedless save a cursor of its own', () => {
    const out = imported({ rngSeed: undefined })!
    expect(Number.isFinite(out.rngSeed)).toBe(true)
  })
})
