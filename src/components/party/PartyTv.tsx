/* The big screen. Before the game: a room code, a QR code, and the seats
   filling up as phones join. During the game: the board, whose turn it is,
   the eras, and the table talk. Nobody's cards are ever shown here.

   The TV remembers its room, so a refresh (or the laptop going to sleep)
   brings the same room straight back. */

import { useCallback, useEffect, useRef, useState } from 'react'
import { ERAS, MAX_SEATS, WIN_POINTS } from '../../board/data'
import { ApiError } from '../../net/api'
import { PartyClient, partyApi, tvMemory, type Link } from '../../party/client'
import type { PartyOp, PartyView } from '../../party/protocol'
import BoardSvg from '../board/BoardSvg'
import Qr from './Qr'
import './party.css'

type Screen =
  | { kind: 'loading' }
  | { kind: 'host'; message?: string; signIn?: boolean }
  | { kind: 'room'; code: string; token: string }

export default function PartyTv() {
  const [screen, setScreen] = useState<Screen>({ kind: 'loading' })

  /* A remembered room that's still open picks up where it was. */
  useEffect(() => {
    const saved = tvMemory.get()
    if (!saved) return setScreen({ kind: 'host' })
    partyApi.peek(saved.code).then((p) => {
      if (p.ok) setScreen({ kind: 'room', ...saved })
      else {
        tvMemory.set(null)
        setScreen({ kind: 'host', message: p.error === 'no_server' || p.error === 'offline' ? p.message : undefined })
      }
    })
  }, [])

  const host = async () => {
    try {
      const r = await partyApi.host()
      const saved = { code: r.code, token: r.tvToken }
      tvMemory.set(saved)
      setScreen({ kind: 'room', ...saved })
    } catch (e) {
      const err = e instanceof ApiError ? e : null
      if (err?.status === 401) setScreen({ kind: 'host', signIn: true })
      else setScreen({ kind: 'host', message: err?.message ?? 'Couldn’t open a room.' })
    }
  }

  const closeRoom = useCallback(() => {
    tvMemory.set(null)
    setScreen({ kind: 'host' })
  }, [])

  if (screen.kind === 'loading') return <div className="pt-tv" />
  if (screen.kind === 'host')
    return (
      <div className="pt-tv pt-center">
        <div className="pt-host">
          <p className="pt-eyebrow">Real Estate Empire presents</p>
          <h1 className="pt-title">Land Grab</h1>
          <p className="pt-sub">The party board game. One big screen, everyone plays on their phone. 2–4 players, about 45 minutes.</p>
          {screen.signIn ? (
            <p className="pt-warn">
              Sign in on this screen first: open your sign-in link here, then come back to <b>/tv</b>.{' '}
              <a href="/">Go to sign in</a>
            </p>
          ) : (
            <button className="pt-big" onClick={() => void host()}>
              Start a room
            </button>
          )}
          {screen.message && <p className="pt-warn">{screen.message}</p>}
        </div>
      </div>
    )
  return <TvRoom code={screen.code} token={screen.token} onClosed={closeRoom} />
}

function TvRoom({ code, token, onClosed }: { code: string; token: string; onClosed: () => void }) {
  const [view, setView] = useState<PartyView | null>(null)
  const [link, setLink] = useState<Link>('connecting')
  const [error, setError] = useState<string | null>(null)
  const client = useRef<PartyClient | null>(null)

  useEffect(() => {
    const c = new PartyClient(code, token, {
      onState: setView,
      onLink: setLink,
      onError: (_code, message) => setError(message),
      onBye: () => onClosed(),
    })
    client.current = c
    return () => c.dispose()
  }, [code, token, onClosed])

  useEffect(() => {
    if (!error) return
    const t = setTimeout(() => setError(null), 5000)
    return () => clearTimeout(t)
  }, [error])

  const send = useCallback((op: PartyOp) => {
    if (!client.current?.send(op)) setError('Reconnecting… try again in a moment.')
  }, [])

  return (
    <div className="pt-tv">
      {link !== 'open' && <div className="pt-link">{link === 'connecting' ? 'Connecting…' : 'Reconnecting…'}</div>}
      {error && <div className="pt-toast">{error}</div>}
      {!view ? (
        <div className="pt-center">
          <p className="pt-sub">Opening room {code}…</p>
        </div>
      ) : view.board.status === 'lobby' ? (
        <TvLobby view={view} send={send} onClose={onClosed} />
      ) : (
        <TvGame view={view} />
      )}
    </div>
  )
}

const joinUrl = (code: string) => `${window.location.origin}/join/${code}`

