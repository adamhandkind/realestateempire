/* The phone during a game: your hand, and on your turn one big thing to do
   at a time. Roll → build tray (Street · House · Upgrade · Deal card) →
   Trade → End turn. Placing anything opens the board zoomed in on the spots
   you can pick; you tap one, the TV shows a ghost of it, and nothing is
   spent until you press Confirm. */

import { useEffect, useMemo, useRef, useState } from 'react'
import { COSTS, DEAL_INFO, ERAS, LIMITS, RESOURCES, RES_INFO, WIN_POINTS, bankRatio } from '../../board/data'
import { canAfford, canUpgrade, emptyHand, handSize, legalHouses, legalStreets, upgradeCost } from '../../board/rules'
import type { BoardView, DealCard, Hand, Move, Phase, Res } from '../../board/types'
import type { Aim, PartyOp, PartyView } from '../../party/protocol'
import type { Clickable, Ghost } from '../board/BoardSvg'
import PhoneBoard from './PhoneBoard'

type Tool = 'street' | 'house' | 'upgrade'
type Sheet = 'trade' | 'deals' | null

const costText = (h: Hand) =>
  RESOURCES.filter((r) => h[r])
    .map((r) => (h[r] > 1 ? h[r] : '') + RES_INFO[r].icon)
    .join(' ')

/** What someone else is doing, in a few words. */
const DOING: Record<Phase, string> = {
  setupHouse: 'is picking a spot for a house',
  setupStreet: 'is laying a street',
  roll: 'is about to roll',
  crash: 'is moving the Market Crash 📉',
  steal: 'is picking who to poach from',
  main: 'is trading and building',
  freeStreets: 'is laying free streets',
}

function buzz(ms: number | number[]) {
  try {
    navigator.vibrate?.(ms)
  } catch {
    /* not on this phone */
  }
}

