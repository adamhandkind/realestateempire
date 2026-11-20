/* The phone. Scan the TV's QR code (or type the code), pick a name and a
   colour, and you're in. The phone keeps its seat token, so locking the
   screen, a reload, or a dropped Wi-Fi puts you straight back in your seat.

   During a game the phone is the controller (PhoneGame). */

import { useCallback, useEffect, useRef, useState } from 'react'
import { ApiError } from '../../net/api'
import { PartyClient, partyApi, rememberName, rememberedName, seatMemory, type Link } from '../../party/client'
import { NAME_MAX, PARTY_COLORS, normalizeCode, type PartyOp, type PartyView, type Peek } from '../../party/protocol'
import PhoneGame from './PhoneGame'
import './party.css'

type Screen =
  | { kind: 'code'; message?: string }
  | { kind: 'join'; code: string }
  | { kind: 'seat'; code: string; token: string }
  | { kind: 'gone'; message: string; code: string | null }

/** The code in the address (/join/ABCD), if any. */
function codeFromPath(): string | null {
  const m = window.location.pathname.match(/^\/join\/([^/]+)/)
  return m ? normalizeCode(decodeURIComponent(m[1])) : null
}

function setPath(code: string | null) {
  window.history.replaceState(null, '', code ? '/join/' + code : '/join')
}

export default function PartyPhone() {
  const [screen, setScreen] = useState<Screen>(() => {
    const code = codeFromPath()
    const saved = seatMemory.get()
    if (saved && (!code || saved.code === code)) return { kind: 'seat', ...saved }
    return code ? { kind: 'join', code } : { kind: 'code' }
  })

  const toCode = useCallback((message?: string) => {
    setPath(null)
    setScreen({ kind: 'code', message })
  }, [])

  if (screen.kind === 'code')
    return (
      <EnterCode
        message={screen.message}
        onCode={(code) => {
          setPath(code)
          setScreen({ kind: 'join', code })
        }}
      />
    )
  if (screen.kind === 'join')
    return (
      <Join
        code={screen.code}
        onBack={toCode}
        onJoined={(token) => {
          const saved = { code: screen.code, token }
          seatMemory.set(saved)
          setScreen({ kind: 'seat', ...saved })
        }}
      />
    )
  if (screen.kind === 'gone')
    return (
      <div className="pt-phone pt-center">
        <div className="pt-card">
          <p>{screen.message}</p>
          {screen.code && (
            <button className="pt-big" onClick={() => setScreen({ kind: 'join', code: screen.code! })}>
              Join again
            </button>
          )}
          <button className="pt-link-btn" onClick={() => toCode()}>
            Enter a different code
          </button>
        </div>
      </div>
    )
  return (
    <Seat
      code={screen.code}
      token={screen.token}
      onGone={(message, rejoin) => {
        seatMemory.set(null)
        setScreen({ kind: 'gone', message, code: rejoin ? screen.code : null })
      }}
    />
  )
}

/* ------------------------------------------------------------------ code */

function EnterCode({ message, onCode }: { message?: string; onCode: (code: string) => void }) {
  const [text, setText] = useState('')
  const [err, setErr] = useState<string | null>(message ?? null)
  const go = async () => {
    const code = normalizeCode(text)
    if (!code) return setErr('Room codes are four letters. Check the TV.')
    const p = await partyApi.peek(code)
    if (!p.ok) return setErr(p.message)
    onCode(code)
  }
  return (
    <div className="pt-phone pt-center">
      <form
        className="pt-card"
        onSubmit={(e) => {
          e.preventDefault()
          void go()
        }}
      >
        <h1 className="pt-title sm">Land Grab</h1>
        <label className="pt-label" htmlFor="pt-code">
          Room code (it’s on the TV)
        </label>
        <input
          id="pt-code"
          className="pt-input pt-code-input"
          value={text}
          onChange={(e) => setText(e.target.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4))}
          autoCapitalize="characters"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          inputMode="text"
          placeholder="ABCD"
          autoFocus
        />
        {err && <p className="pt-warn">{err}</p>}
        <button className="pt-big" disabled={text.length !== 4}>
          Next
        </button>
      </form>
    </div>
  )
}

/* ------------------------------------------------------------------ join */

