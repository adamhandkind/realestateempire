import { rankOf } from '../logic/economy'
import { money } from '../logic/rand'
import type { GameState } from '../state/types'

export default function WeekSummaryModal({
  state,
  onClose,
}: {
  state: GameState
  onClose: () => void
}) {
  const summary = state.summary
  if (!summary) return null
  return (
    <div className="res-modal" onClick={onClose}>
      <div className="res-card" onClick={(e) => e.stopPropagation()}>
        <h2 className="res-display">WEEK {summary.week} — IN REVIEW</h2>
        <div className="res-meta" style={{ marginBottom: 10 }}>
          {rankOf(state.rank).name}
        </div>
        {summary.promo && (
          <div
            className="res-banner"
            style={{
              color: '#14161f',
              background: '#f0e2ad',
              borderColor: '#c9a227',
            }}
          >
            🎉 PROMOTED TO {summary.promo.toUpperCase()} — certificate suitable
            for framing.
          </div>
        )}
        {summary.moneyIn.map(([l, v], i) => (
          <div className="res-line" key={'i' + i}>
            <span>{l}</span>
            <b style={{ color: 'var(--mint)' }}>+{money(v)}</b>
          </div>
        ))}
        {summary.moneyOut.map(([l, v], i) => (
          <div className="res-line" key={'o' + i}>
            <span>{l}</span>
            <b style={{ color: 'var(--sold)' }}>-{money(v)}</b>
          </div>
        ))}
        {summary.portfolio.length > 0 && (
          <>
            <h3>Portfolio</h3>
            {summary.portfolio.map((r) => (
              <div key={r.nickname} className="res-summary-row">
                <div className="res-line">
                  <span>{r.nickname}</span>
                  <b className={r.net >= 0 ? 'res-mint' : 'res-loss'}>
                    {money(r.net)}
                  </b>
                </div>
                <div className="res-meta">
                  In {money(r.rentIn)} · Out {money(r.moneyOut)}
                  {r.occupancyPct !== undefined
                    ? ' · ' + r.occupancyPct + '% occupancy'
                    : ''}
                </div>
                {r.events.length > 0 && (
                  <div className="res-meta">{r.events.join(' · ')}</div>
                )}
              </div>
            ))}
          </>
        )}
        {(summary.territory?.rows.length > 0 ||
          summary.territory?.rivalMoves.length > 0) && (
          <>
            <h3>Territory</h3>
            {summary.territory.rows.map((r) => (
              <div key={r.name} className="res-line">
                <span>{r.name}</span>
                <b className={r.delta >= 0 ? 'res-mint' : 'res-loss'}>
                  {r.delta >= 0 ? '+' : ''}
                  {r.delta.toFixed(1)}% · {r.holder}
                </b>
              </div>
            ))}
            {summary.territory.rivalMoves.map((m, i) => (
              <div key={i} className="res-meta">
                {m}
              </div>
            ))}
          </>
        )}
        <div className="res-line">
          <span>
            <b>Net for the week</b>
          </span>
          <b
            style={{ color: summary.net >= 0 ? 'var(--mint)' : 'var(--sold)' }}
          >
            {summary.net >= 0 ? '+' : ''}
            {money(summary.net)}
          </b>
        </div>
        <div className="res-line">
          <span>On hand</span>
          <b>{money(state.cash)}</b>
        </div>
        {!!summary.events.length && (
          <div style={{ fontSize: 12.5, marginTop: 10, color: '#5e6270' }}>
            This week's incidents: {summary.events.join(', ')}. Details in the
            Log.
          </div>
        )}
        <div className="res-brag">
          <b style={{ color: 'var(--brass)' }}>Your post:</b>
          <br />
          {summary.brag}
        </div>
        <button className="res-go" onClick={onClose}>
          Back to the Grind
        </button>
      </div>
    </div>
  )
}
