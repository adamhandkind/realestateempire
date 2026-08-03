import type { Dispatch } from 'react'
import {
  SLOTS,
  SWAG,
  canAfford,
  isEquipped,
  isOwned,
  isSwagLocked,
  rankOf,
} from '../logic/economy'
import { money } from '../logic/rand'
import type { Action, GameState, SwagItem } from '../state/types'

function StatChips({ it }: { it: SwagItem }) {
  return (
    <div>
      {it.hustle ? <span className="res-stat">HUS +{it.hustle}</span> : null}
      {it.swagger ? <span className="res-stat">SWA +{it.swagger}</span> : null}
      {it.ego ? <span className="res-stat e">EGO +{it.ego}</span> : null}
      {it.upkeep ? (
        <span className="res-stat">{money(it.upkeep)}/wk</span>
      ) : null}
    </div>
  )
}

export default function ClosetTab({
  state,
  dispatch,
}: {
  state: GameState
  dispatch: Dispatch<Action>
}) {
  return (
    <div className="res-panel dark">
      <h3 className="res-h2 res-display">The Closet</h3>
      {SLOTS.map((slot) => (
        <div key={slot.id} style={{ marginBottom: 16 }}>
          <div className="res-meta" style={{ marginBottom: 6 }}>
            {slot.label}
          </div>
          <div className="res-grid">
            {SWAG.filter(
              (i) =>
                i.slot === slot.id &&
                /* A character's own kit is never in the shop — but it is in
                   the closet once they own it. */
                (!i.shopHidden || isOwned(state, i)),
            ).map((it) => {
              const owned = isOwned(state, it)
              const eq = isEquipped(state, it)
              const locked = isSwagLocked(it, state.rank)
              const afford = canAfford(state, it)
              return (
                <div
                  key={it.id}
                  className={
                    'res-item' + (eq ? ' eq' : '') + (locked ? ' lock' : '')
                  }
                >
                  <div className="nm">{it.name}</div>
                  <div className="res-price">{money(it.price)}</div>
                  <StatChips it={it} />
                  <div className="fl">{it.flavor}</div>
                  {locked ? (
                    <div className="res-meta">
                      Unlocks at {rankOf(it.unlockRank).name}
                    </div>
                  ) : owned ? (
                    <div className="res-mini">
                      <button
                        onClick={() =>
                          dispatch({ type: 'EQUIP_SWAG', itemId: it.id })
                        }
                      >
                        {eq ? 'Equipped — Take Off' : 'Equip'}
                      </button>
                    </div>
                  ) : (
                    <div className="res-mini">
                      <button
                        disabled={!afford}
                        title={afford ? '' : 'You cannot afford this. Yet.'}
                        onClick={() =>
                          dispatch({ type: 'BUY_SWAG', itemId: it.id })
                        }
                      >
                        Buy
                      </button>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}
