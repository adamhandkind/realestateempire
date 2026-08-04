import { describe, expect, it } from 'vitest'
import { ARCHETYPE_TELLS, CALL_BEATS, CLIENT_REPLIES } from '../../data/callBeats'
import { cardOf } from '../../data/callCards'
import { P8 } from '../../data/p8'
import { arch } from '../leads'
import {
  beatOf,
  finalChanceFor,
  isPerfect,
  readLineFor,
  revealTell,
  startCall,
  callSummaryLine,
  clientReplyFor,
  momentumWord,
  pickBeat,
  playerLineFor,
  reactionFor,
  shouldCall,
  tacticDelta,
} from '../call'
import { setSeed } from '../rand'
import { closeChance } from '../leads'
import { initialState } from '../../state/reducer'
import { deriveStats } from '../economy'
import type {
  CallState,
  CallTurn,
  GameState,
  Lead,
  TacticId,
} from '../../state/types'

function leadFixture(over: Partial<Lead> = {}): Lead {
  return {
    id: 'L1',
    archetypeId: 'firstTimer',
    clientName: 'Dana Feltz',
    stage: 'ready',
    salePrice: 250000,
    patience: 3,
    maxPatience: 3,
    retriedClose: false,
    createdWeek: 1,
    intro: 'x',
    referralBonus: false,
    districtId: 'downtown',
    ...over,
  }
}

describe('shouldCall', () => {
  it('fires at or above the price threshold', () => {
    expect(shouldCall(leadFixture({ salePrice: 400000 }))).toBe(true)
    expect(shouldCall(leadFixture({ salePrice: 400001 }))).toBe(true)
  })

  it('does not fire below it', () => {
    expect(shouldCall(leadFixture({ salePrice: 399999 }))).toBe(false)
    expect(shouldCall(leadFixture({ salePrice: 120000 }))).toBe(false)
  })

  it('always fires for the three luxury archetypes, at any price', () => {
    ;['luxLorenzo', 'celebrityCleo', 'oldMoneyOtis'].forEach((archetypeId) => {
      expect(
        shouldCall(leadFixture({ archetypeId, salePrice: 1000 })),
        archetypeId,
      ).toBe(true)
    })
  })

  it('does not fire for a cheap lead of any other archetype', () => {
    ;['firstTimer', 'cashChad', 'influencerIzzy', 'techTyler'].forEach((id) => {
      expect(shouldCall(leadFixture({ archetypeId: id, salePrice: 99000 }))).toBe(
        false,
      )
    })
  })
})

describe('momentumWord', () => {
  it('maps every band to its word', () => {
    expect(momentumWord(30)).toBe("They're in")
    expect(momentumWord(20)).toBe("They're in")
    expect(momentumWord(19)).toBe('Warm')
    expect(momentumWord(10)).toBe('Warm')
    expect(momentumWord(9)).toBe('Leaning')
    expect(momentumWord(1)).toBe('Leaning')
    expect(momentumWord(0)).toBe('Neutral')
    expect(momentumWord(-1)).toBe('Cooling')
    expect(momentumWord(-9)).toBe('Cooling')
    expect(momentumWord(-10)).toBe('Losing them')
    expect(momentumWord(-19)).toBe('Losing them')
    expect(momentumWord(-20)).toBe("It's slipping")
    expect(momentumWord(-30)).toBe("It's slipping")
  })
})

describe('callSummaryLine', () => {
  it('maps every band, reading top down', () => {
    expect(callSummaryLine(16)).toContain('beautifully')
    expect(callSummaryLine(15)).toContain('Solid call')
    expect(callSummaryLine(5)).toContain('Solid call')
    expect(callSummaryLine(4)).toContain('Professionally fine')
    expect(callSummaryLine(-5)).toContain('Professionally fine')
    expect(callSummaryLine(-6)).toContain('got away from you')
    expect(callSummaryLine(-15)).toContain('got away from you')
    expect(callSummaryLine(-16)).toContain('car accident')
  })
})

