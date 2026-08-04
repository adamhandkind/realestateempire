import { describe, expect, it } from 'vitest'
import { P8 } from '../../data/p8'

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
