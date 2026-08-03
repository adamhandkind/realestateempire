import { priceTier } from '../data/districts'
import { INDIES, P6, PLAYER } from '../data/p6'
import { RIVALS } from '../data/rivals'
import { isDominant, playerShare, sharesOf } from '../logic/territory'
import { money } from '../logic/rand'
import type { Action, DistrictDef, GameState } from '../state/types'

/** Player brass, each rival their own colour, everyone else grey. */
const colorOf = (owner: string): string => {
  if (owner === PLAYER) return 'var(--brass)'
  const rival = RIVALS.find((r) => r.id === owner)
  return rival ? rival.color : '#3a4050'
}

const labelOf = (owner: string): string => {
  if (owner === PLAYER) return 'You'
  if (owner === INDIES) return 'Independents'
  return RIVALS.find((r) => r.id === owner)?.name ?? owner
}

/** Why the Farm button is off, or null when it is on. */
function farmBlockReason(state: GameState): string | null {
  if (state.ap < 1) return 'No action points left this week'
  if (state.pendingChoices.length > 0) return 'Decisions await'
  return null
}

export default function DistrictSheet({
  state,
  dispatch,
  district,
  onClose,
}: {
  state: GameState
  dispatch: (a: Action) => void
  district: DistrictDef
  onClose: () => void
}) {
  const shares = sharesOf(state, district.id)
  const dominant = isDominant(state, district.id)
  const mine = playerShare(state, district.id)
  const here = state.properties.filter((p) => p.districtId === district.id)
  const listings = state.marketPool.filter((l) => l.districtId === district.id)
  const blocked = farmBlockReason(state)

  /* Player first, then the rivals who are actually present, then the rest. */
  const order = [PLAYER, ...RIVALS.map((r) => r.id), INDIES].filter(
    (o) => (shares[o] ?? 0) > 0,
  )

  return (
    <div
      className="res-modal"
      role="dialog"
      aria-modal="true"
      aria-label={district.name}
      onClick={onClose}
    >
      <div
        className="res-card res-sheet"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="res-sheet-head">
          <h2 className="res-display" style={{ margin: 0 }}>
            {district.name}
          </h2>
          <span className="res-tier" title="Typical price level">
            {priceTier(district.priceMult)}
          </span>
        </div>
        <p className="res-blurb">{district.blurb}</p>

        {/* stacked share bar with the three threshold markers */}
        <div className="res-sharebar" aria-label="market share">
          {order.map((owner) => (
            <span
              key={owner}
              className="res-shareseg"
              style={{
                width: (shares[owner] ?? 0) + '%',
                background: colorOf(owner),
              }}
              title={labelOf(owner) + ' ' + (shares[owner] ?? 0).toFixed(1) + '%'}
            >
              {(shares[owner] ?? 0) >= 5 && (
                <i>{(shares[owner] ?? 0).toFixed(1)}</i>
              )}
            </span>
          ))}
          {[P6.THRESH_PRESENCE, P6.THRESH_DOMINANT, P6.THRESH_LOCKED].map((t) => (
            <u key={t} className="res-thresh" style={{ left: t + '%' }} />
          ))}
        </div>
        <div className="res-sharekey">
          {order.map((owner) => (
            <span key={owner}>
              <b style={{ background: colorOf(owner) }} />
              {labelOf(owner)} {(shares[owner] ?? 0).toFixed(1)}%
            </span>
          ))}
        </div>

        <div className={'res-perk' + (dominant ? ' lit' : '')}>
          <span>{dominant ? '★' : '☆'}</span> {district.dominantPerk.text}
          {!dominant && (
            <i>
              {' '}
              — {(P6.THRESH_DOMINANT - mine).toFixed(1)}% more to switch it on.
            </i>
          )}
        </div>

        {here.length > 0 && (
          <div className="res-sheet-list">
            <h3>Your properties here</h3>
            {here.map((p) => (
              <div key={p.id} className="res-line">
                <span>{p.nickname}</span>
                <b>{p.isVrbo ? '⚙' : '●'}</b>
              </div>
            ))}
          </div>
        )}

        {listings.length > 0 && (
          <div className="res-sheet-list">
            <h3>On the market here</h3>
            {listings.map((l) => (
              <div key={l.id} className="res-line">
                <span>{l.blurb.slice(0, 40)}</span>
                <b>{money(l.askPrice)}</b>
              </div>
            ))}
          </div>
        )}

        <button
          className="res-go"
          disabled={blocked !== null}
          title={blocked ?? 'Work the neighbourhood'}
          onClick={() => {
            dispatch({ type: 'FARM_DISTRICT', districtId: district.id })
            onClose()
          }}
        >
          {blocked ?? 'FARM THIS DISTRICT · 1 AP'}
        </button>
        <button className="res-btn" onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  )
}
