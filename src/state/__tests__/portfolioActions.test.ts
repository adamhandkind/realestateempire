import { describe, expect, it } from 'vitest'
import { setSeed } from '../../logic/rand'
import { initialState, reducer } from '../reducer'
import type { GameState, Listing, Property } from '../types'

const listing = (over: Partial<Listing> = {}): Listing => ({
  id: 'LST1',
  typeId: 'starter',
  intrinsicValue: 200000,
  condition: 60,
  askPrice: 180000,
  blurb: 'Good bones. The bones are load-bearing wallpaper.',
  ...over,
})

const owned = (over: Partial<Property> = {}): Property => ({
  id: 'P1',
  typeId: 'starter',
  nickname: 'Starter Home on Dundurn',
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
