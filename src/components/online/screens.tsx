/* The screens between "opened the link" and "playing": sign in, the 18+
   check, founding a city, and the no-invite dead end. */

import { useState, type FormEvent, type ReactNode } from 'react'
import { ApiError, api, type InvitePeek } from '../../net/api'

export function Gate({ eyebrow, title, children }: { eyebrow?: string; title: string; children: ReactNode }) {
  return (
    <div className="res-gate">
      <div className="res-card">
        <p className="res-eyebrow">{eyebrow ?? 'Real Estate Empire'}</p>
        <h2 className="res-display">{title}</h2>
        {children}
      </div>
    </div>
  )
}

const messageOf = (e: unknown) =>
  e instanceof ApiError ? e.message : "Couldn't reach the server. Check your connection."

export function SignIn({
  invite,
  invitePeek,
  notice,
  onJoined,
}: {
  invite: string | null
  invitePeek: InvitePeek | null
  notice: string | null
  onJoined: (cityId: string) => void
}) {
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!invite) return
    setBusy(true)
    setError(null)
    try {
      const r = await api.join(email, invite)
      onJoined(r.cityId)
    } catch (err) {
      setError(messageOf(err))
      setBusy(false)
    }
  }

  if (!invitePeek?.ok)
    return (
      <Gate title="Sign in">
        <p>
          Invite only, and there are no passwords. To get in, open the invite link your city owner sent you. Signed out?
          Ask them for a fresh sign-in link.
        </p>
        {invitePeek && <div className="res-err">{invitePeek.message}</div>}
        {notice && <div className="res-err">{notice}</div>}
      </Gate>
    )

  return (
    <Gate eyebrow={`${invitePeek.from} invited you`} title={`Join ${invitePeek.city}`}>
      <p>
        A private city of {invitePeek.members} agent{invitePeek.members === 1 ? '' : 's'} and counting. You start in a tent
        under a bridge. Where you end up is your problem.
      </p>
      {notice && <div className="res-err">{notice}</div>}
      <form onSubmit={submit}>
        <label className="res-field">
          Your email
          <input
            className="res-input"
            type="email"
            autoComplete="email"
            required
            autoFocus
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={invitePeek.emailLocked ? 'The address your invite is for' : 'you@example.com'}
          />
        </label>
        <p style={{ fontSize: 12.5, color: '#5b5e6c' }}>
          It's your name tag here. We never email you. You'll stay signed in on this device.
        </p>
        {error && <div className="res-err">{error}</div>}
        <button className="res-go" disabled={busy || !email.trim()}>
          {busy ? 'Joining…' : 'Join the city'}
        </button>
      </form>
    </Gate>
  )
}

export function AdultGate({ onDone }: { onDone: () => void }) {
  const [ok, setOk] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const go = async () => {
    setBusy(true)
    try {
      await api.confirmAdult()
      onDone()
    } catch (e) {
      setError(messageOf(e))
      setBusy(false)
    }
  }
  return (
    <Gate eyebrow="One question first" title="Adults only">
      <p>
        Real Estate Empire is satire of realtor culture, and it is not polite about it: crude jokes, adult themes, and
        language your brokerage would not put on a bus bench.
      </p>
      <label className="res-check">
        <input type="checkbox" checked={ok} onChange={(e) => setOk(e.target.checked)} />
        <span>I'm 18 or older and I'm fine with that.</span>
      </label>
      {error && <div className="res-err">{error}</div>}
      <button className="res-go" disabled={!ok || busy} onClick={go}>
        Let me in
      </button>
    </Gate>
  )
}

export function FoundCity({ onDone, onSignOut }: { onDone: () => void; onSignOut: () => void }) {
  const [name, setName] = useState('Brantford')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    try {
      await api.createCity(name)
      onDone()
    } catch (err) {
      setError(messageOf(err))
      setBusy(false)
    }
  }
  return (
    <Gate eyebrow="You own the game" title="Found a city">
      <p>One city, up to ten friends, one season. Name it, then invite people from the League tab.</p>
      <form onSubmit={submit}>
        <label className="res-field">
          City name
          <input className="res-input" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} />
        </label>
        {error && <div className="res-err">{error}</div>}
        <button className="res-go" disabled={busy || name.trim().length < 2}>
          Found it
        </button>
      </form>
      <button className="res-linkbtn" onClick={onSignOut}>
        Sign out
      </button>
    </Gate>
  )
}

export function NoCity({ email, onSignOut }: { email: string; onSignOut: () => void }) {
  return (
    <Gate title="No city yet">
      <p>
        You're signed in as <b>{email}</b>, but you're not in a city. Ask whoever runs your group for an invite link, then
        open it in this browser.
      </p>
      <button className="res-linkbtn" onClick={onSignOut}>
        Sign out
      </button>
    </Gate>
  )
}

export function CityPicker({
  cities,
  onPick,
}: {
  cities: { id: string; name: string; agent: { name: string } | null }[]
  onPick: (id: string) => void
}) {
  return (
    <Gate title="Pick a city">
      {cities.map((c) => (
        <button key={c.id} className="res-go" onClick={() => onPick(c.id)}>
          {c.name}
          {c.agent ? ' · ' + c.agent.name : ''}
        </button>
      ))}
    </Gate>
  )
}
