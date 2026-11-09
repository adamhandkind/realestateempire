/* The city as a grid of tiles, laid over the existing 1000x700 map of
   Brantford (data/districts.ts). Every tile is water, road, bridge, park, a
   buildable lot, or a camp lot under a bridge. Pure and deterministic: the
   same data always produces the same city, so a server and every player's
   browser agree on what "lot 14-9" is.

   Coordinates: col runs west→east (map x), row runs north→south (map y).
   One tile is TILE map units square. */

import { DISTRICTS, RIVER_PATH } from '../data/districts'
import { unit } from './hash'

export const COLS = 40
export const ROWS = 28
export const TILE = 25

export type TileKind = 'water' | 'road' | 'bridge' | 'park' | 'lot' | 'camp'

export interface Tile {
  col: number
  row: number
  kind: TileKind
  districtId: string
  /** Lots and camps only. */
  lotId?: string
}

export interface Lot {
  id: string
  col: number
  row: number
  districtId: string
  /** A camp lot sits on the riverbank beside a bridge — tent territory. */
  camp: boolean
  address: string
}

export interface CityLayout {
  cols: number
  rows: number
  tiles: Tile[]
  lots: Lot[]
  lotById: Map<string, Lot>
  /** Lots per district, in grid order. Camps included. */
  lotsByDistrict: Map<string, Lot[]>
}

/* ------------------------------------------------------------------ river */

type Pt = [number, number]

/** Reads the SVG path in data/districts.ts (M, C and S only — what it uses)
 *  and samples it into a polyline. */
export function riverPolyline(path = RIVER_PATH, perSegment = 60): Pt[] {
  const nums = path.match(/-?\d+(\.\d+)?/g)!.map(Number)
  const cmds = path.match(/[MCS]/g)!
  let i = 0
  const take = (): Pt => [nums[i++], nums[i++]]
  let cur: Pt = [0, 0]
  let lastCtrl: Pt | null = null
  const out: Pt[] = []
  const curve = (c1: Pt, c2: Pt, end: Pt) => {
    for (let k = out.length ? 1 : 0; k <= perSegment; k++) {
      const t = k / perSegment
      const u = 1 - t
      out.push([
        u * u * u * cur[0] +
          3 * u * u * t * c1[0] +
          3 * u * t * t * c2[0] +
          t * t * t * end[0],
        u * u * u * cur[1] +
          3 * u * u * t * c1[1] +
          3 * u * t * t * c2[1] +
          t * t * t * end[1],
      ])
    }
    lastCtrl = c2
    cur = end
  }
  for (const c of cmds) {
    if (c === 'M') cur = take()
    else if (c === 'C') curve(take(), take(), take())
    else {
      const c1: Pt = lastCtrl
        ? [2 * cur[0] - lastCtrl[0], 2 * cur[1] - lastCtrl[1]]
        : cur
      curve(c1, take(), take())
    }
  }
  return out
}

function distToPolyline(p: Pt, line: Pt[]): number {
  let best = Infinity
  for (let k = 0; k < line.length - 1; k++) {
    const [ax, ay] = line[k]
    const [bx, by] = line[k + 1]
    const dx = bx - ax
    const dy = by - ay
    const len = dx * dx + dy * dy
    const t = len
      ? Math.max(0, Math.min(1, ((p[0] - ax) * dx + (p[1] - ay) * dy) / len))
      : 0
    const ex = ax + t * dx - p[0]
    const ey = ay + t * dy - p[1]
    best = Math.min(best, Math.sqrt(ex * ex + ey * ey))
  }
  return best
}

/* -------------------------------------------------------------- districts */

const polys = DISTRICTS.map((d) => ({
  id: d.id,
  pts: d.polygon.split(' ').map((xy) => xy.split(',').map(Number) as Pt),
}))

function inPolygon([x, y]: Pt, pts: Pt[]): boolean {
  let inside = false
  for (let a = 0, b = pts.length - 1; a < pts.length; b = a++) {
    const [xa, ya] = pts[a]
    const [xb, yb] = pts[b]
    if (ya > y !== yb > y && x < ((xb - xa) * (y - ya)) / (yb - ya) + xa)
      inside = !inside
  }
  return inside
}

/** The district a map point falls in; nearest label when it's on a seam. */
export function districtAt(p: Pt): string {
  const hit = polys.find((d) => inPolygon(p, d.pts))
  if (hit) return hit.id
  let best = DISTRICTS[0]
  let bestD = Infinity
  for (const d of DISTRICTS) {
    const dd = (d.labelPos.x - p[0]) ** 2 + (d.labelPos.y - p[1]) ** 2
    if (dd < bestD) {
      bestD = dd
      best = d
    }
  }
  return best.id
}

