/* The city, as one screen. No zoom, no pan — the whole map is always visible,
   and every district is a button.

   Pin placement is deterministic: a property's id hashes to an offset inside a
   120x80 box around its district's label, and that box sits inside every
   polygon in data/districts.ts. No point-in-polygon needed, and a property
   never wanders between renders. */

import { useState } from 'react'
import {
  DISTRICTS,
  MAP_VIEWBOX,
  RIVER_PATH,
  districtOf,
} from '../data/districts'
import { INDIES, P6, PLAYER } from '../data/p6'
import { RIVALS } from '../data/rivals'
import {
  isLocked,
  playerShare,
  pluralityOwner,
  shareOf,
} from '../logic/territory'
import DistrictSheet from './DistrictSheet'
import type { Action, DistrictDef, GameState } from '../state/types'

const PIN_BOX = { x: 120, y: 80 }

/** Stable small hash — same id, same spot, every render. */
function hash(id: string): number {
  let h = 2166136261
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return Math.abs(h)
}

/** Centred on labelPos — that is the placement the 120x80 guarantee covers. */
function pinPos(d: DistrictDef, id: string): { x: number; y: number } {
  const h = hash(id)
  return {
    x: d.labelPos.x - PIN_BOX.x / 2 + (h % PIN_BOX.x),
    y: d.labelPos.y - PIN_BOX.y / 2 + ((h >> 8) % PIN_BOX.y),
  }
}

/** Fill and border for a district, from whoever holds the plurality. */
function fillFor(
  state: GameState,
  d: DistrictDef,
): { fill: string; opacity: number; stroke: string; width: number } {
  const owner = pluralityOwner(state, d.id)
  if (isLocked(state, d.id))
    return {
      fill: 'var(--brass)',
      opacity: 0.15 + 0.6 * (playerShare(state, d.id) / 100),
      stroke: '#e9c94a',
      width: 3,
    }
  if (owner === PLAYER)
    return {
      fill: 'var(--brass)',
      opacity: 0.15 + 0.6 * (playerShare(state, d.id) / 100),
      stroke: 'var(--ink)',
      width: 2,
    }
  const rival = RIVALS.find((r) => r.id === owner)
  if (rival)
    return {
      fill: rival.color,
      opacity: 0.12 + 0.4 * (shareOf(state, d.id, rival.id) / 100),
      stroke: 'var(--ink)',
      width: 2,
    }
  return { fill: '#232734', opacity: 1, stroke: 'var(--ink)', width: 2 }
}

