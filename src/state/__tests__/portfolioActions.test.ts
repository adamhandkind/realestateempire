import { describe, expect, it } from 'vitest'
import { applyEvent } from '../../logic/events'
import { setSeed } from '../../logic/rand'
import { initialState, reducer } from '../reducer'
import type {
  GameState,
  Listing,
  PortfolioChoice,
  Property,
} from '../types'

const listing = (over: Partial<Listing> = {}): Listing => ({
  id: 'LST1',
  typeId: 'starter',
  intrinsicValue: 200000,
  condition: 60,
  askPrice: 180000,
  blurb: 'Good bones. The bones are load-bearing wallpaper.',
  districtId: 'northEnd',
  ...over,
})

const owned = (over: Partial<Property> = {}): Property => ({
  id: 'P1',
  typeId: 'starter',
  nickname: 'Starter Home on Dundurn',
  districtId: 'northEnd',
  baseValue: 180000,
  condition: 60,
  mortgage: null,
  units: [
    {
      id: 'P1-u0',
      tenant: null,
      rentR: 1.0,
      openIssue: null,
      evictionWeeksLeft: null,
    },
  ],
  renovation: null,
  listedForSale: false,
  boughtWeek: 1,
  isVrbo: false,
  vrboProfitStreak: 0,
  vrboRenoDone: false,
  ...over,
})

const base = (over: Partial<GameState> = {}): GameState => ({
  ...initialState(),
  rank: 'sellerAgent',
  cash: 200000,
  marketPool: [listing()],
  /* The fixture hand-places LST1, so the counter has to move past it or the
     post-purchase fillPool mints a second listing with the same id. */
  nextListingId: 2,
  ...over,
})

describe('BUY_PROPERTY', () => {
  it('takes the down payment and finances the rest', () => {
    setSeed(3)
    const s = reducer(base(), {
      type: 'BUY_PROPERTY',
      listingId: 'LST1',
      downPct: 0.2,
    })
    setSeed(null)
    expect(s.cash).toBe(200000 - 36000)
    expect(s.properties).toHaveLength(1)
    expect(s.properties[0].mortgage).toEqual({ balance: 144000 })
    expect(s.properties[0].baseValue).toBe(180000)
    expect(s.properties[0].condition).toBe(60)
    expect(s.properties[0].units).toHaveLength(1)
    expect(s.properties[0].units[0].rentR).toBe(1.0)
    expect(s.marketPool.some((l) => l.id === 'LST1')).toBe(false)
    expect(s.marketPool).toHaveLength(4)
  })

  it('takes no mortgage slot on a cash purchase', () => {
    const s = reducer(base(), {
      type: 'BUY_PROPERTY',
      listingId: 'LST1',
      downPct: 1,
    })
    expect(s.cash).toBe(20000)
    expect(s.properties[0].mortgage).toBeNull()
  })

  it('refuses under 20% down', () => {
    const s = base()
    expect(
      reducer(s, { type: 'BUY_PROPERTY', listingId: 'LST1', downPct: 0.1 })
        .properties,
    ).toHaveLength(0)
  })

  it('refuses when every mortgage slot is used', () => {
    const s = base({
      properties: [
        owned({ id: 'P1', mortgage: { balance: 1 } }),
        owned({ id: 'P2', mortgage: { balance: 1 } }),
      ],
    })
    const out = reducer(s, {
      type: 'BUY_PROPERTY',
      listingId: 'LST1',
      downPct: 0.2,
    })
    expect(out.properties).toHaveLength(2)
  })

  it('refuses when the down payment exceeds cash', () => {
    const s = base({ cash: 1000 })
    expect(
      reducer(s, { type: 'BUY_PROPERTY', listingId: 'LST1', downPct: 0.2 })
        .properties,
    ).toHaveLength(0)
  })
})

describe('SET_RENT', () => {
  it('clamps to the slider range and costs no AP', () => {
    const s = base({ properties: [owned()] })
    const hi = reducer(s, {
      type: 'SET_RENT',
      propertyId: 'P1',
      unitId: 'P1-u0',
      r: 2,
    })
    expect(hi.properties[0].units[0].rentR).toBe(1.4)
    expect(hi.ap).toBe(s.ap)
    const lo = reducer(s, {
      type: 'SET_RENT',
      propertyId: 'P1',
      unitId: 'P1-u0',
      r: 0.1,
    })
    expect(lo.properties[0].units[0].rentR).toBe(0.7)
  })
  it('snaps to the 0.05 step', () => {
    const s = reducer(base({ properties: [owned()] }), {
      type: 'SET_RENT',
      propertyId: 'P1',
      unitId: 'P1-u0',
      r: 1.13,
    })
    expect(s.properties[0].units[0].rentR).toBeCloseTo(1.15, 5)
  })
})