export default function PhoneGame({ view, send }: { view: PartyView; send: (op: PartyOp) => boolean }) {
  const b = view.board
  const you = b.you
  const me = you >= 0 ? b.seats[you] : null
  const hand = me?.hand ?? emptyHand()
  const up = b.seats[b.turn]
  const myTurn = b.status === 'playing' && you === b.turn
  const [tool, setTool] = useState<Tool | null>(null)
  const [sheet, setSheet] = useState<Sheet>(null)
  const [pick, setPick] = useState<Aim | null>(null)

  const move = (m: Move) => send({ op: 'move', move: m, rev: b.rev })

  /* A buzz when your turn starts, and when someone offers you a trade. */
  const wasMine = useRef(myTurn)
  useEffect(() => {
    if (myTurn && !wasMine.current) buzz([120, 60, 120])
    wasMine.current = myTurn
  }, [myTurn])
  const offerKey = b.offer && !myTurn ? JSON.stringify(b.offer) : ''
  useEffect(() => {
    if (offerKey) buzz(150)
  }, [offerKey])

  /* Tools and sheets only last for your own main phase. */
  useEffect(() => {
    if (!myTurn || b.phase !== 'main') {
      setTool(null)
      setSheet(null)
    }
  }, [myTurn, b.phase])
  /* Whatever you'd tapped is gone once the board changes, and a build or a
     played deal card takes you back to the tray. */
  useEffect(() => {
    setPick(null)
    setTool(null)
    setSheet((sh) => (sh === 'deals' ? null : sh))
  }, [b.rev])

  const mine = useMemo(
    () =>
      Object.entries(b.buildings)
        .filter(([, x]) => x.seat === you)
        .map(([k, x]) => ({ v: Number(k), kind: x.kind })),
    [b.buildings, you],
  )

  /* What you're choosing right now, if anything. */
  const placing = useMemo(() => {
    if (!myTurn) return null
    const c: Clickable = {}
    let piece: Aim['piece']
    let title: string
    let tooled = false
    if (b.phase === 'setupHouse') {
      c.vertices = legalHouses(b, you, true)
      piece = 'house'
      title = b.setup.step < b.seats.length ? 'Place your first house' : 'Place your second house (it pays you a card from each tile)'
    } else if (b.phase === 'setupStreet') {
      c.edges = legalStreets(b, you, b.setup.lastHouse)
      piece = 'street'
      title = 'Lay a street off that house'
    } else if (b.phase === 'freeStreets') {
      c.edges = legalStreets(b, you)
      piece = 'street'
      title = `Free street (${b.freeStreets} left)`
    } else if (b.phase === 'crash') {
      c.tiles = b.tiles.map((_, i) => i).filter((i) => i !== b.crash)
      piece = 'crash'
      title = 'Market Crash! Park the 📉 on a tile'
    } else if (b.phase === 'main' && tool) {
      tooled = true
      if (tool === 'street') {
        c.edges = legalStreets(b, you)
        piece = 'street'
        title = `Build a street (${costText(COSTS.street)})`
      } else if (tool === 'house') {
        c.vertices = legalHouses(b, you, false)
        piece = 'house'
        title = `Build a house (${costText(COSTS.house)})`
      } else {
        c.vertices = mine.filter((x) => x.kind !== 'tower' && canUpgrade(b, you, x.v) && canAfford(hand, upgradeCost(x.kind))).map((x) => x.v)
        piece = 'duplex'
        title = 'Pick a building to upgrade'
      }
    } else return null
    return { c, piece, title, tooled }
  }, [myTurn, b, you, tool, mine, hand])

  const choose = (a: Aim) => {
    setPick(a)
    send({ op: 'aim', aim: a })
  }
  /* Let the TV know when you stop choosing. */
  const aiming = !!placing
  useEffect(() => {
    if (!aiming) send({ op: 'aim', aim: null })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aiming])

  if (!me) return <Watching view={view} />
  if (b.status === 'over') return <GameOver view={view} />

  const header = (
    <div className="pt-turnbar" style={{ borderColor: up.color }}>
      <span className="pt-eyebrow">{b.round > 0 ? 'Round ' + b.round : 'Opening'} · {ERAS[b.era].name}</span>
      <b>{myTurn ? 'Your turn' : up.name + ' ' + DOING[b.phase]}</b>
      {b.dice && <span className={'pt-pdice' + (b.dice[0] + b.dice[1] === 7 ? ' seven' : '')}>🎲 {b.dice[0] + b.dice[1]}</span>}
    </div>
  )

  if (placing) {
    const ghost: Ghost | null = pick ? { ...pick, color: me.color } : null
    const click: Clickable = {
      ...placing.c,
      onVertex: (v) => {
        const at = b.buildings[v]
        choose({ kind: 'vertex', i: v, piece: placing.piece === 'duplex' ? (at?.kind === 'duplex' ? 'tower' : 'duplex') : placing.piece })
      },
      onEdge: (e) => choose({ kind: 'edge', i: e, piece: 'street' }),
      onTile: (t) => choose({ kind: 'tile', i: t, piece: 'crash' }),
    }
    const confirm = () => {
      if (!pick) return
      if (pick.kind === 'edge') move({ t: 'street', edge: pick.i })
      else if (pick.kind === 'tile') move({ t: 'crash', tile: pick.i })
      else if (placing.piece === 'house') move({ t: 'house', vertex: pick.i })
      else move({ t: 'upgrade', vertex: pick.i })
    }
    const none = clickCount(placing.c) === 0
    return (
      <div className="pt-pgame placing">
        {header}
        <p className="pt-place-title">{placing.title}</p>
        <PhoneBoard view={b} click={click} ghost={ghost} focusKey={b.phase + ':' + (tool ?? '') + ':' + b.setup.step} />
        {none && <p className="pt-warn">There’s nowhere to build that right now.</p>}
        <div className="pt-place-bar">
          {placing.tooled && (
            <button className="pt-mid" onClick={() => setTool(null)}>
              Cancel
            </button>
          )}
          {b.phase === 'freeStreets' && (
            <button className="pt-mid" onClick={() => move({ t: 'endFreeStreets' })}>
              Done
            </button>
          )}
          <button className="pt-big" disabled={!pick} onClick={confirm}>
            {pick ? 'Confirm' : 'Tap a glowing spot'}
          </button>
        </div>
        <HandStrip hand={hand} />
      </div>
    )
  }

  return (
    <div className="pt-pgame">
      {header}
      <HandStrip hand={hand} points={me.totalPoints ?? me.points} />

      {!myTurn && b.offer && <OfferIn view={view} hand={hand} move={move} />}

      {myTurn && b.phase === 'roll' && (
        <div className="pt-pcard">
          <button className="pt-huge" onClick={() => move({ t: 'roll' })}>
            🎲 Roll the dice
          </button>
          {(me.deals ?? []).includes('openHouse') && !b.playedDeal && (
            <button className="pt-mid" onClick={() => move({ t: 'playDeal', card: 'openHouse' })}>
              🎈 Play an Open House first
            </button>
          )}
        </div>
      )}

      {myTurn && b.phase === 'steal' && (
        <div className="pt-pcard">
          <p className="pt-place-title">Take a card from…</p>
          <div className="pt-victims">
            {b.victims.map((v) => (
              <button key={v} style={{ borderColor: b.seats[v].color }} onClick={() => move({ t: 'steal', seat: v })}>
                <i style={{ background: b.seats[v].color }} />
                <b>{b.seats[v].name}</b>
                <small>{b.seats[v].cards} cards</small>
              </button>
            ))}
          </div>
        </div>
      )}

      {myTurn && b.phase === 'main' && sheet === null && (
        <>
          <BuildTray view={b} hand={hand} mine={mine} pickTool={setTool} move={move} />
          <div className="pt-row2">
            <button className="pt-mid" onClick={() => setSheet('trade')}>
              🤝 Trade{b.offer ? ' (offer out)' : ''}
            </button>
            <button className="pt-mid" disabled={!(me.deals ?? []).some((c) => c !== 'plaque')} onClick={() => setSheet('deals')}>
              🃏 Deal cards
            </button>
          </div>
          <button className="pt-big pt-end" onClick={() => move({ t: 'end' })}>
            End my turn
          </button>
        </>
      )}
      {myTurn && b.phase === 'main' && sheet === 'trade' && <TradeSheet view={b} hand={hand} move={move} close={() => setSheet(null)} />}
      {myTurn && b.phase === 'main' && sheet === 'deals' && <DealSheet view={b} move={move} close={() => setSheet(null)} />}

      {!myTurn && <p className="pt-hint pt-center-text">Watch the TV. Your phone buzzes when it’s your go.</p>}
      <DealList view={b} />
    </div>
  )
}

