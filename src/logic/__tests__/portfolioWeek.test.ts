import { describe, expect, it } from 'vitest'
import { setSeed } from '../rand'
import {
  billPortfolio,
  checkMilestones,
  collectRent,
  newWeekCtx,
  resolveVrbo,
  rollApplicants,
  rollFlips,
  rollTenantEvents,
  tickMarket,
  tickProperties,
} from '../portfolioWeek'
import { initialState } from '../../state/reducer'
import type { GameState, Property, UnitState } from '../../state/types'

const unit = (over: Partial<UnitState> = {}): UnitState => ({
  id: 'P1-u0',
  tenant: null,
  rentR: 1.0,
  openIssue: null,
  evictionWeeksLeft: null,
  ...over,
})

const withTenant = (archetypeId: string, over = {}) =>
  unit({
    tenant: {
      archetypeId,
      name: 'Tenant Name',
      tenancyWeeks: 4,
      plannedStayWeeks: 30,
      owed: 0,
      ...over,
    },
  })

const prop = (over: Partial<Property> = {}): Property => ({
  id: 'P1',
  typeId: 'starter',
  nickname: 'Starter Home on Dundurn',
  districtId: 'northEnd',
  baseValue: 200000,
  condition: 100,
  mortgage: null,
  units: [unit()],
  renovation: null,
  listedForSale: false,
  boughtWeek: 1,
  isVrbo: false,
  vrboProfitStreak: 0,
  vrboRenoDone: false,
  ...over,
})

const st = (over: Partial<GameState> = {}): GameState => ({
  ...initialState(),
  cash: 0,
  rank: 'topProducer',
  ...over,
})

describe('collectRent', () => {
  it('collects the charged rent from a tenant who always pays', () => {
    const s = st({
      properties: [prop({ units: [withTenant('perfectPatricia')] })],
    })
    const ctx = newWeekCtx()
    const out = collectRent(s, ctx)
    expect(out.cash).toBe(400)
    expect(ctx.rows.get('P1')!.rentIn).toBe(400)
  })

  it('withholds rent while an issue is open', () => {
    const s = st({
      properties: [
        prop({
          units: [
            {
              ...withTenant('perfectPatricia'),
              openIssue: { eventId: 'burstPipe', weeksOpen: 1, fixCost: 300 },
            },
          ],
        }),
      ],
    })
    expect(collectRent(s, newWeekCtx()).cash).toBe(0)
  })

  it('collects nothing during an eviction', () => {
    const s = st({
      properties: [
        prop({
          units: [{ ...withTenant('perfectPatricia'), evictionWeeksLeft: 2 }],
        }),
      ],
    })
    expect(collectRent(s, newWeekCtx()).cash).toBe(0)
  })

  it('collects nothing while the crew is in', () => {
    const s = st({
      properties: [
        prop({
          units: [withTenant('perfectPatricia')],
          renovation: { projectId: 'cosmetic', weeksLeft: 1 },
        }),
      ],
    })
    expect(collectRent(s, newWeekCtx()).cash).toBe(0)
  })

  it('recovers half the arrears on a successful payment', () => {
    /* Patricia always pays, so this isolates the arrears rule. */
    const s = st({
      properties: [
        prop({
          units: [
            {
              ...withTenant('perfectPatricia'),
              tenant: {
                archetypeId: 'perfectPatricia',
                name: 'Patricia Reyes',
                tenancyWeeks: 4,
                plannedStayWeeks: 30,
                owed: 800,
              },
            },
          ],
        }),
      ],
    })
    const out = collectRent(s, newWeekCtx())
    expect(out.cash).toBe(800)
    expect(out.properties[0].units[0].tenant!.owed).toBe(0)
  })

  it('writes off Steve entirely when he skips', () => {
    setSeed(2)
    const s = st({
      properties: [
        prop({
          units: [
            {
              ...withTenant('sobStorySteve'),
              tenant: {
                archetypeId: 'sobStorySteve',
                name: 'Steve',
                tenancyWeeks: 6,
                plannedStayWeeks: Infinity,
                owed: 0,
              },
            },
          ],
        }),
      ],
    })
    const out = collectRent(s, newWeekCtx())
    setSeed(null)
    expect(out.properties[0].units[0].tenant!.owed).toBe(0)
  })

  it('skims 8% for PropCo on every dollar collected', () => {
    const s = st({
      propCoActive: true,
      properties: [prop({ units: [withTenant('perfectPatricia')] })],
    })
    expect(collectRent(s, newWeekCtx()).cash).toBe(368)
  })
})

