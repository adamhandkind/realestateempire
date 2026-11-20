/* The bot: plays bot seats and anyone on autopilot. Greedy and readable
   rather than clever. It builds whatever it can afford in order of value,
   trades with the bank to get there, and aims the Market Crash at the
   leader. One move per call; the runner keeps calling until a human is up. */

import { COSTS, DEAL_INFO, PIPS, RESOURCES, WIN_POINTS, bankRatio } from './data'
import { TOPO } from './geometry'
import {
  applyMove,
  botSeat,
  canAfford,
  canUpgrade,
  handSize,
  houseSpotFree,
  legalHouses,
  legalStreets,
  markTimeout,
  publicPoints,
  upgradeCost,
} from './rules'
import type { BoardState, Hand, Move, Res } from './types'

/** How good a corner is: the pips of the tiles around it, with a little
 *  extra for resources the seat doesn't already make. */
function vertexValue(s: BoardState, seat: number, v: number): number {
  const have = new Set<string>()
  for (const [k, b] of Object.entries(s.buildings))
    if (b.seat === seat) for (const h of TOPO.vertices[Number(k)].hexes) have.add(s.tiles[h].terrain)
  let val = 0
  for (const h of TOPO.vertices[v].hexes) {
    const t = s.tiles[h]
    if (t.terrain === 'river' || !t.number) continue
    val += PIPS[t.number] ?? 0
    if (!have.has(t.terrain)) val += 1.5
    if (h === s.crash) val -= 2
  }
  return val
}

const best = <T>(xs: T[], score: (x: T) => number): T | undefined => {
  let top: T | undefined
  let hi = -Infinity
  for (const x of xs) {
    const v = score(x)
    if (v > hi) {
      hi = v
      top = x
    }
  }
  return top
}

/** What it's saving for, most valuable first. */
function targets(s: BoardState, seat: number): { cost: Hand; move: Move }[] {
  const out: { cost: Hand; move: Move }[] = []
  const mine = Object.entries(s.buildings)
    .filter(([, b]) => b.seat === seat)
    .map(([k, b]) => ({ v: Number(k), kind: b.kind }))
  const towerSpot = best(
    mine.filter((b) => b.kind === 'duplex' && canUpgrade(s, seat, b.v)),
    (b) => vertexValue(s, seat, b.v),
  )
  if (towerSpot) out.push({ cost: upgradeCost('duplex'), move: { t: 'upgrade', vertex: towerSpot.v } })
  const duplexSpot = best(
    mine.filter((b) => b.kind === 'house' && canUpgrade(s, seat, b.v)),
    (b) => vertexValue(s, seat, b.v),
  )
  if (duplexSpot) out.push({ cost: upgradeCost('house'), move: { t: 'upgrade', vertex: duplexSpot.v } })
  const houses = mine.filter((b) => b.kind === 'house').length
  const spot = houses < 5 ? best(legalHouses(s, seat, false), (v) => vertexValue(s, seat, v)) : undefined
  if (spot !== undefined) out.push({ cost: COSTS.house, move: { t: 'house', vertex: spot } })
  else {
    const e = streetTowardSpot(s, seat)
    if (e !== undefined) out.push({ cost: COSTS.street, move: { t: 'street', edge: e } })
  }
  return out
}

/** A street that opens up a good corner for a house. */
function streetTowardSpot(s: BoardState, seat: number): number | undefined {
  const streets = legalStreets(s, seat)
  if (!streets.length) return undefined
  return best(streets, (e) => {
    const { a, b } = TOPO.edges[e]
    let v = 0
    for (const x of [a, b]) {
      if (houseSpotFree(s, x)) v = Math.max(v, vertexValue(s, seat, x))
      else for (const y of TOPO.vertices[x].adj) if (houseSpotFree(s, y)) v = Math.max(v, vertexValue(s, seat, y) * 0.5)
    }
    return v
  })
}