const clickCount = (c: Clickable) => (c.vertices?.length ?? 0) + (c.edges?.length ?? 0) + (c.tiles?.length ?? 0)

/* -------------------------------------------------------------- pieces */

function HandStrip({ hand, points }: { hand: Hand; points?: number }) {
  return (
    <div className="pt-handrow">
      <div className="pt-hand">
        {RESOURCES.map((r) => (
          <div key={r} className={hand[r] ? '' : 'zero'}>
            <span>{RES_INFO[r].icon}</span>
            <b>{hand[r]}</b>
            <small>{RES_INFO[r].name}</small>
          </div>
        ))}
      </div>
      {points !== undefined && (
        <p className="pt-pts">
          <b>{points}</b> / {WIN_POINTS} Empire Points · {handSize(hand)} cards
        </p>
      )}
    </div>
  )
}

function BuildTray({
  view,
  hand,
  mine,
  pickTool,
  move,
}: {
  view: BoardView
  hand: Hand
  mine: { v: number; kind: string }[]
  pickTool: (t: Tool) => void
  move: (m: Move) => void
}) {
  const streets = Object.values(view.streets).filter((s) => s === view.you).length
  const houses = mine.filter((x) => x.kind === 'house').length
  const canUp = mine.some(
    (x) => x.kind !== 'tower' && canUpgrade(view, view.you, x.v) && canAfford(hand, upgradeCost(x.kind as 'house' | 'duplex')),
  )
  const rows = [
    { id: 'street' as const, label: 'Street', cost: COSTS.street, ok: canAfford(hand, COSTS.street) && streets < LIMITS.street, note: `${LIMITS.street - streets} left` },
    { id: 'house' as const, label: 'House', cost: COSTS.house, ok: canAfford(hand, COSTS.house) && houses < LIMITS.house, note: '1 point' },
    {
      id: 'upgrade' as const,
      label: view.era >= 2 ? 'Upgrade' : 'Duplex',
      cost: COSTS.duplex,
      ok: canUp,
      note: view.era < 1 ? '🔒 Landlord Era' : view.era >= 2 ? `tower ${costText(COSTS.tower)}` : '+1 point',
    },
    { id: 'deal' as const, label: 'Deal card', cost: COSTS.deal, ok: canAfford(hand, COSTS.deal) && view.deckCount > 0, note: `${view.deckCount} left` },
  ]
  return (
    <div className="pt-tray">
      {rows.map((r) => (
        <button key={r.id} disabled={!r.ok} onClick={() => (r.id === 'deal' ? move({ t: 'buyDeal' }) : pickTool(r.id))}>
          <b>{r.label}</b>
          <span>{costText(r.cost)}</span>
          <small>{r.note}</small>
        </button>
      ))}
    </div>
  )
}

