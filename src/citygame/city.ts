/* The shared city's rules: supply, sealed bids, the overnight tick, the
   newsfeed, absent players, and the season clock.

   Pure: a CityState plus the players' games in, new ones out. Each player's
   own career still runs through the ordinary engine (applyAction); this only
   adds what ten friends share. The city's dice are its own (CityState.rng),
   so nothing here disturbs a player's luck, and a tick replays exactly. */

import { ABSENCE, AUCTION, FEED_MAX, GRUDGE_AT, SEASON_WEEKS, SUPPLY } from '../data/city'
import { districtOrFirst } from '../data/districts'
import { FEED_LINES, type FeedLineKey } from '../data/feedLines'
import { PRICE_ROUND, P3 } from '../data/p3'
import { PROPERTY_TYPES } from '../data/properties'
import { applyAction, createCityGame, settleForTick } from '../engine'
import { quarterOf } from '../logic/cityMode'
import { rankOf } from '../logic/economy'
import { conditionFactor, displayedValue, eligibleTypes, hasFreeMortgageSlot, labelOf, netWorth } from '../logic/portfolio'
import { money } from '../logic/rand'
import { districtsForType, priceMultOf } from '../logic/territory'
import type { Action, GameState, MarketState, Property } from '../state/types'
import type { Bid, CityListing, CityPlayer, CityState, FeedItem, FeedKind, MorningReport, SeasonResult, Standing } from './types'

/* ------------------------------------------------------------------ dice */

/** mulberry32, with its state kept in the CityState. */
class Dice {
  a: number
  constructor(a: number) {
    this.a = a >>> 0
  }
  next(): number {
    this.a = (this.a + 0x6d2b79f5) >>> 0
    let t = this.a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  int(lo: number, hi: number): number {
    return lo + Math.floor(this.next() * (hi - lo + 1))
  }
  pick<T>(xs: readonly T[]): T {
    return xs[Math.floor(this.next() * xs.length)]
  }
  /** A fresh 32-bit seed for a player's game. */
  seed(): number {
    return Math.floor(this.next() * 4294967296) >>> 0
  }
}

/* ------------------------------------------------------------------ city */

export function newCity(seed: number): CityState {
  return {
    version: 1,
    season: 1,
    week: 1,
    status: 'lobby',
    rng: seed >>> 0,
    listings: [],
    nextListingId: 1,
    bids: {},
    bidSeq: 0,
    feed: [],
    nextFeedId: 1,
    rivalries: {},
    standings: [],
    lastSeason: null,
  }
}

const marketOf = (week: number): MarketState => (['normal', 'hot', 'normal', 'cold'] as const)[quarterOf(week)]

function fill(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, k) => (k in vars ? String(vars[k]) : '{' + k + '}'))
}

function post(city: CityState, dice: Dice, kind: FeedKind, key: FeedLineKey, vars: Record<string, string | number>, who: string[]): CityState {
  const item: FeedItem = { id: city.nextFeedId, week: city.week, kind, text: fill(dice.pick(FEED_LINES[key]), vars), who }
  return { ...city, nextFeedId: city.nextFeedId + 1, feed: [...city.feed, item].slice(-FEED_MAX) }
}

const houseOf = (typeId: string) => labelOf(typeId as never).toLowerCase()
const districtName = (id: string) => districtOrFirst(id).name

/* ---------------------------------------------------------------- supply */

export const poolTarget = (players: number): number =>
  Math.min(SUPPLY.MAX, SUPPLY.BASE + SUPPLY.PER_PLAYER * Math.max(1, players))

function makeListing(city: CityState, dice: Dice, source: 'market' | 'bank'): CityListing {
  const total = PROPERTY_TYPES.reduce((t, x) => t + x.weight, 0)
  let r = dice.next() * total
  const type = PROPERTY_TYPES.find((x) => (r -= x.weight) < 0) ?? PROPERTY_TYPES[0]
  const districts = districtsForType(type.id)
  const districtId = districts.length ? dice.pick(districts) : 'downtown'
  const condition = source === 'bank' ? dice.int(...SUPPLY.BANK_CONDITION) : dice.int(40, 90)
  const intrinsicValue =
    Math.round((dice.int(type.band.min, type.band.max) * priceMultOf(districtId)) / PRICE_ROUND) * PRICE_ROUND
  const market = marketOf(city.week)
  const ask = intrinsicValue * conditionFactor(condition) * P3.POOL_PRICE_MULT[market] * (source === 'bank' ? SUPPLY.BANK_PRICE_MULT : 1)
  return {
    id: 'CL' + city.nextListingId,
    typeId: type.id,
    intrinsicValue,
    condition,
    askPrice: Math.round(ask / 1000) * 1000,
    blurb: dice.pick(type.blurbs),
    districtId,
    listedWeek: city.week,
    source,
  }
}

