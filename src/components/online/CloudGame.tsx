/* The game, online: the same Game shell, fed by a CloudStore instead of the
   local reducer. Saves as you play; shows whether it has. */

import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import Game from '../../Game'
import { raw, type CitySummary, type SaveText } from '../../net/api'
import { CloudStore, type SyncStatus } from '../../net/cloudStore'
import LeagueTab from './LeagueTab'

const STATUS_TEXT: Record<SyncStatus, string> = {
  saved: 'Saved',
  pending: 'Unsaved moves',
  saving: 'Saving…',
  offline: 'Offline — will retry',
  error: 'Not saving',
}

export default function CloudGame({
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
    () =>
      new CloudStore(
        {
          postActions: (body, keepalive) =>
            raw('POST', `/api/cities/${city.id}/game/actions`, body, keepalive ? { keepalive: true } : {}),
          getGame: async () => {
            const r = await raw('GET', `/api/cities/${city.id}/game`)
            if (r.status !== 200) throw new Error('load failed')
            return r.data as unknown as SaveText
          },
        },
        save.version,
        save.state,
        { onNotice: setNotice, onSignedOut },
      ),
    // A new save (new game, other city) means a new store.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [city.id, save],
  )
  const state = useSyncExternalStore(store.subscribe, store.getState)
  const status = useSyncExternalStore(store.subscribe, store.getStatus)

  useEffect(() => {
    const hide = () => store.flushOnExit()
    const vis = () => {
      if (document.visibilityState === 'hidden') void store.flush()
      else void store.checkIn()
    }
    const unload = (e: BeforeUnloadEvent) => {
      if (store.pending > 0) {
        store.flushOnExit()
        e.preventDefault()
      }
    }
    window.addEventListener('pagehide', hide)
    window.addEventListener('beforeunload', unload)
    document.addEventListener('visibilitychange', vis)
    return () => {
      window.removeEventListener('pagehide', hide)
      window.removeEventListener('beforeunload', unload)
      document.removeEventListener('visibilitychange', vis)
      store.flushOnExit()
      store.dispose()
    }
  }, [store])

  return (
    <Game
      state={state}
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
        league: (
          <LeagueTab
            city={city}
            email={email}
            cityCount={cityCount}
            onSwitchCity={onSwitchCity}
            onSignOut={onSignOut}
          />
        ),
      }}
    />
  )
}
