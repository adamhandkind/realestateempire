import { useState } from 'react'
import { P3 } from '../../data/p3'
import { RENO_PROGRESS_LINE } from '../../data/properties'
import { VRBO_TOOLTIP } from '../../data/vrbo'
import { hasFlag } from '../../logic/characters'
import {
  displayedValue,
  evictCost,
  interp,
  labelOf,
  renoBlockReason,
  renoCost,
  renoOf,
  renoWeeks,
  tenantOf,
  typeOf,
} from '../../logic/portfolio'
import { money } from '../../logic/rand'
import type {
  Action,
  GameState,
  Property,
  RenoProjectId,
  UnitState,
} from '../../state/types'
import UnitRow from './UnitRow'

export default function PropertyCard({
  state,
  property: p,
  dispatch,
}: {
  state: GameState
  property: Property
  dispatch: (a: Action) => void
}) {
  const [renaming, setRenaming] = useState(false)
  const [name, setName] = useState(p.nickname)
  const [evicting, setEvicting] = useState<UnitState | null>(null)

  const row = state.summary?.portfolio.find((r) => r.nickname === p.nickname)
  const projects: RenoProjectId[] = p.isVrbo
    ? ['full']
    : ((typeOf(p.typeId)?.renoEligible ?? []) as RenoProjectId[])
  const handyman = p.condition < P3.LOW_CONDITION
  const evictArch = evicting?.tenant
    ? tenantOf(evicting.tenant.archetypeId)
    : null

  /* Some landlords get a modal about how they feel. Some just nod. */
  const askToEvict = (u: UnitState) => {
    if (hasFlag(state, 'freeEvictions'))
      dispatch({ type: 'EVICT', propertyId: p.id, unitId: u.id })
    else setEvicting(u)
  }

  return (
    <div className={'res-card' + (p.isVrbo ? ' res-vrbo' : '')}>
      {renaming ? (
        <input
          value={name}
          maxLength={24}
          autoFocus
          onChange={(e) => setName(e.target.value)}
          onBlur={() => {
            dispatch({
              type: 'RENAME_PROPERTY',
              propertyId: p.id,
              nickname: name,
            })
            setRenaming(false)
          }}
        />
      ) : (
        <h3
          onClick={() => setRenaming(true)}
          title={p.isVrbo ? VRBO_TOOLTIP : 'Click to rename'}
        >
          {p.nickname}
          {state.milestonesUnlocked.includes('theMachine') && p.isVrbo && (
            <span className="res-machine"> ⚙</span>
          )}
        </h3>
      )}
      <div className="res-meta">{labelOf(p.typeId)}</div>

      <div className="res-bar" aria-label="condition">
        <i
          style={{ width: p.condition + '%' }}
          className={handyman ? 'low' : ''}
        />
      </div>
      {handyman && <span className="res-chip warn">handyman special</span>}

      <div className="res-line">
        <span>Value</span>
        <b>{money(displayedValue(state, p))}</b>
      </div>
      {p.mortgage && (
        <>
          <div className="res-line">
            <span>Mortgage</span>
            <b>{money(p.mortgage.balance)}</b>
          </div>
          <button
            className="res-tab"
            onClick={() => dispatch({ type: 'PAY_PRINCIPAL', propertyId: p.id })}
          >
            Pay {money(P3.PRINCIPAL_CHUNK)} principal
          </button>
        </>
      )}
      {row && (
        <div className="res-line">
          <span>Last week</span>
          <b className={row.net >= 0 ? 'res-mint' : 'res-loss'}>
            {money(row.net)}
          </b>
        </div>
      )}

      {p.isVrbo && (
        <>
          <div className="res-line">
            <span>Occupancy</span>
            <b>{row?.occupancyPct ?? 0}%</b>
          </div>
          <div className="res-line">
            <span>Profitable weeks</span>
            <b>
              {p.vrboProfitStreak}/{P3.VRBO.STREAK_TARGET}
            </b>
          </div>
        </>
      )}

      {p.renovation ? (
        <p className="res-blurb">
          {interp(RENO_PROGRESS_LINE, {
            n: String(
              renoOf(p.renovation.projectId).weeks - p.renovation.weeksLeft + 1,
            ),
            total: String(renoOf(p.renovation.projectId).weeks),
          })}
        </p>
      ) : (
        <div className="res-actions">
          {projects.map((id) => {
            const blocked = renoBlockReason(state, p, id)
            return (
              <button
                key={id}
                className="res-tab"
                disabled={!!blocked}
                title={blocked ?? ''}
                onClick={() =>
                  dispatch({
                    type: 'START_RENOVATION',
                    propertyId: p.id,
                    projectId: id,
                  })
                }
              >
                {renoOf(id).label} · {money(renoCost(p, id))} ·{' '}
                {renoWeeks(state, id)} wks
              </button>
            )
          })}
          <button
            className="res-tab"
            onClick={() =>
              dispatch({ type: 'EMERGENCY_REPAIR', propertyId: p.id })
            }
          >
            Emergency repair · {money(P3.EMERGENCY_REPAIR_COST)} · 1 AP
          </button>
          <button
            className="res-tab"
            onClick={() =>
              dispatch(
                p.listedForSale
                  ? { type: 'DELIST', propertyId: p.id }
                  : { type: 'LIST_FOR_SALE', propertyId: p.id },
              )
            }
          >
            {p.listedForSale ? 'Delist' : 'List for sale · 1 AP'}
          </button>
        </div>
      )}

      {p.units.map((u) => (
        <UnitRow
          key={u.id}
          state={state}
          property={p}
          unit={u}
          dispatch={dispatch}
          onEvict={askToEvict}
        />
      ))}

      {evicting && (
        <div className="res-modal">
          <div className="res-card">
            <h2 className="res-display">EVICT {evicting.tenant?.name}</h2>
            <p className="res-blurb">
              {evictArch?.evictBody ??
                'Paper, process, and four weeks of avoiding eye contact in the driveway.'}
            </p>
            <div className="res-line">
              <span>Filing cost</span>
              <b>{money(evictCost(state))}</b>
            </div>
            <div className="res-line">
              <span>Weeks without rent</span>
              <b>
                {evicting.tenant?.archetypeId === 'theHoarder'
                  ? P3.EVICT_WEEKS_HOARDER
                  : P3.EVICT_WEEKS}
              </b>
            </div>
            <button
              className="res-go"
              onClick={() => {
                dispatch({
                  type: 'EVICT',
                  propertyId: p.id,
                  unitId: evicting.id,
                })
                setEvicting(null)
              }}
            >
              {evictArch?.evictBody
                ? "I'm still evicting him"
                : 'File the paperwork'}
            </button>
            <button className="res-tab" onClick={() => setEvicting(null)}>
              Not this week
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
