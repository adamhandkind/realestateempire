/* The card that opens when you click a lot. It is a doorway, not a new set of
   rules: every action here hands off to a screen the game already has —
   BuyModal for a listing, PropertyCard for a house you own, DistrictSheet for
   the neighbourhood. */

import { districtOrFirst, priceTier } from '../../data/districts'
import { RIVALS } from '../../data/rivals'
import type { Lot } from '../../city/layout'
import type { LotUse } from '../../city/occupancy'
import { ownerLine } from './ownerLine'
import { displayedValue, labelOf } from '../../logic/portfolio'
import { money } from '../../logic/rand'
import type { Action, GameState, Lead } from '../../state/types'
import { LeadCard } from '../LeadsTab'

export default function LotCard({
  state,
  lot,
  use,
  lead,
  dispatch,
  onClose,
  onBuy,
  onManage,
  onDistrict,
}: {
  state: GameState
  lot: Lot
  use: LotUse
  lead?: Lead
  dispatch: (a: Action) => void
  onClose: () => void
  onBuy: (listingId: string) => void
  onManage: (propertyId: string) => void
  onDistrict: (districtId: string) => void
}) {
  const d = districtOrFirst(lot.districtId)
  return (
    <aside className="res-lotcard" aria-label={'Lot at ' + lot.address}>
      <button className="res-lotcard-x" onClick={onClose} aria-label="Close">
        ×
      </button>
      <div className="res-meta">
        {d.name} · {priceTier(d.priceMult)}
      </div>
      <h3 className="res-display">{lot.address}</h3>
      <div className={'res-owner res-owner-' + use.kind}>
        {use.kind === 'rival' && (
          <b
            style={{
              background: RIVALS.find((r) => r.id === use.rivalId)?.color,
            }}
          />
        )}
        {ownerLine(use)}
      </div>

      {use.kind === 'listing' && (
        <>
          <p className="res-blurb">
            <b>{labelOf(use.listing.typeId)}.</b> {use.listing.blurb}
          </p>
          <Condition value={use.listing.condition} />
          <div className="res-line">
            <span>Ask</span>
            <b>{money(use.listing.askPrice)}</b>
          </div>
          {state.crash.weeksLeft > 0 && (
            <div className="res-chip warn">crash pricing</div>
          )}
          <button className="res-go" onClick={() => onBuy(use.listing.id)}>
            Make an offer
          </button>
        </>
      )}

      {use.kind === 'owned' && (
        <>
          <p className="res-blurb">
            <b>{use.property.nickname}</b> — {labelOf(use.property.typeId)}
          </p>
          <Condition value={use.property.condition} />
          <div className="res-line">
            <span>Worth</span>
            <b>{money(displayedValue(state, use.property))}</b>
          </div>
          <div className="res-line">
            <span>Tenants</span>
            <b>
              {use.property.isVrbo
                ? 'Strangers, nightly'
                : use.property.units.filter((u) => u.tenant).length +
                  ' / ' +
                  use.property.units.length}
            </b>
          </div>
          {use.property.mortgage && (
            <div className="res-line">
              <span>Mortgage</span>
              <b>{money(use.property.mortgage.balance)}</b>
            </div>
          )}
          {use.property.renovation && (
            <div className="res-chip">
              renovating · {use.property.renovation.weeksLeft} wk
            </div>
          )}
          {use.property.listedForSale && <div className="res-chip">listed</div>}
          <button className="res-go" onClick={() => onManage(use.property.id)}>
            Manage property
          </button>
        </>
      )}

      {use.kind === 'rival' && (
        <p className="res-blurb">
          {RIVALS.find((r) => r.id === use.rivalId)?.firm} has a sign on the
          lawn of this {labelOf(use.typeId).toLowerCase()}. Out-farm them in{' '}
          {d.name} and the signs start coming down.
        </p>
      )}
      {use.kind === 'independent' && (
        <p className="res-blurb">
          A {labelOf(use.typeId).toLowerCase()} with a family inside it and no
          plans to sell. Yet.
        </p>
      )}
      {use.kind === 'empty' && (
        <p className="res-blurb">
          Gravel, a tire, and potential. Building on empty lots opens up when
          the city goes live.
        </p>
      )}
      {use.kind === 'camp' && (
        <p className="res-blurb">
          Under the bridge, where every empire starts. In the shared city this
          is where your agent pitches a tent on day one.
        </p>
      )}

      {lead && (
        <div className="res-lotcard-client">
          <div className="res-meta">Your client is touring it</div>
          <LeadCard lead={lead} state={state} dispatch={dispatch} />
        </div>
      )}

      <button
        className="res-btn res-lotcard-d"
        onClick={() => onDistrict(d.id)}
      >
        <span className="t">
          {d.name} <span className="ap">DISTRICT ▸</span>
        </span>
        <span className="d">Market share, rivals and farming.</span>
      </button>
    </aside>
  )
}

function Condition({ value }: { value: number }) {
  return (
    <div className="res-line">
      <span>Condition</span>
      <span
        className="res-bar res-bar-inline"
        aria-label={'condition ' + value}
      >
        <i style={{ width: value + '%' }} className={value < 50 ? 'low' : ''} />
      </span>
    </div>
  )
}
