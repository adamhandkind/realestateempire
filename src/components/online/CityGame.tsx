/* The game, in a shared city: the same Game shell, fed by a CityStore. The
   server plays every move; the week ends for everyone at the overnight tick,
   so the End Week button becomes the tick's countdown, and the Week Summary
   becomes the morning report. */

import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import Game from '../../Game'
import { cityTransport, type CitySummary, type SaveText } from '../../net/api'
import { CityStore, type SyncStatus } from '../../net/cityStore'
import { CityContext, type CityUi } from './cityContext'
import LeagueTab from './LeagueTab'
import TickBar from './TickBar'

const STATUS_TEXT: Record<SyncStatus, string> = {
  saved: 'Saved',
  saving: 'Working…',
  offline: 'Offline — will retry',
  error: 'Not saving',
}

/** Has this browser shown this morning's report yet? A per-viewer nicety. */
const seenKey = (cityId: string) => 'res_report_' + cityId
function seen(cityId: string): string | null {
  try {
    return window.localStorage.getItem(seenKey(cityId))
  } catch {
    return null
  }
}
function markSeen(cityId: string, v: string) {
  try {
    window.localStorage.setItem(seenKey(cityId), v)
  } catch {
    /* fine: it shows again next visit */
  }
}

const POLL_MS = 60_000

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
  const state = useSyncExternalStore(store.subscribe, store.getState)
  const status = useSyncExternalStore(store.subscribe, store.getStatus)
  const view = useSyncExternalStore(store.subscribe, store.getCity)
  const report = useSyncExternalStore(store.subscribe, store.getReport)
  const [seenReport, setSeenReport] = useState(() => seen(city.id))

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
  const ui: CityUi = useMemo(
    () => ({ view, me, isOwner: city.role === 'owner', bid: store.bid, withdraw: store.withdraw }),
    [view, me, city.role, store],
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
            markSeen(city.id, reportId)
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
            />
          ),
        }}
      />
    </CityContext.Provider>
  )
}
