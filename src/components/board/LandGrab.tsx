/* Land Grab: the board game tab. Lobby → opening placement → the race
   through four eras to 12 Empire Points. Everything it does goes through a
   BoardTransport (the server for a city, or a practice table in this
   browser); this file only draws and sends moves. */

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  BUILDING_INFO,
  COSTS,
  DEAL_INFO,
  ERAS,
  LIMITS,
  MAX_SEATS,
  RESOURCES,
  RES_INFO,
  WIN_POINTS,
  bankRatio,
} from '../../board/data'
import { canAfford, canUpgrade, emptyHand, handSize, legalHouses, legalStreets, upgradeCost } from '../../board/rules'
import type { BoardView, DealCard, Hand, Move, Res } from '../../board/types'
import { ApiError } from '../../net/api'
import type { BoardOp, BoardTransport } from '../../net/board'
import BoardSvg, { type Clickable } from './BoardSvg'
import './board.css'

type Tool = 'street' | 'house' | 'upgrade' | null

export default function LandGrab({ transport }: { transport: BoardTransport }) {
  const [view, setView] = useState<BoardView | null | undefined>(undefined)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const reload = useCallback(() => {
    transport.load().then(setView, (e) => setError(e instanceof ApiError ? e.message : 'Couldn’t reach the table.'))
  }, [transport])

  useEffect(() => {
    reload()
    return transport.subscribe(reload)
  }, [transport, reload])

  const send = useCallback(
    async (o: BoardOp) => {
      setBusy(true)
      setError(null)
      try {
        setView(await transport.op(o))
      } catch (e) {
        setError(e instanceof ApiError ? e.message : 'Something went wrong at the table.')
        if (e instanceof ApiError && e.code === 'stale') reload()
      } finally {
        setBusy(false)
      }
    },
    [transport, reload],
  )

  if (view === undefined) return <div className="lg-wrap"><p className="lg-muted">Setting up the table…</p></div>

  return (
    <div className="lg-wrap">
      {error && (
        <div className="res-banner res-notice lg-error">
          <span>{error}</span>
          <button aria-label="Dismiss" onClick={() => setError(null)}>
            ×
          </button>
        </div>
      )}
      {view === null ? (
        <Intro transport={transport} busy={busy} onOpen={() => void send({ op: 'open' })} />
      ) : view.status === 'lobby' ? (
        <Lobby view={view} transport={transport} busy={busy} send={send} />
      ) : (
        <Table view={view} transport={transport} busy={busy} send={send} />
      )}
    </div>
  )
}

/* ----------------------------------------------------------------- intro */

function Rules() {
  return (
    <div className="lg-rules">
      <p>
        A hex map of the city. Every tile pays out a resource when its number is rolled:{' '}
        {RESOURCES.map((r) => (
          <span key={r} className="lg-nowrap">
            {RES_INFO[r].icon} {RES_INFO[r].name}{' '}
          </span>
        ))}
      </p>
      <ol>
        <li>
          <b>Opening:</b> everyone places a house and a street, then again in reverse order. Your second house pays you a card from each tile it touches.
        </li>
        <li>
          <b>Each turn:</b> roll → trade with the table or the bank → build → end your turn.
        </li>
        <li>
          <b>A 7 is a Market Crash:</b> anyone holding more than 7 cards loses half, then you park the 📉 on a tile (it stops paying) and take a card from someone there.
        </li>
        <li>
          <b>Eras:</b> when the leader reaches 4, 7 and 10 points, the whole table moves into the next era and new buildings unlock.
        </li>
        <li>
          <b>Win:</b> first to {WIN_POINTS} Empire Points on their own turn. Houses 1, duplexes 2, towers 3. Main Street (5+ streets in a row) and Top Producer (3+ Open Houses) are worth 2 each.
        </li>
      </ol>
    </div>
  )
}

function Intro({ transport, busy, onOpen }: { transport: BoardTransport; busy: boolean; onOpen: () => void }) {
  return (
    <div className="res-panel dark lg-intro">
      <p className="res-eyebrow">The board game</p>
      <h2 className="res-display">Land Grab</h2>
      <p>
        Two to four agents fight over one city, one dice roll at a time. Build streets, put up houses, flip them into duplexes and towers,
        and work your way from Agent to Mogul.
      </p>
      <Rules />
      <button className="res-go" disabled={busy} onClick={onOpen}>
        {transport.kind === 'online' ? 'Open a table for the city' : 'Deal me in against three bots'}
      </button>
    </div>
  )
}