describe('line selection', () => {
  it('picks the same player line for the same beat and tactic every time', () => {
    const a = playerLineFor('t2_price', 'push')
    const b = playerLineFor('t2_price', 'push')
    expect(a).toBe(b)
    expect(cardOf('push').playerLines).toContain(a)
  })

  it('varies the line across different beats', () => {
    const lines = CALL_BEATS.map((b) => playerLineFor(b.id, 'empathize'))
    expect(new Set(lines).size).toBeGreaterThan(1)
  })

  it('draws client replies from the matching tier', () => {
    setSeed(7)
    expect(CLIENT_REPLIES.great).toContain(clientReplyFor('great'))
    expect(CLIENT_REPLIES.terrible).toContain(clientReplyFor('terrible'))
    setSeed(null)
  })
})

describe('pickBeat', () => {
  it('only draws beats legal for the archetype and the turn', () => {
    setSeed(1)
    for (let i = 0; i < 60; i++) {
      const b = pickBeat(leadFixture({ archetypeId: 'oldMoneyOtis' }), 1, [])
      expect(b.turn === 1 || b.turn === 'any').toBe(true)
      if (b.archetypeIds !== 'any')
        expect(b.archetypeIds).toContain('oldMoneyOtis')
    }
    setSeed(null)
  })

  it('can draw the archetype-specific beat, not just the generic pool', () => {
    setSeed(3)
    const ids = new Set<string>()
    for (let i = 0; i < 200; i++)
      ids.add(pickBeat(leadFixture({ archetypeId: 'oldMoneyOtis' }), 1, []).id)
    expect(ids.has('t1_otis')).toBe(true)
    setSeed(null)
  })

  it('never returns a beat already used this call', () => {
    setSeed(5)
    const turn1 = ['t1_generic_a', 't1_generic_b', 't1_generic_c', 't1_first']
    for (let i = 0; i < 50; i++) {
      const b = pickBeat(leadFixture({ archetypeId: 'firstTimer' }), 1, turn1)
      expect(turn1).not.toContain(b.id)
    }
    setSeed(null)
  })

  it('falls back to the generic beat when every candidate is used', () => {
    const all = CALL_BEATS.map((b) => b.id)
    expect(pickBeat(leadFixture(), 1, all).id).toBe('genericBeat1')
    expect(pickBeat(leadFixture(), 2, all).id).toBe('genericBeat2')
    expect(pickBeat(leadFixture(), 3, all).id).toBe('genericBeat3')
  })

  it('resolves beats by id, including the generic fallbacks', () => {
    expect(beatOf('t3_lux').text).toContain('whose name goes on this')
    expect(beatOf('genericBeat2').id).toBe('genericBeat2')
  })

  it('returns a usable beat for an archetype it has never heard of', () => {
    const b = pickBeat(leadFixture({ archetypeId: 'notARealArchetype' }), 2, [])
    expect(b.turn === 2 || b.turn === 'any').toBe(true)
    expect(b.archetypeIds).toBe('any')
  })
})

/** A state with a known ego, for the Flex scaling assertions. */
const withEgo = (ego: number): GameState => ({
  ...initialState(),
  permBonuses: { hustle: 0, swagger: 0, ego },
})
const withSwagger = (swagger: number): GameState => ({
  ...initialState(),
  permBonuses: { hustle: 0, swagger, ego: 0 },
})

describe('reactionFor', () => {
  it('uses the archetype row when the beat has no override', () => {
    const lead = leadFixture({ archetypeId: 'ghostGary' })
    expect(reactionFor(lead, beatOf('t3_generic_a'), 'push')).toBe('great')
    expect(reactionFor(lead, beatOf('t3_generic_a'), 'empathize')).toBe('good')
  })

  it("lets a beat's tell override the archetype default", () => {
    /* Otis's row says namedrop: great, push: terrible. t3_generic_b overrides
       push to great — the beat wins. */
    const otis = leadFixture({ archetypeId: 'oldMoneyOtis' })
    expect(ARCHETYPE_TELLS.oldMoneyOtis.push).toBe('terrible')
    expect(reactionFor(otis, beatOf('t3_generic_b'), 'push')).toBe('great')
  })

  it('leaves non-overridden tactics on the archetype row', () => {
    const otis = leadFixture({ archetypeId: 'oldMoneyOtis' })
    /* t3_generic_b only overrides push. */
    expect(reactionFor(otis, beatOf('t3_generic_b'), 'flex')).toBe('terrible')
  })

  it('falls back to the default row for an unknown archetype', () => {
    const nobody = leadFixture({ archetypeId: 'notARealArchetype' })
    expect(reactionFor(nobody, beatOf('t3_generic_a'), 'empathize')).toBe('good')
    expect(reactionFor(nobody, beatOf('t3_generic_a'), 'flex')).toBe('neutral')
  })
})

