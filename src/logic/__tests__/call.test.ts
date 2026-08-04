import { describe, expect, it } from 'vitest'
import { P8 } from '../../data/p8'
import { CALL_CARDS, cardOf } from '../../data/callCards'
import { ARCHETYPES } from '../../data/archetypes'
import {
  ARCHETYPE_TELLS,
  CALL_BEATS,
  CLIENT_REPLIES,
  GENERIC_BEATS,
} from '../../data/callBeats'
import type { PlayableTactic, Reaction } from '../../state/types'
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

const PLAYABLE: PlayableTactic[] = ['empathize', 'push', 'namedrop', 'flex']
const TIERS: Reaction[] = ['great', 'good', 'neutral', 'bad', 'terrible']

describe('P8 constants', () => {
  it('sets the trigger threshold and always-call roster', () => {
    expect(P8.CALL_THRESHOLD).toBe(400000)
    expect([...P8.ALWAYS_CALL]).toEqual([
      'luxLorenzo',
      'celebrityCleo',
      'oldMoneyOtis',
    ])
  })

  it('sets the momentum band and the per-reaction deltas', () => {
    expect(P8.TURNS).toBe(3)
    expect(P8.MOMENTUM_START).toBe(0)
    expect(P8.MOMENTUM_MIN).toBe(-30)
    expect(P8.MOMENTUM_MAX).toBe(30)
    expect(P8.GREAT).toBe(10)
    expect(P8.GOOD).toBe(5)
    expect(P8.NEUTRAL).toBe(0)
    expect(P8.BAD).toBe(-6)
    expect(P8.TERRIBLE).toBe(-12)
  })

  it('sets the penalties, bonuses, and scaling factors', () => {
    expect(P8.REPEAT_PENALTY).toBe(4)
    expect(P8.READ_COST_AP).toBe(0)
    expect(P8.PATIENCE_ON_HANGUP).toBe(1)
    expect(P8.HANGUP_MOMENTUM).toBe(-25)
    expect(P8.PERFECT_BONUS).toBe(8)
    expect(P8.EGO_TACTIC_SCALE).toBe(0.4)
    expect(P8.SWAGGER_TACTIC_SCALE).toBe(0.5)
    expect(P8.RETRY_MOMENTUM).toBe(-5)
  })
})

describe('call cards', () => {
  it('ships five tactics in display order, Read last', () => {
    expect(CALL_CARDS.map((c) => c.id)).toEqual([
      'empathize',
      'push',
      'namedrop',
      'flex',
      'read',
    ])
  })

  it('gives every card a label, a hint, and player lines', () => {
    CALL_CARDS.forEach((c) => {
      expect(c.label.length).toBeGreaterThan(0)
      expect(c.hint.length).toBeGreaterThan(0)
      expect(c.playerLines.length).toBeGreaterThan(0)
    })
  })

  it('gives the four playable tactics four lines each, and Read three', () => {
    expect(cardOf('empathize').playerLines).toHaveLength(4)
    expect(cardOf('push').playerLines).toHaveLength(4)
    expect(cardOf('namedrop').playerLines).toHaveLength(4)
    expect(cardOf('flex').playerLines).toHaveLength(4)
    expect(cardOf('read').playerLines).toHaveLength(3)
  })

  it('marks Read as costing the turn', () => {
    expect(cardOf('read').hint).toContain('Costs the turn')
  })
})

