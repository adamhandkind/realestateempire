import { describe, expect, it } from 'vitest'
import { chance, rand, setSeed } from '../rand'

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