function ResPick({ value, onPick, disabled }: { value: Res | null; onPick: (r: Res) => void; disabled?: (r: Res) => boolean }) {
  return (
    <div className="pt-respick" role="radiogroup">
      {RESOURCES.map((r) => (
        <button
          key={r}
          type="button"
          role="radio"
          aria-checked={value === r}
          aria-label={RES_INFO[r].name}
          className={value === r ? 'on' : ''}
          disabled={disabled?.(r)}
          onClick={() => onPick(r)}
        >
          {RES_INFO[r].icon}
        </button>
      ))}
    </div>
  )
}

function Stepper({ hand, set, max }: { hand: Hand; set: (h: Hand) => void; max?: Hand }) {
  return (
    <div className="pt-steppers">
      {RESOURCES.map((r) => (
        <div key={r}>
          <span>{RES_INFO[r].icon}</span>
          <button type="button" onClick={() => set({ ...hand, [r]: Math.max(0, hand[r] - 1) })} disabled={hand[r] === 0} aria-label={'less ' + RES_INFO[r].name}>
            −
          </button>
          <b>{hand[r]}</b>
          <button
            type="button"
            onClick={() => set({ ...hand, [r]: hand[r] + 1 })}
            disabled={max ? hand[r] >= max[r] : hand[r] >= 9}
            aria-label={'more ' + RES_INFO[r].name}
          >
            +
          </button>
        </div>
      ))}
    </div>
  )
}

function TradeSheet({ view, hand, move, close }: { view: BoardView; hand: Hand; move: (m: Move) => void; close: () => void }) {
  const ratio = bankRatio(view.era)
  const [bankGive, setBankGive] = useState<Res | null>(null)
  const [bankGet, setBankGet] = useState<Res | null>(null)
  const [give, setGive] = useState<Hand>(emptyHand())
  const [want, setWant] = useState<Hand>(emptyHand())
  const offerOk = handSize(give) > 0 && handSize(want) > 0 && RESOURCES.every((r) => !(give[r] && want[r])) && canAfford(hand, give)
  return (
    <div className="pt-pcard">
      <div className="pt-sheet-top">
        <b>Trade</b>
        <button className="pt-mini" onClick={close}>
          Done
        </button>
      </div>
      <p className="pt-label">The bank: {ratio} of one for 1 of another</p>
      <span className="pt-sublabel">Give {ratio}×</span>
      <ResPick value={bankGive} onPick={setBankGive} disabled={(r) => hand[r] < ratio} />
      <span className="pt-sublabel">Get 1</span>
      <ResPick value={bankGet} onPick={setBankGet} disabled={(r) => r === bankGive} />
      <button
        className="pt-mid"
        disabled={!bankGive || !bankGet || bankGive === bankGet || hand[bankGive] < ratio}
        onClick={() => {
          if (bankGive && bankGet) move({ t: 'bank', give: bankGive, get: bankGet })
          setBankGive(null)
        }}
      >
        Trade with the bank
      </button>

      <p className="pt-label">The table</p>
      {view.offer ? (
        <>
          <p>
            Your <b>{costText(view.offer.give)}</b> for <b>{costText(view.offer.want)}</b> is on the table. First to accept gets it.
          </p>
          <button className="pt-mid" onClick={() => move({ t: 'cancelOffer' })}>
            Take it back
          </button>
        </>
      ) : (
        <>
          <span className="pt-sublabel">You give</span>
          <Stepper hand={give} set={setGive} max={hand} />
          <span className="pt-sublabel">You want</span>
          <Stepper hand={want} set={setWant} />
          <button
            className="pt-mid"
            disabled={!offerOk}
            onClick={() => {
              move({ t: 'offer', give, want })
              setGive(emptyHand())
              setWant(emptyHand())
            }}
          >
            Offer it to everyone
          </button>
        </>
      )}
    </div>
  )
}