describe('rollApplicants', () => {
  it('never places Patricia above fair rent', () => {
    setSeed(5)
    let placed = 0
    for (let i = 0; i < 200; i++) {
      const s = st({ properties: [prop({ units: [unit({ rentR: 1.4 })] })] })
      const out = rollApplicants(s, newWeekCtx())
      if (out.properties[0].units[0].tenant?.archetypeId === 'perfectPatricia')
        placed++
    }
    setSeed(null)
    expect(placed).toBe(0)
  })

  it('never places a corporate lease below condition 70', () => {
    setSeed(6)
    let placed = 0
    for (let i = 0; i < 200; i++) {
      const s = st({ properties: [prop({ condition: 50, units: [unit()] })] })
      const out = rollApplicants(s, newWeekCtx())
      if (out.properties[0].units[0].tenant?.archetypeId === 'corpLease')
        placed++
    }
    setSeed(null)
    expect(placed).toBe(0)
  })

  it('leaves renovating units alone', () => {
    const s = st({
      properties: [
        prop({
          units: [unit()],
          renovation: { projectId: 'full', weeksLeft: 2 },
        }),
      ],
    })
    expect(
      rollApplicants(s, newWeekCtx()).properties[0].units[0].tenant,
    ).toBeNull()
  })
})

describe('rollTenantEvents', () => {
  it('ticks an open issue and drains condition by 3', () => {
    const s = st({
      properties: [
        prop({
          condition: 80,
          units: [
            {
              ...withTenant('perfectPatricia'),
              openIssue: { eventId: 'burstPipe', weeksOpen: 0, fixCost: 300 },
            },
          ],
        }),
      ],
    })
    const out = rollTenantEvents(s, newWeekCtx())
    expect(out.properties[0].condition).toBe(77)
    expect(out.properties[0].units[0].openIssue!.weeksOpen).toBe(1)
  })

  it('ends the tenancy when a noise complaint sits for two weeks', () => {
    const s = st({
      properties: [
        prop({
          units: [
            {
              ...withTenant('partyPaulie'),
              openIssue: { eventId: 'noiseComplaint', weeksOpen: 1, fixCost: 0 },
            },
          ],
        }),
      ],
    })
    const out = rollTenantEvents(s, newWeekCtx())
    expect(out.properties[0].units[0].tenant).toBeNull()
    expect(out.properties[0].units[0].openIssue).toBeNull()
  })

  it('lets PropCo pay for and close a minor issue', () => {
    const s = st({
      cash: 5000,
      propCoActive: true,
      properties: [
        prop({
          units: [
            {
              ...withTenant('perfectPatricia'),
              openIssue: { eventId: 'burstPipe', weeksOpen: 0, fixCost: 300 },
            },
          ],
        }),
      ],
    })
    const out = rollTenantEvents(s, newWeekCtx())
    expect(out.cash).toBe(4700)
    expect(out.properties[0].units[0].openIssue).toBeNull()
  })

  it('leaves a major issue for the player even with PropCo on', () => {
    const s = st({
      cash: 5000,
      propCoActive: true,
      properties: [
        prop({
          condition: 30,
          units: [
            {
              ...withTenant('perfectPatricia'),
              openIssue: { eventId: 'rentStrike', weeksOpen: 0, fixCost: 0 },
            },
          ],
        }),
      ],
    })
    expect(
      rollTenantEvents(s, newWeekCtx()).properties[0].units[0].openIssue,
    ).not.toBeNull()
  })
})

const vrbo = (over: Partial<Property> = {}): Property => ({
  ...prop({
    id: 'V1',
    typeId: 'vrbo',
    nickname: 'The 424/7 VRBO',
    baseValue: 480000,
    condition: 70,
    units: [],
    isVrbo: true,
  }),
  ...over,
})