/* ----------------------------------------------------------------- lobby */

function Lobby({ view, transport, busy, send }: { view: BoardView; transport: BoardTransport; busy: boolean; send: (o: BoardOp) => void }) {
  const seated = view.you >= 0
  const full = view.seats.length >= MAX_SEATS
  return (
    <div className="res-panel dark lg-intro">
      <p className="res-eyebrow">Land Grab · waiting for players</p>
      <h2 className="res-display">The table</h2>
      <ul className="lg-seats">
        {view.seats.map((s) => (
          <li key={s.id}>
            <i style={{ background: s.color }} />
            <span>{s.name}</span>
            {s.bot && (seated || transport.isOwner) && (
              <button className="lg-link" disabled={busy} onClick={() => send({ op: 'removeBot', seatId: s.id })}>
                remove
              </button>
            )}
          </li>
        ))}
        {Array.from({ length: MAX_SEATS - view.seats.length }, (_, i) => (
          <li key={'empty' + i} className="lg-empty">
            <i />
            <span>Empty seat</span>
          </li>
        ))}
      </ul>
      {transport.kind === 'online' && (
        <p className="lg-muted">Anyone in the city can sit down from their own Land Grab tab. Fill the gaps with bots.</p>
      )}
      <div className="lg-row">
        {!seated && !full && (
          <button className="res-go" disabled={busy} onClick={() => send({ op: 'sit' })}>
            Take a seat
          </button>
        )}
        {(seated || transport.isOwner) && !full && (
          <button className="lg-btn" disabled={busy} onClick={() => send({ op: 'addBot' })}>
            + Add a bot
          </button>
        )}
        {(seated || transport.isOwner) && (
          <button className="res-go" disabled={busy || view.seats.length < 2} onClick={() => send({ op: 'start' })}>
            Deal the board
          </button>
        )}
        {seated && transport.kind === 'online' && (
          <button className="lg-link" disabled={busy} onClick={() => send({ op: 'leave' })}>
            Leave
          </button>
        )}
      </div>
      <Rules />
    </div>
  )
}

/* ----------------------------------------------------------------- table */

const PHASE_HELP: Record<BoardView['phase'], string> = {
  setupHouse: 'Pick a glowing corner for a house.',
  setupStreet: 'Lay a street off the house you just built.',
  roll: 'Roll the dice. (An Open House can go first.)',
  crash: 'Market Crash! Pick a tile to park the 📉 on.',
  steal: 'Pick who to poach a card from.',
  main: 'Trade, build, then end your turn.',
  freeStreets: 'Zoning Variance: place your free streets.',
}