function TvLobby({ view, send, onClose }: { view: PartyView; send: (o: PartyOp) => void; onClose: () => void }) {
  const seats = view.board.seats
  const url = joinUrl(view.code)
  const host = seats.find((s) => s.id === view.hostSeat)
  return (
    <div className="pt-lobby">
      <section className="pt-join">
        <p className="pt-eyebrow">Join on your phone</p>
        <Qr text={url} label={'QR code to join room ' + view.code} />
        <p className="pt-url">
          {window.location.host}/join
        </p>
        <p className="pt-codelabel">Room code</p>
        <p className="pt-code" aria-label={'Room code ' + view.code.split('').join(' ')}>
          {view.code}
        </p>
      </section>

      <section className="pt-seats-col">
        <h1 className="pt-title sm">Land Grab</h1>
        <ul className="pt-seats">
          {seats.map((s) => (
            <li key={s.id} style={{ borderColor: s.color }}>
              <i style={{ background: s.color }} />
              <b>{s.name}</b>
              <span className="pt-seat-tag">
                {s.bot ? 'bot' : view.online[s.id] ? (s.id === view.hostSeat ? 'host · here' : 'here') : 'phone away'}
              </span>
              {s.bot ? (
                <button className="pt-mini" onClick={() => send({ op: 'removeBot', seatId: s.id })}>
                  Remove
                </button>
              ) : (
                <button className="pt-mini" onClick={() => send({ op: 'kick', seatId: s.id })}>
                  Kick
                </button>
              )}
            </li>
          ))}
          {Array.from({ length: MAX_SEATS - seats.length }, (_, i) => (
            <li key={'e' + i} className="pt-empty">
              <i />
              <b>Waiting for a player…</b>
            </li>
          ))}
        </ul>
        <div className="pt-actions">
          <button className="pt-mid" disabled={seats.length >= MAX_SEATS} onClick={() => send({ op: 'addBot' })}>
            + Add a bot
          </button>
          <button className="pt-big" disabled={seats.length < 2} onClick={() => send({ op: 'start' })}>
            Start the game
          </button>
        </div>
        <p className="pt-hint">
          {seats.length < 2
            ? 'Two or more players to start. Bots count.'
            : host
              ? `${host.name} can also start from their phone.`
              : 'Ready when you are.'}
        </p>
        <button className="pt-link-btn" onClick={onClose}>
          Close this room
        </button>
      </section>
    </div>
  )
}

function TvGame({ view }: { view: PartyView }) {
  const b = view.board
  const up = b.seats[b.turn]
  const winner = b.winner !== null ? b.seats[b.winner] : null
  return (
    <div className="pt-game">
      <header className="pt-game-top">
        <span className="pt-title xs">Land Grab</span>
        <ol className="pt-eras">
          {ERAS.map((e, i) => (
            <li key={e.name} className={i < b.era ? 'done' : i === b.era ? 'on' : ''}>
              {e.name.replace(' Era', '')}
            </li>
          ))}
        </ol>
        <span className="pt-codechip">Room {view.code}</span>
      </header>
      <div className="pt-game-main">
        <div className="pt-board-wrap">
          <BoardSvg view={b} click={{}} />
        </div>
        <aside className="pt-game-side">
          <div className="pt-turn" style={{ borderColor: winner?.color ?? up.color }}>
            {winner ? (
              <>
                <span className="pt-eyebrow">Winner</span>
                <b>🏆 {winner.name}</b>
                <span>{winner.totalPoints ?? winner.points} Empire Points</span>
              </>
            ) : (
              <>
                <span className="pt-eyebrow">{b.round > 0 ? 'Round ' + b.round : 'Opening placement'}</span>
                <b>
                  <i style={{ background: up.color }} /> {up.name}
                </b>
                <span>{up.bot || up.autopilot ? 'The bot is thinking…' : 'Make your move on your phone'}</span>
                {b.dice && (
                  <span className={'pt-dice' + (b.dice[0] + b.dice[1] === 7 ? ' seven' : '')}>
                    🎲 {b.dice[0] + b.dice[1]}
                  </span>
                )}
              </>
            )}
          </div>
          <ul className="pt-scores">
            {b.seats.map((s, i) => (
              <li key={s.id} className={i === b.turn && !winner ? 'up' : ''}>
                <i style={{ background: s.color }} />
                <b>{s.name}</b>
                <small>
                  {s.cards} cards
                  {b.mainStreet === i ? ' · 🛣️' : ''}
                  {b.topProducer === i ? ' · 🎈' : ''}
                  {!s.bot && !view.online[s.id] ? ' · 📵' : ''}
                </small>
                <span>{winner ? (s.totalPoints ?? s.points) : s.points}</span>
              </li>
            ))}
          </ul>
          <p className="pt-hint">First to {WIN_POINTS} wins · {ERAS[b.era].blurb}</p>
          <ul className="pt-log">
            {b.log.slice(-6).reverse().map((l) => (
              <li key={l.n} style={l.seat !== undefined ? { borderLeftColor: b.seats[l.seat]?.color } : undefined}>
                {l.text}
              </li>
            ))}
          </ul>
        </aside>
      </div>
    </div>
  )
}
