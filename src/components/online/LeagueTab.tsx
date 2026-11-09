/* The League tab, online only: the city's leaderboard by net worth, the
   owner's invite desk, and the account bits (switch city, sign out). */

import { useCallback, useEffect, useState, type FormEvent } from 'react'
import type { CityView, PlayerView } from '../../citygame/view'
import type { CityStore } from '../../net/cityStore'
import { AGENT_COLORS } from '../../data/agentColors'
import { CHARACTERS } from '../../data/characters'
import { RANKS } from '../../data/ranks'
import { money } from '../../logic/rand'
import { ApiError, api, type CitySummary, type HallSeason, type InviteRow } from '../../net/api'

const hexOf = (id: string) => AGENT_COLORS.find((c) => c.id === id)?.hex ?? '#888'
const rankName = (id: string | null) => RANKS.find((r) => r.id === id)?.name ?? '—'
const charName = (id: string) => CHARACTERS.find((c) => c.id === id)?.name ?? ''

function Leaderboard({ view }: { view: CityView }) {
  return (
    <div className="res-panel">
      <h3 className="res-h2 res-display">The Leaderboard</h3>
      <p className="res-debug-note" style={{ color: '#6d6f7c' }}>
        Net worth, as of {view.status === 'lobby' ? 'right now' : 'week ' + view.week}. The leader after week 52 wears the blazer.
      </p>
      <table className="res-board">
        <thead>
          <tr>
            <th>#</th>
            <th>Agent</th>
            <th className="hide-sm">Rank</th>
            <th className="num hide-sm">Doors</th>
            <th className="num">Net worth</th>
          </tr>
        </thead>
        <tbody>
          {view.players.map((r) => (
            <tr key={r.userId} className={r.you ? 'you' : ''}>
              <td className="place">{r.place}</td>
              <td>
                <span className="dot" style={{ background: hexOf(r.color) }} />
                {r.name}
                {r.gameOver ? ' 💀' : ''}
                <span className="sub">
                  {r.characterId !== 'you' && charName(r.characterId) + ' · '}
                  {r.missed === 0 ? 'checked in this week' : r.missed === 1 ? 'missed a day' : 'missed ' + r.missed + ' days'}
                </span>
              </td>
              <td className="hide-sm">{rankName(r.rank)}</td>
              <td className="num hide-sm">{r.buildings.length}</td>
              <td className="num">{money(r.netWorth)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/** Names in the feed, in their owners' colours. */
function FeedText({ text, who, view }: { text: string; who: string[]; view: CityView }) {
  const people = who.map((id) => view.players.find((p) => p.userId === id)).filter((p): p is PlayerView => !!p)
  if (!people.length) return <>{text}</>
  const names = people.map((p) => p.name).sort((a, b) => b.length - a.length)
  const re = new RegExp('(' + names.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')', 'g')
  return (
    <>
      {text.split(re).map((part, i) => {
        const p = people.find((x) => x.name === part)
        return p ? (
          <b key={i} style={{ color: hexOf(p.color) }}>
            {part}
          </b>
        ) : (
          <span key={i}>{part}</span>
        )
      })}
    </>
  )
}

function Feed({ view }: { view: CityView }) {
  const name = (id: string) => view.players.find((p) => p.userId === id)?.name ?? 'Someone'
  return (
    <div className="res-panel dark">
      <h3 className="res-h2 res-display">The City Feed</h3>
      {view.rivalries.length > 0 && (
        <div className="res-grudges">
          {view.rivalries.slice(0, 3).map((r) => (
            <span key={r.winner + r.loser} className="res-chip">
              {name(r.winner)} over {name(r.loser)} ×{r.n}
            </span>
          ))}
        </div>
      )}
      {view.feed.length === 0 && <p className="res-debug-note">Quiet. Suspiciously quiet.</p>}
      <ul className="res-feed">
        {view.feed.map((f) => (
          <li key={f.id} className={'k-' + f.kind}>
            <span className="wk">W{f.week}</span>
            <span>
              <FeedText text={f.text} who={f.who} view={view} />
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

function HallOfFame({ cityId, view }: { cityId: string; view: CityView }) {
  const [seasons, setSeasons] = useState<HallSeason[] | null>(null)
  useEffect(() => {
    api.seasons(cityId).then((r) => setSeasons(r.seasons), () => setSeasons([]))
  }, [cityId, view.season, view.status])
  if (!seasons?.length) return null
  return (
    <div className="res-panel">
      <h3 className="res-h2 res-display">Hall of Fame</h3>
      <ul className="res-hall">
        {seasons.map((s) => (
          <li key={s.season}>
            <span className="res-meta">Season {s.season}</span>
            {s.champion ? (
              <span>
                <span className="dot" style={{ background: hexOf(s.champion.color) }} /> <b>{s.champion.name}</b> ·{' '}
                {money(s.champion.netWorth)}
              </span>
            ) : (
              <span>Nobody. Nobody at all.</span>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}

const HOURS = Array.from({ length: 24 }, (_, h) => h)
const hourLabel = (h: number) => (h === 0 ? '12 a.m.' : h < 12 ? h + ' a.m.' : h === 12 ? 'noon' : h - 12 + ' p.m.')

function TickDesk({ view, store }: { view: CityView; store: CityStore }) {
  const [hour, setHour] = useState(view.tickHour)
  const [zone, setZone] = useState(view.tickZone)
  const [msg, setMsg] = useState<string | null>(null)
  const save = async (e: FormEvent) => {
    e.preventDefault()
    const err = await store.setSchedule(hour, zone)
    setMsg(err ?? 'Saved. The tick runs at ' + hourLabel(hour) + ', ' + zone + '.')
  }
  return (
    <div className="res-panel dark">
      <h3 className="res-h2 res-display">The Overnight Tick</h3>
      <p className="res-debug-note">
        Every night at this hour the city runs the week for everyone at once: offers settle, rent comes in, the feed
        writes the morning report.
      </p>
      <form onSubmit={save}>
        <label className="res-field">
          Hour
          <select className="res-input" value={hour} onChange={(e) => setHour(Number(e.target.value))}>
            {HOURS.map((h) => (
              <option key={h} value={h}>
                {hourLabel(h)}
              </option>
            ))}
          </select>
        </label>
        <label className="res-field">
          Time zone
          <input className="res-input" value={zone} onChange={(e) => setZone(e.target.value)} />
        </label>
        {msg && <div className="res-ok">{msg}</div>}
        <button className="res-go">Save the schedule</button>
      </form>
    </div>
  )
}

function InviteDesk({ cityId }: { cityId: string }) {
  const [email, setEmail] = useState('')
  const [note, setNote] = useState('')
  const [made, setMade] = useState<{ link: string; emailed: boolean } | null>(null)
  const [invites, setInvites] = useState<InviteRow[]>([])
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)

  const load = useCallback(() => {
    api
      .listInvites(cityId)
      .then((r) => setInvites(r.invites))
      .catch(() => {})
  }, [cityId])
  useEffect(load, [load])

  const create = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    setCopied(false)
    try {
      const r = await api.createInvite(cityId, email, note)
      setMade({ link: r.link, emailed: r.emailed })
      setEmail('')
      setNote('')
      load()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't reach the server.")
    } finally {
      setBusy(false)
    }
  }

  const copy = async () => {
    if (!made) return
    try {
      await navigator.clipboard.writeText(made.link)
      setCopied(true)
    } catch {
      /* the field is selectable */
    }
  }

  return (
    <div className="res-panel dark">
      <h3 className="res-h2 res-display">Invite a Friend</h3>
      <p className="res-debug-note">
        Each link works once, for 14 days. Add their email to send it for you and lock it to that address, or leave it
        blank and send the link yourself.
      </p>
      <form onSubmit={create}>
        <label className="res-field">
          Their email (optional)
          <input className="res-input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label className="res-field">
          Note to self (optional)
          <input
            className="res-input"
            value={note}
            maxLength={60}
            placeholder="e.g. Dave from the job site"
            onChange={(e) => setNote(e.target.value)}
          />
        </label>
        {error && <div className="res-err">{error}</div>}
        <button className="res-go" disabled={busy}>
          {email.trim() ? 'Email the invite' : 'Make an invite link'}
        </button>
      </form>
      {made && (
        <>
          <div className="res-ok">
            {made.emailed ? 'Sent. Here’s the link too, ' : 'Here’s the link. '}it's only shown once.
          </div>
          <div className="res-invite-link">
            <input className="res-input" readOnly value={made.link} onFocus={(e) => e.target.select()} />
            <div className="res-mini" style={{ marginTop: 5 }}>
              <button onClick={copy}>{copied ? 'Copied' : 'Copy'}</button>
            </div>
          </div>
        </>
      )}
      {invites.length > 0 && (
        <ul className="res-invites">
          {invites.map((i) => (
            <li key={i.id}>
              <span>
                {i.usedBy ?? i.email ?? i.note ?? 'Open link'}
                {i.note && (i.usedBy || i.email) ? ' · ' + i.note : ''}
              </span>
              <span>
                <span className={'st ' + i.status}>{i.status}</span>
                {i.status === 'open' && (
                  <button
                    className="res-linkbtn"
                    style={{ marginLeft: 8, marginTop: 0, color: 'var(--muted)' }}
                    onClick={() => api.revokeInvite(cityId, i.id).then(load)}
                  >
                    revoke
                  </button>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export default function LeagueTab({
  city,
  view,
  store,
  email,
  cityCount,
  onSwitchCity,
  onSignOut,
}: {
  city: CitySummary
  view: CityView
  store: CityStore
  email: string
  cityCount: number
  onSwitchCity: () => void
  onSignOut: () => void
}) {
  return (
    <>
      <Leaderboard view={view} />
      <Feed view={view} />
      <HallOfFame cityId={city.id} view={view} />
      {city.role === 'owner' && <InviteDesk cityId={city.id} />}
      {city.role === 'owner' && <TickDesk view={view} store={store} />}
      <div className="res-panel dark">
        <h3 className="res-h2 res-display">{city.name}</h3>
        <p className="res-debug-note">
          Season {view.season}. Signed in as {email}. The city runs on the server, so your game is the same on any
          computer, and nobody, including you, can peek at tomorrow.
        </p>
        <div className="res-mini">
          {cityCount > 1 && <button onClick={onSwitchCity}>Switch city</button>}
          <button onClick={onSignOut}>Sign out</button>
        </div>
      </div>
    </>
  )
}
