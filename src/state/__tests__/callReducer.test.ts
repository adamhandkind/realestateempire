import { describe, expect, it } from 'vitest'
import { initialState, reducer } from '../reducer'
import { P8 } from '../../data/p8'
import { setSeed } from '../../logic/rand'
import type { Action, GameState, Lead, TacticId } from '../types'

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

/** A playable game with one ready lead. Rank must be past receptionist. */
function gameWith(lead: Partial<Lead> = {}): GameState {
  return {
    ...initialState(),
    rank: 'buyerAgent',
    ap: 5,
    leads: [leadFixture(lead)],
  }
}

function openCall(over: Partial<Lead> = {}): GameState {
  setSeed(33)
  const s = reducer(gameWith({ salePrice: 900000, ...over }), {
    type: 'ATTEMPT_CLOSE',
    leadId: 'L1',
  })
  setSeed(null)
  return s
}

/** Plays the given tactics, advancing between each. */
function playThrough(start: GameState, tactics: TacticId[]): GameState {
  let s = start
  for (const t of tactics) {
    if (!s.call || s.call.phase !== 'awaitingTactic') break
    s = reducer(s, { type: 'PLAY_TACTIC', tacticId: t })
    s = reducer(s, { type: 'ADVANCE_CALL' })
  }
  return s
}

describe('ATTEMPT_CLOSE fork', () => {
  it('opens a call for a lead at or above the threshold', () => {
    setSeed(21)
    const s = reducer(gameWith({ salePrice: 400000 }), {
      type: 'ATTEMPT_CLOSE',
      leadId: 'L1',
    })
    expect(s.call).not.toBeNull()
    expect(s.call!.leadId).toBe('L1')
    expect(s.callStats.calls).toBe(1)
    setSeed(null)
  })

  it('opens a call for a luxury archetype at any price', () => {
    setSeed(21)
    const s = reducer(
      gameWith({ archetypeId: 'oldMoneyOtis', salePrice: 90000 }),
      { type: 'ATTEMPT_CLOSE', leadId: 'L1' },
    )
    expect(s.call).not.toBeNull()
    setSeed(null)
  })

  it('resolves instantly by dice below the threshold', () => {
    setSeed(21)
    const s = reducer(gameWith({ salePrice: 399999 }), {
      type: 'ATTEMPT_CLOSE',
      leadId: 'L1',
    })
    expect(s.call).toBeNull()
    expect(s.callStats.calls).toBe(0)
    setSeed(null)
  })

  it('resolves instantly when the player has switched calls off', () => {
    setSeed(21)
    const off = { ...gameWith({ salePrice: 900000 }), callsEnabled: false }
    const s = reducer(off, { type: 'ATTEMPT_CLOSE', leadId: 'L1' })
    expect(s.call).toBeNull()
    expect(s.callStats.calls).toBe(0)
    setSeed(null)
  })

  it('spends exactly one AP either way, and only once', () => {
    setSeed(21)
    expect(
      reducer(gameWith({ salePrice: 900000 }), {
        type: 'ATTEMPT_CLOSE',
        leadId: 'L1',
      }).ap,
    ).toBe(4)
    expect(
      reducer(gameWith({ salePrice: 100000 }), {
        type: 'ATTEMPT_CLOSE',
        leadId: 'L1',
      }).ap,
    ).toBe(4)
    setSeed(null)
  })

  it('logs the call-start line with the name and the price', () => {
    const text = openCall().log.map((l) => l.text).join(' ')
    expect(text).toContain('You called Dana Feltz')
    expect(text).toContain('$900,000')
    expect(text).toContain('Your palms know it')
  })

  it('logs the retry line and opens at a deficit on a second call', () => {
    const s = openCall({ retriedClose: true })
    expect(s.call!.momentum).toBe(P8.RETRY_MOMENTUM)
    expect(s.log.map((l) => l.text).join(' ')).toContain(
      'They remember the first one',
    )
  })
})

