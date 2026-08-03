import { P3 } from '../data/p3'
import { rivalOf } from '../data/rivals'
import { hasFlag } from '../logic/characters'
import { showdownWinChance } from '../logic/territoryWeek'
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

  /* Terri does not do "a good feeling about it." Terri does percentages. */
  const rival =
    c.kind === 'showdown' ? rivalOf(c.payload.rivalId as string) : null
  const odds =
    rival && hasFlag(state, 'showRawNumbers')
      ? Math.round(showdownWinChance(state, rival) * 100)
      : null

  return (
    <div className="res-modal">
      <div className="res-card">
        <h2 className="res-display">{c.title}</h2>
        <p className="res-blurb">{c.body}</p>
        {odds !== null && (
          <div className="res-line">
            <span>Your odds head-to-head</span>
            <b>{odds}%</b>
          </div>
        )}
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