function addListing(city: CityState, l: CityListing): CityState {
  return { ...city, listings: [...city.listings, l], nextListingId: city.nextListingId + 1 }
}

/** Takes unbid stale listings down, swaps a couple for fresh ones, and tops
 *  the board back up to size. */
function resupply(city: CityState, dice: Dice, players: number): CityState {
  let c = city
  const bid = (l: CityListing) => (c.bids[l.id]?.length ?? 0) > 0
  const stale = c.listings.filter((l) => !bid(l) && c.week - l.listedWeek >= SUPPLY.EXPIRE_WEEKS)
  const churn = c.listings
    .filter((l) => !bid(l) && !stale.includes(l) && l.source === 'market')
    .slice(0, SUPPLY.CHURN)
  const gone = new Set([...stale, ...churn].map((l) => l.id))
  c = { ...c, listings: c.listings.filter((l) => !gone.has(l.id)) }
  const target = poolTarget(players)
  while (c.listings.length < target) {
    const source = dice.next() < SUPPLY.BANK_CHANCE ? 'bank' : 'market'
    const l = makeListing(c, dice, source)
    c = addListing(c, l)
    if (source === 'bank') c = post(c, dice, 'deal', 'bankAuction', { house: houseOf(l.typeId), district: districtName(l.districtId) }, [])
  }
  return c
}

/** A property the bank took back, on the market at a discount. */
function foreclosureListing(city: CityState, p: Property, value: number): CityListing {
  const condition = Math.max(1, Math.round(p.condition))
  return {
    id: 'CL' + city.nextListingId,
    typeId: p.typeId,
    intrinsicValue: Math.round(p.baseValue / conditionFactor(condition)),
    condition,
    askPrice: Math.round((value * SUPPLY.FORECLOSURE_PRICE_MULT) / 1000) * 1000,
    blurb: 'Bank-owned. The previous owner left in a hurry and a mood.',
    districtId: p.districtId,
    listedWeek: city.week,
    source: 'foreclosure',
  }
}

/* --------------------------------------------------------------- players */

/** A player's game as they see it: the city's listings are their market. */
export const withCityListings = (game: GameState, city: CityState): GameState => ({
  ...game,
  marketPool: city.listings,
})

/** Someone new arrives (or comes back after going broke): a fresh career at
 *  the city's current week. */
export function joinCity(
  city: CityState,
  who: { userId: string; name: string; color: string; characterId: string },
  seed: number,
  announce = true,
): { city: CityState; player: CityPlayer } {
  const week = city.status === 'running' ? city.week : 1
  const player: CityPlayer = {
    ...who,
    game: createCityGame(who.characterId, seed, week),
    lastActiveWeek: week,
    joinedWeek: week,
    report: null,
  }
  const dice = new Dice(city.rng)
  let c = city
  if (announce) c = post(c, dice, 'join', 'joined', { a: who.name }, [who.userId])
  return { city: { ...c, rng: dice.a }, player }
}

/** The player's own moves (already through the client gate). Marks them as
 *  having checked in this week. Refuses nothing itself: the engine ignores
 *  illegal moves the way it always has. */
export function applyPlayerActions(city: CityState, player: CityPlayer, actions: Action[]): CityPlayer {
  if (city.status === 'finished') return player
  let game = player.game
  for (const a of actions) game = applyAction(game, a)
  return { ...player, game, lastActiveWeek: city.week }
}

/* ------------------------------------------------------------------ bids */

export type BidResult = { ok: true; city: CityState } | { ok: false; error: string; message: string }

const refuse = (error: string, message: string): BidResult => ({ ok: false, error, message })

