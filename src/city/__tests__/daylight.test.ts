import { describe, expect, it } from 'vitest'
import { daylightAt, daylightFor } from '../daylight'

describe('day and night', () => {
  it('is day at noon and night at midnight, every season', () => {
    for (const s of ['spring', 'summer', 'fall', 'winter'] as const) {
      expect(daylightAt(12, s).day).toBe(1)
      expect(daylightAt(0, s).day).toBe(0)
    }
  })
  it('keeps summer evenings light and winter ones dark', () => {
    expect(daylightAt(20, 'summer').day).toBe(1)
    expect(daylightAt(18, 'winter').day).toBe(0)
  })
  it('glows gold at sunset', () => {
    expect(daylightAt(21, 'summer').golden).toBeGreaterThan(0.9)
    expect(daylightAt(13, 'summer').golden).toBe(0)
  })
  it('pins the light when asked', () => {
    const midnight = new Date(2026, 0, 1, 0, 0)
    expect(daylightFor('day', midnight, 'winter').day).toBe(1)
    expect(daylightFor('auto', midnight, 'winter').day).toBe(0)
  })
})
