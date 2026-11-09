import { describe, expect, it } from 'vitest'
import { cityLayout } from '../../city/layout'
import { leadLots, lotUses } from '../../city/occupancy'
import { SEASONS } from '../../city/season'
import { districtOf } from '../../data/districts'
import { applyAction, createGame } from '../../engine'
import { fillPool } from '../../logic/portfolio'
import { buildCityGeometry, clientMarkers } from './cityMesh'

const pm = (id: string) => districtOf(id)?.priceMult ?? 1

describe('city geometry', () => {
  const city = cityLayout()
  let s = fillPool({
    ...createGame('you', 5),
    rank: 'topProducer',
    cash: 9_000_000,
  })
  for (const l of s.marketPool.slice(0, 2))
    s = applyAction(s, { type: 'BUY_PROPERTY', listingId: l.id, downPct: 1 })
  for (let i = 0; i < 3; i++) s = applyAction(s, { type: 'WORK_PHONES' })
  const uses = lotUses(s, city)
  const clients = leadLots(s.leads, uses, city)

  it('makes every lot clickable, in every season', () => {
    for (const season of SEASONS) {
      const g = buildCityGeometry(city, uses, season, pm)
      const idx = g.main.getAttribute('lotIndex')
      const seen = new Set<number>()
      for (let i = 0; i < idx.count; i++) seen.add(idx.getX(i))
      for (let l = 0; l < city.lots.length; l++)
        expect(seen.has(l), city.lots[l].id).toBe(true)
      expect(Number.isFinite(g.main.boundingSphere!.radius)).toBe(true)
    }
  })

  it('floats one marker per listing, door you own, and client', () => {
    const g = buildCityGeometry(city, uses, 'summer', pm)
    const all = [
      ...g.markers,
      ...clientMarkers(city, g.heights, clients.keys()),
    ]
    const count = (k: string) => all.filter((m) => m.kind === k).length
    expect(count('listing')).toBe(s.marketPool.length)
    expect(count('owned')).toBe(s.properties.length)
    expect(count('lead')).toBe(clients.size)
    expect(clients.size).toBeGreaterThan(0)
  })

  it('lights windows and lamps every season, and strings bulbs only in winter', () => {
    for (const season of SEASONS) {
      const g = buildCityGeometry(city, uses, season, pm)
      expect(g.glow.getAttribute('position').count).toBeGreaterThan(1000)
      expect(!!g.lights).toBe(season === 'winter')
    }
    const tris = (g: ReturnType<typeof buildCityGeometry>) =>
      (g.main.getAttribute('position').count + g.glow.getAttribute('position').count + (g.lights?.getAttribute('position').count ?? 0)) / 3
    console.log('city triangles, winter:', tris(buildCityGeometry(city, uses, 'winter', pm)))
  })

  it('rebuilds fast enough to redo on every state change', () => {
    buildCityGeometry(city, uses, 'winter', pm) // warm up the JIT
    const t0 = performance.now()
    for (let i = 0; i < 10; i++) buildCityGeometry(city, uses, 'winter', pm)
    const per = (performance.now() - t0) / 10
    console.log('city rebuild ms:', per.toFixed(1))
    expect(per).toBeLessThan(120)
  })
})
