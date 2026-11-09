/* Turns the city model (city/layout + city/occupancy) into geometry. Pure
   function of its inputs: rebuilt whenever the state that shows on the map
   changes, which is cheap — the whole city is ~40k triangles. */

import type * as THREE from 'three'
import {
  COLS,
  ROWS,
  isRoadCol,
  isRoadRow,
  type CityLayout,
  type Lot,
} from '../../city/layout'
import { hash, unit } from '../../city/hash'
import type { LotUse } from '../../city/occupancy'
import type { Season } from '../../city/season'
import { RIVALS } from '../../data/rivals'
import type { PropertyTypeId } from '../../state/types'
import { MeshBuilder } from './builder'
import {
  BRASS,
  GLASS,
  MARBLE,
  PALETTES,
  ROOFS,
  SOLD_RED,
  TENTS,
  TOWER,
  WALLS,
  type Palette,
} from './palette'

export const wx = (col: number) => col - COLS / 2 + 0.5
export const wz = (row: number) => row - ROWS / 2 + 0.5

const SLAB = -0.6
export const WATER_Y = -0.2
const LAWN_Y = 0.03

export interface Marker {
  lotId: string
  x: number
  y: number
  z: number
  kind: 'listing' | 'owned' | 'lead'
}

export interface CityGeometry {
  main: THREE.BufferGeometry
  markers: Marker[]
  /** Roof height per lot index, for selection boxes and client markers. */
  heights: number[]
}

const pick = <T>(arr: T[], key: string): T => arr[hash(key) % arr.length]

const rivalColor = (id: string) =>
  RIVALS.find((r) => r.id === id)?.color ?? '#888'

function tree(
  b: MeshBuilder,
  x: number,
  z: number,
  pal: Palette,
  key: string,
  scale = 1,
) {
  b.box(x, LAWN_Y, z, 0.05 * scale, 0.14 * scale, 0.05 * scale, '#5b4330')
  const leaf = pick(pal.leaves, 'leaf' + key)
  b.cone(x, LAWN_Y + 0.1 * scale, z, 0.15 * scale, 0.42 * scale, leaf, 6)
}

function flag(b: MeshBuilder, x: number, z: number, color: string) {
  b.box(x, LAWN_Y, z, 0.03, 0.62, 0.03, '#d8d4c8')
  b.box(x + 0.12, LAWN_Y + 0.46, z, 0.22, 0.14, 0.02, color)
}

function forSaleSign(b: MeshBuilder, x: number, z: number) {
  b.box(x, LAWN_Y, z, 0.03, 0.34, 0.03, '#d8d4c8')
  b.box(x, LAWN_Y + 0.22, z, 0.26, 0.16, 0.03, MARBLE)
  b.box(x, LAWN_Y + 0.33, z, 0.26, 0.05, 0.035, SOLD_RED)
}

/** Window bands: thin darker slabs every floor, just proud of the walls. */
function bands(
  b: MeshBuilder,
  x: number,
  y0: number,
  z: number,
  w: number,
  d: number,
  floors: number,
  floorH: number,
  color: string,
) {
  for (let f = 0; f < floors; f++)
    b.box(
      x,
      y0 + f * floorH + floorH * 0.35,
      z,
      w + 0.012,
      floorH * 0.38,
      d + 0.012,
      color,
    )
}

