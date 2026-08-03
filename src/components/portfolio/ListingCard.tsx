import { districtOrFirst } from '../../data/districts'
import { labelOf } from '../../logic/portfolio'
import { money } from '../../logic/rand'
import type { GameState, Listing } from '../../state/types'

export default function ListingCard({
  state,
  listing,
  onOpen,
}: {
  state: GameState
  listing: Listing
  onOpen: () => void
}) {
  const handyman = listing.condition < 50
  return (
    <div className="res-card res-listing">
      {state.crash.weeksLeft > 0 && (
        <div className="res-ribbon">CRASH PRICING</div>
      )}
      <h3>{labelOf(listing.typeId)}</h3>
      <div className="res-meta">{districtOrFirst(listing.districtId).name}</div>
      <p className="res-blurb">{listing.blurb}</p>
      <div className="res-bar" aria-label="condition">
        <i
          style={{ width: listing.condition + '%' }}
          className={handyman ? 'low' : ''}
        />
      </div>
      {handyman && <span className="res-chip warn">handyman special</span>}
      <div className="res-line">
        <span>Ask</span>
        <b>{money(listing.askPrice)}</b>
      </div>
      <button className="res-go" onClick={onOpen}>
        Financing preview
      </button>
    </div>
  )
}
