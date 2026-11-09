/* Phase 4: the season's record, awards night, and the Champion's Kit. */

import { describe, expect, it } from 'vitest'
import { awardsFor, championOf, joinCity, newCity, placeBid, startSeason, tick } from '../city'
import { cityView } from '../view'
import type { CityListing, CityPlayer, CityState, SeasonLedger, SeasonResult } from '../types'

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

const rich = (p: CityPlayer, cash = 900_000): CityPlayer => ({ ...p, game: { ...p.game, rank: 'sellerAgent', cash } })

const listing = (id: string, over: Partial<CityListing> = {}): CityListing => ({
  id,
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

function playSeason(n: number, seed = 5) {
  let { city, players } = cityWith(n, seed)
  let result: SeasonResult | null = null
  for (let i = 0; i < 52; i++) {
    const t = tick(city, players)
    city = t.city
    players = t.players
    result = t.seasonOver ?? result
  }
  return { city, players, result: result! }
}

describe('the season ledger', () => {
  it('counts wins and losses at the tick', () => {
    const { city, players } = cityWith(2)
    const [a, b] = players.map((p) => rich(p))
    let c: CityState = { ...city, listings: [listing('CL900')] }
    for (const [p, amount] of [
      [a, 230_000],
      [b, 210_000],
    ] as const) {
      const r = placeBid(c, p, { listingId: 'CL900', amount, downPct: 1 })
      if (!r.ok) throw new Error(r.message)
      c = r.city
    }
    const t = tick(c, [a, b])
    expect(t.city.ledger?.u0).toMatchObject({ won: 1, outbid: 0 })
    expect(t.city.ledger?.u1).toMatchObject({ won: 0, outbid: 1 })
    expect(t.city.ledger?.u0.peak).toBeGreaterThan(0)
  })

  it('starts clean every season', () => {
    const { city, players } = playSeason(2)
    expect(Object.keys(city.ledger ?? {}).length).toBe(2)
    const next = tick(city, players)
    expect(next.city.ledger).toEqual({})
  })
})

describe('awards night', () => {
  const row = (userId: string, place: number, netWorth: number) => ({ userId, place, netWorth, name: userId, color: 'coral', characterId: 'you', rank: 'junior' })
  const blank: SeasonLedger = { outbid: 0, won: 0, lowballs: 0, foreclosed: 0, peak: 0, bankrupt: false }

  it('crowns the champion and roasts everyone else, never the champ', () => {
    const result: SeasonResult = { season: 1, standings: [row('champ', 1, 900_000), row('bea', 2, 300_000), row('cal', 3, 100_000)] }
    const ledger = {
      champ: { ...blank, outbid: 50, won: 9, peak: 900_000 },
      bea: { ...blank, outbid: 4, lowballs: 2, peak: 320_000, won: 3 },
      cal: { ...blank, outbid: 1, peak: 600_000, foreclosed: 2 },
    }
    const awards = awardsFor(result, ledger, [])
    expect(awards[0]).toMatchObject({ id: 'champion', userId: 'champ' })
    const by = Object.fromEntries(awards.map((a) => [a.id, a.userId]))
    expect(by.outbid).toBe('bea')
    expect(by.landlord).toBe('cal')
    expect(by.flop).toBe('cal')
    expect(by.lowball).toBe('bea')
    expect(by.warrior).toBe('bea')
    expect(awards.slice(1).every((a) => a.userId !== 'champ')).toBe(true)
    expect(awards.find((a) => a.id === 'outbid')?.stat).toBe('Outbid 4 times')
  })

  it('gives nobody a roast for doing nothing wrong', () => {
    const result: SeasonResult = { season: 1, standings: [row('a', 1, 10), row('b', 2, 5)] }
    const awards = awardsFor(result, { a: blank, b: { ...blank, peak: 5 } }, [])
    expect(awards.map((a) => a.id)).toEqual(['champion'])
  })

  it('goes on the record at week 52, with a title and the feed reading them out', () => {
    const { city, result } = playSeason(3, 9)
    expect(result.title).toMatch(/^The /)
    expect(result.awards?.[0]).toMatchObject({ id: 'champion', userId: result.standings[0].userId })
    expect(result.standings[0].doors).toBeTypeOf('number')
    expect(result.standings[0].deals).toBeTypeOf('number')
    expect(city.feed.some((f) => f.text.startsWith('AWARDS NIGHT'))).toBe(true)
    expect(city.feed.filter((f) => f.kind === 'season').length).toBeGreaterThanOrEqual(3)
  })
})

describe('the Champion’s Kit', () => {
  it('belongs to last season’s winner for the whole next season', () => {
    const fresh = cityWith(2)
    expect(championOf(fresh.city)).toBeNull()
    const { city, players, result } = playSeason(2)
    const champ = championOf(city)
    expect(champ).toMatchObject({ userId: result.standings[0].userId, season: 1, title: result.title })
    const s2 = tick(city, players)
    expect(championOf(s2.city)?.userId).toBe(result.standings[0].userId)
    const schedule = { nextTickAt: null, tickHour: 3, tickZone: 'America/Toronto', manualTick: false }
    expect(cityView(s2.city, s2.players, 'u0', schedule).champion?.title).toBe(result.title)
  })

  it('gets fanfare when the champ wins a listing', () => {
    const { city, players } = playSeason(2)
    const s2 = tick(city, players)
    const champId = championOf(s2.city)!.userId
    const champ = rich(s2.players.find((p) => p.userId === champId)!)
    const rest = s2.players.filter((p) => p.userId !== champId)
    const c = { ...s2.city, listings: [listing('CL990')] }
    const r = placeBid(c, champ, { listingId: 'CL990', amount: 200_000, downPct: 1 })
    if (!r.ok) throw new Error(r.message)
    const t = tick(r.city, [champ, ...rest])
    const line = t.city.feed.find((f) => f.week === s2.city.week && f.who[0] === champId && f.kind === 'deal')
    expect(line?.text).toMatch(/champ|Champion|Blazer|blazer/i)
  })
})