describe('LIST_FOR_SALE / DELIST', () => {
  it('costs 1 AP to list and nothing to delist', () => {
    const s = base({ properties: [owned()], ap: 5 })
    const listed = reducer(s, { type: 'LIST_FOR_SALE', propertyId: 'P1' })
    expect(listed.properties[0].listedForSale).toBe(true)
    expect(listed.ap).toBe(4)
    const back = reducer(listed, { type: 'DELIST', propertyId: 'P1' })
    expect(back.properties[0].listedForSale).toBe(false)
    expect(back.ap).toBe(4)
  })
  it('refuses to list a property that is mid-renovation', () => {
    const s = base({
      properties: [owned({ renovation: { projectId: 'full', weeksLeft: 3 } })],
    })
    expect(
      reducer(s, { type: 'LIST_FOR_SALE', propertyId: 'P1' }).properties[0]
        .listedForSale,
    ).toBe(false)
  })
})

describe('PAY_PRINCIPAL', () => {
  it('pays a $10k chunk', () => {
    const s = base({ properties: [owned({ mortgage: { balance: 25000 } })] })
    const out = reducer(s, { type: 'PAY_PRINCIPAL', propertyId: 'P1' })
    expect(out.cash).toBe(190000)
    expect(out.properties[0].mortgage).toEqual({ balance: 15000 })
  })
  it('clears the mortgage and frees the slot on the last payment', () => {
    const s = base({ properties: [owned({ mortgage: { balance: 4000 } })] })
    const out = reducer(s, { type: 'PAY_PRINCIPAL', propertyId: 'P1' })
    expect(out.cash).toBe(196000)
    expect(out.properties[0].mortgage).toBeNull()
  })
  it('refuses when cash will not cover the chunk', () => {
    const s = base({
      cash: 500,
      properties: [owned({ mortgage: { balance: 25000 } })],
    })
    expect(
      reducer(s, { type: 'PAY_PRINCIPAL', propertyId: 'P1' }).properties[0]
        .mortgage,
    ).toEqual({ balance: 25000 })
  })
})

describe('TOGGLE_PROPCO', () => {
  const tenanted = (id: string) =>
    owned({
      id,
      units: [
        {
          id: id + '-u0',
          tenant: {
            archetypeId: 'lateLenny',
            name: 'Lenny Pham',
            tenancyWeeks: 2,
            plannedStayWeeks: 20,
            owed: 0,
          },
          rentR: 1,
          openIssue: null,
          evictionWeeksLeft: null,
        },
      ],
    })

  it('refuses to enable under three occupied units', () => {
    const s = base({ properties: [tenanted('P1'), tenanted('P2')] })
    expect(reducer(s, { type: 'TOGGLE_PROPCO' }).propCoActive).toBe(false)
  })
  it('enables at three occupied units and always disables', () => {
    const s = base({
      properties: [tenanted('P1'), tenanted('P2'), tenanted('P3')],
    })
    const on = reducer(s, { type: 'TOGGLE_PROPCO' })
    expect(on.propCoActive).toBe(true)
    expect(reducer(on, { type: 'TOGGLE_PROPCO' }).propCoActive).toBe(false)
  })
})

describe('RENAME_PROPERTY', () => {
  it('caps the nickname at 24 characters', () => {
    const s = reducer(base({ properties: [owned()] }), {
      type: 'RENAME_PROPERTY',
      propertyId: 'P1',
      nickname: 'A'.repeat(40),
    })
    expect(s.properties[0].nickname).toHaveLength(24)
  })
})

const tenant = (archetypeId: string, name = 'Dave Okafor') => ({
  archetypeId,
  name,
  tenancyWeeks: 3,
  plannedStayWeeks: 20,
  owed: 0,
})