function Table({ view, transport, busy, send }: { view: BoardView; transport: BoardTransport; busy: boolean; send: (o: BoardOp) => void }) {
  const [tool, setTool] = useState<Tool>(null)
  const me = view.you >= 0 ? view.seats[view.you] : null
  const hand = me?.hand ?? emptyHand()
  const playing = view.status === 'playing'
  const myTurn = playing && view.you === view.turn && !!me && !me.autopilot
  const up = view.seats[view.turn]

  /* A tool only makes sense on your own main phase. */
  useEffect(() => {
    if (!myTurn || view.phase !== 'main') setTool(null)
  }, [myTurn, view.phase])

  const move = (m: Move) => send({ op: 'move', move: m, rev: view.rev })

  const mine = useMemo(
    () =>
      Object.entries(view.buildings)
        .filter(([, b]) => b.seat === view.you)
        .map(([k, b]) => ({ v: Number(k), kind: b.kind })),
    [view.buildings, view.you],
  )
  const counts = {
    street: Object.values(view.streets).filter((s) => s === view.you).length,
    house: mine.filter((b) => b.kind === 'house').length,
    duplex: mine.filter((b) => b.kind === 'duplex').length,
    tower: mine.filter((b) => b.kind === 'tower').length,
  }

  const click: Clickable = {}
  if (myTurn) {
    if (view.phase === 'setupHouse') {
      click.vertices = legalHouses(view, view.you, true)
      click.onVertex = (v) => move({ t: 'house', vertex: v })
    } else if (view.phase === 'setupStreet') {
      click.edges = legalStreets(view, view.you, view.setup.lastHouse)
      click.onEdge = (e) => move({ t: 'street', edge: e })
    } else if (view.phase === 'freeStreets') {
      click.edges = legalStreets(view, view.you)
      click.onEdge = (e) => move({ t: 'street', edge: e })
    } else if (view.phase === 'crash') {
      click.tiles = view.tiles.map((_, i) => i).filter((i) => i !== view.crash)
      click.onTile = (t) => move({ t: 'crash', tile: t })
    } else if (view.phase === 'main' && tool) {
      if (tool === 'street') {
        click.edges = legalStreets(view, view.you)
        click.onEdge = (e) => move({ t: 'street', edge: e })
      } else if (tool === 'house') {
        click.vertices = legalHouses(view, view.you, false)
        click.onVertex = (v) => move({ t: 'house', vertex: v })
      } else {
        click.vertices = mine
          .filter((b) => b.kind !== 'tower' && canUpgrade(view, view.you, b.v) && canAfford(hand, upgradeCost(b.kind)))
          .map((b) => b.v)
        click.onVertex = (v) => move({ t: 'upgrade', vertex: v })
      }
    }
  }

  const winner = view.winner !== null ? view.seats[view.winner] : null

  return (
    <>
      <EraTrack era={view.era} />
      <div className="lg-grid">
        <div className="lg-board-col">
          <div className="lg-turn" style={{ borderColor: up.color }}>
            {winner ? (
              <div className="lg-win">
                <span className="res-display">🏆 {winner.name} wins!</span>
                <span className="lg-muted">
                  {winner.totalPoints ?? winner.points} Empire Points in {view.round} rounds.
                </span>
                <button className="res-go" disabled={busy} onClick={() => send({ op: 'open' })}>
                  New game
                </button>
              </div>
            ) : (
              <>
                <div className="lg-turn-who">
                  <i style={{ background: up.color }} />
                  <b>{myTurn ? 'Your turn' : up.name + (up.bot || up.autopilot ? ' (bot)' : '') + '’s turn'}</b>
                  <span className="lg-muted">{view.round > 0 ? 'Round ' + view.round : 'Opening placement'}</span>
                  {view.dice && <Dice dice={view.dice} />}
                </div>
                <div className="lg-turn-help">{myTurn ? PHASE_HELP[view.phase] : 'Waiting on ' + up.name + '…'}</div>
                {myTurn && (
                  <div className="lg-row">
                    {view.phase === 'roll' && (
                      <button className="res-go" disabled={busy} onClick={() => move({ t: 'roll' })}>
                        🎲 Roll
                      </button>
                    )}
                    {view.phase === 'steal' &&
                      view.victims.map((v) => (
                        <button key={v} className="lg-btn" disabled={busy} onClick={() => move({ t: 'steal', seat: v })}>
                          <i className="lg-dot" style={{ background: view.seats[v].color }} /> {view.seats[v].name} ({view.seats[v].cards} cards)
                        </button>
                      ))}
                    {view.phase === 'freeStreets' && (
                      <button className="lg-btn" disabled={busy} onClick={() => move({ t: 'endFreeStreets' })}>
                        Done ({view.freeStreets} left)
                      </button>
                    )}
                    {view.phase === 'main' && (
                      <button className="res-go" disabled={busy} onClick={() => move({ t: 'end' })}>
                        End turn
                      </button>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
          <BoardSvg view={view} click={click} />
          <Legend />
        </div>

        <div className="lg-side">
          {me && (
            <section className="lg-card">
              <h3>
                Your hand <span className="lg-muted">· {handSize(hand)} cards</span>
                {me.totalPoints !== undefined && <span className="lg-pts">{me.totalPoints} / {WIN_POINTS} pts</span>}
              </h3>
              <div className="lg-hand">
                {RESOURCES.map((r) => (
                  <div key={r} className={'lg-res' + (hand[r] ? '' : ' zero')} title={RES_INFO[r].name}>
                    <span>{RES_INFO[r].icon}</span>
                    <b>{hand[r]}</b>
                    <small>{RES_INFO[r].name}</small>
                  </div>
                ))}
              </div>
              {playing && (
                <Build
                  view={view}
                  hand={hand}
                  counts={counts}
                  tool={tool}
                  setTool={setTool}
                  canAct={myTurn && view.phase === 'main'}
                  busy={busy}
                  move={move}
                />
              )}
              {transport.kind === 'online' && playing && (
                <button className="lg-link" disabled={busy} onClick={() => send({ op: 'autopilot', on: !me.autopilot })}>
                  {me.autopilot ? 'Take my seat back from the bot' : 'Step out: let the bot play my seat'}
                </button>
              )}
            </section>
          )}

          {me && playing && (
            <Deals view={view} myTurn={myTurn} busy={busy} move={move} />
          )}

          {playing && (view.offer || (myTurn && view.phase === 'main')) && (
            <Trade view={view} hand={hand} myTurn={myTurn} busy={busy} move={move} />
          )}

          <Players view={view} transport={transport} busy={busy} send={send} />
          <Log view={view} />
        </div>
      </div>
    </>
  )
}

function Dice({ dice }: { dice: [number, number] }) {
  const faces = ['', '⚀', '⚁', '⚂', '⚃', '⚄', '⚅']
  const total = dice[0] + dice[1]
  return (
    <span className={'lg-dice' + (total === 7 ? ' seven' : '')} title={'Rolled ' + total}>
      {faces[dice[0]]}
      {faces[dice[1]]} <b>{total}</b>
    </span>
  )
}

function EraTrack({ era }: { era: number }) {
  return (
    <ol className="lg-eras">
      {ERAS.map((e, i) => (
        <li key={e.name} className={i < era ? 'done' : i === era ? 'on' : ''} title={e.blurb}>
          <b>{e.name}</b>
          <span>{i === 0 ? 'Streets · houses · deals' : i === 1 ? 'Duplexes unlock' : i === 2 ? 'Towers unlock' : 'Bank trades 3:1'}</span>
          {i > 0 && <small>leader at {e.at} pts</small>}
        </li>
      ))}
    </ol>
  )
}

function Legend() {
  return (
    <p className="lg-legend lg-muted">
      Red numbers (6, 8) come up most. Dots under a number show how often it rolls. 📉 is the Market Crash: that tile pays nothing.
    </p>
  )
}

const costText = (h: Hand) =>
  RESOURCES.filter((r) => h[r])
    .map((r) => (h[r] > 1 ? h[r] : '') + RES_INFO[r].icon)
    .join(' ')

function Build({
  view,
  hand,
  counts,
  tool,
  setTool,
  canAct,
  busy,
  move,
}: {
  view: BoardView
  hand: Hand
  counts: { street: number; house: number; duplex: number; tower: number }
  tool: Tool
  setTool: (t: Tool) => void
  canAct: boolean
  busy: boolean
  move: (m: Move) => void
}) {
  const rows: { id: Exclude<Tool, null> | 'deal'; label: string; cost: Hand; ok: boolean; why?: string; note: string }[] = [
    {
      id: 'street',
      label: 'Street',
      cost: COSTS.street,
      ok: canAfford(hand, COSTS.street) && counts.street < LIMITS.street,
      note: `${LIMITS.street - counts.street} left`,
    },
    {
      id: 'house',
      label: 'House',
      cost: COSTS.house,
      ok: canAfford(hand, COSTS.house) && counts.house < LIMITS.house,
      note: `1 pt · ${LIMITS.house - counts.house} left`,
    },
    {
      id: 'upgrade',
      label: view.era >= 2 ? 'Duplex / Tower' : 'Duplex',
      cost: COSTS.duplex,
      ok: view.era >= 1 && (canAfford(hand, COSTS.duplex) || (view.era >= 2 && canAfford(hand, COSTS.tower))),
      why: view.era < 1 ? 'Landlord Era' : undefined,
      note: view.era >= 2 ? `upgrade · tower ${costText(COSTS.tower)}` : 'upgrade a house · 2 pts',
    },
    {
      id: 'deal',
      label: 'Deal card',
      cost: COSTS.deal,
      ok: canAfford(hand, COSTS.deal) && view.deckCount > 0,
      note: `${view.deckCount} in the deck`,
    },
  ]
  return (
    <div className="lg-build">
      {rows.map((r) => (
        <button
          key={r.id}
          className={'lg-build-btn' + (tool === r.id ? ' on' : '')}
          disabled={!canAct || busy || !r.ok}
          onClick={() => (r.id === 'deal' ? move({ t: 'buyDeal' }) : setTool(tool === r.id ? null : r.id))}
        >
          <b>{r.label}</b>
          <span className="lg-cost">{costText(r.cost)}</span>
          <small>{r.why ? '🔒 ' + r.why : r.note}</small>
        </button>
      ))}
      {tool && <p className="lg-muted lg-tool-hint">Click a glowing spot on the board. Click the button again to cancel.</p>}
      <p className="lg-muted lg-pieces">
        On the board: {counts.house} {BUILDING_INFO.house.name.toLowerCase()}s · {counts.duplex} duplexes · {counts.tower} towers · {counts.street} streets
      </p>
    </div>
  )
}

function ResSelect({ value, onChange }: { value: Res; onChange: (r: Res) => void }) {
  return (
    <select className="lg-select" value={value} onChange={(e) => onChange(e.target.value as Res)}>
      {RESOURCES.map((r) => (
        <option key={r} value={r}>
          {RES_INFO[r].icon} {RES_INFO[r].name}
        </option>
      ))}
    </select>
  )
}

function Deals({ view, myTurn, busy, move }: { view: BoardView; myTurn: boolean; busy: boolean; move: (m: Move) => void }) {
  const me = view.seats[view.you]
  const [r1, setR1] = useState<Res>('cash')
  const [r2, setR2] = useState<Res>('permits')
  const deals = me.deals ?? []
  const fresh = me.newDeals ?? []
  if (!deals.length && !fresh.length) return null
  const phaseOk = (c: DealCard) => myTurn && !view.playedDeal && (view.phase === 'main' || (view.phase === 'roll' && c === 'openHouse'))
  const uniq = [...new Set(deals)]
  return (
    <section className="lg-card">
      <h3>Deal cards</h3>
      {uniq.map((c) => {
        const n = deals.filter((x) => x === c).length
        const info = DEAL_INFO[c]
        return (
          <div key={c} className="lg-deal">
            <div>
              <b>
                {info.icon} {info.name}
                {n > 1 ? ' ×' + n : ''}
              </b>
              <small>{info.text}</small>
            </div>
            {c !== 'plaque' && (
              <div className="lg-deal-go">
                {c === 'hotMarket' && (
                  <>
                    <ResSelect value={r1} onChange={setR1} />
                    <ResSelect value={r2} onChange={setR2} />
                  </>
                )}
                {c === 'biddingWar' && <ResSelect value={r1} onChange={setR1} />}
                <button
                  className="lg-btn"
                  disabled={busy || !phaseOk(c)}
                  onClick={() => move({ t: 'playDeal', card: c, res: c === 'hotMarket' || c === 'biddingWar' ? r1 : undefined, res2: c === 'hotMarket' ? r2 : undefined })}
                >
                  Play
                </button>
              </div>
            )}
          </div>
        )
      })}
      {fresh.length > 0 && (
        <p className="lg-muted">
          Just bought: {fresh.map((c) => DEAL_INFO[c].icon + ' ' + DEAL_INFO[c].name).join(', ')}
          {fresh.some((c) => c !== 'plaque') ? ' (playable next turn)' : ''}
        </p>
      )}
    </section>
  )
}

function Stepper({ hand, set, max }: { hand: Hand; set: (h: Hand) => void; max?: Hand }) {
  return (
    <div className="lg-steppers">
      {RESOURCES.map((r) => (
        <div key={r} className="lg-step">
          <span>{RES_INFO[r].icon}</span>
          <button onClick={() => set({ ...hand, [r]: Math.max(0, hand[r] - 1) })} disabled={hand[r] === 0} aria-label={'less ' + RES_INFO[r].name}>
            −
          </button>
          <b>{hand[r]}</b>
          <button onClick={() => set({ ...hand, [r]: hand[r] + 1 })} disabled={max ? hand[r] >= max[r] : hand[r] >= 9} aria-label={'more ' + RES_INFO[r].name}>
            +
          </button>
        </div>
      ))}
    </div>
  )
}

function Trade({ view, hand, myTurn, busy, move }: { view: BoardView; hand: Hand; myTurn: boolean; busy: boolean; move: (m: Move) => void }) {
  const [give, setGive] = useState<Hand>(emptyHand())
  const [want, setWant] = useState<Hand>(emptyHand())
  const ratio = bankRatio(view.era)
  const [bankGive, setBankGive] = useState<Res>('lumber')
  const [bankGet, setBankGet] = useState<Res>('cash')
  const offer = view.offer
  const from = view.seats[view.turn]

  if (!myTurn && offer) {
    const can = view.you >= 0 && canAfford(hand, offer.want)
    return (
      <section className="lg-card lg-offer">
        <h3>
          <i className="lg-dot" style={{ background: from.color }} /> {from.name} wants to trade
        </h3>
        <p>
          They give <b>{costText(offer.give)}</b> for your <b>{costText(offer.want)}</b>
        </p>
        {view.you >= 0 && (
          <button className="res-go" disabled={busy || !can} onClick={() => move({ t: 'accept' })}>
            {can ? 'Take the deal' : 'You don’t have the cards'}
          </button>
        )}
      </section>
    )
  }
  if (!myTurn) return null

  const valid = handSize(give) > 0 && handSize(want) > 0 && RESOURCES.every((r) => !(give[r] && want[r]))
  return (
    <section className="lg-card">
      <h3>Trade</h3>
      <div className="lg-bank">
        <span>Bank {ratio}:1 —</span>
        <ResSelect value={bankGive} onChange={setBankGive} />
        <span>for</span>
        <ResSelect value={bankGet} onChange={setBankGet} />
        <button
          className="lg-btn"
          disabled={busy || hand[bankGive] < ratio || bankGive === bankGet}
          onClick={() => move({ t: 'bank', give: bankGive, get: bankGet })}
        >
          Trade
        </button>
      </div>
      {offer ? (
        <div className="lg-offer-out">
          <p>
            On the table: your <b>{costText(offer.give)}</b> for <b>{costText(offer.want)}</b>. Waiting for a taker…
          </p>
          <button className="lg-link" disabled={busy} onClick={() => move({ t: 'cancelOffer' })}>
            Take it back
          </button>
        </div>
      ) : (
        <details className="lg-offer-make">
          <summary>Offer a trade to the table</summary>
          <div className="lg-muted">You give</div>
          <Stepper hand={give} set={setGive} max={hand} />
          <div className="lg-muted">You want</div>
          <Stepper hand={want} set={setWant} />
          <button
            className="lg-btn"
            disabled={busy || !valid || !canAfford(hand, give)}
            onClick={() => {
              move({ t: 'offer', give, want })
              setGive(emptyHand())
              setWant(emptyHand())
            }}
          >
            Put it on the table
          </button>
        </details>
      )}
    </section>
  )
}

function Players({ view, transport, busy, send }: { view: BoardView; transport: BoardTransport; busy: boolean; send: (o: BoardOp) => void }) {
  return (
    <section className="lg-card">
      <h3>Players</h3>
      <ul className="lg-players">
        {view.seats.map((s, i) => (
          <li key={s.id} className={i === view.turn && view.status === 'playing' ? 'up' : ''}>
            <i className="lg-dot" style={{ background: s.color }} />
            <div className="lg-pl-name">
              <b>
                {s.name}
                {i === view.you ? ' (you)' : ''}
              </b>
              <small>
                {s.cards} cards · {s.dealCount} deals · street {s.streetLength}
                {view.mainStreet === i ? ' · 🛣️ Main Street' : ''}
                {view.topProducer === i ? ' · 🎈 Top Producer' : ''}
                {s.autopilot ? ' · on autopilot' : ''}
              </small>
            </div>
            <span className="lg-pl-pts">{view.status === 'over' ? (s.totalPoints ?? s.points) : s.points}</span>
            {transport.kind === 'online' && transport.isOwner && !s.bot && i !== view.you && view.status === 'playing' && (
              <button className="lg-link" disabled={busy} onClick={() => send({ op: 'autopilot', on: !s.autopilot, seatId: s.id })}>
                {s.autopilot ? 'wake' : 'bot it'}
              </button>
            )}
          </li>
        ))}
      </ul>
      <p className="lg-muted lg-small">Points shown don’t include secret 🏅 plaques.</p>
    </section>
  )
}

function Log({ view }: { view: BoardView }) {
  const lines = view.log.slice(-40).reverse()
  return (
    <section className="lg-card">
      <h3>Table talk</h3>
      <ul className="lg-log">
        {lines.map((l) => (
          <li key={l.n} style={l.seat !== undefined ? { borderLeftColor: view.seats[l.seat]?.color } : undefined}>
            {l.text}
          </li>
        ))}
      </ul>
    </section>
  )
}
