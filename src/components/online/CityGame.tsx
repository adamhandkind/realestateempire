/* The game, in a shared city: the same Game shell, fed by a CityStore. The
   server plays every move; the week ends for everyone at the overnight tick,
   so the End Week button becomes the tick's countdown, and the Week Summary
   becomes the morning report. */

import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import Game from '../../Game'
import { cityTransport, type CitySummary, type SaveText } from '../../net/api'
import { CityStore, type SyncStatus } from '../../net/cityStore'
import { LiveClient } from '../../net/live'
import { CityContext, type CityUi } from './cityContext'
import type { SeasonResult } from '../../citygame/types'
import AwardsNight from './AwardsNight'
import LeagueTab from './LeagueTab'
import PhoneCheckIn from './PhoneCheckIn'
import TickBar from './TickBar'

const STATUS_TEXT: Record<SyncStatus, string> = {
  saved: 'Saved',
  saving: 'Working…',
  offline: 'Offline — will retry',
  error: 'Not saving',
}

/** Has this browser shown this morning's report yet? A per-viewer nicety. */
const seenKey = (cityId: string) => 'res_report_' + cityId
function seen(key: string): string | null {
  try {
    return window.localStorage.getItem(key)
  } catch {
    return null
  }
}
function markSeen(key: string, v: string) {
  try {
    window.localStorage.setItem(key, v)
  } catch {
    /* fine: it shows again next visit */
  }
}

const isPhone = () => typeof window.matchMedia === 'function' && window.matchMedia('(max-width: 640px)').matches

const POLL_MS = 60_000

const noSubscribe = () => () => {}
const NO_AGENTS: never[] = []
const noAgents = () => NO_AGENTS
const noGo = () => {}

export default function CityGame({
  city,
  email,
  cityCount,
  save,
  onNewGame,
  onSwitchCity,
  onSignOut,
  onSignedOut,
}: {
  city: CitySummary
  email: string
  cityCount: number
  save: SaveText
  onNewGame: () => void
  onSwitchCity: () => void
  onSignOut: () => void
  onSignedOut: () => void
}) {
  const [notice, setNotice] = useState<string | null>(null)
  const store = useMemo(
    () => new CityStore(cityTransport(city.id), save, { onNotice: setNotice, onSignedOut }),
    // A new save (new game, other city) means a new store.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [city.id, save],
  )
  /* The live room: other agents on the map, and a nudge when the tick runs.
     Made in an effect, not a memo, so a discarded render never leaves a
     socket open. */
  const [live, setLive] = useState<LiveClient | null>(null)
  useEffect(() => {
    const l = new LiveClient(city.id, { onTick: () => void store.checkIn(), onCity: () => void store.checkIn() })
    setLive(l)
    return () => l.dispose()
  }, [city.id, store])
  const agents = useSyncExternalStore(live?.subscribe ?? noSubscribe, live?.getAgents ?? noAgents)
  const state = useSyncExternalStore(store.subscribe, store.getState)
  const status = useSyncExternalStore(store.subscribe, store.getStatus)
  const view = useSyncExternalStore(store.subscribe, store.getCity)
  const report = useSyncExternalStore(store.subscribe, store.getReport)
  const [seenReport, setSeenReport] = useState(() => seen(seenKey(city.id)))

  useEffect(() => {
    const vis = () => {
      if (document.visibilityState === 'visible') void store.checkIn()
    }
    const timer = setInterval(() => void store.checkIn(), POLL_MS)
    document.addEventListener('visibilitychange', vis)
    return () => {
      clearInterval(timer)
      document.removeEventListener('visibilitychange', vis)
      store.dispose()
    }
  }, [store])

  /* A tick can land while the tab is open; the countdown reaching zero is
     the cue to look. */
  useEffect(() => {
    if (!view.nextTickAt) return
    const wait = view.nextTickAt - Date.now() + 15_000
    if (wait <= 0 || wait > 2 ** 31 - 1) return
    const t = setTimeout(() => void store.checkIn(), wait)
    return () => clearTimeout(t)
  }, [store, view.nextTickAt])

  const reportId = report ? view.season + ':' + report.week : null
  const unread = !!report?.summary && reportId !== seenReport
  const shown = useMemo(() => (unread && report?.summary ? { ...state, summary: report.summary } : state), [unread, report, state])

  const me = view.players.find((p) => p.you)?.userId ?? ''

  /* Awards night: shown once per browser when a season ends (or to anyone
     who missed it, early next season), and from the Hall of Fame. */
  const last = view.lastSeason
  const awardsKey = 'res_awards_' + city.id + '_' + (last?.season ?? 0)
  const [awards, setAwards] = useState<SeasonResult | null>(null)
  useEffect(() => {
    if (!last?.awards?.length) return
    if (view.status !== 'finished' && !(view.season === last.season + 1 && view.week <= 7)) return
    if (seen(awardsKey) === 'seen') return
    setAwards(last)
  }, [last, awardsKey, view.status, view.season, view.week])
  const closeAwards = () => {
    if (awards && last && awards.season === last.season) markSeen(awardsKey, 'seen')
    setAwards(null)
  }

  /* On a phone, the check-in comes first; the full game is a tap away. */
  const [full, setFull] = useState(() => !isPhone())
  const ui: CityUi = useMemo(
    () => ({ view, me, isOwner: city.role === 'owner', bid: store.bid, withdraw: store.withdraw, agents, go: live?.go ?? noGo }),
    [view, me, city.role, store, agents, live],
  )

  const ceremony = awards && <AwardsNight result={awards} me={me} onClose={closeAwards} />

  if (!full)
    return (
      <CityContext.Provider value={ui}>
        <PhoneCheckIn
          city={city}
          view={view}
          state={state}
          report={report}
          store={store}
          onFull={() => setFull(true)}
          onAwards={setAwards}
        />
        {ceremony}
      </CityContext.Provider>
    )

  return (
    <CityContext.Provider value={ui}>
      <Game
        state={shown}
        dispatch={store.dispatch}
        onNewGame={onNewGame}
        online={{
          status: (
            <>
              <div className={'res-sync ' + status} role="status">
                <span>{city.name}</span>·<i /> {STATUS_TEXT[status]}
              </div>
              {notice && (
                <div className="res-banner res-notice">
                  <span>{notice}</span>
                  <button aria-label="Dismiss" onClick={() => setNotice(null)}>
                    ×
                  </button>
                </div>
              )}
            </>
          ),
          endWeek: <TickBar view={view} state={state} isOwner={city.role === 'owner'} store={store} onError={setNotice} />,
          summaryExtra: report?.offers.length ? (
            <div className="res-report-city">
              <div className="res-meta">Your offers</div>
              <ul>
                {report.offers.map((o, i) => (
                  <li key={i}>{o}</li>
                ))}
              </ul>
            </div>
          ) : null,
          onSummaryClosed: () => {
            if (!reportId) return
            markSeen(seenKey(city.id), reportId)
            setSeenReport(reportId)
          },
          league: (
            <LeagueTab
              city={city}
              view={view}
              store={store}
              email={email}
              cityCount={cityCount}
              onSwitchCity={onSwitchCity}
              onSignOut={onSignOut}
              onAwards={setAwards}
            />
          ),
        }}
      />
      {ceremony}
    </CityContext.Provider>
  )
}