describe('START_RENOVATION', () => {
  it('charges 20% of baseValue and starts a five-week full reno', () => {
    const s = reducer(base({ properties: [owned({ baseValue: 200000 })] }), {
      type: 'START_RENOVATION',
      propertyId: 'P1',
      projectId: 'full',
    })
    expect(s.cash).toBe(160000)
    expect(s.properties[0].renovation).toEqual({
      projectId: 'full',
      weeksLeft: 5,
    })
  })
  it('refuses a full reno while anybody is living there', () => {
    const occupied = owned({
      units: [
        {
          id: 'P1-u0',
          tenant: tenant('lateLenny'),
          rentR: 1,
          openIssue: null,
          evictionWeeksLeft: null,
        },
      ],
    })
    const s = reducer(base({ properties: [occupied] }), {
      type: 'START_RENOVATION',
      propertyId: 'P1',
      projectId: 'full',
    })
    expect(s.properties[0].renovation).toBeNull()
    expect(s.log[0].text).toContain("You can't gut it around Patricia.")
  })
  it('allows a cosmetic refresh with a tenant in place', () => {
    const occupied = owned({
      units: [
        {
          id: 'P1-u0',
          tenant: tenant('lateLenny'),
          rentR: 1,
          openIssue: null,
          evictionWeeksLeft: null,
        },
      ],
    })
    const s = reducer(base({ properties: [occupied] }), {
      type: 'START_RENOVATION',
      propertyId: 'P1',
      projectId: 'cosmetic',
    })
    expect(s.properties[0].renovation).toEqual({
      projectId: 'cosmetic',
      weeksLeft: 2,
    })
  })
  it('refuses the luxury package below Top Producer', () => {
    const s = reducer(
      base({
        rank: 'sellerAgent',
        properties: [owned({ typeId: 'townhouse' })],
      }),
      { type: 'START_RENOVATION', propertyId: 'P1', projectId: 'luxuryPkg' },
    )
    expect(s.properties[0].renovation).toBeNull()
  })
  it('refuses a project the type is not eligible for', () => {
    const s = reducer(base({ rank: 'topProducer', properties: [owned()] }), {
      type: 'START_RENOVATION',
      propertyId: 'P1',
      projectId: 'luxuryPkg',
    })
    expect(s.properties[0].renovation).toBeNull()
  })
})

describe('EMERGENCY_REPAIR', () => {
  it('costs 1 AP and $1,000 for +15 condition', () => {
    const s = reducer(base({ properties: [owned({ condition: 30 })], ap: 5 }), {
      type: 'EMERGENCY_REPAIR',
      propertyId: 'P1',
    })
    expect(s.cash).toBe(199000)
    expect(s.ap).toBe(4)
    expect(s.properties[0].condition).toBe(45)
  })
  it('caps condition at 100', () => {
    const s = reducer(base({ properties: [owned({ condition: 95 })] }), {
      type: 'EMERGENCY_REPAIR',
      propertyId: 'P1',
    })
    expect(s.properties[0].condition).toBe(100)
  })
  it('clears a rent strike once condition reaches 50', () => {
    const striking = owned({
      condition: 38,
      units: [
        {
          id: 'P1-u0',
          tenant: tenant('lateLenny'),
          rentR: 1,
          openIssue: { eventId: 'rentStrike', weeksOpen: 2, fixCost: 0 },
          evictionWeeksLeft: null,
        },
      ],
    })
    const s = reducer(base({ properties: [striking] }), {
      type: 'EMERGENCY_REPAIR',
      propertyId: 'P1',
    })
    expect(s.properties[0].condition).toBe(53)
    expect(s.properties[0].units[0].openIssue).toBeNull()
  })
})

describe('HANDLE_ISSUE', () => {
  it('pays the fix cost, closes the issue, and logs the fix line', () => {
    const broken = owned({
      units: [
        {
          id: 'P1-u0',
          tenant: tenant('lateLenny'),
          rentR: 1,
          openIssue: { eventId: 'burstPipe', weeksOpen: 1, fixCost: 300 },
          evictionWeeksLeft: null,
        },
      ],
    })
    const s = reducer(base({ properties: [broken], ap: 5 }), {
      type: 'HANDLE_ISSUE',
      propertyId: 'P1',
      unitId: 'P1-u0',
    })
    expect(s.cash).toBe(199700)
    expect(s.ap).toBe(4)
    expect(s.properties[0].units[0].openIssue).toBeNull()
    expect(s.log[0].text).toContain('You did not ask.')
  })
  it('restores condition to 60 when fixing a failed inspection', () => {
    const failed = owned({
      condition: 35,
      units: [
        {
          id: 'P1-u0',
          tenant: tenant('lateLenny'),
          rentR: 1,
          openIssue: { eventId: 'cityInspection', weeksOpen: 1, fixCost: 800 },
          evictionWeeksLeft: null,
        },
      ],
    })
    const s = reducer(base({ properties: [failed] }), {
      type: 'HANDLE_ISSUE',
      propertyId: 'P1',
      unitId: 'P1-u0',
    })
    expect(s.properties[0].condition).toBe(60)
  })
  it('refuses to fix a rent strike with money', () => {
    const striking = owned({
      condition: 30,
      units: [
        {
          id: 'P1-u0',
          tenant: tenant('lateLenny'),
          rentR: 1,
          openIssue: { eventId: 'rentStrike', weeksOpen: 1, fixCost: 0 },
          evictionWeeksLeft: null,
        },
      ],
    })
    const s = reducer(base({ properties: [striking] }), {
      type: 'HANDLE_ISSUE',
      propertyId: 'P1',
      unitId: 'P1-u0',
    })
    expect(s.properties[0].units[0].openIssue).not.toBeNull()
  })
})