describe('resolveVrbo', () => {
  it('loses roughly $1,500 a week unmanaged and financed', () => {
    setSeed(9)
    let net = 0
    for (let i = 0; i < 10; i++) {
      const s = st({ properties: [vrbo({ mortgage: { balance: 384000 } })] })
      const ctx = newWeekCtx()
      resolveVrbo(s, ctx)
      net += ctx.rows.get('V1')!.net
    }
    setSeed(null)
    expect(net / 10).toBeLessThan(-1000)
    expect(net / 10).toBeGreaterThan(-2000)
  })

  it('clears roughly +$1,400 a week fully optimised', () => {
    setSeed(9)
    let net = 0
    for (let i = 0; i < 10; i++) {
      const s = st({
        activeChannelIds: ['tiktok'],
        properties: [
          vrbo({
            mortgage: { balance: 384000 },
            vrboRenoDone: true,
            condition: 90,
          }),
        ],
      })
      const ctx = newWeekCtx()
      resolveVrbo(s, ctx)
      net += ctx.rows.get('V1')!.net
    }
    setSeed(null)
    expect(net / 10).toBeGreaterThan(900)
  })

  it('fires The Machine at eight profitable weeks', () => {
    const s = st({
      activeChannelIds: ['tiktok'],
      properties: [
        vrbo({ vrboRenoDone: true, condition: 90, vrboProfitStreak: 7 }),
      ],
    })
    const out = resolveVrbo(s, newWeekCtx())
    expect(out.properties[0].vrboProfitStreak).toBe(8)
    expect(out.milestonesUnlocked).toContain('theMachine')
    expect(out.reputation).toBeGreaterThanOrEqual(15)
  })

  it('wears the building down whether or not anyone books', () => {
    /* Seeded past the 15% event roll: influencerSummit and plumbingCatastrophe
       both move condition, which would mask the 1.5/week decay this pins. */
    setSeed(3)
    const s = st({ properties: [vrbo({ condition: 50 })] })
    const out = resolveVrbo(s, newWeekCtx())
    setSeed(null)
    expect(out.properties[0].condition).toBe(48.5)
  })
})

describe('rollFlips', () => {
  it('sells at displayed value and settles the mortgage', () => {
    setSeed(4)
    const s = st({
      reputation: 100,
      marketState: 'hot',
      cash: 0,
      properties: [
        prop({
          listedForSale: true,
          mortgage: { balance: 100000 },
          baseValue: 200000,
        }),
      ],
    })
    let sold = false
    for (let i = 0; i < 40 && !sold; i++) {
      const out = rollFlips(s, newWeekCtx())
      if (out.properties.length === 0) {
        expect(out.cash).toBe(220000 - 100000)
        sold = true
      }
    }
    setSeed(null)
    expect(sold).toBe(true)
  })

  it('discounts a tenanted sale by 5%', () => {
    setSeed(4)
    const tenanted = prop({
      listedForSale: true,
      baseValue: 200000,
      units: [withTenant('perfectPatricia')],
    })
    let sold = false
    for (let i = 0; i < 60 && !sold; i++) {
      const out = rollFlips(
        st({
          reputation: 100,
          marketState: 'hot',
          cash: 0,
          properties: [tenanted],
        }),
        newWeekCtx(),
      )
      if (out.properties.length === 0) {
        expect(out.cash).toBe(Math.round(220000 * 0.95))
        sold = true
      }
    }
    setSeed(null)
    expect(sold).toBe(true)
  })

  it('never touches an unlisted property', () => {
    const s = st({ reputation: 100, properties: [prop()] })
    expect(rollFlips(s, newWeekCtx()).properties).toHaveLength(1)
  })
})