describe('the call blocks everything else', () => {
  it('ignores unrelated actions while the line is open', () => {
    const s = openCall()
    const blocked: Action[] = [
      { type: 'WORK_PHONES' },
      { type: 'END_WEEK' },
      { type: 'SIDE_HUSTLE' },
      { type: 'ATTEMPT_CLOSE', leadId: 'L1' },
      { type: 'FARM_DISTRICT', districtId: 'downtown' },
    ]
    blocked.forEach((a) => expect(reducer(s, a), a.type).toBe(s))
  })

  it('still allows the call actions and the debug escapes', () => {
    const s = openCall()
    expect(reducer(s, { type: 'PLAY_TACTIC', tacticId: 'namedrop' })).not.toBe(s)
    expect(reducer(s, { type: 'DEBUG_SET_MOMENTUM', momentum: 5 })).not.toBe(s)
    expect(reducer(s, { type: 'RESTART' }).call).toBeNull()
  })
})

describe('PLAY_TACTIC', () => {
  it('records the turn and moves to the reaction phase', () => {
    const s = reducer(openCall(), { type: 'PLAY_TACTIC', tacticId: 'namedrop' })
    expect(s.call!.phase).toBe('showingReaction')
    expect(s.call!.history).toHaveLength(1)
    expect(s.call!.history[0].tacticUsed).toBe('namedrop')
    expect(s.call!.usedTactics).toEqual(['namedrop'])
    expect(s.call!.history[0].clientReply.length).toBeGreaterThan(0)
  })

  it('is ignored in the reaction phase — one tactic per turn', () => {
    const once = reducer(openCall(), { type: 'PLAY_TACTIC', tacticId: 'push' })
    expect(reducer(once, { type: 'PLAY_TACTIC', tacticId: 'push' })).toBe(once)
  })

  it('clamps momentum to the band no matter what is played', () => {
    const s = playThrough(openCall({ archetypeId: 'oldMoneyOtis' }), [
      'flex',
      'flex',
      'flex',
    ])
    expect(s.call!.momentum).toBeGreaterThanOrEqual(P8.MOMENTUM_MIN)
    expect(s.call!.momentum).toBeLessThanOrEqual(P8.MOMENTUM_MAX)
  })
})

describe('ADVANCE_CALL', () => {
  it('moves to turn 2 with a fresh, unused beat', () => {
    let s = reducer(openCall(), { type: 'PLAY_TACTIC', tacticId: 'namedrop' })
    const first = s.call!.currentBeatId
    s = reducer(s, { type: 'ADVANCE_CALL' })
    expect(s.call!.turn).toBe(2)
    expect(s.call!.phase).toBe('awaitingTactic')
    expect(s.call!.currentBeatId).not.toBe(first)
    expect(s.call!.usedBeatIds).toContain(first)
  })

  it('resolves after exactly three turns', () => {
    const s = playThrough(openCall(), ['namedrop', 'namedrop', 'namedrop'])
    expect(s.call!.phase).toBe('resolved')
    expect(s.call!.outcome).not.toBeNull()
    expect(s.call!.history).toHaveLength(3)
  })

  it('never repeats a beat within a call', () => {
    const s = playThrough(openCall(), ['empathize', 'empathize', 'empathize'])
    const ids = s.call!.history.map((h) => h.beatId)
    expect(new Set(ids).size).toBe(ids.length)
  })
})

describe('Read the Room in play', () => {
  it('consumes the turn but keeps the beat', () => {
    let s = openCall()
    const beat = s.call!.currentBeatId
    s = reducer(s, { type: 'PLAY_TACTIC', tacticId: 'read' })
    s = reducer(s, { type: 'ADVANCE_CALL' })
    expect(s.call!.turn).toBe(2)
    expect(s.call!.currentBeatId).toBe(beat)
    expect(s.call!.revealedTells).toHaveLength(1)
    expect(s.call!.history[0].delta).toBe(0)
    expect(s.call!.history[0].reaction).toBe('neutral')
  })

  it('cannot be played twice in one call', () => {
    let s = openCall()
    s = reducer(s, { type: 'PLAY_TACTIC', tacticId: 'read' })
    s = reducer(s, { type: 'ADVANCE_CALL' })
    expect(reducer(s, { type: 'PLAY_TACTIC', tacticId: 'read' })).toBe(s)
  })

  it('logs a line naming what it found', () => {
    const s = reducer(openCall(), { type: 'PLAY_TACTIC', tacticId: 'read' })
    const text = s.log.map((l) => l.text).join(' ')
    expect(text).toContain('You let the silence sit')
    expect(text).toContain('Dana Feltz')
  })
})

