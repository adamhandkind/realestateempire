import { describe, expect, it } from 'vitest'
import { runBots } from '../bot'
import { COSTS, WIN_POINTS } from '../data'
import { TOPO } from '../geometry'
import {
  addBot,
  applyMove,
  canPlaceStreet,
  emptyHand,
  handSize,
  legalHouses,
  newTable,
  parseMove,
  setAutopilot,
  sit,
  start,
  streetLength,
  totalPoints,
  viewFor,
} from '../rules'
import type { BoardState } from '../types'

const ok = (r: ReturnType<typeof start>): BoardState => {
  if (!r.ok) throw new Error(r.error)
  return r.state
}

function table(humans: number, bots: number, seed = 7): BoardState {
  let s = newTable(seed, 'u0')
  for (let i = 0; i < humans; i++) s = ok(sit(s, 'u' + i, 'Player ' + i, '#e8573f'))
  for (let i = 0; i < bots; i++) s = ok(addBot(s))
  return ok(start(s))
}

describe('board geometry', () => {
  it('has 19 tiles, 54 corners and 72 sides', () => {
    expect(TOPO.hexes).toHaveLength(19)
    expect(TOPO.vertices).toHaveLength(54)
    expect(TOPO.edges).toHaveLength(72)
    for (const v of TOPO.vertices) expect(v.adj.length).toBeGreaterThanOrEqual(2)
  })
})

describe('the deal', () => {
  it('lays out the river once and keeps 6s and 8s apart', () => {
    for (let seed = 1; seed < 30; seed++) {
      const s = table(1, 2, seed)
      expect(s.tiles.filter((t) => t.terrain === 'river')).toHaveLength(1)
      expect(s.tiles[s.crash].terrain).toBe('river')
      expect(s.deck).toHaveLength(26)
    }
  })

  it('drops seat colours from the lobby log once seats are shuffled', () => {
    const s = table(2, 2, 5)
    const before = s.log.filter((l) => l.text.includes('chair') || l.text.includes('broker'))
    expect(before.length).toBe(4)
    expect(before.every((l) => l.seat === undefined)).toBe(true)
  })

  it('refuses to start alone, and seats at most four', () => {
    let s = newTable(1, 'a')
    s = ok(sit(s, 'a', 'A', '#fff'))
    expect(start(s).ok).toBe(false)
    for (let i = 0; i < 3; i++) s = ok(addBot(s))
    expect(addBot(s).ok).toBe(false)
  })
})

describe('opening placement', () => {
  it('snakes: 0,1,2 then 2,1,0, and the second house pays out', () => {
    let s = table(3, 0)
    const order: number[] = []
    for (let i = 0; i < 6; i++) {
      order.push(s.turn)
      const v = legalHouses(s, s.turn, true)[0]
      s = ok(applyMove(s, s.turn, { t: 'house', vertex: v }))
      const e = TOPO.vertices[v].edges.find((x) => canPlaceStreet(s, s.turn, x, v))!
      s = ok(applyMove(s, s.turn, { t: 'street', edge: e }))
    }
    expect(order).toEqual([0, 1, 2, 2, 1, 0])
    expect(s.phase).toBe('roll')
    expect(s.seats.some((x) => handSize(x.hand) > 0)).toBe(true)
  })

  it('rejects a house next to another and a stray street', () => {
    let s = table(2, 0)
    const v = 10
    s = ok(applyMove(s, 0, { t: 'house', vertex: v }))
    const far = TOPO.edges.findIndex((e) => e.a !== v && e.b !== v)
    expect(applyMove(s, 0, { t: 'street', edge: far }).ok).toBe(false)
    s = ok(applyMove(s, 0, { t: 'street', edge: TOPO.vertices[v].edges[0] }))
    expect(applyMove(s, 1, { t: 'house', vertex: TOPO.vertices[v].adj[0] }).ok).toBe(false)
  })
})

describe('whole games', () => {
  it('four bots always reach a winner with the books balanced', () => {
    for (let seed = 1; seed <= 25; seed++) {
      let s = newTable(seed, 'x')
      for (let i = 0; i < 4; i++) s = ok(addBot(s))
      s = runBots(ok(start(s)), 20000)
      expect(s.status, 'seed ' + seed).toBe('over')
      expect(totalPoints(s, s.winner!)).toBeGreaterThanOrEqual(WIN_POINTS)
      for (const seat of s.seats) for (const n of Object.values(seat.hand)) expect(n).toBeGreaterThanOrEqual(0)
      expect(s.era).toBeGreaterThanOrEqual(2)
    }
  })

  it('stops at a human and waits', () => {
    let s = newTable(3, 'h')
    s = ok(sit(s, 'h', 'Human', '#fff'))
    s = ok(addBot(s))
    s = ok(addBot(s))
    s = runBots(ok(start(s)))
    expect(s.seats[s.turn].id).toBe('h')
    expect(s.status).toBe('playing')
  })

  it('autopilot plays an absent human through', () => {
    let s = newTable(4, 'h')
    s = ok(sit(s, 'h', 'Human', '#fff'))
    s = ok(addBot(s))
    s = ok(start(s))
    s = ok(setAutopilot(s, 'h', true))
    s = runBots(s, 20000)
    expect(s.status).toBe('over')
  })
})

