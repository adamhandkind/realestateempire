/* Getting around the city: where an agent can walk, the way there, and the
   straight runs of road the traffic drives. Pure and deterministic, from the
   layout alone. */

import { COLS, ROWS, isRoadCol, isRoadRow, type CityLayout, type TileKind } from './layout'

export type Tile = [col: number, row: number]

/** Top of what you stand on, per tile kind (matches cityMesh). */
export const GROUND_Y: Record<TileKind, number> = {
  road: -0.01,
  bridge: 0.16,
  lot: 0.03,
  camp: 0.03,
  park: 0.03,
  water: -0.2,
}

export const tileAt = (city: CityLayout, c: number, r: number) =>
  c >= 0 && r >= 0 && c < COLS && r < ROWS ? city.tiles[r * COLS + c] : null

export const walkable = (city: CityLayout, c: number, r: number): boolean => {
  const t = tileAt(city, c, r)
  return !!t && t.kind !== 'water'
}

/** Cutting across a lawn is allowed, but agents prefer the street. */
const stepCost = (kind: TileKind) => (kind === 'road' || kind === 'bridge' ? 1 : 3)

/** The cheapest walk from one tile to another, both ends included, or null
 *  when there's no way (water). Dijkstra on the grid, four ways. */
export function findPath(city: CityLayout, from: Tile, to: Tile): Tile[] | null {
  if (!walkable(city, ...from) || !walkable(city, ...to)) return null
  const n = COLS * ROWS
  const start = from[1] * COLS + from[0]
  const goal = to[1] * COLS + to[0]
  const dist = new Float64Array(n).fill(Infinity)
  const prev = new Int32Array(n).fill(-1)
  const heap: [number, number][] = []
  const push = (d: number, i: number) => {
    heap.push([d, i])
    let k = heap.length - 1
    while (k > 0) {
      const p = (k - 1) >> 1
      if (heap[p][0] <= heap[k][0]) break
      ;[heap[p], heap[k]] = [heap[k], heap[p]]
      k = p
    }
  }
  const pop = (): [number, number] => {
    const top = heap[0]
    const last = heap.pop()!
    if (heap.length) {
      heap[0] = last
      let k = 0
      for (;;) {
        const l = 2 * k + 1
        const r = l + 1
        let m = k
        if (l < heap.length && heap[l][0] < heap[m][0]) m = l
        if (r < heap.length && heap[r][0] < heap[m][0]) m = r
        if (m === k) break
        ;[heap[m], heap[k]] = [heap[k], heap[m]]
        k = m
      }
    }
    return top
  }
  dist[start] = 0
  push(0, start)
  while (heap.length) {
    const [d, i] = pop()
    if (d > dist[i]) continue
    if (i === goal) break
    const c = i % COLS
    const r = (i - c) / COLS
    for (const [dc, dr] of DIRS) {
      const nc = c + dc
      const nr = r + dr
      const t = tileAt(city, nc, nr)
      if (!t || t.kind === 'water') continue
      const j = nr * COLS + nc
      const nd = d + stepCost(t.kind)
      if (nd < dist[j]) {
        dist[j] = nd
        prev[j] = i
        push(nd, j)
      }
    }
  }
  if (dist[goal] === Infinity) return null
  const out: Tile[] = []
  for (let i = goal; i !== -1; i = prev[i]) out.push([i % COLS, Math.floor(i / COLS)])
  return out.reverse()
}

const DIRS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
] as const

/** A straight stretch of road (bridges included) that a car can drive end to
 *  end. `along` is the axis it runs on; `at` the road's row or column. */
export interface RoadRun {
  along: 'col' | 'row'
  at: number
  from: number
  to: number
}

const driveable = (k: TileKind | undefined) => k === 'road' || k === 'bridge'

export function roadRuns(city: CityLayout, minLength = 4): RoadRun[] {
  const runs: RoadRun[] = []
  const scan = (along: 'col' | 'row', at: number, len: number, kind: (i: number) => TileKind | undefined) => {
    let start = -1
    for (let i = 0; i <= len; i++) {
      const ok = i < len && driveable(kind(i))
      if (ok && start < 0) start = i
      if (!ok && start >= 0) {
        if (i - 1 - start + 1 >= minLength) runs.push({ along, at, from: start, to: i - 1 })
        start = -1
      }
    }
  }
  /* East-west roads: a row, driven along its columns. */
  for (let r = 0; r < ROWS; r++) if (isRoadRow(r)) scan('row', r, COLS, (c) => tileAt(city, c, r)?.kind)
  for (let c = 0; c < COLS; c++) if (isRoadCol(c)) scan('col', c, ROWS, (r) => tileAt(city, c, r)?.kind)
  return runs
}

/** Road intersections, where the street lamps stand. */
export function crossings(city: CityLayout): Tile[] {
  const out: Tile[] = []
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++) if (isRoadRow(r) && isRoadCol(c) && tileAt(city, c, r)?.kind === 'road') out.push([c, r])
  return out
}
