import { P3 } from '../data/p3'
import { VRBO_NICKNAME } from '../data/vrbo'
import type { Action, GameState } from '../state/types'
import BuyModal from './portfolio/BuyModal'

export default function PortfolioChoiceModal({
  state,
  dispatch,
}: {
  state: GameState
  dispatch: (a: Action) => void
}) {
  const c = state.pendingChoices[0]
  if (!c) return null

  if (c.kind === 'vrboBuy') {
    return (
      <BuyModal
        state={state}
        askPrice={P3.VRBO.PRICE}
        title={VRBO_NICKNAME}
        blurb={c.body}
        onCancel={() =>
          dispatch({
            type: 'RESOLVE_PORTFOLIO_CHOICE',
            choiceId: c.id,
            actionTag: 'cancel',
          })
        }
        onBuy={(downPct) => dispatch({ type: 'BUY_VRBO', downPct })}
      />
    )
  }

  return (
    <div className="res-modal">
      <div className="res-card">
        <h2 className="res-display">{c.title}</h2>
        <p className="res-blurb">{c.body}</p>
        {c.options.map((o) => (
          <button
            key={o.actionTag}
            className="res-go"
            onClick={() =>
              dispatch({
                type: 'RESOLVE_PORTFOLIO_CHOICE',
                choiceId: c.id,
                actionTag: o.actionTag,
              })
            }
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  )
}
