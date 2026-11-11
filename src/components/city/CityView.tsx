/* The City tab's main event: the isometric city. Lazy-loaded (three.js is the
   biggest thing in the bundle), and the only component that talks to
   CityScene. Game data flows in through setData; clicks flow back out as lot
   ids, which open the game's existing screens. */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { TimeMode } from '../../city/daylight'
import { walkable, type Tile } from '../../city/paths'
import { AGENT_COLORS } from '../../data/agentColors'
import type { AgentSpec } from './agents'
import AgentCard from './AgentCard'
import { cityCard, soloCard } from '../../city/agentCard'
import './life.css'
import { cityLayout } from '../../city/layout'
import { leadLots, lotUses, type LotUse } from '../../city/occupancy'
import { SEASON_LABEL, seasonOf } from '../../city/season'
import { districtOf, districtOrFirst } from '../../data/districts'
import { RIVALS } from '../../data/rivals'
import { labelOf } from '../../logic/portfolio'
import type { Action, GameState } from '../../state/types'
import DistrictSheet from '../DistrictSheet'
import ListingDeal from '../portfolio/ListingDeal'
import PropertyCard from '../portfolio/PropertyCard'
import { CityScene, webglAvailable } from './CityScene'
import { useCity } from '../online/cityContext'
import LotCard from './LotCard'
import { ownerLine } from './ownerLine'
import { BRASS, CLIENT, INDIE_GREY, MARBLE } from './palette'

const priceMultOf = (id: string) => districtOf(id)?.priceMult ?? 1
const hexOf = (id: string) => AGENT_COLORS.find((c) => c.id === id)?.hex ?? id

/* Per-viewer conveniences: where you left your agent, and the sky and
   weather settings. Storage can be missing or blocked; that's fine. */
