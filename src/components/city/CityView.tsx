/* The City tab's main event: the isometric city. Lazy-loaded (three.js is the
   biggest thing in the bundle), and the only component that talks to
   CityScene. Game data flows in through setData; clicks flow back out as lot
   ids, which open the game's existing screens. */

import { useEffect, useMemo, useRef, useState } from 'react'
import { cityLayout } from '../../city/layout'
import { leadLots, lotUses, type LotUse } from '../../city/occupancy'
import { SEASON_LABEL, seasonOf } from '../../city/season'
import { districtOf, districtOrFirst } from '../../data/districts'
import { RIVALS } from '../../data/rivals'
import { labelOf } from '../../logic/portfolio'
import type { Action, GameState } from '../../state/types'
import DistrictSheet from '../DistrictSheet'
import BuyModal from '../portfolio/BuyModal'
import PropertyCard from '../portfolio/PropertyCard'
import { CityScene, webglAvailable } from './CityScene'
import LotCard from './LotCard'
import { ownerLine } from './ownerLine'
import { BRASS, CLIENT, INDIE_GREY, MARBLE } from './palette'

const priceMultOf = (id: string) => districtOf(id)?.priceMult ?? 1

export default function CityView({
  state,
  dispatch,
}: {
  state: GameState
  dispatch: (a: Action) => void
}) {
  const host = useRef<HTMLDivElement>(null)
  const labels = useRef<HTMLDivElement>(null)
  const scene = useRef<CityScene | null>(null)
  const [ok] = useState(webglAvailable)
  const [selected, setSelected] = useState<string | null>(null)
  const [hover, setHover] = useState<string | null>(null)
  const [buying, setBuying] = useState<string | null>(null)
  const [managing, setManaging] = useState<string | null>(null)
  const [district, setDistrict] = useState<string | null>(null)
  const cycle = useRef({ listing: 0, owned: 0, lead: 0 })

  const city = cityLayout()
  const season = seasonOf(state.week)
  /* Only the parts of the state that show on the map rebuild the city. */
  const { properties, marketPool, territory } = state
  const uses = useMemo(
    () => lotUses({ properties, marketPool, territory }, city),
    [properties, marketPool, territory, city],
  )
  const clients = useMemo(
    () => leadLots(state.leads, uses, city),
    [state.leads, uses, city],
  )
  const clientLots = useMemo(() => new Set(clients.keys()), [clients])

  useEffect(() => {
    if (!ok || !host.current || !labels.current) return
    const s = new CityScene(host.current, labels.current, {
      onSelect: setSelected,
      onHover: setHover,
    })
    scene.current = s
    return () => {
      s.dispose()
      scene.current = null
    }
  }, [ok])

  /* What the buildings look like, as a string. A deal that nudges territory
     share by a point usually changes no flags at all, so it skips the rebuild. */
  const look = useMemo(() => {
    let sig = ''
    for (const [id, u] of uses)
      sig +=
        id +
        (u.kind === 'listing'
          ? 'L' + u.listing.typeId
          : u.kind === 'owned'
            ? 'O' + u.property.typeId
            : u.kind === 'rival'
              ? 'R' + u.rivalId
              : u.kind[0]) +
        '|'
    return sig
  }, [uses])
  const latestUses = useRef(uses)
  latestUses.current = uses

  useEffect(() => {
    scene.current?.setData({
      city,
      uses: latestUses.current,
      season,
      priceMultOf,
    })
  }, [city, look, season])

  useEffect(() => {
    scene.current?.setClients(clientLots)
  }, [clientLots, uses])

  /* A lot that stops existing as what it was (bought, delisted) stays
     selected; the card just shows what's there now. */
  useEffect(() => {
    scene.current?.setSelected(selected)
  }, [selected])

  const lotsOf = (kind: LotUse['kind']) =>
    [...uses].filter(([, u]) => u.kind === kind).map(([id]) => id)
  const forSale = lotsOf('listing')
  const mine = lotsOf('owned')
  const clientIds = [...clients.keys()]

  const jump = (kind: 'listing' | 'owned' | 'lead', ids: string[]) => {
    if (!ids.length) return
    const i = cycle.current[kind] % ids.length
    cycle.current[kind] = i + 1
    setSelected(ids[i])
    scene.current?.focusLot(ids[i])
  }

  if (!ok)
    return (
      <div className="res-panel dark">
        This browser can't draw the 3D city (WebGL is off or unsupported). The
        territory map below still works.
      </div>
    )

  const selLot = selected ? city.lotById.get(selected) : undefined
  const selUse = selected ? uses.get(selected) : undefined
  const hovLot = hover ? city.lotById.get(hover) : undefined
  const hovUse = hover ? uses.get(hover) : undefined
  const listing = state.marketPool.find((l) => l.id === buying)
  const property = state.properties.find((p) => p.id === managing)
  const sheet = district ? districtOf(district) : undefined

  return (
    <div className="res-city">
      <div
        className="res-city-stage"
        ref={host}
        tabIndex={0}
        aria-label="The city. Drag to pan, scroll to zoom, Q and E to turn, click a lot."
        onKeyDown={(e) => {
          if (scene.current?.handleKey(e.nativeEvent)) e.preventDefault()
          if (e.key === 'Escape') setSelected(null)
        }}
      >
        <div className="res-city-labels" ref={labels} />

        <div className="res-city-hud res-city-tl">
          <div className="res-city-season">
            <span className="res-meta">Week {state.week}</span>
            <b>{SEASON_LABEL[season]}</b>
          </div>
          <div className="res-city-buttons">
            <button
              onClick={() => scene.current?.rotate(-1)}
              title="Turn left (Q)"
            >
              ⟲
            </button>
            <button
              onClick={() => scene.current?.rotate(1)}
              title="Turn right (E)"
            >
              ⟳
            </button>
            <button
              onClick={() => scene.current?.zoomBy(1.3)}
              title="Zoom in (+)"
            >
              +
            </button>
            <button
              onClick={() => scene.current?.zoomBy(1 / 1.3)}
              title="Zoom out (−)"
            >
              −
            </button>
            <button
              onClick={() => scene.current?.resetView()}
              title="Whole city (0)"
            >
              ⌂
            </button>
          </div>
          <div className="res-city-buttons">
            <button
              className="wide"
              disabled={!forSale.length}
              onClick={() => jump('listing', forSale)}
            >
              ◆ For sale ({forSale.length})
            </button>
            <button
              className="wide"
              disabled={!mine.length}
              onClick={() => jump('owned', mine)}
            >
              ⚑ Yours ({mine.length})
            </button>
            <button
              className="wide"
              disabled={!clientIds.length}
              onClick={() => jump('lead', clientIds)}
            >
              ☺ Clients ({clientIds.length})
            </button>
          </div>
        </div>

        <div className="res-city-hud res-city-legend">
          <span>
            <b style={{ background: BRASS }} />
            You
          </span>
          {RIVALS.map((r) => (
            <span key={r.id}>
              <b style={{ background: r.color }} />
              {r.name}
            </span>
          ))}
          <span>
            <b style={{ background: MARBLE }} />
            For sale
          </span>
          <span>
            <b style={{ background: CLIENT }} />
            Your clients
          </span>
          <span>
            <b style={{ background: INDIE_GREY }} />
            Independents
          </span>
        </div>

        <div className="res-city-hud res-city-hint">
          {hovLot && hovUse ? (
            <>
              <b>{hovLot.address}</b> ·{' '}
              {districtOrFirst(hovLot.districtId).name} · {ownerLine(hovUse)}
              {hovUse.kind === 'listing' &&
                ' · ' + labelOf(hovUse.listing.typeId)}
              {hover &&
                clients.get(hover) &&
                ' · ' + clients.get(hover)!.clientName + ' is touring it'}
            </>
          ) : (
            'Drag to pan · scroll to zoom · Q / E to turn · click any lot'
          )}
        </div>

        {selLot && selUse && (
          <LotCard
            state={state}
            lot={selLot}
            use={selUse}
            lead={clients.get(selLot.id)}
            dispatch={dispatch}
            onClose={() => setSelected(null)}
            onBuy={setBuying}
            onManage={setManaging}
            onDistrict={setDistrict}
          />
        )}
      </div>

      {listing && (
        <BuyModal
          state={state}
          askPrice={listing.askPrice}
          title={labelOf(listing.typeId)}
          blurb={listing.blurb}
          onCancel={() => setBuying(null)}
          onBuy={(downPct) => {
            dispatch({ type: 'BUY_PROPERTY', listingId: listing.id, downPct })
            setBuying(null)
          }}
        />
      )}

      {property && (
        <div
          className="res-modal"
          role="dialog"
          aria-modal="true"
          aria-label={property.nickname}
          onClick={() => setManaging(null)}
        >
          <div className="res-city-manage" onClick={(e) => e.stopPropagation()}>
            <PropertyCard
              state={state}
              property={property}
              dispatch={dispatch}
            />
            <button className="res-go" onClick={() => setManaging(null)}>
              Back to the city
            </button>
          </div>
        </div>
      )}

      {sheet && (
        <DistrictSheet
          state={state}
          dispatch={dispatch}
          district={sheet}
          onClose={() => setDistrict(null)}
        />
      )}
    </div>
  )
}
