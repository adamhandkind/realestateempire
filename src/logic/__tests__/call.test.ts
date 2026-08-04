import { describe, expect, it } from 'vitest'
import { CALL_BEATS, CLIENT_REPLIES } from '../../data/callBeats'
import { cardOf } from '../../data/callCards'
import {
  beatOf,
  callSummaryLine,
  clientReplyFor,
  momentumWord,
  pickBeat,
  playerLineFor,
  shouldCall,
} from '../call'
import { setSeed } from '../rand'
import type { Lead } from '../../state/types'

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
