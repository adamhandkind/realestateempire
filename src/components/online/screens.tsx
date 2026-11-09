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

export function SignIn({ invite, invitePeek, notice }: { invite: string | null; invitePeek: InvitePeek | null; notice: string | null }) {
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState(false)
  const [devLink, setDevLink] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const r = await api.requestLink(email, invite ?? undefined)
      setSent(true)
      setDevLink(r.devLink ?? null)
    } catch (err) {
      setError(messageOf(err))
    } finally {
      setBusy(false)
    }
  }

  const invited = invitePeek?.ok
  if (sent)
    return (
      <Gate title="Check your email">
        <p>
          If <b>{email}</b> {invited ? 'can take this invite' : 'has an account or an invite'}, a login link is on its way. It
          works once and expires in 15 minutes.
        </p>
        <p style={{ fontSize: 12.5, color: '#5b5e6c' }}>No email? Check spam, then try again.</p>
        {devLink && (
          <a className="res-devlink" href={devLink}>
            Dev mode: open the login link →
          </a>
        )}
        <button className="res-linkbtn" onClick={() => setSent(false)}>
          Use a different address
        </button>
      </Gate>
    )

  return (
    <Gate
      eyebrow={invited ? `${invitePeek!.from} invited you` : undefined}
      title={invited ? `Join ${invitePeek!.city}` : 'Sign in'}
    >
      {invited ? (
        <p>
          A private city of {invitePeek!.members} agent{invitePeek!.members === 1 ? '' : 's'} and counting. You start in a
          tent under a bridge. Where you end up is your problem.
        </p>
      ) : (
        <p>Invite only. Enter your email and we'll send you a login link. No passwords.</p>
      )}
      {invitePeek && !invitePeek.ok && <div className="res-err">{invitePeek.message}</div>}
      {notice && <div className="res-err">{notice}</div>}
      <form onSubmit={submit}>
        <label className="res-field">
          Email
          <input
            className="res-input"
            type="email"
            autoComplete="email"
            required
            autoFocus
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={invitePeek?.emailLocked ? 'The address your invite was sent to' : 'you@example.com'}
          />
        </label>
        {error && <div className="res-err">{error}</div>}
        <button className="res-go" disabled={busy || !email.trim()}>
          {busy ? 'Sending…' : 'Email me a login link'}
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
