import { describe, expect, it } from 'vitest'
import { chance, rand, roundTo, setSeed, weightedPick } from '../rand'

describe('rand', () => {
  it('is deterministic under a fixed seed', () => {
    setSeed(42)
    const a = [rand(), rand(), rand()]
    setSeed(42)
    const b = [rand(), rand(), rand()]
    expect(a).toEqual(b)
  })

  it('produces a reproducible chance() sequence for a given seed', () => {
    setSeed(7)
    const a = Array.from({ length: 10 }, () => chance(0.5))
    setSeed(7)
    const b = Array.from({ length: 10 }, () => chance(0.5))
    expect(a).toEqual(b)
    // a coin-flip run of ten should not be all-heads or all-tails
    expect(new Set(a).size).toBe(2)
  })
})

describe('roundTo', () => {
  it('rounds to the nearest step', () => {
    expect(roundTo(1237, 5)).toBe(1235)
    expect(roundTo(1238, 5)).toBe(1240)
    expect(roundTo(212345, 5000)).toBe(210000)
  })
  it('treats a step of 0 or 1 as a plain round', () => {
    expect(roundTo(1237.6, 1)).toBe(1238)
    expect(roundTo(1237.6, 0)).toBe(1238)
  })
})

describe('weightedPick', () => {
  it('never returns a zero-weight entry', () => {
    setSeed(42)
    const items = [
      { id: 'a', weight: 0 },
      { id: 'b', weight: 5 },
    ]
    for (let i = 0; i < 200; i++)
      expect(weightedPick(items, (x) => x.weight)!.id).toBe('b')
    setSeed(null)
  })
  it('returns null when every weight is zero or the list is empty', () => {
    expect(weightedPick([], () => 1)).toBeNull()
    expect(weightedPick([{ w: 0 }], (x) => x.w)).toBeNull()
  })
})