describe('tacticDelta — base values', () => {
  const s = initialState()

  it('maps each reaction tier to its delta with no scaling in play', () => {
    /* namedrop is stat-free, so these are the raw tier values. */
    const otis = leadFixture({ archetypeId: 'oldMoneyOtis' })
    expect(tacticDelta(s, otis, beatOf('t3_generic_a'), 'namedrop', []).delta)
      .toBe(P8.GREAT)
    const nancy = leadFixture({ archetypeId: 'nightmareNancy' })
    expect(tacticDelta(s, nancy, beatOf('t3_generic_a'), 'namedrop', []).delta)
      .toBe(P8.NEUTRAL)
    const larry = leadFixture({ archetypeId: 'lowballLarry' })
    expect(tacticDelta(s, larry, beatOf('t3_wobble'), 'empathize', []).delta)
      .toBe(P8.NEUTRAL)
    const first = leadFixture({ archetypeId: 'firstTimer' })
    expect(tacticDelta(s, first, beatOf('t3_wobble'), 'empathize', []).delta)
      .toBe(P8.GREAT)
  })

  it('returns the reaction alongside the delta', () => {
    const first = leadFixture({ archetypeId: 'firstTimer' })
    expect(tacticDelta(s, first, beatOf('t3_wobble'), 'push', []).reaction)
      .toBe('terrible')
  })
})

describe('tacticDelta — repeat penalty', () => {
  it('compounds at -4, -8, -12 for each prior use', () => {
    const s = initialState()
    const otis = leadFixture({ archetypeId: 'oldMoneyOtis' })
    const at = (used: TacticId[]) =>
      tacticDelta(s, otis, beatOf('t3_generic_a'), 'namedrop', used).delta
    expect(at([])).toBe(10)
    expect(at(['namedrop'])).toBe(6)
    expect(at(['namedrop', 'namedrop'])).toBe(2)
    expect(at(['namedrop', 'namedrop', 'namedrop'])).toBe(-2)
  })

  it('only counts prior uses of the same tactic', () => {
    const s = initialState()
    const otis = leadFixture({ archetypeId: 'oldMoneyOtis' })
    expect(
      tacticDelta(s, otis, beatOf('t3_generic_a'), 'namedrop', [
        'empathize',
        'flex',
        'read',
      ]).delta,
    ).toBe(10)
  })
})

describe('tacticDelta — Push scales with Swagger, positive only', () => {
  it('adds swagger x 0.5 to a positive delta', () => {
    const s = withSwagger(4)
    const sw = deriveStats(s).swagger
    const gary = leadFixture({ archetypeId: 'ghostGary' })
    expect(tacticDelta(s, gary, beatOf('t3_wobble'), 'push', []).delta).toBe(
      Math.round(P8.GREAT + sw * P8.SWAGGER_TACTIC_SCALE),
    )
  })

  it('leaves a negative delta alone no matter how high Swagger is', () => {
    const low = withSwagger(0)
    const high = withSwagger(8)
    const first = leadFixture({ archetypeId: 'firstTimer' })
    const a = tacticDelta(low, first, beatOf('t3_wobble'), 'push', []).delta
    const b = tacticDelta(high, first, beatOf('t3_wobble'), 'push', []).delta
    expect(a).toBe(P8.TERRIBLE)
    expect(b).toBe(P8.TERRIBLE)
  })

  it('leaves a neutral delta alone', () => {
    const s = withSwagger(8)
    const izzy = leadFixture({ archetypeId: 'influencerIzzy' })
    expect(tacticDelta(s, izzy, beatOf('t3_wobble'), 'push', []).delta).toBe(0)
  })
})