export function placeBid(
  city: CityState,
  player: CityPlayer,
  bid: { listingId: string; amount: number; downPct: number },
): BidResult {
  if (city.status !== 'running') return refuse('not_running', 'The season isn’t running.')
  const l = city.listings.find((x) => x.id === bid.listingId)
  if (!l) return refuse('no_listing', 'That listing is gone.')
  const g = player.game
  if (g.gameOver) return refuse('game_over', 'You are, financially speaking, a ghost.')
  if (!eligibleTypes(g).some((t) => t.id === l.typeId))
    return refuse('rank_locked', 'Your rank can’t buy a ' + houseOf(l.typeId) + ' yet.')
  const amount = Math.round(bid.amount)
  if (!Number.isFinite(amount) || amount < l.askPrice * AUCTION.MIN_BID || amount > l.askPrice * AUCTION.MAX_BID)
    return refuse('bad_amount', 'Offers run from ' + money(Math.ceil(l.askPrice * AUCTION.MIN_BID)) + ' to ' + money(l.askPrice * AUCTION.MAX_BID) + '.')
  const downPct = Math.round(bid.downPct * 20) / 20
  if (!(downPct >= P3.DOWN_MIN && downPct <= 1)) return refuse('bad_down', 'Twenty percent down is the floor.')
  if (downPct < 1 && !hasFreeMortgageSlot(g)) return refuse('no_mortgage', 'The underwriter counted your mortgages. No.')
  if (g.cash < amount * downPct) return refuse('no_cash', 'You can’t cover the down payment on that offer.')
  const others = (city.bids[l.id] ?? []).filter((b) => b.userId !== player.userId)
  const mine: Bid = { userId: player.userId, amount, downPct, seq: city.bidSeq + 1 }
  return { ok: true, city: { ...city, bidSeq: city.bidSeq + 1, bids: { ...city.bids, [l.id]: [...others, mine] } } }
}

export function withdrawBid(city: CityState, userId: string, listingId: string): CityState {
  const list = city.bids[listingId]
  if (!list) return city
  const rest = list.filter((b) => b.userId !== userId)
  const bids = { ...city.bids }
  if (rest.length) bids[listingId] = rest
  else delete bids[listingId]
  return { ...city, bids }
}

/** Would the seller take this lone offer? */
export function acceptChance(amount: number, ask: number, week: number): number {
  const ratio = amount / ask
  if (ratio >= 1) return 1
  return Math.max(0, Math.min(1, 1 - (1 - ratio) * AUCTION.LOWBALL_STRICTNESS[quarterOf(week)]))
}

/* ------------------------------------------------------------------ tick */

export interface TickResult {
  city: CityState
  players: CityPlayer[]
  /** Set on the tick that ends week 52. */
  seasonOver: SeasonResult | null
}

type Notes = Map<string, string[]>
const note = (n: Notes, userId: string, text: string) => n.set(userId, [...(n.get(userId) ?? []), text])

/** Every bid settles at once. Listings in id order; within one, best offer
 *  first, earliest on a tie. The engine itself decides whether the winner
 *  can afford it: a refused purchase passes to the next bidder. */
function settleAuctions(city: CityState, byId: Map<string, CityPlayer>, dice: Dice, notes: Notes): CityState {
  let c = city
  const ids = Object.keys(c.bids).sort((a, b) => Number(a.slice(2)) - Number(b.slice(2)))
  for (const listingId of ids) {
    const listing = c.listings.find((l) => l.id === listingId)
    const bids = [...(c.bids[listingId] ?? [])].sort((a, b) => b.amount - a.amount || a.seq - b.seq)
    if (!listing) continue
    const contested = new Set(bids.map((b) => b.userId)).size > 1
    let winner: Bid | null = null
    for (const b of bids) {
      const p = byId.get(b.userId)
      if (!p || p.game.gameOver) continue
      const ratio = b.amount / listing.askPrice
      const sellerSays = contested && ratio >= AUCTION.RESERVE ? true : dice.next() < acceptChance(b.amount, listing.askPrice, c.week)
      if (!sellerSays) {
        note(notes, b.userId, 'The seller of the ' + houseOf(listing.typeId) + ' in ' + districtName(listing.districtId) + ' turned down your ' + money(b.amount) + '.')
        c = post(c, dice, 'flop', 'lowballRejected', { a: p.name, house: houseOf(listing.typeId), district: districtName(listing.districtId) }, [p.userId])
        /* A seller who says no to the best offer says no to the rest. */
        break
      }
      const before = p.game.properties.length
      const game = applyAction(p.game, { type: 'CITY_PURCHASE', listing, price: b.amount, downPct: b.downPct })
      if (game.properties.length === before) {
        note(notes, b.userId, 'Your offer on the ' + houseOf(listing.typeId) + ' in ' + districtName(listing.districtId) + ' fell through: you couldn’t cover it at closing.')
        continue
      }
      byId.set(p.userId, { ...p, game })
      winner = b
      break
    }
    if (winner) {
      const w = byId.get(winner.userId)!
      const vars = { a: w.name, house: houseOf(listing.typeId), district: districtName(listing.districtId), price: money(winner.amount) }
      note(notes, w.userId, 'You won the ' + vars.house + ' in ' + vars.district + ' for ' + vars.price + '.')
      const losers = [...new Set(bids.filter((b) => b.userId !== winner!.userId).map((b) => b.userId))]
      if (losers.length) {
        for (const lid of losers) {
          const loser = byId.get(lid)
          if (!loser) continue
          note(notes, lid, w.name + ' beat you to the ' + vars.house + ' in ' + vars.district + '.')
          byId.set(lid, { ...loser, game: applyAction(loser.game, { type: 'CITY_LOG', kind: 'event', text: 'OUTBID: ' + w.name + ' took the ' + vars.house + ' in ' + vars.district + ' for ' + vars.price + '.' }) })
          const key = w.userId + '>' + lid
          const n = (c.rivalries[key] ?? 0) + 1
          c = { ...c, rivalries: { ...c.rivalries, [key]: n } }
          c = post(c, dice, 'outbid', 'outbid', { ...vars, b: loser.name }, [w.userId, lid])
          if (GRUDGE_AT.includes(n)) c = post(c, dice, 'outbid', 'grudge', { a: w.name, b: loser.name, n }, [w.userId, lid])
        }
      } else c = post(c, dice, 'deal', 'won', vars, [w.userId])
      c = { ...c, listings: c.listings.filter((l) => l.id !== listingId) }
    }
  }
  return { ...c, bids: {} }
}

