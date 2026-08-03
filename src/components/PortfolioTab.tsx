import { useState } from 'react'
import { P3 } from '../data/p3'
import {
  labelOf,
  mortgageSlots,
  netWorth,
  occupiedUnitCount,
  usedMortgageSlots,
} from '../logic/portfolio'
import { money } from '../logic/rand'
import type { Action, GameState } from '../state/types'
import BuyModal from './portfolio/BuyModal'
import ListingCard from './portfolio/ListingCard'
import PropertyCard from './portfolio/PropertyCard'

export default function PortfolioTab({
  state,
  dispatch,
}: {
  state: GameState
  dispatch: (a: Action) => void
}) {
  const [view, setView] = useState<'market' | 'owned'>('market')
  const [buying, setBuying] = useState<string | null>(null)
  const listing = state.marketPool.find((l) => l.id === buying)

  return (
    <section>
      <div className="res-hrow">
        <div>
          <div className="res-meta">Net worth</div>
          <div className="res-display res-brass">{money(netWorth(state))}</div>
        </div>
        <div className="res-meta">
          Mortgages {usedMortgageSlots(state)}/{mortgageSlots(state)}
        </div>
        <button
          className={'res-tab' + (state.propCoActive ? ' on' : '')}
          onClick={() => dispatch({ type: 'TOGGLE_PROPCO' })}
        >
          PropCo {state.propCoActive ? 'ON' : 'OFF'} ·{' '}
          {money(P3.PROPCO_PER_UNIT)}/unit/wk
          {!state.propCoActive &&
          occupiedUnitCount(state) < P3.PROPCO_MIN_OCCUPIED_UNITS
            ? ' (needs 3 occupied units)'
            : ''}
        </button>
      </div>

      <nav className="res-tabs">
        <button
          className={'res-tab' + (view === 'market' ? ' on' : '')}
          onClick={() => setView('market')}
        >
          Market
        </button>
        <button
          className={'res-tab' + (view === 'owned' ? ' on' : '')}
          onClick={() => setView('owned')}
        >
          Owned ({state.properties.length})
        </button>
      </nav>

      {view === 'market' && (
        <div className="res-grid">
          {state.marketPool.length === 0 && (
            <p className="res-blurb">
              Nothing is for sale to someone at your level. Get licensed to
              list, then come back and buy the block.
            </p>
          )}
          {state.marketPool.map((l) => (
            <ListingCard
              key={l.id}
              state={state}
              listing={l}
              onOpen={() => setBuying(l.id)}
            />
          ))}
        </div>
      )}

      {view === 'owned' && (
        <div className="res-grid">
          {state.properties.length === 0 && (
            <p className="res-blurb">
              You own nothing. The market tab is right there, quietly judging
              you.
            </p>
          )}
          {state.properties.map((p) => (
            <PropertyCard
              key={p.id}
              state={state}
              property={p}
              dispatch={dispatch}
            />
          ))}
        </div>
      )}

      {listing && (
        <BuyModal
          state={state}
          askPrice={listing.askPrice}
          title={labelOf(listing.typeId)}
          blurb={listing.blurb}
          onCancel={() => setBuying(null)}
          onBuy={(downPct) => {
            dispatch({ type: 'BUY_PROPERTY', listingId: listing.id, downPct })
            setBuying(null)
          }}
        />
      )}
    </section>
  )
}
