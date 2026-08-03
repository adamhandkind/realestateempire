import { useState } from 'react'
import { P3 } from '../../data/p3'
import { hasFreeMortgageSlot } from '../../logic/portfolio'
import { money } from '../../logic/rand'
import type { GameState } from '../../state/types'

export default function BuyModal({
  state,
  askPrice,
  title,
  blurb,
  onCancel,
  onBuy,
}: {
  state: GameState
  askPrice: number
  title: string
  blurb: string
  onCancel: () => void
  onBuy: (downPct: number) => void
}) {
  const [downPct, setDownPct] = useState<number>(P3.DOWN_MIN)
  const down = Math.round(askPrice * downPct)
  const balance = askPrice - down
  const interest = Math.round(balance * P3.MORTGAGE_WEEKLY_RATE)
  const financed = downPct < 1
  const noSlot = financed && !hasFreeMortgageSlot(state)
  const broke = state.cash < down
  const reason = noSlot
    ? 'Every mortgage slot is spoken for.'
    : broke
      ? "You can't cover the down payment."
      : null

  return (
    <div className="res-modal">
      <div className="res-card">
        <h2 className="res-display">{title}</h2>
        <p className="res-blurb">{blurb}</p>
        <div className="res-line">
          <span>Ask price</span>
          <b>{money(askPrice)}</b>
        </div>
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
          <span>Down</span>
          <b>{money(down)}</b>
        </div>
        <div className="res-line">
          <span>Mortgage balance</span>
          <b>{money(balance)}</b>
        </div>
        <div className="res-line">
          <span>Weekly interest</span>
          <b>{money(interest)}</b>
        </div>
        <div className="res-line">
          <span>Cash after</span>
          <b>{money(state.cash - down)}</b>
        </div>
        {reason && <p className="res-warn">{reason}</p>}
        <button
          className="res-go"
          disabled={!!reason}
          onClick={() => onBuy(downPct)}
        >
          Buy it
        </button>
        <button className="res-tab" onClick={onCancel}>
          Walk away
        </button>
      </div>
    </div>
  )
}