/** Takes one property back from `p` (the one with the most debt on it). */
function foreclose(city: CityState, dice: Dice, p: CityPlayer, all: boolean): { city: CityState; player: CityPlayer } {
  let c = city
  let player = p
  const victims = player.game.properties
    .filter((x) => !x.isVrbo)
    .sort((a, b) => (b.mortgage?.balance ?? 0) - (a.mortgage?.balance ?? 0) || a.id.localeCompare(b.id))
  for (const prop of all ? victims : victims.slice(0, 1)) {
    const value = displayedValue(player.game, prop)
    const proceeds = all ? 0 : Math.max(0, value * ABSENCE.FORECLOSE_SALE - (prop.mortgage?.balance ?? 0))
    const game = player.game.gameOver
      ? { ...player.game, properties: player.game.properties.filter((x) => x.id !== prop.id) }
      : applyAction(player.game, { type: 'CITY_FORECLOSE', propertyId: prop.id, proceeds })
    player = { ...player, game }
    c = addListing(c, foreclosureListing(c, prop, value))
    if (!all) c = post(c, dice, 'drama', 'foreclosed', { a: player.name, house: houseOf(prop.typeId), district: districtName(prop.districtId) }, [player.userId])
  }
  return { city: c, player }
}

export function standingsOf(players: CityPlayer[]): Standing[] {
  return players
    .map((p) => ({ userId: p.userId, netWorth: Math.round(netWorth(p.game)) }))
    .sort((a, b) => b.netWorth - a.netWorth || a.userId.localeCompare(b.userId))
    .map((s, i) => ({ ...s, place: i + 1 }))
}