/** A building for a lot. Returns its roof height. */
function building(
  b: MeshBuilder,
  typeId: PropertyTypeId,
  x: number,
  z: number,
  pal: Palette,
  key: string,
  priceMult: number,
): number {
  const wall = pick(WALLS, 'wall' + key)
  const roofBase = pick(ROOFS, 'roof' + key)
  const roof = pal.roofSnow ? '#f1f4f6' : roofBase
  const flip = hash('rot' + key) % 2 === 0
  const y = LAWN_Y
  switch (typeId) {
    case 'starter': {
      b.box(x, y, z, 0.5, 0.36, 0.46, wall)
      b.pyramid(x, y + 0.36, z, 0.58, 0.3, 0.54, roof)
      b.box(x + 0.1, y, z + 0.231, 0.1, 0.18, 0.01, '#5b4330')
      return y + 0.66
    }
    case 'townhouse': {
      const n = 3
      const w = 0.24
      for (let i = 0; i < n; i++) {
        const ox = (i - 1) * w
        const tint = pick(WALLS, 'th' + key + i)
        const tx = flip ? x + ox : x
        const tz = flip ? z : z + ox
        b.box(
          tx,
          y,
          tz,
          flip ? w - 0.01 : 0.48,
          0.62,
          flip ? 0.48 : w - 0.01,
          tint,
        )
        b.gable(
          tx,
          y + 0.62,
          tz,
          flip ? w : 0.52,
          0.22,
          flip ? 0.52 : w,
          roof,
          !flip,
          tint,
        )
      }
      return y + 0.84
    }
    case 'duplex': {
      b.box(x, y, z, flip ? 0.7 : 0.5, 0.56, flip ? 0.5 : 0.7, wall)
      b.gable(
        x,
        y + 0.56,
        z,
        flip ? 0.76 : 0.56,
        0.26,
        flip ? 0.56 : 0.76,
        roof,
        flip,
        wall,
      )
      return y + 0.82
    }
    case 'apartment': {
      const floors = 3 + (hash('fl' + key) % 2) + (priceMult > 1.05 ? 1 : 0)
      const fh = 0.3
      const brick = pick(
        ['#9c5b45', '#a8674e', '#8a6b5a', '#b07a5c'],
        'brick' + key,
      )
      b.box(
        x,
        y,
        z,
        0.74,
        floors * fh,
        0.7,
        brick,
        pal.roofSnow ? '#eef1f4' : '#5a5d66',
      )
      bands(b, x, y, z, 0.74, 0.7, floors, fh, '#3b4552')
      b.box(x + 0.15, y + floors * fh, z - 0.1, 0.18, 0.12, 0.18, '#6a6d76')
      return y + floors * fh + 0.12
    }
    case 'condo': {
      const floors = 6 + (hash('fl' + key) % 4) + (priceMult > 1.1 ? 3 : 0)
      const fh = 0.26
      const body = pick(TOWER, 'tw' + key)
      const glass = pick(GLASS, 'gl' + key)
      b.box(x, y, z, 0.66, 0.2, 0.66, '#7d7a72')
      b.box(
        x,
        y + 0.2,
        z,
        0.56,
        floors * fh,
        0.56,
        body,
        pal.roofSnow ? '#eef1f4' : '#7d838c',
      )
      bands(b, x, y + 0.2, z, 0.56, 0.56, floors, fh, glass)
      b.box(x, y + 0.2 + floors * fh, z, 0.2, 0.25, 0.2, '#9aa0a8')
      return y + 0.45 + floors * fh
    }
    case 'luxury': {
      b.box(x - 0.08, y, z - 0.06, 0.6, 0.42, 0.4, wall)
      b.box(x + 0.16, y, z + 0.14, 0.3, 0.42, 0.44, wall)
      b.pyramid(x - 0.08, y + 0.42, z - 0.06, 0.68, 0.24, 0.48, roof)
      b.pyramid(x + 0.16, y + 0.42, z + 0.14, 0.38, 0.24, 0.52, roof)
      if (!pal.roofSnow)
        b.box(x - 0.22, y, z + 0.27, 0.3, 0.012, 0.16, '#59b8d8')
      b.box(x - 0.4, y, z, 0.06, 0.12, 0.8, '#3f6e3a')
      return y + 0.66
    }
    default: {
      b.box(x, y, z, 0.5, 0.4, 0.5, wall)
      b.pyramid(x, y + 0.4, z, 0.58, 0.28, 0.58, roof)
      return y + 0.68
    }
  }
}

function tent(b: MeshBuilder, x: number, z: number, key: string) {
  const color = pick(TENTS, 'tent' + key)
  b.pyramid(x, LAWN_Y, z, 0.36, 0.3, 0.32, color)
  b.box(x, LAWN_Y, z + 0.161, 0.08, 0.14, 0.005, '#2a2a2a')
}

/** Client markers sit over the house they're touring. Separate from the city
 *  build so working the phones doesn't rebuild every building. */
export function clientMarkers(
  city: CityLayout,
  heights: number[],
  lotIds: Iterable<string>,
): Marker[] {
  const out: Marker[] = []
  for (const id of lotIds) {
    const lot = city.lotById.get(id)
    if (!lot) continue
    const top = heights[city.lots.indexOf(lot)] ?? 0.5
    out.push({
      lotId: id,
      x: wx(lot.col),
      y: top + 0.35,
      z: wz(lot.row),
      kind: 'lead',
    })
  }
  return out
}

