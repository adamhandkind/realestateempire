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
})

describe('client replies', () => {
  it('ships four lines for every reaction tier', () => {
    TIERS.forEach((t) => expect(CLIENT_REPLIES[t], t).toHaveLength(4))
  })
})
