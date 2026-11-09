/* Opening a listing: in single player you buy it at the asking price; in a
   shared city you make a sealed offer that settles at the overnight tick. */

import type { Action, GameState, Listing } from '../../state/types'
import { labelOf } from '../../logic/portfolio'
import { useCity } from '../online/cityContext'
import BuyModal from './BuyModal'
import OfferModal from './OfferModal'

export default function ListingDeal({
  state,
  listing,
  dispatch,
  onDone,
}: {
  state: GameState
  listing: Listing
  dispatch: (a: Action) => void
  onDone: () => void
}) {
  const city = useCity()
  if (city) return <OfferModal state={state} listing={listing} city={city} onDone={onDone} />
  return (
    <BuyModal
      state={state}
      askPrice={listing.askPrice}
      title={labelOf(listing.typeId)}
      blurb={listing.blurb}
      onCancel={onDone}
      onBuy={(downPct) => {
        dispatch({ type: 'BUY_PROPERTY', listingId: listing.id, downPct })
        onDone()
      }}
    />
  )
}
