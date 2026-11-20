/* The Land Grab board: 19 hex tiles, streets on the sides, buildings on the
   corners, the Market Crash token, and glowing spots for whatever you can
   click right now. Drawing only: the parent decides what's clickable. */

import { PIPS, TERRAIN_INFO } from '../../board/data'
import { TOPO } from '../../board/geometry'
import type { BoardView, BuildingKind } from '../../board/types'
import { S, SEA, VIEW, spotXY, vx, vy, type Ghost } from './frame'

export type { Ghost } from './frame'
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

function GhostPiece({ g }: { g: Ghost }) {
  if (g.kind === 'edge') {
    const e = TOPO.edges[g.i]
    return (
      <g className="lg-ghost">
        <line x1={vx(e.a)} y1={vy(e.a)} x2={vx(e.b)} y2={vy(e.b)} stroke="#fff" strokeWidth={12} strokeLinecap="round" />
        <line x1={vx(e.a)} y1={vy(e.a)} x2={vx(e.b)} y2={vy(e.b)} stroke={g.color} strokeWidth={7} strokeLinecap="round" />
      </g>
    )
  }
  const [x, y] = spotXY(g.kind, g.i)
  if (g.kind === 'tile')
    return (
      <g className="lg-ghost">
        <circle cx={x} cy={y} r={30} fill="none" stroke={g.color} strokeWidth={5} />
        <circle cx={x + 22} cy={y - 2} r={13} fill="#14161f" stroke="#c8372d" strokeWidth={2} />
        <text x={x + 22} y={y + 4} textAnchor="middle" fontSize={15}>
          📉
        </text>
      </g>
    )
  return (
    <g className="lg-ghost">
      <circle cx={x} cy={y} r={21} fill="none" stroke="#fff" strokeWidth={3} />
      <Building kind={g.piece === 'street' || g.piece === 'crash' ? 'house' : g.piece} x={x} y={y} color={g.color} />
    </g>
  )
}

export default function BoardSvg({
  view,
  click,
  ghost,
  touch,
  frame,
}: {
  view: BoardView
  click: Clickable
  ghost?: Ghost | null
  /** Bigger invisible hit areas, for thumbs. */
  touch?: boolean
  /** Show only this part of the board ([x, y, w, h]): the phone's zoom. */
  frame?: [number, number, number, number]
}) {
  const hitV = touch ? 26 : 14
  const hitE = touch ? 34 : 16
  const vSet = new Set(click.vertices ?? [])
  const eSet = new Set(click.edges ?? [])
  const tSet = new Set(click.tiles ?? [])
  const color = (seat: number) => view.seats[seat]?.color ?? '#999'

  return (
    <svg className="lg-board" viewBox={frame ? frame.join(' ') : VIEW} role="img" aria-label="Land Grab board">
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
            <line x1={ax} y1={ay} x2={bx} y2={by} stroke="transparent" strokeWidth={hitE} />
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
                <circle cx={vx(i)} cy={vy(i)} r={hitV} fill="transparent" />
                <circle cx={vx(i)} cy={vy(i)} r={b ? 13 : 7} className="lg-spot-dot" />
              </>
            )}
          </g>
        )
      })}
      {ghost && <GhostPiece g={ghost} />}
    </svg>
  )
}