function Join({ code, onBack, onJoined }: { code: string; onBack: (message?: string) => void; onJoined: (token: string) => void }) {
  const [peek, setPeek] = useState<Peek | null>(null)
  const [name, setName] = useState(rememberedName)
  const [color, setColor] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const look = useCallback(() => partyApi.peek(code).then(setPeek), [code])
  useEffect(() => {
    void look()
    /* Colours get taken while you're typing; look again now and then. */
    const t = setInterval(() => void look(), 4000)
    return () => clearInterval(t)
  }, [look])

  const taken = new Set(peek?.ok ? peek.seats.map((s) => s.color) : [])
  useEffect(() => {
    if (color && taken.has(color)) setColor(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [peek])

  if (peek && !peek.ok) {
    return (
      <div className="pt-phone pt-center">
        <div className="pt-card">
          <p className="pt-warn">{peek.message}</p>
          <button className="pt-big" onClick={() => onBack()}>
            Enter the code again
          </button>
        </div>
      </div>
    )
  }

  const closed = peek?.ok && (peek.status !== 'lobby' || peek.full)
  const go = async () => {
    if (!color) return setErr('Pick a colour.')
    setBusy(true)
    setErr(null)
    try {
      const r = await partyApi.join(code, name, color)
      rememberName(name.trim())
      onJoined(r.token)
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Couldn’t join. Try again.')
      void look()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="pt-phone">
      <form
        className="pt-card pt-join-form"
        onSubmit={(e) => {
          e.preventDefault()
          void go()
        }}
      >
        <p className="pt-eyebrow">Room {code}</p>
        <h1 className="pt-title sm">Land Grab</h1>
        {peek?.ok && peek.seats.length > 0 && (
          <p className="pt-hint">
            Already here: {peek.seats.map((s) => s.name).join(', ')}
          </p>
        )}
        {closed ? (
          <p className="pt-warn">{peek?.ok && peek.full ? 'This table is full.' : 'This game has already started.'}</p>
        ) : (
          <>
            <label className="pt-label" htmlFor="pt-name">
              Your name
            </label>
            <input
              id="pt-name"
              className="pt-input"
              value={name}
              maxLength={NAME_MAX}
              onChange={(e) => setName(e.target.value)}
              autoComplete="nickname"
              enterKeyHint="done"
              placeholder="e.g. Big Steve"
            />
            <span className="pt-label">Your colour</span>
            <div className="pt-swatches" role="radiogroup" aria-label="Your colour">
              {PARTY_COLORS.map((c) => (
                <button
                  type="button"
                  key={c.hex}
                  role="radio"
                  aria-checked={color === c.hex}
                  aria-label={c.name + (taken.has(c.hex) ? ' (taken)' : '')}
                  disabled={taken.has(c.hex)}
                  className={'pt-swatch' + (color === c.hex ? ' on' : '')}
                  style={{ background: c.hex }}
                  onClick={() => setColor(c.hex)}
                />
              ))}
            </div>
            {err && <p className="pt-warn">{err}</p>}
            <button className="pt-big" disabled={busy || !name.trim() || !color}>
              {busy ? 'Joining…' : 'Join the game'}
            </button>
          </>
        )}
        <button type="button" className="pt-link-btn" onClick={() => onBack()}>
          Wrong room?
        </button>
      </form>
    </div>
  )
}

/* ------------------------------------------------------------------ seat */

const BYE: Record<string, string> = {
  kicked: 'You were removed from the table.',
  left: 'You left the table.',
  closed: 'This room has closed.',
  bad_token: 'Your seat isn’t there any more.',
}

function Seat({ code, token, onGone }: { code: string; token: string; onGone: (message: string, rejoin: boolean) => void }) {
  const [view, setView] = useState<PartyView | null>(null)
  const [link, setLink] = useState<Link>('connecting')
  const [err, setErr] = useState<string | null>(null)
  const client = useRef<PartyClient | null>(null)
  const gone = useRef(onGone)
  gone.current = onGone

  useEffect(() => {
    const c = new PartyClient(code, token, {
      onState: setView,
      onLink: setLink,
      onError: (_c, m) => setErr(m),
      onBye: (reason) => gone.current(BYE[reason] ?? 'You’re out of the room.', reason !== 'closed'),
    })
    client.current = c
    return () => c.dispose()
  }, [code, token])

  useEffect(() => {
    if (!err) return
    const t = setTimeout(() => setErr(null), 4000)
    return () => clearTimeout(t)
  }, [err])

  const send = (op: PartyOp) => {
    const ok = client.current?.send(op) ?? false
    if (!ok && op.op !== 'aim') setErr('Reconnecting… try again in a moment.')
    return ok
  }

  if (!view)
    return (
      <div className="pt-phone pt-center">
        <p className="pt-sub">{link === 'offline' ? 'Can’t reach the room. Retrying…' : 'Finding your seat…'}</p>
      </div>
    )

  const b = view.board
  const me = b.seats.find((s) => s.id === view.seatId)
  const isHost = view.hostSeat === view.seatId
  const color = me?.color ?? '#888'

  return (
    <div className="pt-phone" style={{ ['--me' as string]: color }}>
      <header className="pt-phone-top">
        <i style={{ background: color }} />
        <b>{me?.name}</b>
        <span className="pt-codechip">Room {view.code}</span>
      </header>
      {link !== 'open' && <div className="pt-link">Reconnecting…</div>}
      {err && <div className="pt-toast">{err}</div>}

      {b.status === 'lobby' ? (
        <div className="pt-card">
          <p className="pt-youre-in">You’re in!</p>
          <p className="pt-hint">Look at the TV. {isHost ? 'You’re the host: start when everyone’s here.' : 'Waiting for the host to start.'}</p>
          <ul className="pt-mini-seats">
            {b.seats.map((s) => (
              <li key={s.id}>
                <i style={{ background: s.color }} />
                {s.name}
                {s.id === view.seatId ? ' (you)' : s.bot ? ' (bot)' : ''}
              </li>
            ))}
          </ul>
          {isHost && (
            <div className="pt-actions col">
              <button className="pt-mid" disabled={b.seats.length >= 4} onClick={() => send({ op: 'addBot' })}>
                + Add a bot
              </button>
              <button className="pt-big" disabled={b.seats.length < 2} onClick={() => send({ op: 'start' })}>
                Start the game
              </button>
            </div>
          )}
          <button className="pt-link-btn" onClick={() => send({ op: 'leave' })}>
            Leave the table
          </button>
        </div>
      ) : (
        <PhoneGame view={view} send={send} />
      )}
    </div>
  )
}