export function buildCityGeometry(
  city: CityLayout,
  uses: Map<string, LotUse>,
  season: Season,
  priceMultOf: (districtId: string) => number,
): CityGeometry {
  const pal = PALETTES[season]
  const b = new MeshBuilder()
  const markers: Marker[] = []
  const heights: number[] = new Array(city.lots.length).fill(0.3)
  const lotIndex = new Map(city.lots.map((l, i) => [l.id, i]))
  const at = (c: number, r: number) =>
    c >= 0 && r >= 0 && c < COLS && r < ROWS ? city.tiles[r * COLS + c] : null

  for (const t of city.tiles) {
    const x = wx(t.col)
    const z = wz(t.row)
    const key = t.col + ':' + t.row
    b.lotIndex = t.lotId ? lotIndex.get(t.lotId)! : -1

    if (t.kind === 'water' || t.kind === 'bridge') {
      b.box(x, SLAB, z, 1, 0.3, 1, pal.earth)
      if (t.kind === 'bridge') {
        b.box(x, 0.06, z, 1, 0.1, 1, '#6d6a63', pal.road)
        b.box(x - 0.47, 0.16, z, 0.06, 0.12, 1, '#a9a49a')
        b.box(x + 0.47, 0.16, z, 0.06, 0.12, 1, '#a9a49a')
        b.box(x, SLAB + 0.3, z, 0.22, 0.36, 0.22, '#8a857b')
        b.box(x, 0.161, z, 0.04, 0.003, 0.3, pal.roadLine)
      }
      continue
    }

    if (t.kind === 'road') {
      b.box(x, SLAB, z, 1, -SLAB - 0.01, 1, pal.earth, pal.road)
      const ns = isRoadCol(t.col)
      const ew = isRoadRow(t.row)
      if (ns !== ew) {
        b.box(
          x,
          -0.01,
          z,
          ns ? 0.04 : 0.32,
          0.004,
          ns ? 0.32 : 0.04,
          pal.roadLine,
        )
      }
      continue
    }

    /* Land: a sidewalk-coloured block with a lawn on top. */
    const lot: Lot | undefined = t.lotId ? city.lotById.get(t.lotId) : undefined
    const use = t.lotId ? uses.get(t.lotId) : undefined
    const mine = use?.kind === 'owned'
    b.box(x, SLAB, z, 1, -SLAB, 1, pal.earth, mine ? BRASS : pal.sidewalk)

    const lawnColor =
      t.kind === 'park'
        ? pal.park
        : t.kind === 'camp' || use?.kind === 'empty'
          ? pal.dirt
          : hash(key) % 2
            ? pal.grass
            : pal.grassAlt
    b.box(x, 0, z, 0.88, LAWN_Y, 0.88, lawnColor)

    if (t.kind === 'park') {
      tree(b, x - 0.22, z - 0.2, pal, key + 'a', 1.1)
      tree(b, x + 0.24, z - 0.05, pal, key + 'b', 0.9)
      tree(b, x - 0.05, z + 0.25, pal, key + 'c', 1)
      b.box(x + 0.2, LAWN_Y, z + 0.28, 0.24, 0.05, 0.07, '#7a5a3a')
      continue
    }
    if (!lot || !use) continue
    const idx = lotIndex.get(lot.id)!
    const pm = priceMultOf(lot.districtId)

    /* Only the river side of a bank lot looks down at the water, so the camp
       pitches its tents on that side. */
    if (use.kind === 'camp') {
      let ox = 0
      let oz = 0
      for (const [dc, dr] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ] as const) {
        const n = at(t.col + dc, t.row + dr)
        if (n && (n.kind === 'water' || n.kind === 'bridge')) {
          ox += dc
          oz += dr
        }
      }
      tent(b, x + ox * 0.16 - 0.1, z + oz * 0.16, key)
      if (unit('t2' + key) < 0.6)
        tent(b, x - ox * 0.12 + 0.18, z - oz * 0.12 + 0.12, key + 'b')
      b.box(x + 0.22, LAWN_Y, z - 0.24, 0.07, 0.05, 0.07, '#e3a93a')
      b.box(x - 0.28, LAWN_Y, z - 0.25, 0.16, 0.12, 0.12, '#a88a62')
      heights[idx] = 0.45
      continue
    }

    if (use.kind === 'empty') {
      b.box(x - 0.18, LAWN_Y, z + 0.1, 0.08, 0.06, 0.08, pal.grass)
      b.box(x + 0.2, LAWN_Y, z - 0.15, 0.06, 0.05, 0.06, pal.grass)
      b.box(x + 0.3, LAWN_Y, z + 0.3, 0.2, 0.02, 0.12, '#8a857b')
      heights[idx] = 0.15
      continue
    }

    const typeId =
      use.kind === 'listing'
        ? use.listing.typeId
        : use.kind === 'owned'
          ? use.property.typeId
          : use.typeId
    const top = building(b, typeId, x, z, pal, lot.id, pm)
    heights[idx] = top
    const lowRise = typeId !== 'condo' && typeId !== 'apartment'
    if (lowRise && unit('tree' + key) < 0.55)
      tree(b, x - 0.33, z + 0.33, pal, key, 0.8)

    if (use.kind === 'listing') {
      forSaleSign(b, x + 0.33, z + 0.36)
      markers.push({ lotId: lot.id, x, y: top + 0.35, z, kind: 'listing' })
    } else if (use.kind === 'owned') {
      flag(b, x + 0.36, z + 0.36, BRASS)
      markers.push({ lotId: lot.id, x, y: top + 0.35, z, kind: 'owned' })
    } else if (use.kind === 'rival') {
      flag(b, x + 0.36, z + 0.36, rivalColor(use.rivalId))
    }
  }

  return { main: b.build(), markers, heights }
}
