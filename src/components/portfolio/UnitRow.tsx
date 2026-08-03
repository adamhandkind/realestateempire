import { P3 } from '../../data/p3'
import { hasFlag } from '../../logic/characters'
import {
  baseRentOf,
  chargedRent,
  evictCost,
  tenantOf,
} from '../../logic/portfolio'
import { money } from '../../logic/rand'
import type { Action, GameState, Property, UnitState } from '../../state/types'

export default function UnitRow({
  state,
  property,
  unit,
  dispatch,
  onEvict,
}: {
  state: GameState
  property: Property
  unit: UnitState
  dispatch: (a: Action) => void
  onEvict: (unit: UnitState) => void
}) {
  const t = unit.tenant
  const a = t ? tenantOf(t.archetypeId) : null
  const rent = chargedRent(property, unit, baseRentOf(property))
  const rawNumbers = hasFlag(state, 'showRawNumbers')

  return (
    <div className="res-unit">
      <div className="res-line">
        <span>
          {t ? t.name : 'Vacant'}
          {a ? ' · ' + a.label : ''}
        </span>
        <b>{money(rent)}/wk</b>
      </div>

      {t && a && rawNumbers && (
        <span className="res-chip">
          Pays: {Math.round(a.payChance * 100)}%
        </span>
      )}
      {t && t.owed > 0 && (
        <span className="res-chip warn">owes {money(t.owed)}</span>
      )}
      {unit.openIssue && (
        <span className="res-chip issue">
          {unit.openIssue.eventId}
          {unit.openIssue.fixCost > 0
            ? ' · ' + money(unit.openIssue.fixCost)
            : ' · needs repairs, not money'}
        </span>
      )}
      {unit.evictionWeeksLeft !== null && (
        <span className="res-chip warn">
          eviction · {unit.evictionWeeksLeft} weeks left
        </span>
      )}

      <label className="res-slider-row">
        <span>Rent multiplier · {unit.rentR.toFixed(2)}×</span>
        <input
          type="range"
          min={P3.RENT_R_MIN * 100}
          max={P3.RENT_R_MAX * 100}
          step={P3.RENT_R_STEP * 100}
          value={unit.rentR * 100}
          onChange={(e) =>
            dispatch({
              type: 'SET_RENT',
              propertyId: property.id,
              unitId: unit.id,
              r: Number(e.target.value) / 100,
            })
          }
        />
      </label>

      <div className="res-actions">
        {unit.openIssue && unit.openIssue.eventId !== 'rentStrike' && (
          <button
            className="res-tab"
            onClick={() =>
              dispatch({
                type: 'HANDLE_ISSUE',
                propertyId: property.id,
                unitId: unit.id,
              })
            }
          >
            Handle it · {money(unit.openIssue.fixCost)} · 1 AP
          </button>
        )}
        {t && unit.evictionWeeksLeft === null && (
          <button className="res-tab" onClick={() => onEvict(unit)}>
            Evict · {money(evictCost(state))} · 1 AP
          </button>
        )}
      </div>
    </div>
  )
}
