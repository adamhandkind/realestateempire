import { describe, expect, it } from 'vitest'
import { P3 } from '../../data/p3'
import { fillPool } from '../../logic/portfolio'
import { applyAction, applyActions, createGame, fromWire, toWire } from '..'
import type { Action, GameState } from '..'

/* A dumb but busy bot: it works the phones, runs every lead it can, closes,
   buys whatever it can afford and answers every prompt with option one. It
   decides only from the state in front of it, so the same state always makes
   the same moves — which is the point. */
function botWeek(start: GameState, log: Action[]): GameState {
  let s = start
  const act = (a: Action) => {
    log.push(a)
    s = applyAction(s, a)
  }
  if (s.callsEnabled) act({ type: 'SET_CALLS_ENABLED', enabled: false })
  act({ type: 'WORK_PHONES' })
  act({ type: 'WORK_PHONES' })
  for (const lead of [...s.leads]) {
    if (lead.stage === 'new') act({ type: 'RUN_SHOWING', leadId: lead.id })
    else act({ type: 'ATTEMPT_CLOSE', leadId: lead.id })
  }
  const listing = s.marketPool[0]
  if (listing && s.cash > listing.askPrice * P3.DOWN_MIN * 2)
    act({ type: 'BUY_PROPERTY', listingId: listing.id, downPct: P3.DOWN_MIN })
  if (s.pendingChoice)
    act({ type: 'RESOLVE_CHOICE_EVENT', key: s.pendingChoice.options[0].key })
  for (let i = 0; i < 5 && s.pendingChoices.length; i++) {
    const c = s.pendingChoices[0]
    act({
      type: 'RESOLVE_PORTFOLIO_CHOICE',
      choiceId: c.id,
      actionTag: c.options[0].actionTag,
    })
  }
  act({ type: 'END_WEEK' })
  if (s.postComposerPending) act({ type: 'SKIP_POST' })
  for (let i = 0; i < 12 && s.ceremony; i++)
    act({ type: i < 11 ? 'ADVANCE_CEREMONY' : 'CLOSE_CEREMONY' })
  return s
}

function play(s: GameState, weeks: number, log: Action[] = []): GameState {
  for (let w = 0; w < weeks && !s.gameOver; w++) s = botWeek(s, log)
  return s
}

describe('engine', () => {
  it('creates the same game from the same seed', () => {
    expect(toWire(createGame('you', 42))).toBe(toWire(createGame('you', 42)))
    expect(toWire(createGame('you', 42))).not.toBe(toWire(createGame('you', 43)))
  })

  it('plays the same season twice from the same seed', () => {
    const a = play(createGame('nigel', 7), 30)
    const b = play(createGame('nigel', 7), 30)
    expect(a.week).toBeGreaterThan(10)
    expect(toWire(a)).toBe(toWire(b))
  })

  it('replays a recorded action log to the identical state', () => {
    const log: Action[] = []
    const live = play(createGame('doreen', 99), 25, log)
    expect(log.length).toBeGreaterThan(50)
    const replayed = applyActions(createGame('doreen', 99), log)
    expect(toWire(replayed)).toBe(toWire(live))
  })

  it('keeps playing identically after a trip over the wire', () => {
    for (const seed of [1, 2, 3]) {
      const mid = play(createGame('you', seed), 15)
      const shipped = fromWire(toWire(mid))
      expect(shipped).not.toBeNull()
      const stayed = play(mid, 20)
      const travelled = play(shipped!, 20)
      expect(toWire(travelled)).toBe(toWire(stayed))
    }
  })

  /* The bot can't get licensed fast, so hand it a landlord career: a rank that
     can buy, and the cash to do it. Tenants, rent, renovations and the market
     all come into play — the parts most likely to hold a non-JSON value. */
  const landlord = (seed: number): GameState =>
    fillPool({
      ...createGame('you', seed),
      rank: 'topProducer',
      cash: 3_000_000,
    })

  it('a landlord career survives the wire too', () => {
    const mid = play(landlord(5), 20)
    expect(mid.properties.length).toBeGreaterThan(2)
    expect(mid.properties.some((p) => p.units.some((u) => u.tenant))).toBe(true)
    const stayed = play(mid, 25)
    const travelled = play(fromWire(toWire(mid))!, 25)
    expect(toWire(travelled)).toBe(toWire(stayed))
  })

  it('a tenant who never leaves still never leaves after a reload', () => {
    const s = play(landlord(8), 3)
    const p = s.properties[0]
    expect(p).toBeDefined()
    const forever = {
      ...s,
      properties: [
        {
          ...p,
          units: p.units.map((u) => ({
            ...u,
            tenant: {
              archetypeId: 'retiree',
              name: 'Marg Forever',
              tenancyWeeks: 400,
              plannedStayWeeks: Infinity,
              owed: 0,
            },
          })),
        },
      ],
    }
    const back = fromWire(toWire(forever))!
    expect(back.properties[0].units[0].tenant!.plannedStayWeeks).toBe(Infinity)
  })

  it('fromWire refuses garbage instead of throwing', () => {
    expect(fromWire('not json')).toBeNull()
    expect(fromWire('{"hello":1}')).toBeNull()
  })
})
