/* The shared city's rules: joining, sealed bids, the tick, absence, the
   season clock. */

import { describe, expect, it } from 'vitest'
import { applyAction, createCityGame, toWire } from '../../engine'
import { parseBatch } from '../../engine/clientActions'
import { ABSENCE } from '../../data/city'
import { netWorth } from '../../logic/portfolio'
import { acceptChance, joinCity, newCity, placeBid, startSeason, tick, withdrawBid } from '../city'
import type { CityListing, CityPlayer, CityState } from '../types'

function cityWith(n: number, seed = 5): { city: CityState; players: CityPlayer[] } {
  let city = newCity(seed)
  const players: CityPlayer[] = []
  for (let i = 0; i < n; i++) {
    const r = joinCity(city, { userId: 'u' + i, name: 'Agent ' + i, color: 'coral', characterId: 'you' }, 100 + i)
    city = r.city
    players.push(r.player)
  }
  return startSeason(city, players)
}

/** A player who can buy: Seller's Agent with money in the bank. */
const rich = (p: CityPlayer, cash = 400_000): CityPlayer => ({ ...p, game: { ...p.game, rank: 'sellerAgent', cash } })

const listing = (over: Partial<CityListing> = {}): CityListing => ({
  id: 'CL900',
  typeId: 'starter',
  intrinsicValue: 200_000,
  condition: 70,
  askPrice: 200_000,
  blurb: 'Good bones.',
  districtId: 'northEnd',
  listedWeek: 1,
  source: 'market',
  ...over,
})

describe('joining', () => {
  it('starts a city-mode career and tells the feed', () => {
    const { city, players } = cityWith(2)
    expect(players[0].game.cityMode).toBe(true)
    expect(players[0].game.week).toBe(1)
    expect(city.status).toBe('running')
    expect(city.listings.length).toBeGreaterThan(0)
    expect(city.feed.some((f) => f.kind === 'join')).toBe(true)
    expect(city.feed.some((f) => f.kind === 'season')).toBe(true)
  })

  it('lines a mid-season joiner up with the city calendar', () => {
    const g = createCityGame('you', 7, 20)
    expect(g.week).toBe(20)
    expect(g.marketState).toBe('hot')
    expect(g.seasonStartWeek).toBe(14)
    expect(g.season.seasonIndex).toBe(1)
    expect(g.log.every((l) => l.week >= 20)).toBe(true)
  })
})

describe('the city gate', () => {
  it('refuses End Week and instant buys from a client in a shared city', () => {
    expect(parseBatch([{ type: 'END_WEEK' }], { city: true }).ok).toBe(false)
    expect(parseBatch([{ type: 'BUY_PROPERTY', listingId: 'CL1', downPct: 1 }], { city: true }).ok).toBe(false)
    expect(parseBatch([{ type: 'WORK_PHONES' }], { city: true }).ok).toBe(true)
    expect(parseBatch([{ type: 'CITY_PURCHASE' }]).ok).toBe(false)
  })

  it('ignores BUY_PROPERTY in a city-mode game even if it got through', () => {
    const { city, players } = cityWith(1)
    const g = { ...rich(players[0]).game, marketPool: city.listings }
    expect(applyAction(g, { type: 'BUY_PROPERTY', listingId: city.listings[0].id, downPct: 1 })).toBe(g)
  })
})

describe('bids', () => {
  it('needs the rank, a sane amount and the down payment', () => {
    const { city, players } = cityWith(1)
    const l = listing()
    const c = { ...city, listings: [l] }
    expect(placeBid(c, players[0], { listingId: l.id, amount: 200_000, downPct: 1 })).toMatchObject({ ok: false, error: 'rank_locked' })
    expect(placeBid(c, rich(players[0]), { listingId: l.id, amount: 100_000, downPct: 1 })).toMatchObject({ ok: false, error: 'bad_amount' })
    expect(placeBid(c, rich(players[0], 1000), { listingId: l.id, amount: 200_000, downPct: 0.2 })).toMatchObject({ ok: false, error: 'no_cash' })
    const ok = placeBid(c, rich(players[0]), { listingId: l.id, amount: 210_000, downPct: 0.2 })
    expect(ok.ok).toBe(true)
  })

  it('keeps one bid per player per listing, and can take it back', () => {
    const { city, players } = cityWith(1)
    const l = listing()
    let c = { ...city, listings: [l] }
    const p = rich(players[0])
    for (const amount of [200_000, 230_000]) {
      const r = placeBid(c, p, { listingId: l.id, amount, downPct: 1 })
      if (r.ok) c = r.city
    }
    expect(c.bids[l.id]).toHaveLength(1)
    expect(c.bids[l.id][0].amount).toBe(230_000)
    expect(withdrawBid(c, p.userId, l.id).bids[l.id]).toBeUndefined()
  })

  it('makes winter sellers easier than summer ones', () => {
    expect(acceptChance(200_000, 200_000, 20)).toBe(1)
    expect(acceptChance(180_000, 200_000, 45)).toBeGreaterThan(acceptChance(180_000, 200_000, 20))
    expect(acceptChance(140_000, 200_000, 20)).toBe(0)
  })
})

