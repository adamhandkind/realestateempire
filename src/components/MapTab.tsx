/* The City tab: the isometric 3D city (components/city), lazy-loaded with
   three.js, plus a short territory scoreboard underneath. */

import { lazy, Suspense } from 'react'
import { DISTRICTS, districtOf } from '../data/districts'
import { INDIES, P6 } from '../data/p6'
import { playerShare, pluralityOwner } from '../logic/territory'
import type { Action, GameState } from '../state/types'

const CityView = lazy(() => import('./city/CityView'))

export default function MapTab({
  state,
  dispatch,
}: {
  state: GameState
  dispatch: (a: Action) => void
}) {
  const intel = state.chadwickIntel

  return (
    <div className="res-maptab">
      <Suspense
        fallback={
          <div className="res-city res-city-loading">
            Pouring the foundations…
          </div>
        }
      >
        <CityView state={state} dispatch={dispatch} />
      </Suspense>

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
    </div>
  )
}