describe('hangup', () => {
  /* Force the collapse rather than hoping the dice deliver it. */
  const collapsed = (turn: number) => {
    const s = openCall()
    return {
      ...s,
      call: {
        ...s.call!,
        turn,
        momentum: -26,
        phase: 'showingReaction' as const,
      },
    }
  }

  it('does not fire on turn 1', () => {
    const s = reducer(collapsed(1), { type: 'ADVANCE_CALL' })
    expect(s.call!.phase).toBe('awaitingTactic')
    expect(s.call!.turn).toBe(2)
    expect(s.callStats.hangups).toBe(0)
  })

  it('fires on turn 2, costs patience, and still resolves the close', () => {
    const s = reducer(collapsed(2), { type: 'ADVANCE_CALL' })
    expect(s.callStats.hangups).toBe(1)
    expect(s.call!.phase).toBe('resolved')
    expect(s.call!.outcome).not.toBeNull()
    expect(s.log.map((l) => l.text).join(' ')).toContain('The line goes dead')
    const lead = s.leads.find((l) => l.id === 'L1')
    if (lead) expect(lead.patience).toBeLessThan(3)
  })

  it('does not fire on turn 3 — that call was ending anyway', () => {
    const s = reducer(collapsed(3), { type: 'ADVANCE_CALL' })
    expect(s.callStats.hangups).toBe(0)
    expect(s.call!.phase).toBe('resolved')
    expect(s.log.map((l) => l.text).join(' ')).not.toContain(
      'The line goes dead',
    )
  })
})

describe('resolution', () => {
  it('logs the call summary line', () => {
    const s = playThrough(openCall(), ['namedrop', 'namedrop', 'namedrop'])
    const text = s.log.map((l) => l.text).join(' ')
    expect(/call went beautifully|Solid call|Professionally fine|got away from you|car accident/.test(text)).toBe(true)
  })

  it('records the outcome for the modal to render', () => {
    const s = playThrough(openCall(), ['namedrop', 'namedrop', 'namedrop'])
    const o = s.call!.outcome!
    expect(typeof o.success).toBe('boolean')
    expect(o.finalChance).toBeGreaterThanOrEqual(0.1)
    expect(o.finalChance).toBeLessThanOrEqual(0.9)
    if (o.success) expect(o.payout).toBeGreaterThan(0)
    else expect(o.payout).toBe(0)
  })

  it('counts exactly one close attempt regardless of turns taken', () => {
    const s = playThrough(openCall(), ['push', 'push', 'push'])
    expect(s.callStats.calls).toBe(1)
  })

  it('clears the call and unblocks the game on CLOSE_CALL_MODAL', () => {
    let s = playThrough(openCall(), ['namedrop', 'namedrop', 'namedrop'])
    s = reducer(s, { type: 'CLOSE_CALL_MODAL' })
    expect(s.call).toBeNull()
    expect(reducer(s, { type: 'WORK_PHONES' })).not.toBe(s)
  })

  it('will not close the modal mid-call', () => {
    const s = openCall()
    expect(reducer(s, { type: 'CLOSE_CALL_MODAL' })).toBe(s)
  })
})

describe('settings and debug', () => {
  it('toggles calls off and back on', () => {
    let s = reducer(initialState(), {
      type: 'SET_CALLS_ENABLED',
      enabled: false,
    })
    expect(s.callsEnabled).toBe(false)
    s = reducer(s, { type: 'SET_CALLS_ENABLED', enabled: true })
    expect(s.callsEnabled).toBe(true)
  })

  it('forces a call on any lead, threshold or not', () => {
    setSeed(41)
    const s = reducer(gameWith({ salePrice: 1000 }), {
      type: 'DEBUG_FORCE_CALL',
      leadId: 'L1',
    })
    expect(s.call).not.toBeNull()
    setSeed(null)
  })

  it('sets momentum directly, clamped to the band', () => {
    let s = reducer(openCall(), { type: 'DEBUG_SET_MOMENTUM', momentum: 999 })
    expect(s.call!.momentum).toBe(P8.MOMENTUM_MAX)
    s = reducer(s, { type: 'DEBUG_SET_MOMENTUM', momentum: -999 })
    expect(s.call!.momentum).toBe(P8.MOMENTUM_MIN)
  })

  it('reveals all four tells at once', () => {
    const s = reducer(openCall(), { type: 'DEBUG_REVEAL_TELLS' })
    expect([...s.call!.revealedTells].sort()).toEqual(
      ['empathize', 'flex', 'namedrop', 'push'].sort(),
    )
  })
})