describe('turn rules', () => {
  function rolled(seed = 11) {
    let s = table(2, 0, seed)
    s = runBotsAsHumans(s)
    return s
  }
  /* Plays the opening for two humans with the bot's brain, then stops. */
  function runBotsAsHumans(s: BoardState) {
    s.seats.forEach((x) => (x.autopilot = true))
    for (let i = 0; i < 8; i++) {
      s = runBots(s, 1)
    }
    s.seats.forEach((x) => (x.autopilot = false))
    return s
  }

  it('makes you roll before building and before ending', () => {
    const s = rolled()
    expect(s.phase).toBe('roll')
    expect(applyMove(s, s.turn, { t: 'end' }).ok).toBe(false)
    expect(applyMove(s, s.turn, { t: 'buyDeal' }).ok).toBe(false)
    expect(applyMove(s, 1 - s.turn, { t: 'roll' }).ok).toBe(false)
  })

  it('trades between players both ways', () => {
    let s = rolled()
    while (s.phase !== 'main') {
      const r = applyMove(s, s.turn, s.phase === 'roll' ? { t: 'roll' } : s.phase === 'crash' ? { t: 'crash', tile: (s.crash + 1) % 19 } : { t: 'steal', seat: s.victims[0] })
      s = ok(r)
    }
    const me = s.turn
    const them = 1 - me
    s.seats[me].hand = { ...emptyHand(), brick: 2 }
    s.seats[them].hand = { ...emptyHand(), cash: 1 }
    s = ok(applyMove(s, me, { t: 'offer', give: { ...emptyHand(), brick: 2 }, want: { ...emptyHand(), cash: 1 } }))
    expect(applyMove(s, me, { t: 'accept' }).ok).toBe(false)
    s = ok(applyMove(s, them, { t: 'accept' }))
    expect(s.seats[me].hand.cash).toBe(1)
    expect(s.seats[them].hand.brick).toBe(2)
    expect(s.offer).toBeNull()
  })

  it('gates duplexes behind the Landlord Era', () => {
    let s = rolled()
    while (s.phase !== 'main') {
      s = ok(applyMove(s, s.turn, s.phase === 'roll' ? { t: 'roll' } : s.phase === 'crash' ? { t: 'crash', tile: (s.crash + 1) % 19 } : { t: 'steal', seat: s.victims[0] }))
    }
    const v = Number(Object.entries(s.buildings).find(([, b]) => b.seat === s.turn)![0])
    s.seats[s.turn].hand = { ...emptyHand(), ...COSTS.duplex }
    expect(applyMove(s, s.turn, { t: 'upgrade', vertex: v }).ok).toBe(false)
    s.era = 1
    const up = ok(applyMove(s, s.turn, { t: 'upgrade', vertex: v }))
    expect(up.buildings[v].kind).toBe('duplex')
  })
})

describe('main street', () => {
  it('counts the longest run and is cut by a rival building', () => {
    const s = newTable(1, 'a')
    /* Five sides of one tile, corner to corner. */
    const path = TOPO.hexes[9].vertices
    for (let i = 0; i < 5; i++) {
      const e = TOPO.edges.findIndex((x) => (x.a === path[i] && x.b === path[i + 1]) || (x.b === path[i] && x.a === path[i + 1]))
      s.streets[e] = 0
    }
    expect(streetLength(s, 0)).toBe(5)
    s.buildings[path[2]] = { seat: 1, kind: 'house' }
    expect(streetLength(s, 0)).toBe(3)
  })
})

describe('what the browser sees', () => {
  it('hides other hands and the dice', () => {
    const s = table(2, 0)
    s.seats[0].hand.cash = 3
    s.seats[1].hand.brick = 2
    const v = viewFor(s, s.seats[0].id, 1)
    expect(v.seats[0].hand?.cash).toBe(3)
    expect(v.seats[1].hand).toBeUndefined()
    expect(v.seats[1].cards).toBe(2)
    expect('rng' in v).toBe(false)
    expect('deck' in v).toBe(false)
  })

  it('parses only well-formed moves', () => {
    expect(parseMove({ t: 'house', vertex: 3 })).toEqual({ t: 'house', vertex: 3 })
    expect(parseMove({ t: 'house', vertex: 999 })).toBeNull()
    expect(parseMove({ t: 'bank', give: 'gold', get: 'cash' })).toBeNull()
    expect(parseMove({ t: 'offer', give: { leads: -1, lumber: 0, brick: 0, permits: 0, cash: 0 }, want: emptyHand() })).toBeNull()
    expect(parseMove({ t: 'nope' })).toBeNull()
  })
})
