/* Where the End Week button used to be. In a shared city the week ends for
   everyone at once, overnight, so this says when — and, for the owner, opens
   the season. */

import { useEffect, useState } from 'react'
import { SEASON_LABEL, seasonOf } from '../../city/season'
import type { CityView } from '../../citygame/view'
import type { CityStore } from '../../net/cityStore'
import type { GameState } from '../../state/types'
import { clockTime, countdown } from './time'

export default function TickBar({
  view,
  state,
  isOwner,
  store,
  onError,
}: {
  view: CityView
  state: GameState
  isOwner: boolean
  store: CityStore
  onError: (text: string) => void
}) {
  const [now, setNow] = useState(() => Date.now())
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(t)
  }, [])

  const run = async (f: () => Promise<string | null>) => {
    setBusy(true)
    const e = await f()
    setBusy(false)
    if (e) onError(e)
  }

  const waiting =
    state.call !== null ? "You're on the phone." : state.pendingChoices.length > 0 ? 'Decisions await — answer them before the tick, or the safe answer is picked for you.' : null

  if (view.status === 'lobby')
    return (
      <div className="res-tickbar">
        <div>
          <div className="res-display">THE SEASON HASN’T STARTED</div>
          <div className="res-meta">
            {view.players.length} agent{view.players.length === 1 ? '' : 's'} in town.{' '}
            {isOwner
              ? 'Open it when everyone’s in. Everybody starts fresh in a tent at week 1.'
              : 'The city owner opens the season. Look around until then.'}
          </div>
        </div>
        {isOwner && (
          <button className="res-go" disabled={busy} onClick={() => run(store.startSeason)}>
            Open season {view.season}
          </button>
        )}
      </div>
    )

  const finished = view.status === 'finished'
  return (
    <div className={'res-tickbar' + (finished ? ' done' : '')}>
      <div>
        <div className="res-display">
          {finished ? 'SEASON ' + view.season + ' IS OVER' : 'WEEK ' + view.week + ' OF 52'}
        </div>
        <div className="res-meta">
          {finished
            ? 'Season ' + (view.season + 1) + ' opens at the next tick. Everybody back to the tent.'
            : SEASON_LABEL[seasonOf(view.week)] + '. The week ends for everyone at the overnight tick.'}
        </div>
        {waiting && !finished && <div className="res-meta warn">{waiting}</div>}
      </div>
      <div className="res-tick-when">
        {view.nextTickAt ? (
          <>
            <b>{countdown(view.nextTickAt - now)}</b>
            <span>{clockTime(view.nextTickAt, view.tickZone)}</span>
          </>
        ) : (
          <span>No tick scheduled</span>
        )}
        {isOwner && view.manualTick && (
          <button className="res-tab" disabled={busy} onClick={() => run(store.runTick)} title="Dev only">
            Run the tick now
          </button>
        )}
      </div>
    </div>
  )
}