describe('tacticDelta — Flex scales with ego x egoAffinity, BOTH directions', () => {
  it('rewards a high-Ego player on luxLorenzo, whose affinity is positive', () => {
    expect(arch('luxLorenzo').egoAffinity).toBeGreaterThan(0)
    const flat = initialState()
    const proud = withEgo(6)
    const lorenzo = leadFixture({ archetypeId: 'luxLorenzo' })
    const a = tacticDelta(flat, lorenzo, beatOf('t3_wobble'), 'flex', []).delta
    const b = tacticDelta(proud, lorenzo, beatOf('t3_wobble'), 'flex', []).delta
    expect(b).toBeGreaterThan(a)
  })

  it('punishes that same player on oldMoneyOtis, whose affinity is negative', () => {
    expect(arch('oldMoneyOtis').egoAffinity).toBeLessThan(0)
    const flat = initialState()
    const proud = withEgo(6)
    const otis = leadFixture({ archetypeId: 'oldMoneyOtis' })
    const a = tacticDelta(flat, otis, beatOf('t3_wobble'), 'flex', []).delta
    const b = tacticDelta(proud, otis, beatOf('t3_wobble'), 'flex', []).delta
    expect(b).toBeLessThan(a)
  })

  it('drags a merely-good Flex below neutral on a negative-affinity client', () => {
    /* t2_other_agent overrides flex to 'good' (+5). Otis's egoAffinity is -3,
       so a proud player gets 5 + (ego x -3 x 0.4) and lands under zero: the
       tell was positive and the tactic still cost them. This is the whole
       point of Flex scaling in both directions.

       Note this does NOT hold for every negative-affinity archetype — Ruth at
       -2 lands on 0.2, which rounds to 0. The rule bites hardest exactly where
       the design wants it to, on the luxury tier. */
    const proud = withEgo(6)
    const otis = leadFixture({ archetypeId: 'oldMoneyOtis' })
    expect(arch('oldMoneyOtis').egoAffinity).toBeLessThan(0)
    expect(reactionFor(otis, beatOf('t2_other_agent'), 'flex')).toBe('good')
    expect(
      tacticDelta(proud, otis, beatOf('t2_other_agent'), 'flex', []).delta,
    ).toBeLessThan(0)
  })

  it('computes the exact scaled value', () => {
    const proud = withEgo(6)
    const ego = deriveStats(proud).ego
    const lorenzo = leadFixture({ archetypeId: 'luxLorenzo' })
    expect(
      tacticDelta(proud, lorenzo, beatOf('t3_lux'), 'flex', []).delta,
    ).toBe(
      Math.round(
        P8.GREAT + ego * arch('luxLorenzo').egoAffinity * P8.EGO_TACTIC_SCALE,
      ),
    )
  })
})


describe('revealTell', () => {
  it('reveals the first great tactic in priority order', () => {
    /* Otis: empathize good, push terrible, namedrop GREAT, flex terrible.
       Priority is empathize, push, namedrop, flex — so namedrop wins. */
    const otis = leadFixture({ archetypeId: 'oldMoneyOtis' })
    const r = revealTell(otis, beatOf('t3_wobble'), [])
    expect(r.tactic).toBe('namedrop')
    expect(r.positive).toBe(true)
  })

  it('respects the beat tell over the archetype row', () => {
    /* t3_generic_b overrides push to great; push comes before namedrop. */
    const otis = leadFixture({ archetypeId: 'oldMoneyOtis' })
    expect(revealTell(otis, beatOf('t3_generic_b'), []).tactic).toBe('push')
  })

  it('warns about a terrible tactic when nothing would be great', () => {
    /* Otis with namedrop already known: no great remains, so the next-best
       information is what NOT to do. Push and flex are both terrible; push
       comes first in priority order. */
    const otis = leadFixture({ archetypeId: 'oldMoneyOtis' })
    const r = revealTell(otis, beatOf('t3_wobble'), ['namedrop'])
    expect(r.tactic).toBe('push')
    expect(r.positive).toBe(false)
  })

  it('picks the best available on a flat beat, and calls it positive', () => {
    /* default row: empathize good, push neutral, namedrop good, flex neutral —
       no great and no terrible anywhere. */
    const nobody = leadFixture({ archetypeId: 'notARealArchetype' })
    const r = revealTell(nobody, beatOf('t3_wobble'), [])
    expect(r.tactic).toBe('empathize')
    expect(r.positive).toBe(true)
  })

  it('never no-ops — it always names one unrevealed tactic', () => {
    const nobody = leadFixture({ archetypeId: 'notARealArchetype' })
    const r = revealTell(nobody, beatOf('t3_wobble'), ['empathize', 'namedrop'])
    expect(['push', 'flex']).toContain(r.tactic)
  })

  it('phrases the read line to match the polarity', () => {
    const good = readLineFor('Dana Feltz', { tactic: 'namedrop', positive: true })
    expect(good).toContain('Dana Feltz')
    expect(good).toContain("They'd respond well to")
    expect(good).toContain('Namedrop')
    const bad = readLineFor('Dana Feltz', { tactic: 'push', positive: false })
    expect(bad).toContain('Whatever you do, don')
    expect(bad).toContain('Push')
  })
})

