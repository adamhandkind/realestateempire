/* The board's shape: 19 pointy-top hexes (radius 2), their 54 corners
   (where houses go) and 72 sides (where streets go). Fixed for every game,
   so it's worked out once; a BoardState only stores what's on it. */

export interface HexDef {
  q: number
  r: number
  x: number
  y: number
  /** Corner vertex indexes, clockwise from the top-right. */
  vertices: number[]
}

export interface VertexDef {
  x: number
  y: number
  hexes: number[]
  edges: number[]
  /** Vertices one street away. */
  adj: number[]
}

export interface EdgeDef {
  a: number
  b: number
  hexes: number[]
}

export interface Topology {
  hexes: HexDef[]
  vertices: VertexDef[]
  edges: EdgeDef[]
}

const SQRT3 = Math.sqrt(3)

function build(): Topology {
  const hexes: HexDef[] = []
  for (let r = -2; r <= 2; r++)
    for (let q = -2; q <= 2; q++) {
      if (Math.abs(q + r) > 2) continue
      hexes.push({ q, r, x: SQRT3 * (q + r / 2), y: 1.5 * r, vertices: [] })
    }

  const vertices: VertexDef[] = []
  const vKey = new Map<string, number>()
  for (let hi = 0; hi < hexes.length; hi++) {
    const hx = hexes[hi]
    for (let i = 0; i < 6; i++) {
      const a = ((60 * i - 30) * Math.PI) / 180
      const x = hx.x + Math.cos(a)
      const y = hx.y + Math.sin(a)
      const k = Math.round(x * 1000) + ',' + Math.round(y * 1000)
      let vi = vKey.get(k)
      if (vi === undefined) {
        vi = vertices.length
        vKey.set(k, vi)
        vertices.push({ x, y, hexes: [], edges: [], adj: [] })
      }
      vertices[vi].hexes.push(hi)
      hx.vertices.push(vi)
    }
  }

  const edges: EdgeDef[] = []
  const eKey = new Map<string, number>()
  for (let hi = 0; hi < hexes.length; hi++) {
    const vs = hexes[hi].vertices
    for (let i = 0; i < 6; i++) {
      const a = Math.min(vs[i], vs[(i + 1) % 6])
      const b = Math.max(vs[i], vs[(i + 1) % 6])
      const k = a + '-' + b
      let ei = eKey.get(k)
      if (ei === undefined) {
        ei = edges.length
        eKey.set(k, ei)
        edges.push({ a, b, hexes: [] })
        vertices[a].edges.push(ei)
        vertices[b].edges.push(ei)
        vertices[a].adj.push(b)
        vertices[b].adj.push(a)
      }
      edges[ei].hexes.push(hi)
    }
  }
  return { hexes, vertices, edges }
}

export const TOPO: Topology = build()

/** Neighbouring tiles of a tile. */
export function hexNeighbours(i: number): number[] {
  const h = TOPO.hexes[i]
  const dirs = [
    [1, 0],
    [1, -1],
    [0, -1],
    [-1, 0],
    [-1, 1],
    [0, 1],
  ]
  const out: number[] = []
  for (const [dq, dr] of dirs) {
    const j = TOPO.hexes.findIndex((o) => o.q === h.q + dq && o.r === h.r + dr)
    if (j >= 0) out.push(j)
  }
  return out
}
