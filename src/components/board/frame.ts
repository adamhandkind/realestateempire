/* Where things sit on the Land Grab board, in the board picture's own units.
   Shared by the board drawing and the phone's zoomable view. */

import { TOPO } from '../../board/geometry'

export const S = 58

export const vx = (i: number) => TOPO.vertices[i].x * S
export const vy = (i: number) => TOPO.vertices[i].y * S

const ys = TOPO.vertices.map((v) => v.y * S)
/* The water around the island: a flat-topped hexagon a little larger than
   the board, which also sets the picture's frame. */
const R = S * 5.0
const SEA_PTS = Array.from({ length: 6 }, (_, i) => [Math.cos((i * Math.PI) / 3) * R, Math.sin((i * Math.PI) / 3) * R])
export const SEA = SEA_PTS.map(([x, y]) => `${x},${y}`).join(' ')
const PAD = 4
const BOX = [-R - PAD, Math.min(...ys, ...SEA_PTS.map((p) => p[1])) - PAD, 2 * (R + PAD), 0]
BOX[3] = Math.max(...ys, ...SEA_PTS.map((p) => p[1])) + PAD - BOX[1]
export const VIEW = BOX.join(' ')

/** The whole board's frame, in board units: [x, y, width, height]. */
export const BOARD_BOX = BOX as [number, number, number, number]

/** Where a spot sits on the board, in board units. */
export function spotXY(kind: 'vertex' | 'edge' | 'tile', i: number): [number, number] {
  if (kind === 'vertex') return [vx(i), vy(i)]
  if (kind === 'tile') return [TOPO.hexes[i].x * S, TOPO.hexes[i].y * S]
  const e = TOPO.edges[i]
  return [(vx(e.a) + vx(e.b)) / 2, (vy(e.a) + vy(e.b)) / 2]
}

/** A piece drawn see-through: the TV's view of someone choosing, or the
 *  spot you've tapped on your phone before you confirm. */
export interface Ghost {
  kind: 'vertex' | 'edge' | 'tile'
  i: number
  piece: 'house' | 'duplex' | 'tower' | 'street' | 'crash'
  color: string
}

