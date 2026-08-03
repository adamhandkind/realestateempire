import { getChar } from '../logic/characters'
import { isEgoDangerous, rankOf } from '../logic/economy'
import { hasMarketInsight, netWorth } from '../logic/portfolio'
import { money } from '../logic/rand'
import type { GameState } from '../state/types'

function Pips({ ap, max }: { ap: number; max: number }) {
  return (
    <div className="res-pips" aria-label={ap + ' action points left'}>
      {Array.from({ length: max }).map((_, i) => (
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
  const char = getChar(state)
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
            {state.kingOfBrantford && (
              <span className="res-kingcrown" title="King of Brantford">
                ♛
              </span>
            )}
            {' · '}
            <span title={char.tagline}>
              {char.portrait.emoji} {char.name}
            </span>
          </div>
        </div>
        <div>
          <div className="res-meta">Net worth</div>
          <div className="res-display res-brass">{money(netWorth(state))}</div>
        </div>
        <div className="res-dial" aria-label={'market: ' + state.marketState}>
          {(['cold', 'normal', 'hot'] as const).map((m) => (
            <span
              key={m}
              className={
                'res-dial-seg' +
                (state.marketState === m ? ' on' : '') +
                (hasMarketInsight(state) && state.nextMarketState === m
                  ? ' next'
                  : '')
              }
            >
              {m}
            </span>
          ))}
        </div>
        <Pips ap={state.ap} max={char.apPerWeek} />
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
