import { describe, expect, it } from 'vitest'
import { cityLayout, COLS, ROWS } from '../layout'
import { crossings, findPath, roadRuns, tileAt, walkable } from '../paths'

describe('getting around', () => {
  const city = cityLayout()

  it('walks between any two camps, never through water, one step at a time', () => {
    const camps = city.lots.filter((l) => l.camp)
    const a = camps[0]
    const b = camps[camps.length - 1]
    const path = findPath(city, [a.col, a.row], [b.col, b.row])!
    expect(path[0]).toEqual([a.col, a.row])
    expect(path.at(-1)).toEqual([b.col, b.row])
    for (let i = 1; i < path.length; i++) {
      const [c0, r0] = path[i - 1]
      const [c1, r1] = path[i]
      expect(Math.abs(c1 - c0) + Math.abs(r1 - r0)).toBe(1)
      expect(walkable(city, c1, r1)).toBe(true)
    }
    /* It prefers the street: most of a long walk is road or bridge. */
    const street = path.filter(([c, r]) => ['road', 'bridge'].includes(tileAt(city, c, r)!.kind)).length
    expect(street / path.length).toBeGreaterThan(0.7)
  })

  it('has no way onto the river', () => {
    const water = city.tiles.find((t) => t.kind === 'water')!
    expect(findPath(city, [city.lots[0].col, city.lots[0].row], [water.col, water.row])).toBeNull()
  })

  it('lays traffic on straight runs of road that cross only at bridges', () => {
    const runs = roadRuns(city)
    expect(runs.length).toBeGreaterThan(8)
    for (const r of runs)
      for (let i = r.from; i <= r.to; i++) {
        const t = r.along === 'row' ? tileAt(city, i, r.at)! : tileAt(city, r.at, i)!
        expect(['road', 'bridge']).toContain(t.kind)
      }
    expect(runs.some((r) => r.along === 'col' && r.to - r.from + 1 === ROWS)).toBe(true)
    expect(runs.every((r) => (r.along === 'row' ? r.to < COLS : r.to < ROWS))).toBe(true)
    expect(crossings(city).length).toBeGreaterThan(10)
  })
})