function recall<T>(key: string, fallback: T): T {
  try {
    const v = window.localStorage.getItem(key)
    return v ? (JSON.parse(v) as T) : fallback
  } catch {
    return fallback
  }
}
function remember(key: string, v: unknown) {
  try {
    window.localStorage.setItem(key, JSON.stringify(v))
  } catch {
    /* fine */
  }
}
const TIME_NEXT: Record<TimeMode, TimeMode> = { auto: 'day', day: 'night', night: 'auto' }
const TIME_ICON: Record<TimeMode, string> = { auto: '◐', day: '☀', night: '☾' }
const TIME_TITLE: Record<TimeMode, string> = {
  auto: 'Sky follows your clock (click for day)',
  day: 'Always day (click for night)',
  night: 'Always night (click for your clock)',
}

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
  /** Whose agent card is open (a lot card and an agent card never share the corner). */
  const [agentId, setAgentId] = useState<string | null>(null)
  const cycle = useRef({ listing: 0, owned: 0, lead: 0 })
  const [timeMode, setTimeMode] = useState<TimeMode>(() => recall('res_city_time', 'auto' as TimeMode))
  const [weather, setWeather] = useState<boolean>(() => recall('res_city_weather', true))

  const city = cityLayout()
  const season = seasonOf(state.week)
  /* In a shared city everyone else's buildings and tents are on the map. */
  const shared = useCity()
  const others = shared?.view.players
  const me = shared?.me
  const sharedMap = useMemo(
    () => (others && me ? { me, players: others } : undefined),
    [others, me],
  )
  /* Only the parts of the state that show on the map rebuild the city. */
  const { properties, marketPool, territory } = state
  const uses = useMemo(
    () => lotUses({ properties, marketPool, territory }, city, sharedMap),
    [properties, marketPool, territory, city, sharedMap],
  )
  const clients = useMemo(
    () => leadLots(state.leads, uses, city),
    [state.leads, uses, city],
  )
  const clientLots = useMemo(() => new Set(clients.keys()), [clients])

  /* ------------------------------------------------- your agent, walking */
  const myId = me ?? 'you'
  const champion = shared?.view.champion ?? null
  const iAmChamp = !!champion && champion.userId === me
  const myColor = shared ? hexOf(shared.view.players.find((p) => p.you)?.color ?? '') : BRASS
  const posKey = 'res_agent_' + (shared ? shared.me : 'solo')
  /** Where you start: where you left off, else your first door, else your
   *  tent under the bridge. */
  const home = useMemo((): Tile => {
    const camp = [...uses].find(([, u]) => u.kind === 'camp' && (!shared || u.campers?.some((c) => c.userId === shared.me)))
    const owned = [...uses].find(([, u]) => u.kind === 'owned')
    const id = (owned ?? camp)?.[0] ?? city.lots.find((l) => l.camp)?.id ?? city.lots[0].id
    const lot = city.lotById.get(id)!
    return [lot.col, lot.row]
    // Only on first sight of the map; walking around shouldn't move "home".
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [city])
  const [walk, setWalk] = useState<{ from: Tile; to: Tile; at: number }>(() => {
    const to = recall<Tile | null>(posKey, null) ?? home
    return { from: to, to, at: 0 }
  })
  const go = shared?.go
  /* Tell the live room where we're standing as soon as it's there. */
  useEffect(() => {
    go?.(walk.to, walk.to)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [go])
  const walkTo = useCallback(
    (to: Tile) => {
      const from = scene.current?.agents.tileOf(myId) ?? walk.to
      if (from[0] === to[0] && from[1] === to[1]) return
      if (!walkable(city, ...to)) return
      setWalk({ from, to, at: Date.now() })
      remember(posKey, to)
      go?.(from, to)
    },
    [myId, walk.to, posKey, go, city],
  )
  const walkRef = useRef(walkTo)
  walkRef.current = walkTo

  const agentSpecs = useMemo((): AgentSpec[] => {
    const mine: AgentSpec = {
      id: myId,
      name: 'You',
      color: iAmChamp ? '#e9c94a' : myColor,
      you: true,
      champion: iAmChamp,
      title: iAmChamp ? champion!.title : undefined,
      ...walk,
    }
    const others = (shared?.agents ?? [])
      .filter((a) => a.userId !== me)
      .map(
        (a): AgentSpec => ({
          id: a.userId,
          name: a.name,
          color: hexOf(a.color),
          you: false,
          champion: a.champion,
          title: a.champion && champion?.userId === a.userId ? champion.title : undefined,
          from: a.from,
          to: a.to,
          at: a.at,
        }),
      )
    return [mine, ...others]
  }, [myId, iAmChamp, myColor, champion, walk, shared?.agents, me])

  useEffect(() => {
    if (!ok || !host.current || !labels.current) return
    const s = new CityScene(host.current, labels.current, {
      onSelect: (lot) => {
        setSelected(lot)
        if (lot) setAgentId(null)
      },
      onAgent: (id) => {
        setAgentId(id)
        setSelected(null)
      },
      onHover: setHover,
      onGround: (t) => walkRef.current(t),
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
              : u.kind === 'player'
                ? 'P' + u.color + u.typeId
                : u.kind === 'camp'
                  ? 'C' + (u.campers ?? []).map((c) => c.color).join()
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

  useEffect(() => {
    scene.current?.setAgents(agentSpecs)
  }, [agentSpecs, ok])

  useEffect(() => {
    scene.current?.setTimeMode(timeMode)
    remember('res_city_time', timeMode)
  }, [timeMode, ok])

  useEffect(() => {
    scene.current?.setWeatherOn(weather)
    remember('res_city_weather', weather)
  }, [weather, ok])

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
        This browser can't draw the 3D city (WebGL is off or unsupported).
      </div>
    )

  const selLot = selected ? city.lotById.get(selected) : undefined
  const selUse = selected ? uses.get(selected) : undefined
  const hovLot = hover ? city.lotById.get(hover) : undefined
  const hovUse = hover ? uses.get(hover) : undefined
  const listing = state.marketPool.find((l) => l.id === buying)
  const property = state.properties.find((p) => p.id === managing)
  const sheet = district ? districtOf(district) : undefined
  const agentColor = agentSpecs.find((a) => a.id === agentId)?.color ?? myColor
  const agentCard = !agentId
    ? null
    : shared
      ? cityCard(shared.view, agentId, agentColor)
      : agentId === myId
        ? soloCard(state, myId, agentColor)
        : null

  return (
    <div className="res-city">
      <div
        className="res-city-stage"
        ref={host}
        tabIndex={0}
        aria-label="The city. Drag to pan, scroll to zoom, Q and E to turn, click a lot."
        onKeyDown={(e) => {
          if (scene.current?.handleKey(e.nativeEvent)) e.preventDefault()
          if (e.key === 'Escape') {
            setSelected(null)
            setAgentId(null)
          }
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
            <button onClick={() => setTimeMode(TIME_NEXT[timeMode])} title={TIME_TITLE[timeMode]} aria-label={TIME_TITLE[timeMode]}>
              {TIME_ICON[timeMode]}
            </button>
            <button
              onClick={() => setWeather(!weather)}
              title={weather ? 'Weather on (click to turn it off)' : 'Weather off (click to turn it on)'}
              aria-pressed={weather}
              className={weather ? '' : 'off'}
            >
              ❄
            </button>
            <button className="wide" onClick={() => scene.current?.followAgent(myId)} title="Find your agent and follow them">
              ◎ Find me
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
          {champion && (
            <span title={'Season ' + champion.season + ' champion'}>
              👑 {champion.userId === me ? 'You' : champion.name}, “{champion.title}”
            </span>
          )}
          {shared && (
            <span>
              {shared.agents.filter((a) => a.userId !== me).length
                ? shared.agents.filter((a) => a.userId !== me).length + ' on the map now'
                : 'Nobody else out walking'}
            </span>
          )}
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
            'Click anywhere to walk there · click an agent for their card · drag to pan · scroll to zoom · Q / E to turn'
          )}
        </div>

        {agentCard && (
          <AgentCard
            card={agentCard}
            onClose={() => setAgentId(null)}
            onFollow={() => {
              scene.current?.followAgent(agentCard.id)
              setAgentId(null)
            }}
          />
        )}

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
        <ListingDeal state={state} listing={listing} dispatch={dispatch} onDone={() => setBuying(null)} />
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
