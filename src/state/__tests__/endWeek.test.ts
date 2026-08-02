import { describe, expect, it } from 'vitest'
import { setSeed } from '../../logic/rand'
import { endWeek, initialState, reducer } from '../reducer'
import type { GameState } from '../types'

const base = (over: Partial<GameState> = {}): GameState => ({
  ...initialState(),
  week: 10,
  rank: 'sellerAgent',
  cash: 50000,
  reputation: 40,
  ...over,
})

describe('End Week — marketing billing', () => {
  it('bills every active channel', () => {
    setSeed(1)
    const s = endWeek(base({ activeChannelIds: ['billboard', 'flyerBlitz'] }))
    expect(s.summary!.marketing.spend).toBe(1100)
    expect(s.summary!.moneyOut).toContainEqual(['Marketing', 1100])
  })

  it('bills nothing when no channel is active', () => {
    setSeed(2)
    const s = endWeek(base())
    expect(s.summary!.marketing.spend).toBe(0)
    expect(s.summary!.moneyOut).not.toContainEqual(['Marketing', 0])
  })

  it('takes the ad spend out of cash', () => {
    setSeed(3)
    const before = base({ activeChannelIds: ['flyerBlitz'], cash: 50000 })
    const after = endWeek(before)
    // desk fee 150 + marketing 100, no other spend at this seed is guaranteed,
    // so assert the marketing portion specifically via the summary
    expect(after.summary!.marketing.spend).toBe(100)
    expect(after.cash).toBeLessThan(50000)
  })

  it('still bills a muted channel', () => {
    setSeed(4)
    const s = endWeek(
      base({ activeChannelIds: ['tiktok'], channelMuteUntil: { tiktok: 20 } }),
    )
    expect(s.summary!.marketing.spend).toBe(150)
    expect(s.summary!.marketing.leads).toBe(0)
  })
})

describe('End Week — reputation', () => {
  it('adds each active channel’s rep per week', () => {
    setSeed(5)
    // billboard +3, flyerBlitz +0, and no decay because a channel is active
    const s = endWeek(base({ activeChannelIds: ['billboard', 'flyerBlitz'] }))
    expect(s.reputation).toBe(43)
    expect(s.summary!.marketing.repChange).toBe(3)
  })

  it('decays reputation by one when nothing is running', () => {
    setSeed(6)
    expect(endWeek(base({ reputation: 40 })).reputation).toBe(39)
  })

  it('never decays reputation below zero', () => {
    setSeed(7)
    expect(endWeek(base({ reputation: 0 })).reputation).toBe(0)
  })

  it('never pushes reputation above one hundred', () => {
    setSeed(8)
    const s = endWeek(
      base({
        reputation: 99,
        rank: 'topProducer',
        activeChannelIds: ['tvCommercial'],
      }),
    )
    expect(s.reputation).toBe(100)
  })

  it('reports the decay in the summary as a negative change', () => {
    setSeed(9)
    expect(endWeek(base({ reputation: 40 })).summary!.marketing.repChange).toBe(-1)
  })

  it('logs a threshold crossing in the player’s own words', () => {
    setSeed(10)
    // 14 + billboard's +3 crosses 15
    const s = endWeek(
      base({ reputation: 14, activeChannelIds: ['billboard'], rank: 'sellerAgent' }),
    )
    expect(s.reputation).toBe(17)
    expect(s.log.some((l) => l.text.includes('gas station'))).toBe(true)
  })
})

describe('End Week — inbound leads', () => {
  it('produces no inbound leads below the reputation gate', () => {
    setSeed(11)
    // flyerBlitz earns no reputation, so rep stays parked at 5 — under the
    // gate at 15 — for the whole run. It bills every week and delivers nothing.
    let s = base({ reputation: 5, activeChannelIds: ['flyerBlitz'], leads: [] })
    for (let i = 0; i < 20; i++) s = endWeek(s)
    expect(s.reputation).toBe(5)
    expect(s.leads.every((l) => l.channelId === undefined)).toBe(true)
    expect(s.summary!.marketing.spend).toBe(100)
    expect(s.summary!.marketing.leads).toBe(0)
  })

  it('inbound leads arrive free and carry a channel badge', () => {
    setSeed(21)
    let s = base({ activeChannelIds: ['facebookAds'], reputation: 40, leads: [] })
    let found = null
    for (let i = 0; i < 30 && !found; i++) {
      s = endWeek(s)
      found = s.leads.find((l) => l.channelId === 'facebookAds') ?? null
    }
    expect(found).not.toBeNull()
    expect(s.ap).toBe(5)
  })

  it('grants a guaranteed free lead at reputation 90', () => {
    setSeed(31)
    const before = base({ reputation: 90, leads: [] })
    const after = endWeek(before)
    expect(after.leads.length).toBeGreaterThanOrEqual(1)
    expect(after.summary!.marketing.leads).toBeGreaterThanOrEqual(1)
  })

  it('does not grant the free lead just below reputation 90', () => {
    setSeed(32)
    const after = endWeek(base({ reputation: 88, leads: [] }))
    expect(after.leads).toHaveLength(0)
  })
})

describe('End Week — reputation from closed deals', () => {
  it('is unaffected by end week alone', () => {
    setSeed(51)
    expect(endWeek(base({ activeChannelIds: ['instagram'] })).reputation).toBe(41)
  })

  it('gains a point when a deal closes', () => {
    setSeed(52)
    const withLead: GameState = {
      ...base({ reputation: 40, rank: 'buyerAgent' }),
      ap: 5,
      leads: [
        {
          id: 'L1',
          archetypeId: 'firstTimer',
          clientName: 'Test Client',
          stage: 'ready',
          salePrice: 200000,
          patience: 5,
          maxPatience: 5,
          retriedClose: false,
          createdWeek: 1,
          intro: 'x',
          referralBonus: false,
        },
      ],
      permBonuses: { hustle: 0, swagger: 9, ego: 0 },
    }
    let closed = withLead
    // swagger 10 gives a high close chance; retry until it lands
    for (let i = 0; i < 40; i++) {
      const r = reducer(closed, { type: 'ATTEMPT_CLOSE', leadId: 'L1' })
      if (r.counters.dealsClosed > 0) {
        closed = r
        break
      }
      closed = { ...closed, ap: 5, leads: withLead.leads }
    }
    expect(closed.counters.dealsClosed).toBe(1)
    expect(closed.reputation).toBe(41)
  })
})

describe('End Week — Phase 1 regressions', () => {
  it('still rolls the week and refills action points', () => {
    setSeed(61)
    const s = endWeek(base({ ap: 0 }))
    expect(s.week).toBe(11)
    expect(s.ap).toBe(5)
  })

  it('still charges the desk fee', () => {
    setSeed(62)
    expect(endWeek(base()).summary!.moneyOut).toContainEqual(['Desk fee', 150])
  })
})
