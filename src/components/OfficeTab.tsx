import { useState, type Dispatch } from 'react'
import { CHARACTERS } from '../data/characters'
import { DISTRICTS } from '../data/districts'
import { channelOf, isChannelLocked } from '../logic/marketing'
import { TARGETABLE_CHANNEL_IDS } from '../logic/territoryWeek'
import { atLeastRank, weeklyExpenses } from '../logic/economy'
import { byStage } from '../logic/leads'
import { money } from '../logic/rand'
import type { Action, GameState } from '../state/types'
import RankTrack from './RankTrack'

function ActionButton({
  title,
  ap,
  desc,
  reason,
  onClick,
}: {
  title: string
  ap: number
  desc: string
  reason: string | null
  onClick: () => void
}) {
  return (
    <button
      className="res-btn"
      disabled={!!reason}
      onClick={onClick}
      title={reason || desc}
    >
      <div className="t">
        <span>{title}</span>
        <span className="ap">{ap} AP</span>
      </div>
      <div className="d">{reason || desc}</div>
    </button>
  )
}

export default function OfficeTab({
  state,
  dispatch,
  goToLeads,
  importText,
  setImportText,
  exported,
  onExport,
  onImport,
  onNewGame,
}: {
  state: GameState
  dispatch: Dispatch<Action>
  goToLeads: () => void
  importText: string
  setImportText: (v: string) => void
  exported: string
  onExport: () => void
  onImport: () => void
  onNewGame: () => void
}) {
  const [debugDistrict, setDebugDistrict] = useState(DISTRICTS[0].id)
  const st = state.stats
  const junior = atLeastRank(state.rank, 'junior')
  const buyerPlus = atLeastRank(state.rank, 'buyerAgent')
  const noAp = state.ap < 1
  const stages = byStage(state.leads)

  return (
    <>
      <div className="res-panel dark">
        <h3 className="res-h2 res-display">This Week's Work</h3>
        <div className="res-grid">
          <ActionButton
            title="Work the Phones"
            ap={1}
            desc={
              'Dial strangers until leads happen. Hustle ' +
              st.hustle +
              ' means more names.'
            }
            reason={
              !junior
                ? 'Locked — nobody gives the receptionist a phone list.'
                : noAp
                  ? 'No action points left this week.'
                  : null
            }
            onClick={() => dispatch({ type: 'WORK_PHONES' })}
          />
          <ActionButton
            title="Assist a Showing"
            ap={1}
            desc="Hold the sign, refill the cookies, learn the trade. Flat $100."
            reason={
              state.rank !== 'receptionist'
                ? "You're past this. Mostly."
                : noAp
                  ? 'No action points left this week.'
                  : null
            }
            onClick={() => dispatch({ type: 'ASSIST_SHOWING' })}
          />
          <ActionButton
            title="Side Hustle"
            ap={1}
            desc="Photos, staging, drone work, aggressive nodding. $150–$400."
            reason={noAp ? 'No action points left this week.' : null}
            onClick={() => dispatch({ type: 'SIDE_HUSTLE' })}
          />
          <ActionButton
            title="Run a Showing"
            ap={1}
            desc={junior ? 'Head to the Leads tab and pick a client.' : 'Locked.'}
            reason={
              !junior
                ? 'Unlocks at Junior Showing Assistant.'
                : state.leads.some((l) => l.stage !== 'ready')
                  ? 'Open the Leads tab to choose a client.'
                  : 'No lead is waiting on a showing.'
            }
            onClick={goToLeads}
          />
          <ActionButton
            title="Attempt a Close"
            ap={1}
            desc={
              buyerPlus
                ? 'Full split. Leads tab.'
                : "Referral cut only until Buyer's Agent."
            }
            reason={
              !junior
                ? 'Unlocks at Junior Showing Assistant.'
                : stages.ready.length
                  ? 'Open the Leads tab to close.'
                  : "Nobody's ready to sign."
            }
            onClick={goToLeads}
          />
        </div>
      </div>

      <div className="res-panel">
        <h3 className="res-h2 res-display">The Ladder</h3>
        <RankTrack state={state} />
        <div style={{ fontSize: 12, color: '#5e6270', marginTop: 10 }}>
          Career earnings {money(state.careerEarnings)} ·{' '}
          {state.counters.showingsRun} showings · {state.counters.dealsClosed}{' '}
          deals · weekly overhead {money(weeklyExpenses(state))}
        </div>
      </div>

      <div className="res-panel dark">
        <h3 className="res-h2 res-display">Settings</h3>
        <div style={{ marginBottom: 12 }}>
          <button
            className={'res-tab' + (state.callsEnabled ? ' on' : '')}
            onClick={() =>
              dispatch({
                type: 'SET_CALLS_ENABLED',
                enabled: !state.callsEnabled,
              })
            }
          >
            {state.callsEnabled ? '● ' : '○ '}Phone calls for big deals
          </button>
          <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>
            Off = instant dice roll, like the old days.
          </div>
        </div>
        <div className="res-mini" style={{ marginBottom: 8 }}>
          <button onClick={onExport}>Export Save</button>
          <button onClick={onImport} disabled={!importText.trim()}>
            Import Save
          </button>
        </div>
        {exported && (
          <textarea
            className="res-ta"
            readOnly
            value={exported}
            onFocus={(e) => e.target.select()}
          />
        )}
        <textarea
          className="res-ta"
          placeholder="Paste a save here, then hit Import Save."
          value={importText}
          onChange={(e) => setImportText(e.target.value)}
        />
      </div>

      {/* Phase 2 shipped its channel logic but not its channel cards, so the
          three targetable formats get their switch and their dropdown here
          until that tab exists. */}
      <div className="res-panel dark">
        <h3 className="res-h2 res-display">Big-Format Advertising</h3>
        {TARGETABLE_CHANNEL_IDS.map((id) => {
          const c = channelOf(id)
          if (!c) return null
          const on = state.activeChannelIds.includes(c.id)
          const locked = isChannelLocked(state, c)
          return (
            <div key={c.id} style={{ marginBottom: 10 }}>
              <button
                className={'res-tab' + (on ? ' on' : '')}
                disabled={!on && locked}
                title={locked && !on ? 'Not available at your rank yet' : c.flavor}
                onClick={() =>
                  dispatch({ type: 'TOGGLE_CHANNEL', channelId: c.id })
                }
              >
                {on ? '● ' : '○ '}
                {c.name} · {money(c.weeklyCost)}/wk
              </button>
              {on && (
                <label className="res-target">
                  Aim it at
                  <select
                    value={state.channelTargets[c.id] ?? ''}
                    onChange={(e) =>
                      dispatch({
                        type: 'SET_CHANNEL_TARGET',
                        channelId: c.id,
                        districtId: e.target.value || null,
                      })
                    }
                  >
                    <option value="">The whole city</option>
                    {DISTRICTS.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </div>
          )
        })}
      </div>

      <div className="res-panel dark">
        <h3 className="res-h2 res-display">Cheat Codes (We Won't Tell)</h3>
        <div className="res-actions">
          <button
            className="res-tab"
            onClick={() => dispatch({ type: 'DEBUG_CASH' })}
          >
            +$100k
          </button>
          <button
            className="res-tab"
            onClick={() => dispatch({ type: 'DEBUG_FORCE_CRASH' })}
          >
            Force crash
          </button>
          <button
            className="res-tab"
            onClick={() => dispatch({ type: 'DEBUG_FILL_VACANCIES' })}
          >
            Fill vacancies
          </button>
          {/* Testing tool: swaps the active character live, mid-run. */}
          <label className="res-chip">
            Set Character
            <select
              value={state.characterId}
              onChange={(e) =>
                dispatch({
                  type: 'DEBUG_SET_CHARACTER',
                  characterId: e.target.value,
                })
              }
            >
              {CHARACTERS.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <button className="res-tab" onClick={onNewGame}>
            New Game (pick an agent)
          </button>
          {/* ---- phase 6 ---- */}
          <label className="res-chip">
            District
            <select
              value={debugDistrict}
              onChange={(e) => setDebugDistrict(e.target.value)}
            >
              {DISTRICTS.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </label>
          <button
            className="res-tab"
            onClick={() =>
              dispatch({ type: 'DEBUG_ADD_SHARE', districtId: debugDistrict })
            }
          >
            +10% share
          </button>
          <button
            className="res-tab"
            onClick={() =>
              dispatch({
                type: 'DEBUG_SET_SHARES',
                districtId: debugDistrict,
                shares: { player: 60, chadwick: 10, zambonis: 10, krystal: 0 },
              })
            }
          >
            Set shares: dominant
          </button>
          <button
            className="res-tab"
            onClick={() =>
              dispatch({
                type: 'DEBUG_SET_SHARES',
                districtId: debugDistrict,
                shares: { player: 80, chadwick: 5, zambonis: 5, krystal: 5 },
              })
            }
          >
            Set shares: locked
          </button>
          {/* ---- phase 8 ---- */}
          <label className="res-chip">
            Force call
            <select
              value=""
              onChange={(e) =>
                e.target.value &&
                dispatch({ type: 'DEBUG_FORCE_CALL', leadId: e.target.value })
              }
            >
              <option value="">Pick a lead…</option>
              {state.leads
                .filter((l) => !l.sold)
                .map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.clientName} · {money(l.salePrice)}
                  </option>
                ))}
            </select>
          </label>
          <button
            className="res-tab"
            onClick={() => dispatch({ type: 'DEBUG_FORCE_SHOWDOWN' })}
          >
            Force showdown
          </button>
          <button
            className="res-tab"
            onClick={() => dispatch({ type: 'DEBUG_KING_CHECK' })}
          >
            King of Brantford check
          </button>
          {(['cold', 'normal', 'hot'] as const).map((m) => (
            <button
              key={m}
              className="res-tab"
              onClick={() =>
                dispatch({ type: 'DEBUG_SET_MARKET', marketState: m })
              }
            >
              Market: {m}
            </button>
          ))}
        </div>
      </div>
    </>
  )
}