describe('archetype tells', () => {
  it('covers every shipped archetype plus a default row', () => {
    expect(ARCHETYPE_TELLS.default).toBeDefined()
    ARCHETYPES.forEach((a) => {
      expect(ARCHETYPE_TELLS[a.id], a.id).toBeDefined()
    })
  })

  it('gives every row all four playable tactics', () => {
    Object.entries(ARCHETYPE_TELLS).forEach(([id, row]) => {
      PLAYABLE.forEach((t) => expect(TIERS, id + '.' + t).toContain(row[t]))
    })
  })

  it('gives every archetype exactly one great', () => {
    Object.entries(ARCHETYPE_TELLS).forEach(([id, row]) => {
      if (id === 'default') return
      const vals = PLAYABLE.map((t) => row[t])
      expect(vals.filter((v) => v === 'great'), id).toHaveLength(1)
    })
  })

  /* Five agreeable archetypes have no way to actively blow it — they have an
     obvious right answer and no punishing cell. That is deliberate: it is what
     makes the luxury tier's terribles feel sharp by contrast. Pinned here so an
     accidental edit is caught in either direction. */
  it('leaves exactly five archetypes with no negative tell', () => {
    const noNegative = Object.entries(ARCHETYPE_TELLS)
      .filter(([id]) => id !== 'default')
      .filter(([, row]) =>
        PLAYABLE.every((t) => row[t] !== 'bad' && row[t] !== 'terrible'),
      )
      .map(([id]) => id)
      .sort()
    expect(noNegative).toEqual(
      ['flipBro', 'ghostGary', 'hgtvCouple', 'relocRob', 'techTyler'].sort(),
    )
  })

  it('keeps the luxury split — Lorenzo and Cleo reward Flex, Otis punishes it', () => {
    expect(ARCHETYPE_TELLS.luxLorenzo.flex).toBe('great')
    expect(ARCHETYPE_TELLS.celebrityCleo.flex).toBe('great')
    expect(ARCHETYPE_TELLS.oldMoneyOtis.flex).toBe('terrible')
    expect(ARCHETYPE_TELLS.oldMoneyOtis.namedrop).toBe('great')
  })
})

describe('beats', () => {
  it('ships nineteen beats with unique ids', () => {
    expect(CALL_BEATS).toHaveLength(19)
    expect(new Set(CALL_BEATS.map((b) => b.id)).size).toBe(19)
  })

  it('ships at least three beats per turn, counting the any-turn pool', () => {
    ;[1, 2, 3].forEach((turn) => {
      const n = CALL_BEATS.filter(
        (b) => b.turn === turn || b.turn === 'any',
      ).length
      expect(n, 'turn ' + turn).toBeGreaterThanOrEqual(3)
    })
  })

  it('only references archetypes that exist', () => {
    const known = new Set(ARCHETYPES.map((a) => a.id))
    CALL_BEATS.forEach((b) => {
      if (b.archetypeIds === 'any') return
      b.archetypeIds.forEach((id) => expect(known, b.id).toContain(id))
    })
  })

  it('only uses valid reactions in tell overrides', () => {
    CALL_BEATS.forEach((b) => {
      Object.entries(b.tell ?? {}).forEach(([t, r]) => {
        expect(PLAYABLE, b.id).toContain(t)
        expect(TIERS, b.id).toContain(r)
      })
    })
  })

  it('has one generic fallback beat per turn, outside the main pool', () => {
    expect(Object.keys(GENERIC_BEATS).sort()).toEqual(['1', '2', '3'])
    ;[1, 2, 3].forEach((t) => {
      const b = GENERIC_BEATS[t as 1 | 2 | 3]
      expect(b.turn).toBe(t)
      expect(b.tell).toBeUndefined()
      expect(CALL_BEATS.some((x) => x.id === b.id)).toBe(false)
    })
  })

  /* The generics deliberately mirror the plainest beat of their turn. Nothing
     in the type system enforces that, so a reword of one and not the other
     would silently desync. Pin it here instead. */
  it('keeps each generic fallback in sync with the beat it mirrors', () => {
    const mirrors: [1 | 2 | 3, string][] = [
      [1, 't1_generic_a'],
      [2, 't2_price'],
      [3, 't3_generic_a'],
    ]
    mirrors.forEach(([turn, id]) => {
      const source = CALL_BEATS.find((b) => b.id === id)
      expect(source, id).toBeDefined()
      expect(GENERIC_BEATS[turn].text, id).toBe(source!.text)
    })
  })
})

describe('client replies', () => {
  it('ships four lines for every reaction tier', () => {
    TIERS.forEach((t) => expect(CLIENT_REPLIES[t], t).toHaveLength(4))
  })
})

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