/* ------------------------------------------------------------------ roads */

/** A road every few tiles makes blocks of five by four lots. */
export const isRoadCol = (c: number) => c % 6 === 2
export const isRoadRow = (r: number) => r % 5 === 2
/** Only these north-south roads cross the Grand. */
export const BRIDGE_COLS = [8, 20, 32]
/** Half the river's width, in map units. */
const RIVER_HALF_WIDTH = 24
const PARK_CHANCE = 0.06

/** Real Brantford street names, one per east-west road, north to south. */
const STREETS = [
  'Dufferin Ave',
  'Brant Ave',
  'Colborne St',
  'Dalhousie St',
  'Erie Ave',
  'Mohawk St',
]
const AVENUES = [
  'St Paul Ave',
  'King George Rd',
  'Clarence St',
  'Market St',
  'West St',
  'Wayne Gretzky Pkwy',
  'Garden Ave',
]

function addressFor(col: number, row: number): string {
  const street =
    STREETS[Math.min(STREETS.length - 1, Math.round((row - 2) / 5))]
  const avenue =
    AVENUES[Math.min(AVENUES.length - 1, Math.round((col - 2) / 6))]
  /* Lots that front an avenue more than a street take the avenue's name. */
  const nearStreet = Math.abs(((((row - 2) % 5) + 5) % 5) - 2.5)
  const nearAve = Math.abs(((((col - 2) % 6) + 6) % 6) - 3)
  const onStreet = nearStreet >= nearAve - 0.5
  const n = onStreet ? 10 + col * 12 + (row % 2) : 10 + row * 14 + (col % 2)
  return n + ' ' + (onStreet ? street : avenue)
}

/* ------------------------------------------------------------------ build */

export function buildCity(): CityLayout {
  const river = riverPolyline()
  const tiles: Tile[] = []
  const water = (c: number, r: number) =>
    c >= 0 &&
    r >= 0 &&
    c < COLS &&
    r < ROWS &&
    distToPolyline([(c + 0.5) * TILE, (r + 0.5) * TILE], river) <
      RIVER_HALF_WIDTH

  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++) {
      const center: Pt = [(c + 0.5) * TILE, (r + 0.5) * TILE]
      const districtId = districtAt(center)
      let kind: TileKind
      if (water(c, r)) kind = BRIDGE_COLS.includes(c) ? 'bridge' : 'water'
      else if (isRoadCol(c) || isRoadRow(r)) kind = 'road'
      else kind = 'lot'
      tiles.push({ col: c, row: r, kind, districtId })
    }

  const at = (c: number, r: number) =>
    c >= 0 && r >= 0 && c < COLS && r < ROWS ? tiles[r * COLS + c] : null

  for (const t of tiles) {
    if (t.kind !== 'lot') continue
    const id = 'lot-' + t.col + '-' + t.row
    let bank = false
    for (let dr = -1; dr <= 1; dr++)
      for (let dc = -1; dc <= 1; dc++) {
        const n = at(t.col + dc, t.row + dr)
        if (n && (n.kind === 'water' || n.kind === 'bridge')) bank = true
      }
    const nearBridge = BRIDGE_COLS.some((b) => Math.abs(t.col - b) <= 2)
    if (bank && nearBridge) t.kind = 'camp'
    else if (unit('park:' + id) < PARK_CHANCE) t.kind = 'park'
    if (t.kind === 'lot' || t.kind === 'camp') t.lotId = id
  }

  const lots: Lot[] = tiles
    .filter((t) => t.lotId)
    .map((t) => ({
      id: t.lotId!,
      col: t.col,
      row: t.row,
      districtId: t.districtId,
      camp: t.kind === 'camp',
      address:
        t.kind === 'camp'
          ? 'Under the ' + bridgeName(t.col)
          : addressFor(t.col, t.row),
    }))
  const lotById = new Map(lots.map((l) => [l.id, l]))
  const lotsByDistrict = new Map<string, Lot[]>(
    DISTRICTS.map((d) => [d.id, []]),
  )
  for (const l of lots) lotsByDistrict.get(l.districtId)!.push(l)
  return { cols: COLS, rows: ROWS, tiles, lots, lotById, lotsByDistrict }
}

function bridgeName(col: number): string {
  let nearest = BRIDGE_COLS[0]
  for (const b of BRIDGE_COLS)
    if (Math.abs(b - col) < Math.abs(nearest - col)) nearest = b
  return ['Brant Ave Bridge', 'Lorne Bridge', 'Erie Ave Bridge'][
    BRIDGE_COLS.indexOf(nearest)
  ]
}

let cached: CityLayout | null = null
/** The city is constant; build it once. */
export function cityLayout(): CityLayout {
  return (cached ??= buildCity())
}