describe('EVICT', () => {
  const withTenant = (archetypeId: string) =>
    owned({
      units: [
        {
          id: 'P1-u0',
          tenant: tenant(archetypeId),
          rentR: 1,
          openIssue: null,
          evictionWeeksLeft: null,
        },
      ],
    })

  it('costs 1 AP and $800 and starts a four-week clock', () => {
    const s = reducer(base({ properties: [withTenant('lateLenny')], ap: 5 }), {
      type: 'EVICT',
      propertyId: 'P1',
      unitId: 'P1-u0',
    })
    expect(s.cash).toBe(199200)
    expect(s.ap).toBe(4)
    expect(s.properties[0].units[0].evictionWeeksLeft).toBe(4)
    expect(s.properties[0].units[0].tenant).not.toBeNull()
  })
  it('gives the Collector six weeks', () => {
    const s = reducer(base({ properties: [withTenant('theHoarder')] }), {
      type: 'EVICT',
      propertyId: 'P1',
      unitId: 'P1-u0',
    })
    expect(s.properties[0].units[0].evictionWeeksLeft).toBe(6)
  })
  it('does not restart a running eviction', () => {
    const started = reducer(base({ properties: [withTenant('lateLenny')] }), {
      type: 'EVICT',
      propertyId: 'P1',
      unitId: 'P1-u0',
    })
    const again = reducer(started, {
      type: 'EVICT',
      propertyId: 'P1',
      unitId: 'P1-u0',
    })
    expect(again.cash).toBe(started.cash)
  })
})

describe('the VRBO offer conversion', () => {
  it('offers only decline while under three prior offers', () => {
    const s = base({
      rank: 'topProducer',
      gagCounters: { ...initialState().gagCounters, vrboOffers: 1 },
    })
    const out = applyEvent(s, 'vrboSpam').state
    expect(out.pendingChoice!.options.map((o) => o.key)).toEqual(['decline'])
  })

  it('adds decline-forever and buy at three offers as Top Producer', () => {
    const s = base({
      rank: 'topProducer',
      gagCounters: { ...initialState().gagCounters, vrboOffers: 3 },
    })
    const out = applyEvent(s, 'vrboSpam').state
    expect(out.pendingChoice!.options.map((o) => o.key)).toEqual([
      'decline',
      'declineForever',
      'buyVrbo',
    ])
    expect(out.pendingChoice!.body).toContain('MACHINE waiting for an operator')
  })

  it('stays a one-button gag below Top Producer', () => {
    const s = base({
      rank: 'sellerAgent',
      gagCounters: { ...initialState().gagCounters, vrboOffers: 5 },
    })
    expect(applyEvent(s, 'vrboSpam').state.pendingChoice!.options).toHaveLength(
      1,
    )
  })

  it('stops offering once declined forever', () => {
    const s = base({
      rank: 'topProducer',
      gagCounters: {
        ...initialState().gagCounters,
        vrboOffers: 5,
        vrboDeclinedForever: true,
      },
    })
    expect(applyEvent(s, 'vrboSpam').state.pendingChoice!.options).toHaveLength(
      1,
    )
  })
})

describe('RESOLVE_CHOICE_EVENT: the two new VRBO keys', () => {
  it('declineForever sets the flag and mourns', () => {
    const s = base({
      rank: 'topProducer',
      gagCounters: { ...initialState().gagCounters, vrboOffers: 3 },
    })
    const offered = applyEvent(s, 'vrboSpam').state
    const out = reducer(offered, {
      type: 'RESOLVE_CHOICE_EVENT',
      key: 'declineForever',
    })
    expect(out.gagCounters.vrboDeclinedForever).toBe(true)
    expect(out.log[0].text).toContain("You'll always wonder.")
  })

  it('buyVrbo queues a vrboBuy choice', () => {
    const s = base({
      rank: 'topProducer',
      gagCounters: { ...initialState().gagCounters, vrboOffers: 3 },
    })
    const offered = applyEvent(s, 'vrboSpam').state
    const out = reducer(offered, {
      type: 'RESOLVE_CHOICE_EVENT',
      key: 'buyVrbo',
    })
    expect(out.pendingChoice).toBeNull()
    expect(out.pendingChoices[0].kind).toBe('vrboBuy')
  })
})

