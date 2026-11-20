/* Land Grab's rules. Pure: a BoardState and a move in, a new BoardState out
   (or a reason it's not allowed). The table's dice live in the state, so a
   game replays exactly. The server is the only thing that runs this for an
   online table; browsers use the legality helpers to light up the board. */

import {
  AWARD_POINTS,
  BOTS,
  BUILDING_INFO,
  COSTS,
  DECK,
  ERAS,
  HAND_LIMIT,
  LIMITS,
  LOG_MAX,
  MAIN_STREET_MIN,
  MAX_SEATS,
  MIN_SEATS,
  NUMBER_BAG,
  RESOURCES,
  RES_INFO,
  TERRAIN_BAG,
  TOP_PRODUCER_MIN,
  WIN_POINTS,
  bankRatio,
} from './data'
import { TOPO, hexNeighbours } from './geometry'
import type { BoardState, BoardView, DealCard, Hand, Move, Res, Seat, SeatStats, SeatView, Terrain, Tile } from './types'
import { say, type Beat } from './voice'

/* ------------------------------------------------------------------ dice */

/** mulberry32 over state.rng. Mutates the draft it's handed. */
function rand(s: BoardState): number {
  s.rng = (s.rng + 0x6d2b79f5) >>> 0
  let t = s.rng
  t = Math.imul(t ^ (t >>> 15), t | 1)
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}
const int = (s: BoardState, n: number) => Math.floor(rand(s) * n)
function shuffle<T>(s: BoardState, xs: T[]): T[] {
  const a = xs.slice()
  for (let i = a.length - 1; i > 0; i--) {
    const j = int(s, i + 1)
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

/* ----------------------------------------------------------------- hands */

export const emptyHand = (): Hand => ({ leads: 0, lumber: 0, brick: 0, permits: 0, cash: 0 })
export const handSize = (h: Hand) => RESOURCES.reduce((n, r) => n + h[r], 0)
export const canAfford = (h: Hand, cost: Hand) => RESOURCES.every((r) => h[r] >= cost[r])
const pay = (h: Hand, cost: Hand) => {
  for (const r of RESOURCES) h[r] -= cost[r]
}
const add = (h: Hand, more: Hand) => {
  for (const r of RESOURCES) h[r] += more[r]
}
export const handText = (h: Hand) =>
  RESOURCES.filter((r) => h[r] > 0)
    .map((r) => h[r] + ' ' + RES_INFO[r].icon)
    .join(' ') || 'nothing'

/* ----------------------------------------------------------------- setup */

export function newTable(seed: number, host: string): BoardState {
  return {
    version: 1,
    rng: seed >>> 0,
    status: 'lobby',
    host,
    seats: [],
    tiles: [],
    buildings: {},
    streets: {},
    crash: 0,
    turn: 0,
    round: 0,
    phase: 'setupHouse',
    setup: { step: 0, lastHouse: null },
    dice: null,
    era: 0,
    deck: [],
    playedDeal: false,
    freeStreets: 0,
    victims: [],
    offer: null,
    mainStreet: null,
    topProducer: null,
    log: [],
    nextLog: 1,
    winner: null,
  }
}

const blankSeat = (id: string, name: string, color: string, bot: boolean): Seat => ({
  id,
  name,
  color,
  bot,
  autopilot: false,
  hand: emptyHand(),
  deals: [],
  newDeals: [],
  openHouses: 0,
  stats: emptyStats(),
})

export const emptyStats = (): SeatStats => ({ robbed: 0, stole: 0, audited: 0, bank: 0, trades: 0, sevens: 0, collected: 0, timeouts: 0 })

/** Adds to a seat's award tally. */
function tally(seat: Seat, key: keyof SeatStats, n = 1) {
  seat.stats ??= emptyStats()
  seat.stats[key] += n
}

export type Result = { ok: true; state: BoardState } | { ok: false; error: string }
const no = (error: string): Result => ({ ok: false, error })

/** A person takes a seat in the lobby. */
export function sit(state: BoardState, id: string, name: string, color: string): Result {
  if (state.status !== 'lobby') return no('The game has already started.')
  if (state.seats.some((s) => s.id === id)) return { ok: true, state }
  if (state.seats.length >= MAX_SEATS) return no('The table is full.')
  const s = clone(state)
  const taken = new Set(s.seats.map((x) => x.color))
  s.seats.push(blankSeat(id, name, taken.has(color) ? '#9aa0b0' : color, false))
  tell(s, 'join', { name }, s.seats.length - 1)
  return { ok: true, state: s }
}

export function addBot(state: BoardState): Result {
  if (state.status !== 'lobby') return no('The game has already started.')
  if (state.seats.length >= MAX_SEATS) return no('The table is full.')
  const s = clone(state)
  const used = new Set(s.seats.map((x) => x.name))
  const b = BOTS.find((x) => !used.has(x.name)) ?? BOTS[0]
  const n = s.seats.filter((x) => x.bot).length + 1
  s.seats.push(blankSeat('bot:' + n + ':' + s.nextLog, b.name, b.color, true))
  tell(s, 'join', { name: b.name }, s.seats.length - 1)
  return { ok: true, state: s }
}

/** Leave the lobby, or take a bot out of it. */
export function leave(state: BoardState, id: string): Result {
  if (state.status !== 'lobby') return no('The game has started. Hand your seat to the bot instead.')
  const i = state.seats.findIndex((x) => x.id === id)
  if (i < 0) return { ok: true, state }
  const s = clone(state)
  const [gone] = s.seats.splice(i, 1)
  forgetSeats(s)
  tell(s, 'leave', { name: gone.name })
  return { ok: true, state: s }
}

/** Hand a seat to the bot (or take it back). */
export function setAutopilot(state: BoardState, id: string, on: boolean): Result {
  const i = state.seats.findIndex((x) => x.id === id)
  if (i < 0) return no('That seat isn’t at this table.')
  if (state.seats[i].bot) return no('That one is already a bot.')
  const s = clone(state)
  s.seats[i].autopilot = on
  tell(s, on ? 'awayOn' : 'awayOff', { name: s.seats[i].name }, i)
  return { ok: true, state: s }
}

/** After a game: a fresh table with the same people in the same seats,
 *  back in the lobby so bots can be added or removed. */
export function rematch(state: BoardState, seed: number): Result {
  if (state.status !== 'over') return no('Finish this game first.')
  const s = newTable(seed, state.host)
  s.seats = state.seats.map((x) => blankSeat(x.id, x.name, x.color, x.bot))
  tell(s, 'rematch', {})
  return { ok: true, state: s }
}

/** The clock ran out on the player whose turn it is: say so. The bot then
 *  finishes their turn (bot.ts timeOut). */
export function markTimeout(state: BoardState): BoardState {
  const s = clone(state)
  const me = s.seats[s.turn]
  tally(me, 'timeouts')
  tell(s, 'timeout', { name: me.name }, s.turn)
  return s
}

/** Deal the board and start the opening placement. */
export function start(state: BoardState): Result {
  if (state.status !== 'lobby') return no('The game has already started.')
  if (state.seats.length < MIN_SEATS) return no('Land Grab needs at least two players. Add a bot.')
  const s = clone(state)
  s.seats = shuffle(s, s.seats)
  forgetSeats(s)
  s.tiles = dealTiles(s)
  s.crash = s.tiles.findIndex((t) => t.terrain === 'river')
  s.deck = shuffle(s, DECK)
  s.status = 'playing'
  s.phase = 'setupHouse'
  s.setup = { step: 0, lastHouse: null }
  s.turn = 0
  s.round = 0
  tell(s, 'dealt', { era: ERAS[0].name, blurb: ERAS[0].blurb })
  tell(s, 'first', { name: s.seats[0].name }, 0)
  return { ok: true, state: s }
}

/** Shuffles terrain and numbers until no two red numbers (6, 8) touch. */
function dealTiles(s: BoardState): Tile[] {
  for (let tries = 0; ; tries++) {
    const terrain = shuffle(s, TERRAIN_BAG)
    const nums = shuffle(s, NUMBER_BAG)
    let k = 0
    const tiles: Tile[] = terrain.map((t: Terrain) => ({ terrain: t, number: t === 'river' ? null : nums[k++] }))
    const hot = (i: number) => tiles[i].number === 6 || tiles[i].number === 8
    const clash = tiles.some((_, i) => hot(i) && hexNeighbours(i).some(hot))
    if (!clash || tries > 200) return tiles
  }
}

/* --------------------------------------------------------------- helpers */

const clone = (s: BoardState): BoardState => structuredClone(s)

function note(s: BoardState, text: string, seat?: number) {
  s.log.push(seat === undefined ? { n: s.nextLog++, text } : { n: s.nextLog++, text, seat })
  if (s.log.length > LOG_MAX) s.log.splice(0, s.log.length - LOG_MAX)
}

/** A line of table talk about a moment (see voice.ts). A bot's own moments
 *  get its own lines. */
function tell(s: BoardState, beat: Beat, vars: Record<string, string | number>, seat?: number) {
  const who = seat !== undefined ? s.seats[seat] : undefined
  note(s, say(beat, vars, (s.rng ^ Math.imul(s.nextLog + 1, 7919)) >>> 0, who?.bot ? who.name : undefined), seat)
}

/** Log lines point at seats by position. When seats move (someone leaves,
 *  or the start shuffles them), older lines lose their colour rather than
 *  wear somebody else's. */
function forgetSeats(s: BoardState) {
  s.log = s.log.map((l) => ({ n: l.n, text: l.text }))
}

const count = (s: BoardState, seat: number, kind: 'house' | 'duplex' | 'tower') =>
  Object.values(s.buildings).filter((b) => b.seat === seat && b.kind === kind).length
const streetCount = (s: BoardState, seat: number) => Object.values(s.streets).filter((x) => x === seat).length

/** Setup placement order: 0,1,..,n-1, n-1,..,1,0. */
export const setupSeat = (n: number, step: number) => (step < n ? step : 2 * n - 1 - step)

/* ------------------------------------------------------------- legality */

/** Empty, and no building on a neighbouring corner. */
export function houseSpotFree(s: Pick<BoardState, 'buildings'>, v: number): boolean {
  if (s.buildings[v]) return false
  return TOPO.vertices[v].adj.every((a) => !s.buildings[a])
}

export function canPlaceHouse(s: Pick<BoardState, 'buildings' | 'streets'>, seat: number, v: number, setup: boolean): boolean {
  if (!houseSpotFree(s, v)) return false
  if (setup) return true
  return TOPO.vertices[v].edges.some((e) => s.streets[e] === seat)
}

export function canPlaceStreet(
  s: Pick<BoardState, 'buildings' | 'streets'>,
  seat: number,
  e: number,
  mustTouch: number | null = null,
): boolean {
  if (s.streets[e] !== undefined) return false
  const { a, b } = TOPO.edges[e]
  if (mustTouch !== null) return a === mustTouch || b === mustTouch
  /* A corner joins up if it's your building, or an empty corner one of
     your other streets touches. Someone else's building blocks it. */
  const reaches = (v: number) => {
    const bl = s.buildings[v]
    if (bl) return bl.seat === seat
    return TOPO.vertices[v].edges.some((x) => x !== e && s.streets[x] === seat)
  }
  return reaches(a) || reaches(b)
}

export function canUpgrade(s: Pick<BoardState, 'buildings' | 'era'>, seat: number, v: number): boolean {
  const b = s.buildings[v]
  if (!b || b.seat !== seat) return false
  if (b.kind === 'house') return s.era >= 1
  if (b.kind === 'duplex') return s.era >= 2
  return false
}

export const upgradeCost = (kind: 'house' | 'duplex') => (kind === 'house' ? COSTS.duplex : COSTS.tower)

/** Every spot a seat could legally put a street right now. */
export const legalStreets = (s: Pick<BoardState, 'buildings' | 'streets'>, seat: number, mustTouch: number | null = null) =>
  TOPO.edges.map((_, i) => i).filter((e) => canPlaceStreet(s, seat, e, mustTouch))
export const legalHouses = (s: Pick<BoardState, 'buildings' | 'streets'>, seat: number, setup: boolean) =>
  TOPO.vertices.map((_, i) => i).filter((v) => canPlaceHouse(s, seat, v, setup))

/* ---------------------------------------------------------------- scores */

/** Longest unbroken run of a seat's streets. Another player's building on a
 *  corner cuts the run there. */
export function streetLength(s: Pick<BoardState, 'buildings' | 'streets'>, seat: number): number {
  const mine = Object.keys(s.streets)
    .map(Number)
    .filter((e) => s.streets[e] === seat)
  if (!mine.length) return 0
  const used = new Set<number>()
  let best = 0
  const walk = (v: number, len: number) => {
    best = Math.max(best, len)
    const bl = s.buildings[v]
    if (bl && bl.seat !== seat && len > 0) return
    for (const e of TOPO.vertices[v].edges) {
      if (s.streets[e] !== seat || used.has(e)) continue
      used.add(e)
      const { a, b } = TOPO.edges[e]
      walk(a === v ? b : a, len + 1)
      used.delete(e)
    }
  }
  for (const e of mine) {
    walk(TOPO.edges[e].a, 0)
    walk(TOPO.edges[e].b, 0)
  }
  return best
}

export function publicPoints(s: BoardState, seat: number): number {
  let p = 0
  for (const b of Object.values(s.buildings)) if (b.seat === seat) p += BUILDING_INFO[b.kind].points
  if (s.mainStreet === seat) p += AWARD_POINTS
  if (s.topProducer === seat) p += AWARD_POINTS
  return p
}

const plaques = (seat: Seat) => [...seat.deals, ...seat.newDeals].filter((c) => c === 'plaque').length
export const totalPoints = (s: BoardState, seat: number) => publicPoints(s, seat) + plaques(s.seats[seat])

function updateMainStreet(s: BoardState) {
  const lens = s.seats.map((_, i) => streetLength(s, i))
  const max = Math.max(...lens)
  const was = s.mainStreet
  if (was !== null && lens[was] === max && max >= MAIN_STREET_MIN) return
  const leaders = lens.map((l, i) => (l === max ? i : -1)).filter((i) => i >= 0)
  const next = max >= MAIN_STREET_MIN && leaders.length === 1 ? leaders[0] : null
  if (next === was) return
  s.mainStreet = next
  if (next !== null) tell(s, 'mainStreet', { name: s.seats[next].name, n: max }, next)
  else if (was !== null) tell(s, 'mainStreetLost', {})
}

function updateTopProducer(s: BoardState, seat: number) {
  const mine = s.seats[seat].openHouses
  if (mine < TOP_PRODUCER_MIN || s.topProducer === seat) return
  if (s.topProducer !== null && s.seats[s.topProducer].openHouses >= mine) return
  s.topProducer = seat
  tell(s, 'topProducer', { name: s.seats[seat].name, n: mine }, seat)
}

/** The leader pulls everyone into the next era. */
function updateEra(s: BoardState) {
  const lead = Math.max(...s.seats.map((_, i) => publicPoints(s, i)))
  while (s.era < ERAS.length - 1 && lead >= ERAS[s.era + 1].at) {
    s.era++
    tell(s, 'era', { era: ERAS[s.era].name, blurb: ERAS[s.era].blurb })
  }
}

function checkWin(s: BoardState) {
  const seat = s.turn
  if (totalPoints(s, seat) >= WIN_POINTS) {
    s.status = 'over'
    s.winner = seat
    tell(s, 'win', { name: s.seats[seat].name, n: totalPoints(s, seat) }, seat)
  }
}

/* ------------------------------------------------------------ production */

function produce(s: BoardState, total: number) {
  const got = s.seats.map(() => emptyHand())
  s.tiles.forEach((t, i) => {
    if (t.number !== total || i === s.crash || t.terrain === 'river') return
    for (const v of TOPO.hexes[i].vertices) {
      const b = s.buildings[v]
      if (b) got[b.seat][t.terrain] += BUILDING_INFO[b.kind].yield
    }
  })
  got.forEach((h, i) => {
    if (handSize(h) === 0) return
    add(s.seats[i].hand, h)
    tally(s.seats[i], 'collected', handSize(h))
    note(s, s.seats[i].name + ' collects ' + handText(h) + '.', i)
  })
}

/** A 7: anyone over the limit loses half, at random (the audit is not
 *  negotiable). */
function audit(s: BoardState) {
  s.seats.forEach((seat, i) => {
    const n = handSize(seat.hand)
    if (n <= HAND_LIMIT) return
    const lose = Math.floor(n / 2)
    const lost = emptyHand()
    for (let k = 0; k < lose; k++) {
      const cards = RESOURCES.flatMap((r) => Array<Res>(seat.hand[r]).fill(r))
      const r = cards[int(s, cards.length)]
      seat.hand[r]--
      lost[r]++
    }
    tally(seat, 'audited', lose)
    tell(s, 'audit', { name: seat.name, cards: handText(lost) }, i)
  })
}

function victimsAt(s: BoardState, tile: number): number[] {
  const out = new Set<number>()
  for (const v of TOPO.hexes[tile].vertices) {
    const b = s.buildings[v]
    if (b && b.seat !== s.turn && handSize(s.seats[b.seat].hand) > 0) out.add(b.seat)
  }
  return [...out]
}

function stealFrom(s: BoardState, victim: number) {
  const h = s.seats[victim].hand
  const cards = RESOURCES.flatMap((r) => Array<Res>(h[r]).fill(r))
  if (!cards.length) return
  const r = cards[int(s, cards.length)]
  h[r]--
  s.seats[s.turn].hand[r]++
  tally(s.seats[s.turn], 'stole')
  tally(s.seats[victim], 'robbed')
  tell(s, 'steal', { name: s.seats[s.turn].name, who: s.seats[victim].name }, s.turn)
}

/** After the crash (and any steal): back to rolling, or on with the turn. */
const afterCrash = (s: BoardState) => {
  s.victims = []
  s.phase = s.dice ? 'main' : 'roll'
}

function nextTurn(s: BoardState) {
  const seat = s.seats[s.turn]
  seat.deals.push(...seat.newDeals)
  seat.newDeals = []
  s.offer = null
  s.playedDeal = false
  s.dice = null
  s.freeStreets = 0
  s.turn = (s.turn + 1) % s.seats.length
  if (s.turn === 0) s.round++
  s.phase = 'roll'
}

/* ----------------------------------------------------------------- moves */

/** Who may make this move: the seat whose turn it is, except accepting a
 *  trade, which is anyone else. */
export function applyMove(state: BoardState, seat: number, move: Move): Result {
  if (state.status !== 'playing') return no(state.status === 'lobby' ? 'The game hasn’t started.' : 'The game is over.')
  if (seat < 0 || seat >= state.seats.length) return no('You’re not at this table.')
  if (move.t === 'accept') return accept(state, seat)
  if (seat !== state.turn) return no('It’s not your turn.')
  const s = clone(state)
  const me = s.seats[seat]
  const r = play(s, seat, me, move)
  if (r) return no(r)
  if (s.status === 'playing') {
    updateEra(s)
    checkWin(s)
  }
  return { ok: true, state: s }
}

/** Plays a move on the draft. Returns an error, or null when it worked. */
function play(s: BoardState, seat: number, me: Seat, m: Move): string | null {
  const n = s.seats.length
  switch (m.t) {
    case 'house': {
      if (!validVertex(m.vertex)) return 'That’s not a corner.'
      if (s.phase === 'setupHouse') {
        if (!canPlaceHouse(s, seat, m.vertex, true)) return 'Too close to another building.'
        s.buildings[m.vertex] = { seat, kind: 'house' }
        s.setup.lastHouse = m.vertex
        s.phase = 'setupStreet'
        if (s.setup.step >= n) {
          const got = emptyHand()
          for (const h of TOPO.vertices[m.vertex].hexes) {
            const t = s.tiles[h].terrain
            if (t !== 'river') got[t]++
          }
          add(me.hand, got)
          tell(s, 'secondHouse', { name: me.name, cards: handText(got) }, seat)
        } else tell(s, 'firstHouse', { name: me.name }, seat)
        return null
      }
      if (s.phase !== 'main') return 'You can’t build right now.'
      if (count(s, seat, 'house') >= LIMITS.house) return 'You’re out of houses. Upgrade one to free it up.'
      if (!canPlaceHouse(s, seat, m.vertex, false)) return 'A house needs one of your streets, and room around it.'
      if (!canAfford(me.hand, COSTS.house)) return 'You can’t afford a house.'
      pay(me.hand, COSTS.house)
      s.buildings[m.vertex] = { seat, kind: 'house' }
      tell(s, 'house', { name: me.name }, seat)
      updateMainStreet(s)
      return null
    }
    case 'street': {
      if (!validEdge(m.edge)) return 'That’s not a street.'
      if (s.phase === 'setupStreet') {
        if (!canPlaceStreet(s, seat, m.edge, s.setup.lastHouse)) return 'Your street has to touch the house you just built.'
        s.streets[m.edge] = seat
        s.setup.step++
        s.setup.lastHouse = null
        if (s.setup.step >= 2 * n) {
          s.turn = 0
          s.round = 1
          s.phase = 'roll'
          tell(s, 'setupDone', { name: s.seats[0].name }, 0)
        } else {
          s.turn = setupSeat(n, s.setup.step)
          s.phase = 'setupHouse'
        }
        return null
      }
      const free = s.phase === 'freeStreets'
      if (s.phase !== 'main' && !free) return 'You can’t build right now.'
      if (streetCount(s, seat) >= LIMITS.street) return 'You’re out of streets.'
      if (!canPlaceStreet(s, seat, m.edge)) return 'A street has to join up with your own.'
      if (!free) {
        if (!canAfford(me.hand, COSTS.street)) return 'You can’t afford a street.'
        pay(me.hand, COSTS.street)
      }
      s.streets[m.edge] = seat
      if (free) {
        s.freeStreets--
        if (s.freeStreets <= 0 || legalStreets(s, seat).length === 0) s.phase = 'main'
      }
      updateMainStreet(s)
      return null
    }
    case 'endFreeStreets':
      if (s.phase !== 'freeStreets') return 'Nothing to finish.'
      s.freeStreets = 0
      s.phase = 'main'
      return null
    case 'upgrade': {
      if (s.phase !== 'main') return 'You can’t build right now.'
      if (!validVertex(m.vertex)) return 'That’s not a corner.'
      const b = s.buildings[m.vertex]
      if (!b || b.seat !== seat) return 'That isn’t yours.'
      if (b.kind === 'tower') return 'It’s already a tower.'
      if (!canUpgrade(s, seat, m.vertex)) return b.kind === 'house' ? 'Duplexes open in the Landlord Era.' : 'Towers open in the Developer Era.'
      const to = b.kind === 'house' ? 'duplex' : 'tower'
      if (count(s, seat, to) >= LIMITS[to]) return to === 'duplex' ? 'You’re out of duplexes.' : 'You’re out of towers.'
      const cost = upgradeCost(b.kind)
      if (!canAfford(me.hand, cost)) return 'You can’t afford that.'
      pay(me.hand, cost)
      s.buildings[m.vertex] = { seat, kind: to }
      tell(s, to === 'tower' ? 'tower' : 'duplex', { name: me.name }, seat)
      return null
    }
    case 'roll': {
      if (s.phase !== 'roll') return 'You’ve already rolled.'
      const d: [number, number] = [int(s, 6) + 1, int(s, 6) + 1]
      s.dice = d
      const total = d[0] + d[1]
      tell(s, total === 2 ? 'snakeEyes' : total === 12 ? 'boxcars' : 'roll', { name: me.name, n: total }, seat)
      if (total === 7) {
        tally(me, 'sevens')
        tell(s, 'crash', {})
        audit(s)
        s.phase = 'crash'
      } else {
        produce(s, total)
        s.phase = 'main'
      }
      return null
    }
    case 'crash': {
      if (s.phase !== 'crash') return 'The Market Crash isn’t moving.'
      if (!Number.isInteger(m.tile) || m.tile < 0 || m.tile >= s.tiles.length) return 'That’s not a tile.'
      if (m.tile === s.crash) return 'It has to move somewhere new.'
      s.crash = m.tile
      tell(s, 'crashMove', { name: me.name, tile: tileName(s, m.tile) }, seat)
      const v = victimsAt(s, m.tile)
      if (v.length === 1) {
        stealFrom(s, v[0])
        afterCrash(s)
      } else if (v.length > 1) {
        s.victims = v
        s.phase = 'steal'
      } else afterCrash(s)
      return null
    }
    case 'steal':
      if (s.phase !== 'steal') return 'Nobody to take from.'
      if (!s.victims.includes(m.seat)) return 'You can’t take from them.'
      stealFrom(s, m.seat)
      afterCrash(s)
      return null
    case 'buyDeal':
      if (s.phase !== 'main') return 'Not now.'
      if (!s.deck.length) return 'The deal deck is empty.'
      if (!canAfford(me.hand, COSTS.deal)) return 'You can’t afford a deal card.'
      pay(me.hand, COSTS.deal)
      me.newDeals.push(s.deck.pop()!)
      tell(s, 'buyDeal', { name: me.name }, seat)
      return null
    case 'playDeal':
      return playDeal(s, seat, me, m)
    case 'bank': {
      if (s.phase !== 'main') return 'Not now.'
      if (!isRes(m.give) || !isRes(m.get) || m.give === m.get) return 'Pick two different resources.'
      const k = bankRatio(s.era)
      if (me.hand[m.give] < k) return 'The bank wants ' + k + ' of a kind.'
      me.hand[m.give] -= k
      me.hand[m.get]++
      tally(me, 'bank')
      tell(s, 'bank', { name: me.name, k, give: RES_INFO[m.give].icon, get: RES_INFO[m.get].icon }, seat)
      return null
    }
    case 'offer': {
      if (s.phase !== 'main') return 'Trade after you roll.'
      if (!isHand(m.give) || !isHand(m.want)) return 'That trade doesn’t add up.'
      if (handSize(m.give) === 0 || handSize(m.want) === 0) return 'A trade needs something each way.'
      if (RESOURCES.some((r) => m.give[r] > 0 && m.want[r] > 0)) return 'You can’t give and want the same thing.'
      if (!canAfford(me.hand, m.give)) return 'You don’t have those cards.'
      s.offer = { give: { ...m.give }, want: { ...m.want } }
      tell(s, 'offer', { name: me.name, give: handText(m.give), want: handText(m.want) }, seat)
      return null
    }
    case 'cancelOffer':
      s.offer = null
      return null
    case 'end':
      if (s.phase !== 'main') return s.phase === 'roll' ? 'Roll first.' : 'Finish what you’re doing first.'
      nextTurn(s)
      return null
    case 'accept':
      return 'Unreachable.'
  }
}

function playDeal(s: BoardState, seat: number, me: Seat, m: Extract<Move, { t: 'playDeal' }>): string | null {
  if (s.phase !== 'main' && s.phase !== 'roll') return 'Not now.'
  if (s.playedDeal) return 'One deal card a turn.'
  const i = me.deals.indexOf(m.card)
  if (i < 0) return me.newDeals.includes(m.card) ? 'You just bought that one. Play it next turn.' : 'You don’t have that card.'
  if (m.card !== 'openHouse' && s.phase === 'roll') return 'Roll first. Only an Open House can go before the dice.'
  switch (m.card) {
    case 'openHouse':
      me.openHouses++
      s.phase = 'crash'
      tell(s, 'openHouse', { name: me.name }, seat)
      updateTopProducer(s, seat)
      break
    case 'zoning':
      if (legalStreets(s, seat).length === 0) return 'There’s nowhere to put a street.'
      s.freeStreets = Math.min(2, LIMITS.street - streetCount(s, seat))
      if (s.freeStreets <= 0) return 'You’re out of streets.'
      s.phase = 'freeStreets'
      tell(s, 'zoning', { name: me.name }, seat)
      break
    case 'hotMarket': {
      if (!isRes(m.res) || !isRes(m.res2)) return 'Pick two resources.'
      me.hand[m.res]++
      me.hand[m.res2]++
      tell(s, 'hotMarket', { name: me.name, res: RES_INFO[m.res].icon + RES_INFO[m.res2].icon }, seat)
      break
    }
    case 'biddingWar': {
      if (!isRes(m.res)) return 'Name a resource.'
      let got = 0
      s.seats.forEach((o, j) => {
        if (j === seat) return
        got += o.hand[m.res!]
        o.hand[m.res!] = 0
      })
      me.hand[m.res] += got
      tell(s, 'biddingWar', { name: me.name, resName: RES_INFO[m.res].name, n: got }, seat)
      break
    }
  }
  me.deals.splice(i, 1)
  s.playedDeal = true
  return null
}

function accept(state: BoardState, seat: number): Result {
  if (state.phase !== 'main' || !state.offer) return no('There’s no offer on the table.')
  if (seat === state.turn) return no('You can’t take your own offer.')
  const s = clone(state)
  const from = s.seats[s.turn]
  const to = s.seats[seat]
  const o = s.offer!
  if (!canAfford(to.hand, o.want)) return no('You don’t have what they want.')
  if (!canAfford(from.hand, o.give)) return no('They no longer have those cards.')
  pay(from.hand, o.give)
  add(to.hand, o.give)
  pay(to.hand, o.want)
  add(from.hand, o.want)
  s.offer = null
  tally(from, 'trades')
  tally(to, 'trades')
  tell(s, 'took', { who: to.name, name: s.seats[s.turn].name, give: handText(o.give), want: handText(o.want) }, seat)
  return { ok: true, state: s }
}

/* ---------------------------------------------------------------- checks */

const isRes = (r: unknown): r is Res => typeof r === 'string' && (RESOURCES as string[]).includes(r)
const validVertex = (v: unknown) => Number.isInteger(v) && (v as number) >= 0 && (v as number) < TOPO.vertices.length
const validEdge = (e: unknown) => Number.isInteger(e) && (e as number) >= 0 && (e as number) < TOPO.edges.length
function isHand(h: unknown): h is Hand {
  if (typeof h !== 'object' || h === null) return false
  const o = h as Record<string, unknown>
  return RESOURCES.every((r) => Number.isInteger(o[r]) && (o[r] as number) >= 0 && (o[r] as number) <= 20)
}

export const tileName = (s: Pick<BoardState, 'tiles'>, i: number) => {
  const t = s.tiles[i]
  const names: Record<Terrain, string> = {
    leads: 'the cul-de-sacs',
    lumber: 'the lumberyard',
    brick: 'the brickworks',
    permits: 'City Hall',
    cash: 'Bank Row',
    river: 'the Grand River',
  }
  return names[t.terrain] + (t.number ? ' (' + t.number + ')' : '')
}

/** Checks a move from the network has the right shape before it reaches
 *  the rules. */
export function parseMove(raw: unknown): Move | null {
  if (typeof raw !== 'object' || raw === null) return null
  const m = raw as Record<string, unknown>
  switch (m.t) {
    case 'house':
    case 'upgrade':
      return validVertex(m.vertex) ? { t: m.t, vertex: m.vertex as number } : null
    case 'street':
      return validEdge(m.edge) ? { t: 'street', edge: m.edge as number } : null
    case 'crash':
      return Number.isInteger(m.tile) ? { t: 'crash', tile: m.tile as number } : null
    case 'steal':
      return Number.isInteger(m.seat) ? { t: 'steal', seat: m.seat as number } : null
    case 'playDeal': {
      const cards: DealCard[] = ['openHouse', 'zoning', 'hotMarket', 'biddingWar']
      if (!cards.includes(m.card as DealCard)) return null
      const out: Move = { t: 'playDeal', card: m.card as Exclude<DealCard, 'plaque'> }
      if (m.res !== undefined) {
        if (!isRes(m.res)) return null
        out.res = m.res
      }
      if (m.res2 !== undefined) {
        if (!isRes(m.res2)) return null
        out.res2 = m.res2
      }
      return out
    }
    case 'bank':
      return isRes(m.give) && isRes(m.get) ? { t: 'bank', give: m.give, get: m.get } : null
    case 'offer':
      return isHand(m.give) && isHand(m.want) ? { t: 'offer', give: { ...m.give }, want: { ...m.want } } : null
    case 'roll':
    case 'buyDeal':
    case 'cancelOffer':
    case 'accept':
    case 'endFreeStreets':
    case 'end':
      return { t: m.t }
    default:
      return null
  }
}

/* ------------------------------------------------------------------ view */

/** What one person sees: their own hand, everyone else's card counts. */
export function viewFor(s: BoardState, userId: string, rev: number): BoardView {
  const you = s.seats.findIndex((x) => x.id === userId)
  const seats: SeatView[] = s.seats.map((x, i) => {
    const base: SeatView = {
      id: x.id,
      name: x.name,
      color: x.color,
      bot: x.bot,
      autopilot: x.autopilot,
      cards: handSize(x.hand),
      dealCount: x.deals.length + x.newDeals.length,
      openHouses: x.openHouses,
      points: publicPoints(s, i),
      streetLength: s.status === 'lobby' ? 0 : streetLength(s, i),
      stats: { ...emptyStats(), ...x.stats },
    }
    /* At the end, every hand is shown: who had the plaques. */
    if (i === you || s.status === 'over')
      return { ...base, hand: { ...x.hand }, deals: [...x.deals], newDeals: [...x.newDeals], totalPoints: totalPoints(s, i) }
    return base
  })
  return {
    status: s.status,
    host: s.host,
    seats,
    you,
    tiles: s.tiles,
    buildings: s.buildings,
    streets: s.streets,
    crash: s.crash,
    turn: s.turn,
    round: s.round,
    phase: s.phase,
    setup: s.setup,
    dice: s.dice,
    era: s.era,
    deckCount: s.deck.length,
    playedDeal: s.playedDeal,
    freeStreets: s.freeStreets,
    victims: s.victims,
    offer: s.offer,
    mainStreet: s.mainStreet,
    topProducer: s.topProducer,
    log: s.log,
    winner: s.winner,
    rev,
  }
}

/** Is this seat played by the bot right now? */
export const botSeat = (s: BoardState, i: number) => s.seats[i].bot || s.seats[i].autopilot