/** A bank trade that gets closer to a cost, if one is possible. */
function bankToward(s: BoardState, seat: number, cost: Hand): Move | null {
  const hand = s.seats[seat].hand
  const k = bankRatio(s.era)
  const need = RESOURCES.find((r) => hand[r] < cost[r])
  if (!need) return null
  const spare = best(
    RESOURCES.filter((r) => hand[r] - cost[r] >= k),
    (r) => hand[r] - cost[r],
  )
  return spare ? { t: 'bank', give: spare, get: need } : null
}

const leader = (s: BoardState, seat: number) =>
  best(
    s.seats.map((_, i) => i).filter((i) => i !== seat),
    (i) => publicPoints(s, i) * 10 + handSize(s.seats[i].hand),
  ) ?? -1

function crashTile(s: BoardState, seat: number): number {
  const lead = leader(s, seat)
  const tiles = s.tiles.map((_, i) => i).filter((i) => i !== s.crash)
  return (
    best(tiles, (i) => {
      const t = s.tiles[i]
      const pips = t.number ? (PIPS[t.number] ?? 0) : 0
      let v = 0
      for (const vx of TOPO.hexes[i].vertices) {
        const b = s.buildings[vx]
        if (!b) continue
        if (b.seat === seat) v -= 100
        else v += pips * (b.seat === lead ? 2 : 1) * (b.kind === 'house' ? 1 : b.kind === 'duplex' ? 2 : 3)
      }
      return v
    }) ?? (s.crash + 1) % s.tiles.length
  )
}

/** The scarcest resource for this seat. */
function wanted(s: BoardState, seat: number): Res {
  const hand = s.seats[seat].hand
  const t = targets(s, seat)[0]
  if (t) {
    const r = RESOURCES.find((x) => hand[x] < t.cost[x])
    if (r) return r
  }
  return best(RESOURCES, (r) => -hand[r]) ?? 'cash'
}

/** The bot's next move for the seat whose turn it is. */
export function botMove(s: BoardState): Move {
  const seat = s.turn
  const me = s.seats[seat]
  switch (s.phase) {
    case 'setupHouse': {
      const v = best(legalHouses(s, seat, true), (x) => vertexValue(s, seat, x))!
      return { t: 'house', vertex: v }
    }
    case 'setupStreet': {
      const streets = legalStreets(s, seat, s.setup.lastHouse)
      const e = best(streets, (x) => {
        const { a, b } = TOPO.edges[x]
        const far = a === s.setup.lastHouse ? b : a
        return Math.max(0, ...TOPO.vertices[far].adj.filter((y) => houseSpotFree(s, y)).map((y) => vertexValue(s, seat, y)))
      })!
      return { t: 'street', edge: e }
    }
    case 'roll': {
      /* Clear the crash off its own tile first if it can. */
      const blocked = TOPO.hexes[s.crash].vertices.some((v) => s.buildings[v]?.seat === seat)
      if (blocked && !s.playedDeal && me.deals.includes('openHouse')) return { t: 'playDeal', card: 'openHouse' }
      return { t: 'roll' }
    }
    case 'crash':
      return { t: 'crash', tile: crashTile(s, seat) }
    case 'steal':
      return { t: 'steal', seat: best(s.victims, (v) => handSize(s.seats[v].hand) + (v === leader(s, seat) ? 3 : 0))! }
    case 'freeStreets': {
      const e = streetTowardSpot(s, seat)
      return e === undefined ? { t: 'endFreeStreets' } : { t: 'street', edge: e }
    }
    case 'main': {
      if (s.offer) return { t: 'cancelOffer' }
      if (!s.playedDeal) {
        const play = dealToPlay(s, seat)
        if (play) return play
      }
      const goals = targets(s, seat)
      for (const g of goals) if (canAfford(me.hand, g.cost)) return g.move
      if (goals[0]) {
        const trade = bankToward(s, seat, goals[0].cost)
        if (trade) return trade
      }
      if (s.deck.length && canAfford(me.hand, COSTS.deal) && handSize(me.hand) >= 5) return { t: 'buyDeal' }
      return { t: 'end' }
    }
  }
}

