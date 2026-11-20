/* The Land Grab board: 19 hex tiles, streets on the sides, buildings on the
   corners, the Market Crash token, and glowing spots for whatever you can
   click right now. Drawing only: the parent decides what's clickable. */

import { PIPS, TERRAIN_INFO } from '../../board/data'
import { TOPO } from '../../board/geometry'
import type { BoardView, BuildingKind } from '../../board/types'

const S = 58

const vx = (i: number) => TOPO.vertices[i].x * S
const vy = (i: number) => TOPO.vertices[i].y * S

const ys = TOPO.vertices.map((v) => v.y * S)
/* The water around the island: a flat-topped hexagon a little larger than
   the board, which also sets the picture's frame. */
const R = S * 5.0
const SEA_PTS = Array.from({ length: 6 }, (_, i) => [Math.cos((i * Math.PI) / 3) * R, Math.sin((i * Math.PI) / 3) * R])
const SEA = SEA_PTS.map(([x, y]) => `${x},${y}`).join(' ')
const PAD = 4
const BOX = [-R - PAD, Math.min(...ys, ...SEA_PTS.map((p) => p[1])) - PAD, 2 * (R + PAD), 0]
BOX[3] = Math.max(...ys, ...SEA_PTS.map((p) => p[1])) + PAD - BOX[1]
const VIEW = BOX.join(' ')

export interface Clickable {
  vertices?: number[]
  edges?: number[]
  tiles?: number[]
  onVertex?: (v: number) => void
  onEdge?: (e: number) => void
  onTile?: (t: number) => void
}

function Building({ kind, x, y, color }: { kind: BuildingKind; x: number; y: number; color: string }) {
  const stroke = { stroke: '#14161f', strokeWidth: 1.6, strokeLinejoin: 'round' as const }
  if (kind === 'house')
    return <path d={`M${x - 10},${y + 9} v-10 l10,-9 l10,9 v10 z`} fill={color} {...stroke} />
  if (kind === 'duplex')
    return (
      <g>
        <path d={`M${x - 15},${y + 9} v-10 l8,-7 l7,6 l7,-6 l8,7 v10 z`} fill={color} {...stroke} />
        <line x1={x} y1={y - 1} x2={x} y2={y + 9} stroke="#14161f" strokeWidth={1.2} />
      </g>
    )
  return (
    <g>
      <rect x={x - 8} y={y - 17} width={16} height={26} rx={1.5} fill={color} {...stroke} />
      {[-11, -5, 1].map((dy) => (
        <g key={dy}>
          <rect x={x - 5} y={y + dy} width={3.5} height={3} fill="#14161f" opacity={0.55} />
          <rect x={x + 1.5} y={y + dy} width={3.5} height={3} fill="#14161f" opacity={0.55} />
        </g>
      ))}
    </g>
  )
}

