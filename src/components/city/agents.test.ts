import { describe, expect, it } from 'vitest'
import { nearestFigure, type ScreenFigure } from './agents'

/* Two people standing upright, 40px tall, 30px apart. */
const figs: ScreenFigure[] = [
  { id: 'a', foot: [100, 200], head: [100, 160] },
  { id: 'b', foot: [130, 200], head: [130, 160] },
]

describe('clicking a person on the map', () => {
  it('finds whoever is under the click, head to toe', () => {
    expect(nearestFigure(figs, 100, 195, 16)).toBe('a')
    expect(nearestFigure(figs, 101, 162, 16)).toBe('a')
    expect(nearestFigure(figs, 131, 180, 16)).toBe('b')
  })

  it('picks the closer of two neighbours', () => {
    expect(nearestFigure(figs, 112, 180, 16)).toBe('a')
    expect(nearestFigure(figs, 118, 180, 16)).toBe('b')
  })

  it('misses when nobody is near', () => {
    expect(nearestFigure(figs, 100, 230, 16)).toBeNull()
    expect(nearestFigure(figs, 300, 180, 16)).toBeNull()
    expect(nearestFigure([], 100, 180, 16)).toBeNull()
  })

  it('copes with a figure seen from straight above', () => {
    expect(nearestFigure([{ id: 'c', foot: [50, 50], head: [50, 50] }], 55, 52, 16)).toBe('c')
  })
})