function dealToPlay(s: BoardState, seat: number): Move | null {
  const me = s.seats[seat]
  const has = (c: keyof typeof DEAL_INFO) => me.deals.includes(c)
  if (has('hotMarket')) {
    const goal = targets(s, seat)[0]
    if (goal) {
      const need = RESOURCES.flatMap((r) => Array<Res>(Math.max(0, goal.cost[r] - me.hand[r])).fill(r))
      if (need.length >= 1) return { t: 'playDeal', card: 'hotMarket', res: need[0], res2: need[1] ?? need[0] }
    }
  }
  if (has('biddingWar')) {
    const r = wanted(s, seat)
    const pool = s.seats.reduce((n, o, i) => n + (i === seat ? 0 : o.hand[r]), 0)
    if (pool >= 3) return { t: 'playDeal', card: 'biddingWar', res: r }
  }
  if (has('zoning') && legalStreets(s, seat).length > 0 && legalHouses(s, seat, false).length === 0)
    return { t: 'playDeal', card: 'zoning' }
  if (has('openHouse')) {
    const blocked = TOPO.hexes[s.crash].vertices.some((v) => s.buildings[v]?.seat === seat)
    if (blocked || me.openHouses >= 2) return { t: 'playDeal', card: 'openHouse' }
  }
  return null
}

/** Would this bot take the trade on the table? A clear win (more cards in
 *  than out) it always takes; an even swap only if it keeps one of
 *  everything it gives up. Never with someone about to win. */
export function botAccepts(s: BoardState, seat: number): boolean {
  const o = s.offer
  if (!o || seat === s.turn) return false
  const hand = s.seats[seat].hand
  if (publicPoints(s, s.turn) >= WIN_POINTS - 3) return false
  const give = RESOURCES.reduce((n, r) => n + o.want[r], 0)
  const get = RESOURCES.reduce((n, r) => n + o.give[r], 0)
  if (get < give || !canAfford(hand, o.want)) return false
  if (get > give) return true
  return RESOURCES.every((r) => o.want[r] === 0 || hand[r] > o.want[r])
}

/** If a person has an offer on the table, the first bot that likes it
 *  takes it. Returns the state unchanged if none does. */
export function botsTakeOffer(state: BoardState): BoardState {
  if (state.status !== 'playing' || !state.offer || botSeat(state, state.turn)) return state
  const taker = state.seats.findIndex((_, j) => j !== state.turn && botSeat(state, j) && botAccepts(state, j))
  if (taker < 0) return state
  const r = applyMove(state, taker, { t: 'accept' })
  return r.ok ? r.state : state
}

/** One move by the bot whose turn it is, or null if it's a person's turn
 *  (or the bot is stuck). */
export function botStep(state: BoardState): BoardState | null {
  if (state.status !== 'playing' || !botSeat(state, state.turn)) return null
  const r = applyMove(state, state.turn, botMove(state))
  if (r.ok) return r.state
  /* A move the bot thought was fine but wasn't: end the turn instead of
     looping (or, mid-placement, give up on the bot's plan). */
  const fallback = applyMove(state, state.turn, { t: 'end' })
  return fallback.ok ? fallback.state : null
}

/** Plays every bot move until it's a person's turn (or the game ends). */
export function runBots(s: BoardState, cap = 400): BoardState {
  let state = s
  for (let i = 0; i < cap && state.status === 'playing'; i++) {
    const took = botsTakeOffer(state)
    if (took !== state) {
      state = took
      continue
    }
    const next = botStep(state)
    if (!next) break
    state = next
  }
  return state
}

/** The clock ran out on a person's turn: the bot finishes that turn for
 *  them. It only does what the turn needs (place, roll, move the crash,
 *  end), and never spends their cards on anything else. */
export function timeOut(state: BoardState): BoardState {
  if (state.status !== 'playing') return state
  const seat = state.turn
  let s = markTimeout(state)
  for (let i = 0; i < 20 && s.status === 'playing' && s.turn === seat; i++) {
    const m: Move =
      s.phase === 'roll'
        ? { t: 'roll' }
        : s.phase === 'main'
          ? { t: 'end' }
          : s.phase === 'freeStreets'
            ? { t: 'endFreeStreets' }
            : botMove(s)
    const r = applyMove(s, seat, m)
    if (!r.ok) break
    s = r.state
  }
  return s
}