describe('the tick', () => {
  function auction(amounts: [number, number], cashB = 400_000) {
    const { city, players } = cityWith(2)
    const l = listing()
    let c: CityState = { ...city, listings: [l] }
    const ps = [rich(players[0]), rich(players[1], cashB)]
    for (const [i, amount] of amounts.entries()) {
      const r = placeBid(c, ps[i], { listingId: l.id, amount, downPct: 1 })
      if (!r.ok) throw new Error(r.message)
      c = r.city
    }
    return { before: c, ps, l, ...tick(c, ps) }
  }

  it('settles a bidding war: highest bid wins and pays what it bid', () => {
    const { city, players, ps, l } = auction([210_000, 250_000])
    const [a, b] = players
    expect(b.game.properties.some((p) => p.fromListingId === l.id)).toBe(true)
    expect(a.game.properties).toHaveLength(0)
    /* Paid the bid, before the week's own money moved. */
    expect(b.report!.offers.join(' ')).toMatch(/won/)
    expect(a.report!.offers.join(' ')).toMatch(/beat you/)
    expect(a.game.log.some((x) => x.text.startsWith('OUTBID'))).toBe(true)
    expect(city.rivalries['u1>u0']).toBe(1)
    expect(city.feed.some((f) => f.kind === 'outbid')).toBe(true)
    expect(city.listings.some((x) => x.id === l.id)).toBe(false)
    expect(city.bids).toEqual({})
    expect(ps[1].game.cash - b.game.cash).toBeGreaterThanOrEqual(250_000 - 5_000)
  })

  it('passes to the next bidder when the winner cannot pay at closing', () => {
    const { before, ps, l } = auction([210_000, 250_000])
    /* The top bidder spent their money elsewhere before the tick. */
    const broke = { ...ps[1], game: { ...ps[1].game, cash: 10_000 } }
    const r = tick(before, [ps[0], broke])
    expect(r.players[0].game.properties.some((p) => p.fromListingId === l.id)).toBe(true)
    expect(r.players[1].report!.offers.join(' ')).toMatch(/fell through/)
  })

  it('breaks a tie in favour of whoever bid first', () => {
    const { players, l } = auction([220_000, 220_000])
    expect(players[0].game.properties.some((p) => p.fromListingId === l.id)).toBe(true)
  })

  it('ends everybody’s week together and keeps the morning report', () => {
    const { city, players } = cityWith(3)
    const r = tick(city, players)
    expect(r.city.week).toBe(2)
    for (const p of r.players) {
      expect(p.game.week).toBe(2)
      expect(p.report?.week).toBe(1)
      expect(p.report?.summary).not.toBeNull()
      expect(p.game.summary).toBeNull()
    }
  })

  it('answers open questions for a player who never showed up', () => {
    const { city, players } = cityWith(1)
    const p = { ...players[0], game: { ...players[0].game, postComposerPending: true } }
    const r = tick(city, [p])
    expect(r.players[0].game.week).toBe(2)
  })

  it('follows the calendar into summer', () => {
    let { city, players } = cityWith(1)
    for (let i = 0; i < 13; i++) ({ city, players } = tick(city, players))
    expect(city.week).toBe(14)
    expect(players[0].game.marketState).toBe('hot')
  })

  it('is deterministic', () => {
    const a = cityWith(3, 9)
    const b = cityWith(3, 9)
    const ta = tick(a.city, a.players)
    const tb = tick(b.city, b.players)
    expect(JSON.stringify(ta.city)).toBe(JSON.stringify(tb.city))
    expect(ta.players.map((p) => toWire(p.game))).toEqual(tb.players.map((p) => toWire(p.game)))
  })
})

describe('absence', () => {
  it('wears down the houses of someone who stops checking in, then forecloses', () => {
    const { city, players } = cityWith(1)
    const l = listing()
    let c: CityState = { ...city, listings: [l] }
    const r0 = placeBid(c, rich(players[0]), { listingId: l.id, amount: 200_000, downPct: 1 })
    if (!r0.ok) throw new Error()
    let t = tick(r0.city, [rich(players[0])])
    const owned = t.players[0].game.properties[0]
    expect(owned).toBeDefined()
    c = t.city
    let ps = t.players.map((p) => ({ ...p, lastActiveWeek: c.week }))
    let foreclosedAt = 0
    for (let i = 1; i <= ABSENCE.FORECLOSE_AFTER + 2 && !foreclosedAt; i++) {
      t = tick(c, ps)
      c = t.city
      ps = t.players
      if (!ps[0].game.properties.length) foreclosedAt = i
    }
    /* Active in the week of the first tick, then seven missed check-ins. */
    expect(foreclosedAt).toBe(ABSENCE.FORECLOSE_AFTER + 1)
    expect(c.feed.some((f) => f.text.includes('knee-high') || f.text.includes('gone quiet'))).toBe(true)
    expect(c.listings.some((x) => x.source === 'foreclosure' && x.typeId === owned.typeId)).toBe(true)
    expect(ps[0].game.log.some((x) => x.text.startsWith('FORECLOSED'))).toBe(true)
  })
})

describe('the season', () => {
  it('finishes after week 52, then starts season 2 from the tent', () => {
    let { city, players } = cityWith(2)
    let result = null
    for (let i = 0; i < 52; i++) {
      const t = tick(city, players)
      city = t.city
      players = t.players
      result = t.seasonOver ?? result
    }
    expect(city.status).toBe('finished')
    expect(result?.standings[0].place).toBe(1)
    expect(result?.standings[0].netWorth).toBe(Math.max(...players.map((p) => Math.round(netWorth(p.game)))))
    const next = tick(city, players)
    expect(next.city.status).toBe('running')
    expect(next.city.season).toBe(2)
    expect(next.city.week).toBe(1)
    expect(next.players.every((p) => p.game.week === 1 && p.game.properties.length === 0)).toBe(true)
  })
})

describe('the feed', () => {
  it('minds its articles', () => {
    let { city, players } = cityWith(3, 11)
    for (let i = 0; i < 20; i++) ({ city, players } = tick(city, players))
    expect(city.feed.some((f) => /\ba [aeiou]/.test(f.text))).toBe(false)
  })
})