const turnStub = (reaction: CallTurn['reaction']): CallTurn => ({
  turn: 1,
  beatId: 't3_wobble',
  tacticUsed: 'namedrop',
  reaction,
  delta: 0,
  clientReply: 'x',
})

const callWith = (over: Partial<CallState> = {}): CallState => ({
  leadId: 'L1',
  turn: 3,
  momentum: 0,
  history: [],
  usedTactics: [],
  usedBeatIds: [],
  currentBeatId: 't3_wobble',
  revealedTells: [],
  phase: 'resolving',
  outcome: null,
  ...over,
})

describe('startCall', () => {
  it('opens at turn 1, zero momentum, with a legal beat already drawn', () => {
    setSeed(11)
    const lead = leadFixture({ archetypeId: 'luxLorenzo', salePrice: 900000 })
    const c = startCall(lead)
    expect(c.leadId).toBe('L1')
    expect(c.turn).toBe(1)
    expect(c.momentum).toBe(P8.MOMENTUM_START)
    expect(c.phase).toBe('awaitingTactic')
    expect(c.history).toEqual([])
    expect(c.usedBeatIds).toEqual([c.currentBeatId])
    const b = beatOf(c.currentBeatId)
    expect(b.turn === 1 || b.turn === 'any').toBe(true)
    setSeed(null)
  })

  it('opens a retry call at -5, because they remember the first one', () => {
    setSeed(11)
    const lead = leadFixture({ salePrice: 900000, retriedClose: true })
    expect(startCall(lead).momentum).toBe(P8.RETRY_MOMENTUM)
    setSeed(null)
  })
})

describe('isPerfect', () => {
  it('needs all three turns great', () => {
    expect(
      isPerfect(callWith({ history: [1, 2, 3].map(() => turnStub('great')) })),
    ).toBe(true)
  })

  it('rejects two greats and a good', () => {
    expect(
      isPerfect(
        callWith({
          history: [turnStub('great'), turnStub('great'), turnStub('good')],
        }),
      ),
    ).toBe(false)
  })

  it('is disqualified by a Read turn, which scores neutral', () => {
    expect(
      isPerfect(
        callWith({
          history: [turnStub('great'), turnStub('neutral'), turnStub('great')],
        }),
      ),
    ).toBe(false)
  })
})

describe('finalChanceFor', () => {
  const s = initialState()
  const lead = leadFixture({ salePrice: 900000 })

  it('is exactly the dice chance at zero momentum with no perfect', () => {
    expect(finalChanceFor(s, lead, callWith({ momentum: 0 }))).toBeCloseTo(
      closeChance(s, lead),
      6,
    )
  })

  it('adds momentum as hundredths of a point', () => {
    const base = closeChance(s, lead)
    expect(finalChanceFor(s, lead, callWith({ momentum: 18 }))).toBeCloseTo(
      Math.min(0.9, base + 0.18),
      6,
    )
    expect(finalChanceFor(s, lead, callWith({ momentum: -18 }))).toBeCloseTo(
      Math.max(0.1, base - 0.18),
      6,
    )
  })

  it('adds the perfect bonus on top', () => {
    const flat = callWith({ momentum: 10 })
    const perfect = callWith({
      momentum: 10,
      history: [1, 2, 3].map(() => turnStub('great')),
    })
    expect(
      finalChanceFor(s, lead, perfect) - finalChanceFor(s, lead, flat),
    ).toBeCloseTo(P8.PERFECT_BONUS / 100, 6)
  })

  it('never escapes the existing close bounds', () => {
    const rich = { ...s, permBonuses: { hustle: 0, swagger: 10, ego: 0 } }
    expect(
      finalChanceFor(rich, lead, callWith({ momentum: 30 })),
    ).toBeLessThanOrEqual(0.9)
    expect(
      finalChanceFor(s, lead, callWith({ momentum: -30 })),
    ).toBeGreaterThanOrEqual(0.1)
  })
})
