/* The big screen. Before the game: a room code, a QR code, and the seats
   filling up as phones join. During the game: the board, whose turn it is,
   the eras, and the table talk. Nobody's cards are ever shown here.

   The TV remembers its room, so a refresh (or the laptop going to sleep)
   brings the same room straight back. */

import { useCallback, useEffect, useRef, useState } from 'react'
import { ERAS, MAX_SEATS, WIN_POINTS } from '../../board/data'
import { awardsFor } from '../../party/awards'
import { ApiError, api } from '../../net/api'
import { PartyClient, partyApi, tvMemory, type Link } from '../../party/client'
import { SETUP_MS, TURN_MS, type PartyOp, type PartyView } from '../../party/protocol'
import { sound } from '../../party/sound'
import BoardSvg from '../board/BoardSvg'
import Qr from './Qr'
import { useSecondsLeft } from './useClock'
import './party.css'

type Screen =
  | { kind: 'loading' }
  | { kind: 'host'; message?: string; signIn?: boolean }
  | { kind: 'room'; code: string; token: string }

export default function PartyTv() {
  const [screen, setScreen] = useState<Screen>({ kind: 'loading' })
  const [adults, setAdults] = useState(false)

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
      sound.unlock()
      /* Ticking the box is the host saying they're 18+, as in the main game. */
      await api.confirmAdult()
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
          <p className="pt-sub">The filthy party board game. One big screen, everyone plays on their phone. 2–4 players, about 45 minutes, adults only.</p>
          {screen.signIn ? (
            <p className="pt-warn">
              Sign in on this screen first: open your sign-in link here, then come back to <b>/tv</b>.{' '}
              <a href="/">Go to sign in</a>
            </p>
          ) : (
            <>
              <label className="pt-check">
                <input type="checkbox" checked={adults} onChange={(e) => setAdults(e.target.checked)} />
                <span>
                  <b>Everyone playing is 18 or older.</b> The table talk is filthy, the bots are worse, and nobody here is getting
                  an apology.
                </span>
              </label>
              <button className="pt-big" disabled={!adults} onClick={() => void host()}>
                Start a room
              </button>
            </>
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
        <TvGame view={view} send={send} />
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
        <p className="pt-codelabel">Room code · 18+</p>
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
          <button
            className="pt-big"
            disabled={seats.length < 2}
            onClick={() => {
              sound.unlock()
              send({ op: 'start' })
            }}
          >
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

const TV_DOING: Record<PartyView['board']['phase'], string> = {
  setupHouse: 'Picking a spot for a house…',
  setupStreet: 'Laying a street…',
  roll: 'About to roll…',
  crash: 'Market Crash! Moving the 📉…',
  steal: 'Picking who to poach from…',
  main: 'Trading and building…',
  freeStreets: 'Laying free streets…',
}

/** Table talk too routine for the big caption. */
const PLAIN = / collects |^.{1,40} rolled \d+\.$/

const FACES = ['', '⚀', '⚁', '⚂', '⚃', '⚄', '⚅']

type Moment = { kind: 'era' | 'crash'; key: number; era?: number }

/** Watches the board change and makes the room notice: sounds, the
 *  Market Crash and new-era cards. */
function useMoments(view: PartyView, secs: number | null) {
  const b = view.board
  const prev = useRef<PartyView | null>(null)
  const [moment, setMoment] = useState<Moment | null>(null)
  useEffect(() => {
    const p = prev.current?.board
    prev.current = view
    if (!p || p.status === 'lobby') return
    const rolled = b.dice && (!p.dice || p.turn !== b.turn || p.round !== b.round)
    if (b.status === 'over' && p.status !== 'over') sound.play('win')
    else if (b.era > p.era) {
      sound.play('era')
      setMoment({ kind: 'era', key: b.rev, era: b.era })
    } else if (rolled && b.dice![0] + b.dice![1] === 7) {
      sound.play('crash')
      setMoment({ kind: 'crash', key: b.rev })
    } else if (rolled) sound.play('dice')
    else if (Object.keys(b.buildings).length > Object.keys(p.buildings).length || Object.keys(b.streets).length > Object.keys(p.streets).length)
      sound.play('build')
    else if (p.turn !== b.turn && !b.seats[b.turn].bot) sound.play('turn')
  }, [view, b])
  /* The last five seconds of a person's clock tick. */
  useEffect(() => {
    if (secs !== null && secs > 0 && secs <= 5 && !b.seats[b.turn]?.bot) sound.play('tick')
  }, [secs, b.seats, b.turn])
  useEffect(() => {
    if (!moment) return
    const t = setTimeout(() => setMoment(null), moment.kind === 'era' ? 4200 : 2600)
    return () => clearTimeout(t)
  }, [moment])
  return moment
}

function SoundButton() {
  const [, redraw] = useState(0)
  const flip = () => {
    sound.unlock()
    if (!sound.blocked || sound.muted) sound.setMuted(!sound.muted)
    redraw((n) => n + 1)
  }
  const label = sound.muted ? '🔇 Sound off' : sound.blocked ? '🔈 Click for sound' : '🔊 Sound on'
  return (
    <button className="pt-mini pt-sound" onClick={flip}>
      {label}
    </button>
  )
}

function Clock({ secs, total, color }: { secs: number; total: number; color: string }) {
  const r = 26
  const c = 2 * Math.PI * r
  const frac = Math.min(1, secs / total)
  return (
    <svg className={'pt-clock' + (secs <= 10 ? ' warn' : '')} viewBox="0 0 64 64" aria-label={secs + ' seconds left'}>
      <circle cx="32" cy="32" r={r} className="pt-clock-bg" />
      <circle cx="32" cy="32" r={r} className="pt-clock-fg" style={{ stroke: secs <= 10 ? undefined : color }}
        strokeDasharray={c} strokeDashoffset={c * (1 - frac)} transform="rotate(-90 32 32)" />
      <text x="32" y="39" textAnchor="middle">{secs}</text>
    </svg>
  )
}

function TvGame({ view, send }: { view: PartyView; send: (o: PartyOp) => void }) {
  const b = view.board
  const up = b.seats[b.turn]
  const secs = useSecondsLeft(view)
  const moment = useMoments(view, secs)
  const showClock = secs !== null && !up.bot && b.status === 'playing'
  /* The caption is for the jokes: skip plain payouts and dice totals. */
  const latest = [...b.log].reverse().find((l) => !PLAIN.test(l.text)) ?? b.log[b.log.length - 1]
  if (b.status === 'over') return <TvWinner view={view} send={send} />
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
        <SoundButton />
        <span className="pt-codechip">Room {view.code}</span>
      </header>
      <div className="pt-game-main">
        <div className="pt-board-wrap">
          <BoardSvg view={b} click={{}} ghost={view.aim ? { ...view.aim, color: b.seats[view.aim.seat]?.color ?? '#fff' } : null} />
          {latest && (
            <p key={latest.n} className="pt-caption" style={latest.seat !== undefined ? { borderColor: b.seats[latest.seat]?.color } : undefined}>
              {latest.text}
            </p>
          )}
        </div>
        <aside className="pt-game-side">
          <div className="pt-turn" style={{ borderColor: up.color }}>
            <div className="pt-turn-row">
              <div className="pt-turn-who">
                <span className="pt-eyebrow">{b.round > 0 ? 'Round ' + b.round : 'Opening placement'}</span>
                <b>
                  <i style={{ background: up.color }} /> {up.name}
                </b>
                <span>{up.bot || up.autopilot ? 'The bot is thinking…' : !view.online[up.id] ? '📵 Phone away. The bot steps in soon.' : TV_DOING[b.phase]}</span>
              </div>
              {showClock && <Clock secs={secs} total={b.round === 0 ? SETUP_MS / 1000 : TURN_MS / 1000} color={up.color} />}
            </div>
            {b.dice && (
              <div key={b.turn + ':' + b.round + ':' + b.dice.join()} className={'pt-bigdice' + (b.dice[0] + b.dice[1] === 7 ? ' seven' : '')}>
                <span>{FACES[b.dice[0]]}</span>
                <span>{FACES[b.dice[1]]}</span>
                <b>{b.dice[0] + b.dice[1]}</b>
              </div>
            )}
          </div>
          <ul className="pt-scores">
            {b.seats.map((s, i) => (
              <li key={s.id} className={i === b.turn ? 'up' : ''}>
                <i style={{ background: s.color }} />
                <b>{s.name}</b>
                <small>
                  {s.cards} cards
                  {b.mainStreet === i ? ' · 🛣️' : ''}
                  {b.topProducer === i ? ' · 🎈' : ''}
                  {!s.bot && !view.online[s.id] ? ' · 📵' : ''}
                </small>
                <span>{s.points}</span>
              </li>
            ))}
          </ul>
          <p className="pt-hint">First to {WIN_POINTS} wins · {ERAS[b.era].blurb}</p>
          <ul className="pt-log">
            {b.log.slice(-5, -1).reverse().map((l) => (
              <li key={l.n} style={l.seat !== undefined ? { borderLeftColor: b.seats[l.seat]?.color } : undefined}>
                {l.text}
              </li>
            ))}
          </ul>
        </aside>
      </div>
      {moment?.kind === 'era' && (
        <div key={moment.key} className="pt-moment era">
          <p className="pt-eyebrow">📢 A new era</p>
          <h2>{ERAS[moment.era!].name}</h2>
          <p>{ERAS[moment.era!].blurb}</p>
        </div>
      )}
      {moment?.kind === 'crash' && (
        <div key={moment.key} className="pt-moment crash">
          <h2>📉 Market Crash</h2>
          <p>Seven. Anyone holding more than 7 cards just got audited.</p>
        </div>
      )}
    </div>
  )
}

function TvWinner({ view, send }: { view: PartyView; send: (o: PartyOp) => void }) {
  const b = view.board
  const w = b.winner !== null ? b.seats[b.winner] : null
  const awards = awardsFor(b)
  const ranked = b.seats.map((s, i) => ({ s, i })).sort((x, y) => (y.s.totalPoints ?? y.s.points) - (x.s.totalPoints ?? x.s.points))
  return (
    <div className="pt-winner" style={{ ['--win' as string]: w?.color ?? 'var(--brass)' }}>
      <div className="pt-winner-head">
        <p className="pt-eyebrow">Game over · {b.round} rounds</p>
        <h1>🏆 {w?.name ?? 'Nobody'} wins</h1>
        <p className="pt-sub">{b.log[b.log.length - 1]?.text.replace(/^🏆 /, '')}</p>
      </div>
      <div className="pt-winner-body">
        <ol className="pt-final">
          {ranked.map(({ s, i }) => (
            <li key={s.id} className={i === b.winner ? 'win' : ''}>
              <i style={{ background: s.color }} />
              <b>{s.name}</b>
              <span>{s.totalPoints ?? s.points}</span>
            </li>
          ))}
        </ol>
        <ul className="pt-awards">
          {awards.map((a) => (
            <li key={a.title} style={{ borderColor: b.seats[a.seat].color }}>
              <span className="pt-award-icon">{a.icon}</span>
              <div>
                <b>{a.title}</b>
                <small>{a.line}</small>
              </div>
            </li>
          ))}
        </ul>
      </div>
      <div className="pt-actions pt-winner-actions">
        <button className="pt-big" onClick={() => send({ op: 'again' })}>
          Play again
        </button>
        <span className="pt-hint">Same people, back to the lobby. The host can start it from their phone too.</span>
      </div>
    </div>
  )
}
