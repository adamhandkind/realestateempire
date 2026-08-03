import type { Dispatch } from 'react'
import { hasFlag } from '../logic/characters'
import { atLeastRank } from '../logic/economy'
import { arch, byStage, closeChance, fusePct } from '../logic/leads'
import { money } from '../logic/rand'
import type { Action, GameState, Lead, Stage } from '../state/types'

function LeadCard({
  lead,
  state,
  dispatch,
}: {
  lead: Lead
  state: GameState
  dispatch: Dispatch<Action>
}) {
  const a = arch(lead.archetypeId)
  const justSold = !!lead.sold
  const pct = fusePct(lead)
  const noAp = state.ap < 1
  const junior = atLeastRank(state.rank, 'junior')
  return (
    <div className="res-lead">
      {justSold && <div className="res-sold">SOLD</div>}
      <div className="n">{lead.clientName}</div>
      <div className="a">{a.label}</div>
      <div className="p">{money(lead.salePrice)}</div>
      <div className="q">{lead.intro}</div>
      <div className="res-fuse">
        <i className={pct <= 34 ? 'low' : ''} style={{ width: pct + '%' }} />
      </div>
      <div className="a">
        {lead.patience} week{lead.patience === 1 ? '' : 's'} of goodwill left
      </div>
      <div className="res-mini">
        {justSold && (
          <div style={{ fontSize: 12, fontStyle: 'italic', color: '#6b6f7d' }}>
            Signed, sealed, and already being posted about.
          </div>
        )}
        {!justSold && lead.stage !== 'ready' && (
          <button
            disabled={noAp || !junior}
            title={
              !junior
                ? 'Junior Showing Assistant and up only'
                : noAp
                  ? 'No action points left'
                  : ''
            }
            onClick={() => dispatch({ type: 'RUN_SHOWING', leadId: lead.id })}
          >
            Run Showing
          </button>
        )}
        {/* Some agents sell dreams. Some send the actual number. */}
        {!justSold &&
          lead.stage === 'ready' &&
          hasFlag(state, 'showRawNumbers') && (
            <span className="res-chip">
              {Math.round(closeChance(state, lead) * 100)}%
            </span>
          )}
        {!justSold && lead.stage === 'ready' && (
          <button
            disabled={noAp || !junior}
            title={
              !junior
                ? 'Junior Showing Assistant and up only'
                : noAp
                  ? 'No action points left'
                  : ''
            }
            onClick={() => dispatch({ type: 'ATTEMPT_CLOSE', leadId: lead.id })}
          >
            {state.rank === 'junior' ? 'Close (Referral Cut)' : 'Attempt Close'}
          </button>
        )}
      </div>
    </div>
  )
}

const COLUMNS: [Stage, string][] = [
  ['new', 'New'],
  ['shown', 'Shown'],
  ['ready', 'Ready to Close'],
]

export default function LeadsTab({
  state,
  dispatch,
}: {
  state: GameState
  dispatch: Dispatch<Action>
}) {
  const stages = byStage(state.leads)
  return (
    <div className="res-panel dark">
      <h3 className="res-h2 res-display">Pipeline</h3>
      {!state.leads.length && (
        <div style={{ fontSize: 13, color: 'var(--muted)' }}>
          Nobody's in the pipeline. The phone is right there, and it is not going
          to ring on its own.
        </div>
      )}
      <div className="res-cols">
        {COLUMNS.map(([k, label]) => (
          <div className="res-col" key={k}>
            <h3>
              {label} ({stages[k].length})
            </h3>
            {stages[k].map((l) => (
              <LeadCard key={l.id} lead={l} state={state} dispatch={dispatch} />
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}