function DealSheet({ view, move, close }: { view: BoardView; move: (m: Move) => void; close: () => void }) {
  const me = view.seats[view.you]
  const [card, setCard] = useState<Exclude<DealCard, 'plaque'> | null>(null)
  const [r1, setR1] = useState<Res | null>(null)
  const [r2, setR2] = useState<Res | null>(null)
  const playable = [...new Set((me.deals ?? []).filter((c): c is Exclude<DealCard, 'plaque'> => c !== 'plaque'))]
  const ready = card && (card === 'hotMarket' ? r1 && r2 : card === 'biddingWar' ? r1 : true)
  return (
    <div className="pt-pcard">
      <div className="pt-sheet-top">
        <b>Deal cards</b>
        <button className="pt-mini" onClick={close}>
          Back
        </button>
      </div>
      {view.playedDeal && <p className="pt-hint">You’ve played a deal card this turn. One a turn.</p>}
      <div className="pt-deals">
        {playable.map((c) => (
          <button key={c} className={card === c ? 'on' : ''} disabled={view.playedDeal} onClick={() => setCard(c)}>
            <b>
              {DEAL_INFO[c].icon} {DEAL_INFO[c].name}
            </b>
            <small>{DEAL_INFO[c].text}</small>
          </button>
        ))}
      </div>
      {card === 'hotMarket' && (
        <>
          <span className="pt-sublabel">First card</span>
          <ResPick value={r1} onPick={setR1} />
          <span className="pt-sublabel">Second card</span>
          <ResPick value={r2} onPick={setR2} />
        </>
      )}
      {card === 'biddingWar' && (
        <>
          <span className="pt-sublabel">Everyone hands you all their…</span>
          <ResPick value={r1} onPick={setR1} />
        </>
      )}
      <button
        className="pt-big"
        disabled={!ready || view.playedDeal}
        onClick={() => card && move({ t: 'playDeal', card, res: r1 ?? undefined, res2: card === 'hotMarket' ? (r2 ?? undefined) : undefined })}
      >
        {card ? 'Play ' + DEAL_INFO[card].name : 'Pick a card'}
      </button>
    </div>
  )
}

function DealList({ view }: { view: BoardView }) {
  const me = view.seats[view.you]
  const all = [...(me.deals ?? []), ...(me.newDeals ?? [])]
  if (!all.length) return null
  const fresh = new Set(me.newDeals ?? [])
  return (
    <div className="pt-dealchips">
      {[...new Set(all)].map((c) => {
        const n = all.filter((x) => x === c).length
        return (
          <span key={c} title={DEAL_INFO[c].text}>
            {DEAL_INFO[c].icon} {DEAL_INFO[c].name}
            {n > 1 ? ' ×' + n : ''}
            {fresh.has(c) && c !== 'plaque' && !(me.deals ?? []).includes(c) ? ' (next turn)' : ''}
          </span>
        )
      })}
    </div>
  )
}

function OfferIn({ view, hand, move }: { view: PartyView; hand: Hand; move: (m: Move) => void }) {
  const b = view.board
  const o = b.offer!
  const from = b.seats[b.turn]
  const can = canAfford(hand, o.want)
  return (
    <div className="pt-pcard pt-offer" style={{ borderColor: from.color }}>
      <p className="pt-eyebrow">Trade offer</p>
      <p className="pt-offer-line">
        <b>{from.name}</b> gives <b>{costText(o.give)}</b> for your <b>{costText(o.want)}</b>
      </p>
      <button className="pt-big" disabled={!can} onClick={() => move({ t: 'accept' })}>
        {can ? 'Accept' : 'You don’t have the cards'}
      </button>
    </div>
  )
}

function GameOver({ view }: { view: PartyView }) {
  const b = view.board
  const w = b.winner !== null ? b.seats[b.winner] : null
  const ranked = [...b.seats].sort((x, y) => (y.totalPoints ?? y.points) - (x.totalPoints ?? x.points))
  return (
    <div className="pt-pgame">
      <div className="pt-pcard pt-center-text">
        <p className="pt-eyebrow">Game over</p>
        <p className="pt-youre-in">{w ? (b.winner === b.you ? 'You win! 🏆' : w.name + ' wins') : 'Game over'}</p>
        <ul className="pt-mini-seats">
          {ranked.map((s) => (
            <li key={s.id}>
              <i style={{ background: s.color }} />
              {s.name}
              <b className="pt-push">{s.totalPoints ?? s.points}</b>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

function Watching({ view }: { view: PartyView }) {
  const b = view.board
  return (
    <div className="pt-pgame">
      <p className="pt-hint pt-center-text">
        {b.seats[b.turn]?.name} {DOING[b.phase]}. Watch the TV.
      </p>
    </div>
  )
}