export default function MapTab({
  state,
  dispatch,
}: {
  state: GameState
  dispatch: (a: Action) => void
}) {
  const [open, setOpen] = useState<string | null>(null)
  const sheet = open ? districtOf(open) : null
  const intel = state.chadwickIntel

  return (
    <div className="res-maptab">
      <div className="res-mapwrap">
        <svg
          className="res-map"
          viewBox={MAP_VIEWBOX}
          role="group"
          aria-label="The map of Brantford"
        >
          <defs>
            <pattern
              id="res-grid"
              width="40"
              height="40"
              patternUnits="userSpaceOnUse"
            >
              <path
                d="M 40 0 L 0 0 0 40"
                fill="none"
                stroke="#1b1e29"
                strokeWidth="1"
              />
            </pattern>
          </defs>
          <rect width="1000" height="700" fill="var(--ink)" />
          <rect width="1000" height="700" fill="url(#res-grid)" />

          {/* the Grand River, under everything */}
          <path
            d={RIVER_PATH}
            fill="none"
            stroke="#2b3140"
            strokeWidth="34"
            opacity="0.9"
          />
          <path
            d={RIVER_PATH}
            fill="none"
            stroke="#3a4256"
            strokeWidth="12"
            opacity="0.9"
          />

          {DISTRICTS.map((d) => {
            const f = fillFor(state, d)
            const locked = isLocked(state, d.id)
            const mine = playerShare(state, d.id)
            return (
              <g
                key={d.id}
                className="res-district"
                tabIndex={0}
                role="button"
                aria-label={
                  d.name + ', your share ' + mine.toFixed(1) + ' percent'
                }
                onClick={() => setOpen(d.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    setOpen(d.id)
                  }
                }}
              >
                <polygon
                  points={d.polygon}
                  fill={f.fill}
                  fillOpacity={f.opacity}
                  stroke={f.stroke}
                  strokeWidth={f.width}
                />
                <text
                  className="res-dlabel"
                  x={d.labelPos.x}
                  y={d.labelPos.y}
                  textAnchor="middle"
                >
                  {d.name}
                </text>
                {locked && (
                  <text
                    className="res-crown"
                    x={d.labelPos.x}
                    y={d.labelPos.y - 20}
                    textAnchor="middle"
                  >
                    ♛
                  </text>
                )}
                <text
                  className="res-dshare"
                  x={d.labelPos.x}
                  y={d.labelPos.y + 17}
                  textAnchor="middle"
                >
                  {mine.toFixed(1)}%
                </text>

                {/* Chadwick's leaked farming schedule */}
                {intel?.district === d.id && (
                  <circle
                    className="res-intel"
                    cx={d.labelPos.x}
                    cy={d.labelPos.y + 40}
                    r="10"
                    fill="none"
                    stroke="#8b1e3f"
                    strokeWidth="3"
                  />
                )}
              </g>
            )
          })}

          {/* market pool listings — hollow marble */}
          {state.marketPool.map((l) => {
            const d = districtOf(l.districtId)
            if (!d) return null
            const p = pinPos(d, l.id)
            return (
              <circle
                key={l.id}
                cx={p.x}
                cy={p.y}
                r="6"
                fill="none"
                stroke="var(--marble)"
                strokeWidth="1.5"
                opacity="0.7"
              >
                <title>For sale in {d.name}</title>
              </circle>
            )
          })}

          {/* your doors — solid brass, the VRBO wears a gear */}
          {state.properties.map((prop) => {
            const d = districtOf(prop.districtId)
            if (!d) return null
            const p = pinPos(d, prop.id)
            return (
              <g key={prop.id}>
                <circle
                  cx={p.x}
                  cy={p.y}
                  r="7"
                  fill={prop.isVrbo ? '#e9c94a' : 'var(--brass)'}
                  stroke="var(--ink)"
                  strokeWidth="1.5"
                >
                  <title>
                    {prop.nickname} — {d.name}
                  </title>
                </circle>
                {prop.isVrbo && (
                  <text className="res-vrbopin" x={p.x} y={p.y + 4} textAnchor="middle">
                    ⚙
                  </text>
                )}
              </g>
            )
          })}
        </svg>
      </div>

      <div className="res-maplegend">
        <span>
          <b style={{ background: 'var(--brass)' }} />
          You
        </span>
        {RIVALS.map((r) => (
          <span key={r.id}>
            <b style={{ background: r.color }} />
            {r.name}
          </span>
        ))}
        <span>
          <b style={{ background: '#232734' }} />
          Independents
        </span>
      </div>

      {intel && (
        <div className="res-banner">
          🍐 The Sterling schedule says {districtOf(intel.district)?.name} next
          week. The card was not meant to include that.
        </div>
      )}

      <div className="res-panel dark">
        <div className="res-line">
          <span>Districts with presence ({P6.THRESH_PRESENCE}%+)</span>
          <b>
            {DISTRICTS.filter((d) => playerShare(state, d.id) >= P6.THRESH_PRESENCE)
              .length}{' '}
            / 8
          </b>
        </div>
        <div className="res-line">
          <span>Dominant ({P6.THRESH_DOMINANT}%+)</span>
          <b>
            {DISTRICTS.filter((d) => playerShare(state, d.id) >= P6.THRESH_DOMINANT)
              .length}{' '}
            / {P6.KING_REQUIREMENT}
          </b>
        </div>
        <div className="res-line">
          <span>Held by independents</span>
          <b>
            {
              DISTRICTS.filter((d) => pluralityOwner(state, d.id) === INDIES)
                .length
            }{' '}
            / 8
          </b>
        </div>
      </div>

      {sheet && (
        <DistrictSheet
          state={state}
          dispatch={dispatch}
          district={sheet}
          onClose={() => setOpen(null)}
        />
      )}
    </div>
  )
}