export default function BoardSvg({ view, click }: { view: BoardView; click: Clickable }) {
  const vSet = new Set(click.vertices ?? [])
  const eSet = new Set(click.edges ?? [])
  const tSet = new Set(click.tiles ?? [])
  const color = (seat: number) => view.seats[seat]?.color ?? '#999'

  return (
    <svg className="lg-board" viewBox={VIEW} role="img" aria-label="Land Grab board">
      <defs>
        <radialGradient id="lg-sea" cx="50%" cy="50%" r="60%">
          <stop offset="0%" stopColor="#2b4a68" />
          <stop offset="100%" stopColor="#1a2b3f" />
        </radialGradient>
      </defs>
      <polygon points={SEA} fill="url(#lg-sea)" stroke="#c9a227" strokeOpacity={0.35} strokeWidth={2} strokeLinejoin="round" />

      {TOPO.hexes.map((h, i) => {
        const t = view.tiles[i]
        if (!t) return null
        const info = TERRAIN_INFO[t.terrain]
        const pts = h.vertices.map((v) => `${vx(v)},${vy(v)}`).join(' ')
        const cx = h.x * S
        const cy = h.y * S
        const hot = t.number === 6 || t.number === 8
        const pickable = tSet.has(i)
        return (
          <g
            key={i}
            className={'lg-tile' + (pickable ? ' pick' : '')}
            onClick={pickable ? () => click.onTile?.(i) : undefined}
          >
            <polygon points={pts} fill={info.fill} stroke="#f5f2ea" strokeWidth={2.5} strokeOpacity={0.85} />
            <text x={cx} y={cy - 17} textAnchor="middle" fontSize={20} className="lg-emoji">
              {info.icon}
            </text>
            {t.number !== null && (
              <g>
                <circle cx={cx} cy={cy + 10} r={14} fill="#f5f2ea" stroke="#14161f" strokeOpacity={0.3} />
                <text
                  x={cx}
                  y={cy + 14}
                  textAnchor="middle"
                  fontSize={14}
                  fontWeight={800}
                  fill={hot ? '#c8372d' : '#14161f'}
                  fontFamily="Archivo Black, Impact, sans-serif"
                >
                  {t.number}
                </text>
                <g fill={hot ? '#c8372d' : '#14161f'}>
                  {Array.from({ length: PIPS[t.number] ?? 0 }, (_, k) => (
                    <circle key={k} cx={cx + (k - ((PIPS[t.number!] ?? 1) - 1) / 2) * 3.4} cy={cy + 19} r={1.1} />
                  ))}
                </g>
              </g>
            )}
            {view.crash === i && (
              <g className="lg-crash">
                <circle cx={cx + 22} cy={cy - 2} r={13} fill="#14161f" stroke="#c8372d" strokeWidth={2} />
                <text x={cx + 22} y={cy + 4} textAnchor="middle" fontSize={15}>
                  📉
                </text>
              </g>
            )}
            {pickable && <polygon points={pts} className="lg-tile-glow" />}
          </g>
        )
      })}

      {TOPO.edges.map((e, i) => {
        const owner = view.streets[i]
        const pickable = eSet.has(i)
        if (owner === undefined && !pickable) return null
        const x1 = vx(e.a)
        const y1 = vy(e.a)
        const x2 = vx(e.b)
        const y2 = vy(e.b)
        /* Pull the ends in a touch so the corners stay readable. */
        const k = 0.16
        const ax = x1 + (x2 - x1) * k
        const ay = y1 + (y2 - y1) * k
        const bx = x2 - (x2 - x1) * k
        const by = y2 - (y2 - y1) * k
        if (owner !== undefined)
          return (
            <g key={'e' + i}>
              <line x1={ax} y1={ay} x2={bx} y2={by} stroke="#14161f" strokeWidth={9} strokeLinecap="round" />
              <line x1={ax} y1={ay} x2={bx} y2={by} stroke={color(owner)} strokeWidth={6} strokeLinecap="round" />
            </g>
          )
        return (
          <g key={'e' + i} className="lg-spot" onClick={() => click.onEdge?.(i)}>
            <line x1={ax} y1={ay} x2={bx} y2={by} stroke="transparent" strokeWidth={16} />
            <line x1={ax} y1={ay} x2={bx} y2={by} className="lg-spot-line" strokeWidth={6} strokeLinecap="round" />
          </g>
        )
      })}

      {TOPO.vertices.map((_, i) => {
        const b = view.buildings[i]
        const pickable = vSet.has(i)
        if (!b && !pickable) return null
        return (
          <g key={'v' + i} className={pickable ? 'lg-spot' : undefined} onClick={pickable ? () => click.onVertex?.(i) : undefined}>
            {b && <Building kind={b.kind} x={vx(i)} y={vy(i)} color={color(b.seat)} />}
            {pickable && (
              <>
                <circle cx={vx(i)} cy={vy(i)} r={14} fill="transparent" />
                <circle cx={vx(i)} cy={vy(i)} r={b ? 13 : 7} className="lg-spot-dot" />
              </>
            )}
          </g>
        )
      })}
    </svg>
  )
}
