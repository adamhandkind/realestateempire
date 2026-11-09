/* A sealed offer on a city listing. Nothing happens until the overnight
   tick: then the best offer wins a bidding war, and a lone offer under ask
   is up to the seller (who is proud in summer and desperate in winter). */

import { useState } from 'react'
import { AUCTION } from '../../data/city'
import { P3 } from '../../data/p3'
import { acceptChance } from '../../citygame/city'
import { SEASON_LABEL, seasonOf } from '../../city/season'
import { eligibleTypes, hasFreeMortgageSlot, labelOf } from '../../logic/portfolio'
import { money } from '../../logic/rand'
import type { GameState, Listing } from '../../state/types'
import type { CityUi } from '../online/cityContext'

const SOURCE: Record<string, string> = {
  bank: 'Bank auction · sold as-is',
  foreclosure: 'Foreclosure · bank-owned',
  market: '',
}

/** How the seller feels about a lone offer, in words, never a percentage. */
function sellerMood(p: number): string {
  if (p >= 1) return 'At or over ask. If nobody beats you, it’s yours.'
  if (p >= 0.75) return 'A little under. The seller will probably grumble and sign.'
  if (p >= 0.4) return 'Under ask. Coin-flip territory with this seller.'
  if (p > 0) return 'Well under. The seller may read it aloud at dinner, for laughs.'
  return 'This is not an offer. This is a dare.'
}

export default function OfferModal({
  state,
  listing,
  city,
  onDone,
}: {
  state: GameState
  listing: Listing
  city: CityUi
  onDone: () => void
}) {
  const lv = city.view.listings.find((l) => l.id === listing.id)
  const ask = listing.askPrice
  const [amount, setAmount] = useState<number>(lv?.myBid?.amount ?? ask)
  const [downPct, setDownPct] = useState<number>(lv?.myBid?.downPct ?? P3.DOWN_MIN)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const down = Math.round(amount * downPct)
  const balance = amount - down
  const financed = downPct < 1
  const locked = !eligibleTypes(state).some((t) => t.id === listing.typeId)
  const running = city.view.status === 'running'
  const reason = !running
    ? 'The season hasn’t started yet.'
    : locked
      ? 'Your rank can’t buy a ' + labelOf(listing.typeId).toLowerCase() + ' yet.'
      : financed && !hasFreeMortgageSlot(state)
        ? 'Every mortgage slot is spoken for.'
        : state.cash < down
          ? "You can't cover the down payment on that."
          : null
  const others = (lv?.bids ?? 0) - (lv?.myBid ? 1 : 0)
  const season = seasonOf(city.view.week)

  const submit = async () => {
    setBusy(true)
    setError(null)
    const e = await city.bid(listing.id, amount, downPct)
    setBusy(false)
    if (e) setError(e)
    else onDone()
  }
  const withdraw = async () => {
    setBusy(true)
    const e = await city.withdraw(listing.id)
    setBusy(false)
    if (e) setError(e)
    else onDone()
  }

  const lo = Math.ceil((ask * AUCTION.MIN_BID) / 1000) * 1000
  const hi = Math.round((ask * 1.5) / 1000) * 1000

  return (
    <div className="res-modal" onClick={onDone}>
      <div className="res-card" onClick={(e) => e.stopPropagation()}>
        <div className="res-meta">{SEASON_LABEL[season]}</div>
        <h2 className="res-display">{labelOf(listing.typeId)}</h2>
        {SOURCE[(listing as { source?: string }).source ?? 'market'] && (
          <div className="res-chip warn">{SOURCE[(listing as { source?: string }).source ?? 'market']}</div>
        )}
        <p className="res-blurb">{listing.blurb}</p>
        <div className="res-line">
          <span>Ask price</span>
          <b>{money(ask)}</b>
        </div>
        <div className="res-line">
          <span>Other offers</span>
          <b>{others <= 0 ? 'None yet' : others === 1 ? 'One, sealed' : others + ', sealed'}</b>
        </div>
        <label className="res-slider-row">
          <span>Your offer · {money(amount)}</span>
          <input
            type="range"
            min={lo}
            max={hi}
            step={1000}
            value={amount}
            onChange={(e) => setAmount(Number(e.target.value))}
          />
        </label>
        <p className="res-debug-note" style={{ marginTop: 2 }}>
          {others > 0
            ? 'Bidding war: the best offer at the tick wins, if it’s anywhere near ask.'
            : sellerMood(acceptChance(amount, ask, city.view.week))}
        </p>
        <label className="res-slider-row">
          <span>Down payment · {Math.round(downPct * 100)}%</span>
          <input
            type="range"
            min={P3.DOWN_MIN * 100}
            max={100}
            step={P3.DOWN_STEP * 100}
            value={downPct * 100}
            onChange={(e) => setDownPct(Number(e.target.value) / 100)}
          />
        </label>
        <div className="res-line">
          <span>Down at closing</span>
          <b>{money(down)}</b>
        </div>
        <div className="res-line">
          <span>Mortgage</span>
          <b>{money(balance)}</b>
        </div>
        <p className="res-debug-note">
          Nothing is spent now. The money moves at the overnight tick, if you win and can still cover it.
        </p>
        {reason && <p className="res-warn">{reason}</p>}
        {error && <div className="res-err">{error}</div>}
        <button className="res-go" disabled={!!reason || busy} onClick={submit}>
          {lv?.myBid ? 'Change my offer' : 'Make the offer'}
        </button>
        {lv?.myBid && (
          <button className="res-tab" disabled={busy} onClick={withdraw}>
            Withdraw my {money(lv.myBid.amount)} offer
          </button>
        )}
        <button className="res-tab" onClick={onDone}>
          Walk away
        </button>
      </div>
    </div>
  )
}
