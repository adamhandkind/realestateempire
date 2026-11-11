/* Today: the front door. What happened, what needs attention, what you can
   do next. Every decision about what to show lives in logic/briefing; this
   only lays it out and wires the buttons. */

import type { AttentionItem, Briefing, BriefingTarget, NextMove } from '../logic/briefing'
import { money } from '../logic/rand'
import type { Action } from '../state/types'
import './today.css'

const LEVEL_LABEL = { urgent: 'Now', soon: 'Soon', fyi: 'FYI' } as const

const TARGET_LABEL: Record<BriefingTarget, string> = {
  portfolio: 'Open portfolio',
  leads: 'Open leads',
  city: 'Open the city',
  marketing: 'Open marketing',
  office: 'Open the office',
}

export default function TodayTab({
  briefing: b,
  dispatch,
  go,
}: {
  briefing: Briefing
  dispatch: (a: Action) => void
  go: (target: BriefingTarget) => void
}) {
  return (
    <section className="res-today">
      <header className="res-today-head">
        <div>
          <div className="res-meta">Week {b.week}</div>
          <h2 className="res-display">Good morning.</h2>
        </div>
        <div className="res-today-stats">
          <Stat label="Cash" value={money(b.runway.cash)} />
          {b.net !== null && (
            <Stat label={'Week ' + b.reportWeek} value={(b.net >= 0 ? '+' : '') + money(b.net)} tone={b.net >= 0 ? 'good' : 'bad'} />
          )}
          <Stat
            label="Runway"
            value={b.runway.weeks === null ? 'Self-funding' : b.runway.weeks + ' wks'}
            tone={b.runway.weeks !== null && b.runway.weeks < 3 ? 'bad' : undefined}
          />
        </div>
      </header>

      <div className="res-today-cols">
        <div className="res-panel dark res-today-col">
          <h3 className="res-h2 res-display">What happened</h3>
          <div className="res-meta res-today-sub">Week {b.reportWeek}</div>
          <ul className="res-today-list">
            {b.happened.map((h, i) => (
              <li key={i} className={'res-today-happened ' + h.tone}>
                <span className="ic" aria-hidden>
                  {h.icon}
                </span>
                <span className="tx">{h.text}</span>
                {h.amount !== undefined && <b className={h.amount >= 0 ? 'res-mint' : 'res-loss'}>{(h.amount >= 0 ? '+' : '') + money(h.amount)}</b>}
              </li>
            ))}
          </ul>
        </div>

        <div className="res-panel dark res-today-col">
          <h3 className="res-h2 res-display">Needs attention</h3>
          <div className="res-meta res-today-sub">
            {b.attention.length === 0 ? 'All quiet.' : b.attention.length + (b.attention.length === 1 ? ' item' : ' items')}
          </div>
          {b.attention.length === 0 ? (
            <p className="res-blurb">Nothing is on fire. Enjoy it; it won’t last.</p>
          ) : (
            <ul className="res-today-list">
              {b.attention.map((a) => (
                <Attention key={a.id} item={a} dispatch={dispatch} go={go} />
              ))}
            </ul>
          )}
        </div>

        <div className="res-panel dark res-today-col">
          <h3 className="res-h2 res-display">What you can do</h3>
          <div className="res-meta res-today-sub">Pick one. Or all of them.</div>
          <ul className="res-today-list">
            {b.moves.map((m) => (
              <Move key={m.id} move={m} dispatch={dispatch} go={go} />
            ))}
          </ul>
        </div>
      </div>
    </section>
  )
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: 'good' | 'bad' }) {
  return (
    <div className="res-today-stat">
      <div className="res-meta">{label}</div>
      <b className={tone === 'good' ? 'res-mint' : tone === 'bad' ? 'res-loss' : 'res-brass'}>{value}</b>
    </div>
  )
}

function Attention({ item: a, dispatch, go }: { item: AttentionItem; dispatch: (a: Action) => void; go: (t: BriefingTarget) => void }) {
  return (
    <li className={'res-today-item ' + a.level}>
      <div className="res-today-item-head">
        <span className="ic" aria-hidden>
          {a.icon}
        </span>
        <b>{a.title}</b>
        <span className={'res-today-level ' + a.level}>{LEVEL_LABEL[a.level]}</span>
      </div>
      <p className="res-today-detail">{a.detail}</p>
      <div className="res-today-actions">
        {a.action && (
          <button className="res-tab on" onClick={() => dispatch(a.action!)}>
            {a.actionLabel}
          </button>
        )}
        <button className="res-tab" onClick={() => go(a.target)}>
          {TARGET_LABEL[a.target]}
        </button>
      </div>
    </li>
  )
}

function Move({ move: m, dispatch, go }: { move: NextMove; dispatch: (a: Action) => void; go: (t: BriefingTarget) => void }) {
  const run = m.action ? () => dispatch(m.action!) : m.target ? () => go(m.target!) : null
  return (
    <li className={'res-today-item move' + (m.available ? '' : ' off')}>
      <div className="res-today-item-head">
        <span className="ic" aria-hidden>
          {m.icon}
        </span>
        <b>{m.title}</b>
        {!m.available && m.why && <span className="res-today-level fyi">{m.why}</span>}
      </div>
      <p className="res-today-detail">{m.detail}</p>
      {run && m.actionLabel && (
        <div className="res-today-actions">
          <button className={'res-tab' + (m.available && m.action ? ' on' : '')} disabled={!m.available && !!m.action} onClick={run}>
            {m.actionLabel}
          </button>
        </div>
      )}
    </li>
  )
}
