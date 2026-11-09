import { describe, expect, it } from 'vitest'
import { DISTRICTS } from '../../data/districts'
import { fillPool } from '../../logic/portfolio'
import { createGame, applyAction } from '../../engine'
import type { GameState } from '../../state/types'
import {
  BRIDGE_COLS,
  buildCity,
  cityLayout,
  COLS,
  ROWS,
  riverPolyline,
} from '../layout'
import { leadLots, lotOfEntity, lotUses } from '../occupancy'
import { seasonOf } from '../season'

describe('city layout', () => {
  const city = cityLayout()

  it('is a full grid and is identical every time it is built', () => {
    expect(city.tiles).toHaveLength(COLS * ROWS)
    const again = buildCity()
    expect(again.tiles.map((t) => t.kind + t.districtId).join()).toBe(
      city.tiles.map((t) => t.kind + t.districtId).join(),
    )
  })

  it('samples the Grand River from its SVG path, end to end', () => {
    const line = riverPolyline()
    expect(line[0]).toEqual([0, 435])
    expect(line[line.length - 1][0]).toBeCloseTo(1000)
    expect(line[line.length - 1][1]).toBeCloseTo(255)
  })

  it('has a river that runs the width of the map', () => {
    for (let c = 0; c < COLS; c++) {
      const col = city.tiles.filter((t) => t.col === c)
      expect(col.some((t) => t.kind === 'water' || t.kind === 'bridge')).toBe(
        true,
      )
    }
  })

  it('bridges the river on every bridge road, and only there', () => {
    const bridges = city.tiles.filter((t) => t.kind === 'bridge')
    expect(new Set(bridges.map((t) => t.col))).toEqual(new Set(BRIDGE_COLS))
  })

  it('puts camp lots under every bridge, on both banks', () => {
    for (const b of BRIDGE_COLS) {
      const camps = city.lots.filter((l) => l.camp && Math.abs(l.col - b) <= 2)
      const bridgeRows = city.tiles
        .filter((t) => t.kind === 'bridge' && t.col === b)
        .map((t) => t.row)
      expect(camps.some((l) => l.row < Math.min(...bridgeRows))).toBe(true)
      expect(camps.some((l) => l.row > Math.max(...bridgeRows))).toBe(true)
    }
  })

  it('gives every district a real neighbourhood of lots', () => {
    for (const d of DISTRICTS) {
      const lots = city.lotsByDistrict.get(d.id)!
      expect(lots.filter((l) => !l.camp).length, d.id).toBeGreaterThan(20)
    }
  })

  it('names every lot with an address, uniquely by id', () => {
    expect(new Set(city.lots.map((l) => l.id)).size).toBe(city.lots.length)
    for (const l of city.lots) expect(l.address.length).toBeGreaterThan(5)
  })
})

describe('lot occupancy', () => {
  const city = cityLayout()
  const landlord = (): GameState => {
    let s = fillPool({
      ...createGame('you', 11),
      rank: 'topProducer',
      cash: 5_000_000,
    })
    for (const l of s.marketPool.slice(0, 3))
      s = applyAction(s, { type: 'BUY_PROPERTY', listingId: l.id, downPct: 1 })
    return fillPool(s)
  }

  it('gives every listing and property its own lot in its own district', () => {
    const s = landlord()
    expect(s.properties.length).toBe(3)
    const uses = lotUses(s, city)
    const seen = new Set<string>()
    for (const e of [...s.properties, ...s.marketPool]) {
      const lotId = lotOfEntity(uses, e.id)
      expect(lotId, e.id).not.toBeNull()
      expect(seen.has(lotId!)).toBe(false)
      seen.add(lotId!)
      expect(city.lotById.get(lotId!)!.districtId).toBe(e.districtId)
    }
  })

  it('never moves a house you own when the market changes', () => {
    const s = landlord()
    const before = s.properties.map((p) => lotOfEntity(lotUses(s, city), p.id))
    const churned = fillPool({
      ...s,
      marketPool: [],
      nextListingId: s.nextListingId + 50,
    })
    const after = churned.properties.map((p) =>
      lotOfEntity(lotUses(churned, city), p.id),
    )
    expect(after).toEqual(before)
  })

  it('a house you buy stays on the lot its listing stood on', () => {
    const s = fillPool({
      ...createGame('you', 21),
      rank: 'topProducer',
      cash: 5_000_000,
    })
    for (const l of s.marketPool) {
      const before = lotOfEntity(lotUses(s, city), l.id)
      const bought = applyAction(s, {
        type: 'BUY_PROPERTY',
        listingId: l.id,
        downPct: 1,
      })
      const p = bought.properties[bought.properties.length - 1]
      expect(p.fromListingId).toBe(l.id)
      expect(lotOfEntity(lotUses(bought, city), p.id)).toBe(before)
    }
  })

  it('covers every lot, and camps stay camps', () => {
    const uses = lotUses(landlord(), city)
    expect(uses.size).toBe(city.lots.length)
    for (const l of city.lots)
      if (l.camp) expect(uses.get(l.id)!.kind).toBe('camp')
  })

  it('turns rival territory share into rival-flagged lots', () => {
    const s = createGame('you', 3)
    const shares = { ...s.territory }
    shares.dufferin = {
      ...shares.dufferin,
      shares: { chadwick: 80, indies: 20 },
    }
    const uses = lotUses({ ...s, territory: shares }, city)
    const duff = city.lotsByDistrict.get('dufferin')!
    const chad = duff.filter((l) => {
      const u = uses.get(l.id)!
      return u.kind === 'rival' && u.rivalId === 'chadwick'
    })
    expect(chad.length).toBeGreaterThan(duff.length * 0.3)
  })
})

describe('clients on the map', () => {
  it('puts every lead at an independent home in its own district', () => {
    const city = cityLayout()
    let s = createGame('you', 4)
    for (let i = 0; i < 4; i++) s = applyAction(s, { type: 'WORK_PHONES' })
    expect(s.leads.length).toBeGreaterThan(0)
    const uses = lotUses(s, city)
    const placed = leadLots(s.leads, uses, city)
    expect(placed.size).toBe(s.leads.length)
    for (const [lotId, lead] of placed) {
      expect(uses.get(lotId)!.kind).toBe('independent')
      expect(city.lotById.get(lotId)!.districtId).toBe(lead.districtId)
    }
    expect(leadLots(s.leads, uses, city)).toEqual(placed)
  })
})

describe('seasons', () => {
  it('follows the 13-week market quarters and loops each year', () => {
    expect(seasonOf(1)).toBe('spring')
    expect(seasonOf(13)).toBe('spring')
    expect(seasonOf(14)).toBe('summer')
    expect(seasonOf(27)).toBe('fall')
    expect(seasonOf(40)).toBe('winter')
    expect(seasonOf(52)).toBe('winter')
    expect(seasonOf(53)).toBe('spring')
    expect(seasonOf(NaN)).toBe('spring')
  })
})
