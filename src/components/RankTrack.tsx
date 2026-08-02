import { LOCKED_RANKS, RANKS, rankIndex } from '../logic/economy'
import { money } from '../logic/rand'
import type { GameState } from '../state/types'

export default function RankTrack({ state }: { state: GameState }) {
  const cur = rankIndex(state.rank)
  return (
    <div className="res-rank-track">
      {RANKS.map((r, i) => {
        const cls = i === cur ? 'cur' : i < cur ? 'done' : ''
        const req =
          i <= cur
            ? r.blurb
            : [
                r.req.earnings ? money(r.req.earnings) + ' career' : null,
                r.req.showings ? r.req.showings + ' showings' : null,
                r.req.deals ? r.req.deals + ' deals' : null,
                r.req.rep ? r.req.rep + ' reputation' : null,
              ]
                .filter(Boolean)
                .join(' · ')
        return (
          <div key={r.id} className={'res-rt ' + cls}>
            <span className="num">{r.n}</span>
            <span>{r.name}</span>
            <span className="req">{req}</span>
          </div>
        )
      })}
      {LOCKED_RANKS.map((n, i) => (
        <div key={n} className="res-rt lock" title="Coming in a future update.">
          <span className="num">{RANKS.length + 1 + i}</span>
          <span>{n}</span>
          <span className="req">Locked</span>
        </div>
      ))}
    </div>
  )
}