describe('BUY_VRBO', () => {
  const offering = (over: Partial<GameState> = {}) =>
    base({
      rank: 'topProducer',
      cash: 200000,
      pendingChoices: [
        {
          id: 'C1',
          kind: 'vrboBuy',
          title: 'THE 424/7 VRBO',
          body: 'x',
          options: [],
          payload: {},
        } as PortfolioChoice,
      ],
      ...over,
    })

  it('creates the property, takes the slot, and clears the choice', () => {
    const s = reducer(offering(), { type: 'BUY_VRBO', downPct: 0.2 })
    expect(s.cash).toBe(200000 - 96000)
    const v = s.properties[0]
    expect(v.typeId).toBe('vrbo')
    expect(v.nickname).toBe('The 424/7 VRBO')
    expect(v.baseValue).toBe(480000)
    expect(v.condition).toBe(70)
    expect(v.units).toEqual([])
    expect(v.isVrbo).toBe(true)
    expect(v.mortgage).toEqual({ balance: 384000 })
    expect(s.gagCounters.vrboOwned).toBe(true)
    expect(s.pendingChoices).toHaveLength(0)
  })

  it('refuses a second VRBO', () => {
    const once = reducer(offering(), { type: 'BUY_VRBO', downPct: 0.2 })
    const twice = reducer(
      { ...once, pendingChoices: offering().pendingChoices },
      { type: 'BUY_VRBO', downPct: 0.2 },
    )
    expect(twice.properties).toHaveLength(1)
  })
})

describe('RESOLVE_PORTFOLIO_CHOICE', () => {
  const lowball = (): PortfolioChoice => ({
    id: 'C1',
    kind: 'lowball',
    title: 'Offer on Starter Home on Dundurn',
    body: 'A buyer offers $170,000.',
    options: [
      { label: 'Take the money', actionTag: 'accept' },
      { label: 'Hold firm', actionTag: 'reject' },
    ],
    payload: { propertyId: 'P1', offerAmount: 170000 },
  })

  it('accepting sells at the offer and settles the mortgage', () => {
    const s = base({
      cash: 1000,
      properties: [
        owned({ mortgage: { balance: 100000 }, listedForSale: true }),
      ],
      pendingChoices: [lowball()],
    })
    const out = reducer(s, {
      type: 'RESOLVE_PORTFOLIO_CHOICE',
      choiceId: 'C1',
      actionTag: 'accept',
    })
    expect(out.cash).toBe(1000 + 70000)
    expect(out.properties).toHaveLength(0)
    expect(out.pendingChoices).toHaveLength(0)
  })

  it('rejecting keeps the property and pops the queue', () => {
    const s = base({
      properties: [owned({ listedForSale: true })],
      pendingChoices: [lowball()],
    })
    const out = reducer(s, {
      type: 'RESOLVE_PORTFOLIO_CHOICE',
      choiceId: 'C1',
      actionTag: 'reject',
    })
    expect(out.properties).toHaveLength(1)
    expect(out.pendingChoices).toHaveLength(0)
  })

  const renewalState = () =>
    base({
      properties: [
        owned({
          units: [
            {
              id: 'P1-u0',
              tenant: {
                archetypeId: 'lateLenny',
                name: 'Lenny Pham',
                tenancyWeeks: 12,
                plannedStayWeeks: 25,
                owed: 0,
              },
              rentR: 1.0,
              openIssue: null,
              evictionWeeksLeft: null,
            },
          ],
        }),
      ],
      pendingChoices: [
        {
          id: 'C1',
          kind: 'renewal',
          title: 'Lease renewal',
          body: 'x',
          options: [
            { label: 'Raise rent 10%', actionTag: 'raise' },
            { label: 'Keep them happy', actionTag: 'keep' },
          ],
          payload: { propertyId: 'P1', unitId: 'P1-u0' },
        } as PortfolioChoice,
      ],
    })

  it('a renewal raise bumps rentR by 0.10', () => {
    setSeed(11)
    const out = reducer(renewalState(), {
      type: 'RESOLVE_PORTFOLIO_CHOICE',
      choiceId: 'C1',
      actionTag: 'raise',
    })
    setSeed(null)
    expect(out.properties[0].units[0].rentR).toBeCloseTo(1.1, 5)
  })

  it('keeping them happy adds four weeks of tenancy', () => {
    const out = reducer(renewalState(), {
      type: 'RESOLVE_PORTFOLIO_CHOICE',
      choiceId: 'C1',
      actionTag: 'keep',
    })
    expect(out.properties[0].units[0].tenant!.plannedStayWeeks).toBe(29)
  })
})
