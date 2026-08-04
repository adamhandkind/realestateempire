import { useState, type Dispatch } from 'react'
import { awardOf } from '../data/awards'
import {
  NOMINATION_BANNER,
  P7,
  SPONSOR_CRINGE_WARNING,
} from '../data/p7'
import { isUpgrade, upgradeCost, weeksToCeremony } from '../logic/awards'
import { money } from '../logic/rand'
import type { Action, GameState, TableTierId } from '../state/types'

/** The brass strip under the header, weeks 12–13 of a season. Renders nothing
 *  outside the nomination window. */
export function NominationBanner({
  state,
  onOpen,
}: {
  state: GameState
  onOpen: () => void
}) {
  const noms = state.nominations
  if (!noms || noms.length === 0) return null
  return (
    <div className="res-banner res-goldies">
      <span>
        {NOMINATION_BANNER.replace('{n}', String(noms.length)).replace(
          '{x}',
          String(weeksToCeremony(state)),
        )}
      </span>
      <button className="res-tab" onClick={onOpen}>
        {state.tableTier === 'none' ? 'Buy a table' : 'Upgrade your table'}
      </button>
    </div>
  )
}

/** The tier picker. Lives in the Office tab; the banner scrolls you to it. */
export default function TablePicker({
  state,
  dispatch,
}: {
  state: GameState
  dispatch: Dispatch<Action>
}) {
  const [showNoms, setShowNoms] = useState(false)
  const noms = state.nominations
  if (!noms || noms.length === 0) return null

  return (
    <div className="res-panel dark" id="goldies-table">
      <h3 className="res-h2 res-display">The Goldies — Your Table</h3>
      <div className="res-meta" style={{ marginBottom: 8 }}>
        Ceremony in {weeksToCeremony(state)} weeks · nominated for {noms.length}
      </div>

      <button
        className="res-tab"
        style={{ marginBottom: 10 }}
        onClick={() => setShowNoms((v) => !v)}
      >
        {showNoms ? 'Hide nominations' : 'See what you’re up for'}
      </button>
      {showNoms && (
        <ul className="res-nomlist">
          {noms.map((id) => (
            <li key={id}>{awardOf(id)?.name ?? id}</li>
          ))}
        </ul>
      )}

      <div className="res-grid">
        {P7.TABLE_TIERS.filter((t) => t.id !== 'none').map((t) => {
          const tierId = t.id as TableTierId
          const owned = state.tableTier === tierId
          const up = isUpgrade(state.tableTier, tierId)
          const cost = upgradeCost(state.tableTier, tierId)
          const afford = state.cash >= cost
          return (
            <div
              key={t.id}
              className={'res-tier-card' + (owned ? ' on' : '')}
            >
              <div className="nm">{t.label}</div>
              <div className="res-price">{money(cost)}</div>
              <div className="res-meta">
                Visibility: +{t.scoreBonus} · +{t.repGain} Rep
              </div>
              {t.id === 'sponsor' && (
                <div className="res-sponsor-warn">{SPONSOR_CRINGE_WARNING}</div>
              )}
              <div className="res-mini">
                <button
                  disabled={!up || !afford}
                  title={
                    owned
                      ? 'Already yours.'
                      : !up
                        ? 'The Board does not do refunds.'
                        : afford
                          ? ''
                          : 'Not this season.'
                  }
                  onClick={() => dispatch({ type: 'BUY_TABLE', tierId })}
                >
                  {owned ? 'Yours' : !up ? 'Below your tier' : 'Buy'}
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
