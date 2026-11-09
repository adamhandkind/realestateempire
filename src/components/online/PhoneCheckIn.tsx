/* The phone check-in: the daily visit for someone on a job site. One
   column, big buttons, no 3D. It shows what the overnight tick did, lets you
   check in (which keeps your houses from falling apart), keep an eye on your
   offers, and read the feed and the standings. The full game is one tap
   away for when you're at a desk. */

import { useEffect, useState } from 'react'
import { SEASON_LABEL, seasonOf } from '../../city/season'
import type { MorningReport, SeasonResult } from '../../citygame/types'
import type { CityView } from '../../citygame/view'
import { AGENT_COLORS } from '../../data/agentColors'
import { districtOrFirst } from '../../data/districts'
import { labelOf } from '../../logic/portfolio'
import { money } from '../../logic/rand'
import type { CitySummary } from '../../net/api'
import type { CityStore } from '../../net/cityStore'
import type { GameState } from '../../state/types'
import { countdown } from './time'

const hexOf = (id: string) => AGENT_COLORS.find((c) => c.id === id)?.hex ?? '#888'
const sum = (lines: [string, number][]) => lines.reduce((t, [, n]) => t + n, 0)

export default function PhoneCheckIn({
  city,
  view,
  state,
  report,
  store,
  onFull,
  onAwards,
}: {
  city: CitySummary
  view: CityView
  state: GameState
  report: MorningReport | null
  store: CityStore
  onFull: () => void
  onAwards: (r: SeasonResult) => void
}) {
  const [now, setNow] = useState(() => Date.now())
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(t)
  }, [])
  const me = view.players.find((p) => p.you)
  const offers = view.listings.filter((l) => l.myBid)
  const sm = report?.summary
  const net = sm ? sum(sm.moneyIn) - sum(sm.moneyOut) : 0
  const checkedIn = (me?.missed ?? 0) === 0
  const champ = view.champion

  const call = async (f: () => Promise<string | null>, ok: string) => {
    setBusy(true)
    const e = await f()
    setBusy(false)
    setMsg(e ?? ok)
  }

  return (
    <div className="res-app res-phone">
      <header className="res-phone-head">
        <div className="res-eyebrow">{city.name}</div>
        <h1 className="res-display">
          {view.status === 'lobby' ? 'In the lobby' : view.status === 'finished' ? 'Season ' + view.season + ' is over' : 'Week ' + view.week}
        </h1>
        {view.status === 'running' && (
          <div className="res-meta">
            Season {view.season} · {SEASON_LABEL[seasonOf(view.week)]}
          </div>
        )}
      </header>

      {champ && (
        <div className="res-phone-champ">
          👑 <b style={{ color: hexOf(champ.color) }}>{champ.userId === me?.userId ? 'You' : champ.name}</b>, “{champ.title}”, wears the
          kit this season.
        </div>
      )}

      {view.status === 'running' && (
        <section className={'res-phone-card res-phone-checkin' + (checkedIn ? ' done' : '')}>
          {checkedIn ? (
            <>
              <b>✓ You’ve shown up this week.</b>
              <span>Your houses are safe from the weeds. Nothing else needed unless you want to play.</span>
            </>
          ) : (
            <>
              <b>{me && me.missed > 1 ? 'You’ve missed ' + me.missed + ' days.' : 'You haven’t checked in this week.'}</b>
              <span>Miss three and your properties start falling apart; seven and the bank comes for them.</span>
              <button className="res-go" disabled={busy} onClick={() => call(store.markCheckedIn, 'Checked in. See you tomorrow.')}>
                Check in
              </button>
            </>
          )}
          {view.nextTickAt && <span className="res-meta">The tick runs in {countdown(view.nextTickAt - now)}</span>}
        </section>
      )}
      {msg && <div className="res-ok">{msg}</div>}

      {me && (
        <section className="res-phone-card res-phone-stats">
          <div>
            <span className="res-meta">Place</span>
            <b>#{me.place}</b>
          </div>
          <div>
            <span className="res-meta">Cash</span>
            <b>{money(state.cash)}</b>
          </div>
          <div>
            <span className="res-meta">Net worth</span>
            <b>{money(me.netWorth)}</b>
          </div>
        </section>
      )}

      {report && (
        <section className="res-phone-card">
          <h2 className="res-h2 res-display">Overnight · week {report.week}</h2>
          {sm && (
            <div className="res-phone-money">
              <span>In {money(sum(sm.moneyIn))}</span>
              <span>Out {money(sum(sm.moneyOut))}</span>
              <b className={net >= 0 ? 'up' : 'down'}>
                {net >= 0 ? '+' : '−'}
                {money(Math.abs(net))}
              </b>
            </div>
          )}
          {report.offers.length > 0 && (
            <ul>
              {report.offers.map((o, i) => (
                <li key={i}>{o}</li>
              ))}
            </ul>
          )}
        </section>
      )}

      {offers.length > 0 && (
        <section className="res-phone-card">
          <h2 className="res-h2 res-display">Your offers</h2>
          <ul className="res-phone-offers">
            {offers.map((l) => (
              <li key={l.id}>
                <span>
                  {labelOf(l.typeId)} in {districtOrFirst(l.districtId).name}
                  <small>
                    {money(l.myBid!.amount)} on {money(l.askPrice)} ask · {l.bids > 1 ? l.bids + ' bidders' : 'just you'}
                  </small>
                </span>
                <button disabled={busy} onClick={() => call(() => store.withdraw(l.id), 'Offer withdrawn.')}>
                  Withdraw
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="res-phone-card">
        <h2 className="res-h2 res-display">Standings</h2>
        <ol className="res-phone-board">
          {view.players.map((p) => (
            <li key={p.userId} className={p.you ? 'you' : ''}>
              <span className="dot" style={{ background: hexOf(p.color) }} />
              <span>{p.you ? 'You' : p.name}</span>
              <b>{money(p.netWorth)}</b>
            </li>
          ))}
        </ol>
      </section>

      <section className="res-phone-card dark">
        <h2 className="res-h2 res-display">The feed</h2>
        <ul className="res-feed">
          {view.feed.slice(0, 10).map((f) => (
            <li key={f.id} className={'k-' + f.kind}>
              <span className="wk">W{f.week}</span>
              <span>{f.text}</span>
            </li>
          ))}
        </ul>
      </section>

      <div className="res-phone-actions">
        {view.lastSeason?.awards?.length ? (
          <button className="res-tab" onClick={() => onAwards(view.lastSeason!)}>
            Season {view.lastSeason.season} awards
          </button>
        ) : null}
        <button className="res-go" onClick={onFull}>
          Open the full game
        </button>
      </div>
    </div>
  )
}
