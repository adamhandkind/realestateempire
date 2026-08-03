import { describe, expect, it } from 'vitest'
import { setSeed } from '../rand'
import {
  collectRent,
  newWeekCtx,
  rollApplicants,
  rollTenantEvents,
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
