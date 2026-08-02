import { AP_PER_WEEK, isEgoDangerous, rankOf } from '../logic/economy'
import { money } from '../logic/rand'
import type { GameState } from '../state/types'

function Pips({ ap }: { ap: number }) {
  return (
    <div className="res-pips" aria-label={ap + ' action points left'}>
      {Array.from({ length: AP_PER_WEEK }).map((_, i) => (
        <div key={i} className={'res-pip' + (i < ap ? ' on' : '')} />
      ))}
    </div>
  )
}

export default function Header({
  state,
  bump,
}: {
  state: GameState
  bump: boolean
}) {
  const st = state.stats
  return (
    <header className="res-header">
      <div className="res-hrow">
        <div>
          <div className={'res-cash res-display' + (bump ? ' bump' : '')}>
            {money(state.cash)}
          </div>
          <div className="res-meta">
            Week {state.week} ·{' '}
            <span className="res-rank">{rankOf(state.rank).name}</span>
          </div>
        </div>
        <Pips ap={state.ap} />
        <div className="res-chips">
          <span className="res-chip">
            Hustle<b>{st.hustle}</b>
          </span>
          <span className="res-chip">
            Swagger<b>{st.swagger}</b>
          </span>
          <span className={'res-chip' + (isEgoDangerous(st) ? ' warn' : '')}>
            Ego<b>{st.ego}</b>
          </span>
        </div>
      </div>
    </header>
  )
}
