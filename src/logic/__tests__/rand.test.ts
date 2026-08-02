import { describe, expect, it } from 'vitest'
import { chance, rand, setSeed } from '../rand'

describe('rand', () => {
  it('is deterministic under a fixed seed', () => {
    setSeed(42)
    const a = [rand(), rand(), rand()]
    setSeed(42)
    const b = [rand(), rand(), rand()]
    setSeed(null)
    expect(a).toEqual(b)
  })

  it('chance(1) is always true and chance(0) always false', () => {
    setSeed(7)
    expect(chance(1)).toBe(true)
    expect(chance(0)).toBe(false)
    setSeed(null)
  })
})