/** The overnight tick: everyone's week ends at the same moment. */
export function tick(city: CityState, players: CityPlayer[]): TickResult {
  if (city.status === 'lobby') return { city, players, seasonOver: null }
  if (city.status === 'finished') {
    const started = startSeason(city, players)
    return { ...started, seasonOver: null }
  }

  const dice = new Dice(city.rng)
  let c = city
  const notes: Notes = new Map()
  const order = [...players].sort((a, b) => a.userId.localeCompare(b.userId))
  const byId = new Map(order.map((p) => [p.userId, p]))
  const before = new Map(order.map((p) => [p.userId, p.game]))

  /* 1. Whatever is still on screen gets the safe answer. */
  for (const p of order) byId.set(p.userId, { ...p, game: settleForTick(p.game) })

  /* 2. Offers and auctions, before anyone's rent or bills move the cash
        they bid with. */
  c = settleAuctions(c, byId, dice, notes)

  /* 3. Absence: wear, then the bank. */
  for (const id of byId.keys()) {
    let p = byId.get(id)!
    if (p.game.gameOver) continue
    const missed = c.week - p.lastActiveWeek
    if (missed >= ABSENCE.NEGLECT_AFTER && p.game.properties.length) {
      p = { ...p, game: applyAction(p.game, { type: 'CITY_NEGLECT', wear: ABSENCE.NEGLECT_WEAR }) }
      if (missed === ABSENCE.NEGLECT_AFTER) c = post(c, dice, 'drama', 'neglect', { a: p.name }, [p.userId])
    }
    if (missed >= ABSENCE.FORECLOSE_AFTER && p.game.properties.some((x) => !x.isVrbo)) {
      const r = foreclose(c, dice, p, false)
      c = r.city
      p = r.player
    }
    byId.set(id, p)
  }

  /* 4. The week itself, for everyone. */
  for (const id of byId.keys()) {
    let p = byId.get(id)!
    if (p.game.gameOver) {
      byId.set(id, { ...p, report: null })
      continue
    }
    const ended = applyAction(p.game, { type: 'END_WEEK' })
    const report: MorningReport = { week: c.week, summary: ended.summary, offers: notes.get(id) ?? [] }
    p = { ...p, game: { ...ended, summary: null, promo: null }, report }
    const was = before.get(id)!
    if (ended.rank !== was.rank)
      c = post(c, dice, 'promo', 'promoted', { a: p.name, rank: rankOf(ended.rank).name }, [id])
    /* Sold to an outside buyer (a flip, or a lowball they took). */
    const kept = new Set(ended.properties.map((x) => x.id))
    const settled = byId.get(id)!.game.properties
    for (const prop of settled) {
      if (kept.has(prop.id) || prop.isVrbo) continue
      c = post(c, dice, 'deal', 'sold', { a: p.name, house: houseOf(prop.typeId), district: districtName(prop.districtId), price: money(displayedValue(was, prop)) }, [id])
    }
    if (ended.gameOver) {
      c = post(c, dice, 'flop', 'bankrupt', { a: p.name }, [id])
      const r = foreclose(c, dice, p, true)
      c = r.city
      p = r.player
    }
    byId.set(id, p)
  }

  /* 5. The board moves on. */
  const after = order.map((p) => byId.get(p.userId)!)
  const standings = standingsOf(after)
  const oldLeader = c.standings[0]?.userId
  if (standings[0] && oldLeader && standings[0].userId !== oldLeader && after.length > 1) {
    const name = (id: string) => byId.get(id)?.name ?? 'Someone'
    c = post(c, dice, 'leader', 'leader', { a: name(standings[0].userId), b: name(oldLeader) }, [standings[0].userId, oldLeader])
  }
  c = { ...c, standings }

  /* 6. The season clock. */
  if (c.week >= SEASON_WEEKS) {
    const result: SeasonResult = {
      season: c.season,
      standings: standings.map((s) => {
        const p = byId.get(s.userId)!
        return { ...s, name: p.name, color: p.color, characterId: p.characterId, rank: p.game.rank }
      }),
    }
    const champ = result.standings[0]
    if (champ) c = post(c, dice, 'season', 'seasonEnd', { n: c.season, a: champ.name, price: money(champ.netWorth) }, [champ.userId])
    c = { ...c, status: 'finished', lastSeason: result, listings: [], bids: {}, rng: dice.a }
    return { city: c, players: after, seasonOver: result }
  }
  c = { ...c, week: c.week + 1 }
  c = resupply(c, dice, after.length)
  return { city: { ...c, rng: dice.a }, players: after, seasonOver: null }
}

/** Week 1 of a season: everyone back to the tent with the agent they chose,
 *  a fresh board, and the feed's opening line. */
export function startSeason(city: CityState, players: CityPlayer[]): { city: CityState; players: CityPlayer[] } {
  const dice = new Dice(city.rng)
  const season = city.status === 'lobby' ? city.season : city.season + 1
  let c: CityState = { ...city, season, week: 1, status: 'running', listings: [], bids: {}, standings: [] }
  const fresh = [...players]
    .sort((a, b) => a.userId.localeCompare(b.userId))
    .map((p) => ({
      ...p,
      game: createCityGame(p.characterId, dice.seed(), 1),
      lastActiveWeek: 1,
      joinedWeek: 1,
      report: null,
    }))
  c = post(c, dice, 'season', 'seasonStart', { n: season }, [])
  c = resupply(c, dice, fresh.length)
  c = { ...c, standings: standingsOf(fresh) }
  return { city: { ...c, rng: dice.a }, players: fresh }
}

/** A seed for someone joining, from the city's dice. */
export function nextSeed(city: CityState): { city: CityState; seed: number } {
  const dice = new Dice(city.rng)
  const seed = dice.seed()
  return { city: { ...city, rng: dice.a }, seed }
}
