/* The League tab, online only: the city's leaderboard by net worth, the
   owner's invite desk, and the account bits (switch city, sign out). */

import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { AGENT_COLORS } from '../../data/agentColors'
import { CHARACTERS } from '../../data/characters'
import { RANKS } from '../../data/ranks'
import { money } from '../../logic/rand'
import { ApiError, api, type BoardRow, type CitySummary, type InviteRow } from '../../net/api'

const hexOf = (id: string) => AGENT_COLORS.find((c) => c.id === id)?.hex ?? '#888'
const rankName = (id: string | null) => RANKS.find((r) => r.id === id)?.name ?? '—'
const charName = (id: string) => CHARACTERS.find((c) => c.id === id)?.name ?? ''

function ago(t: number | null): string {
  if (!t) return 'never'
  const m = Math.round((Date.now() - t) / 60_000)
  if (m < 2) return 'just now'
  if (m < 60) return m + ' min ago'
  const h = Math.round(m / 60)
  if (h < 36) return h + ' h ago'
  return Math.round(h / 24) + ' days ago'
}

function Leaderboard({ cityId }: { cityId: string }) {
  const [rows, setRows] = useState<BoardRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const load = useCallback(() => {
    api
      .leaderboard(cityId)
      .then((b) => {
        setRows(b.rows)
        setError(null)
      })
      .catch((e) => setError(e instanceof ApiError ? e.message : "Couldn't load the leaderboard."))
  }, [cityId])
  useEffect(load, [load])

  return (
    <div className="res-panel">
      <h3 className="res-h2 res-display">The Leaderboard</h3>
      {error && <div className="res-err">{error}</div>}
      {!rows && !error && <p>Counting everybody's money…</p>}
      {rows && (
        <table className="res-board">
          <thead>
            <tr>
              <th>#</th>
              <th>Agent</th>
              <th className="hide-sm">Rank</th>
              <th className="num hide-sm">Week</th>
              <th className="num">Net worth</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.place} className={r.you ? 'you' : ''}>
                <td className="place">{r.place}</td>
                <td>
                  <span className="dot" style={{ background: hexOf(r.color) }} />
                  {r.name}
                  {r.gameOver ? ' 💀' : ''}
                  <span className="sub">
                    {r.characterId !== 'you' && charName(r.characterId) + ' · '}played {ago(r.lastPlayed)}
                  </span>
                </td>
                <td className="hide-sm">{rankName(r.rank)}</td>
                <td className="num hide-sm">{r.week}</td>
                <td className="num">{money(r.netWorth)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <div className="res-mini">
        <button onClick={load}>Refresh</button>
      </div>
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
  email,
  cityCount,
  onSwitchCity,
  onSignOut,
}: {
  city: CitySummary
  email: string
  cityCount: number
  onSwitchCity: () => void
  onSignOut: () => void
}) {
  return (
    <>
      <Leaderboard cityId={city.id} />
      {city.role === 'owner' && <InviteDesk cityId={city.id} />}
      <div className="res-panel dark">
        <h3 className="res-h2 res-display">{city.name}</h3>
        <p className="res-debug-note">
          Season {city.season}. Signed in as {email}. Your game saves to the cloud as you play, so you can pick it up on
          any computer.
        </p>
        <div className="res-mini">
          {cityCount > 1 && <button onClick={onSwitchCity}>Switch city</button>}
          <button onClick={onSignOut}>Sign out</button>
        </div>
      </div>
    </>
  )
}