describe('tickProperties', () => {
  it('decays a vacant property by half a point', () => {
    const s = st({ properties: [prop({ condition: 80 })] })
    expect(tickProperties(s, newWeekCtx()).properties[0].condition).toBe(79.5)
  })

  it('decays by the tenant archetype rate when occupied', () => {
    const s = st({
      properties: [prop({ condition: 80, units: [withTenant('partyPaulie')] })],
    })
    expect(tickProperties(s, newWeekCtx()).properties[0].condition).toBe(77)
  })

  it('completes a renovation and applies its effects', () => {
    const s = st({
      properties: [
        prop({
          condition: 40,
          baseValue: 200000,
          renovation: { projectId: 'full', weeksLeft: 1 },
        }),
      ],
    })
    const out = tickProperties(s, newWeekCtx())
    expect(out.properties[0].renovation).toBeNull()
    expect(out.properties[0].baseValue).toBe(260000)
    expect(out.properties[0].condition).toBe(100)
  })

  it('marks the VRBO renovated when a full job finishes there', () => {
    const s = st({
      properties: [vrbo({ renovation: { projectId: 'full', weeksLeft: 1 } })],
    })
    expect(tickProperties(s, newWeekCtx()).properties[0].vrboRenoDone).toBe(true)
  })

  it('completes an eviction on schedule and empties the unit', () => {
    const s = st({
      properties: [
        prop({ units: [{ ...withTenant('lateLenny'), evictionWeeksLeft: 1 }] }),
      ],
    })
    const out = tickProperties(s, newWeekCtx())
    expect(out.properties[0].units[0].tenant).toBeNull()
    expect(out.properties[0].units[0].evictionWeeksLeft).toBeNull()
  })

  it('moves a tenant out when the planned stay runs out', () => {
    const s = st({
      properties: [
        prop({
          units: [
            {
              ...withTenant('perfectPatricia'),
              tenant: {
                archetypeId: 'perfectPatricia',
                name: 'Patricia Reyes',
                tenancyWeeks: 19,
                plannedStayWeeks: 20,
                owed: 0,
              },
            },
          ],
        }),
      ],
    })
    expect(
      tickProperties(s, newWeekCtx()).properties[0].units[0].tenant,
    ).toBeNull()
  })
})

describe('tickMarket', () => {
  it('counts down an active crash and freezes transitions', () => {
    const s = st({
      marketState: 'cold',
      nextMarketState: 'hot',
      crash: { weeksLeft: 3, lastCrashWeek: 10 },
    })
    const out = tickMarket(s)
    expect(out.state.crash.weeksLeft).toBe(2)
    expect(out.state.marketState).toBe('cold')
    expect(out.regenerated).toBe(false)
  })

  it('applies the pre-rolled next state and regenerates the pool on a change', () => {
    const s = st({ marketState: 'normal', nextMarketState: 'hot' })
    const out = tickMarket(s)
    expect(out.state.marketState).toBe('hot')
    expect(out.regenerated).toBe(true)
    expect(out.state.marketPool).toHaveLength(4)
  })

  it('never jumps hot to cold', () => {
    setSeed(12)
    for (let i = 0; i < 300; i++) {
      const out = tickMarket(st({ marketState: 'hot', nextMarketState: 'hot' }))
      expect(out.state.nextMarketState).not.toBe('cold')
    }
    setSeed(null)
  })
})

describe('billPortfolio', () => {
  it('bills interest, HOA, PropCo, and VRBO upkeep', () => {
    const s = st({
      cash: 100000,
      propCoActive: true,
      properties: [
        prop({ typeId: 'condo', mortgage: { balance: 200000 } }),
        vrbo({ mortgage: { balance: 384000 } }),
      ],
    })
    const out = billPortfolio(s, newWeekCtx())
    // interest 300 + 576, HOA 80, PropCo 60 x 1 unit, VRBO upkeep 1700
    expect(out.state.cash).toBe(100000 - 300 - 576 - 80 - 60 - 1700)
    expect(out.lines.map((l) => l[0])).toEqual([
      'Mortgage interest',
      'HOA fees',
      'PropCo',
      'VRBO upkeep',
    ])
  })
})

describe('checkMilestones', () => {
  it('unlocks every milestone the net worth has passed, in order', () => {
    const s = st({ cash: 1200000 })
    const out = checkMilestones(s)
    expect(out.state.milestonesUnlocked).toEqual([
      'mogul250',
      'portfolioGuy',
      'sevenFig',
    ])
    expect(out.unlocked.map((m) => m.id)).toContain('sevenFig')
  })
  it('does not re-unlock', () => {
    const s = st({ cash: 300000, milestonesUnlocked: ['mogul250'] })
    expect(checkMilestones(s).unlocked).toHaveLength(0)
  })
})
