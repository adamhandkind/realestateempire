import { describe, expect, it } from 'vitest'
import { REP_THRESHOLDS } from '../../data/reputation'
import { initialState } from '../../state/reducer'
import { clampRep, crossedThresholds, deriveStats, repUnlocked } from '../economy'

describe('reputation', () => {
  it('clamps to 0..100', () => {
    expect(clampRep(-5)).toBe(0)
    expect(clampRep(140)).toBe(100)
    expect(clampRep(42)).toBe(42)
  })

  it('reports which thresholds are unlocked', () => {
    expect(repUnlocked(14, 15)).toBe(false)
    expect(repUnlocked(15, 15)).toBe(true)
    expect(repUnlocked(99, 90)).toBe(true)
  })

  it('lists thresholds crossed between two rep values', () => {
    const crossed = crossedThresholds(28, 52)
    expect(crossed.map((t) => t.rep)).toEqual([30, 50])
    expect(crossedThresholds(52, 28)).toEqual([])
    expect(crossedThresholds(50, 50)).toEqual([])
  })

  it('exposes all five thresholds in ascending order', () => {
    expect(REP_THRESHOLDS.map((t) => t.rep)).toEqual([15, 30, 50, 75, 90])
  })

  it('folds permBonuses.ego into derived stats', () => {
    const s = initialState()
    expect(deriveStats(s).ego).toBe(0)
    const withEgo = { ...s, permBonuses: { hustle: 0, swagger: 0, ego: 3 } }
    expect(deriveStats(withEgo).ego).toBe(3)
  })
})
