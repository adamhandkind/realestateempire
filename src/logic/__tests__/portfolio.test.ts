import { describe, expect, it } from 'vitest'
import {
  PROPERTY_TYPES,
  RENO_PROJECTS,
  STREET_NAMES,
} from '../../data/properties'
import { TENANTS } from '../../data/tenants'
import { TENANT_EVENTS } from '../../data/tenantEvents'
import { MILESTONES } from '../../data/milestones'
import { VRBO_EVENTS } from '../../data/vrbo'
import { CRASH_BRAGS, LANDLORD_BRAGS, VRBO_BRAGS } from '../../data/brags'
import { setSeed } from '../rand'
import {
  applicantChance,
  chargedRent,
  conditionFactor,
  displayedValue,
  fairRent,
  interp,
  makeListing,
  mortgageSlots,
  netWorth,
  renoCost,
  renoWeeks,
  saleChance,
  usedMortgageSlots,
  vrboOccupancy,
} from '../portfolio'
import type { GameState, Property, UnitState } from '../../state/types'

describe('property data', () => {
  it('lists the six buyable types and no vrbo entry', () => {
    expect(PROPERTY_TYPES.map((t) => t.id)).toEqual([
      'starter',
      'condo',
      'townhouse',
      'duplex',
      'apartment',
      'luxury',
    ])
  })
  it('gives every type exactly two blurbs', () => {
    PROPERTY_TYPES.forEach((t) => expect(t.blurbs).toHaveLength(2))
  })
  it('gates apartment and luxury behind Top Producer', () => {
    const gated = PROPERTY_TYPES.filter((t) => t.unlockRank === 'topProducer')
    expect(gated.map((t) => t.id)).toEqual(['apartment', 'luxury'])
  })
  it('offers the luxury package only to townhouse and luxury', () => {
    const lux = PROPERTY_TYPES.filter((t) =>
      t.renoEligible.includes('luxuryPkg'),
    )
    expect(lux.map((t) => t.id)).toEqual(['townhouse', 'luxury'])
  })
  it('has three renovation projects and twelve streets', () => {
    expect(RENO_PROJECTS.map((r) => r.id)).toEqual([
      'cosmetic',
      'full',
      'luxuryPkg',
    ])
    expect(STREET_NAMES).toHaveLength(12)
  })
})

describe('tenant data', () => {
  it('has all eight archetypes', () => {
    expect(TENANTS.map((t) => t.id)).toEqual([
      'perfectPatricia',
      'corpLease',
      'lateLenny',
      'diyDave',
      'partyPaulie',
      'sobStorySteve',
      'contentCrew',
      'theHoarder',
    ])
  })
  it('caps Patricia at fair rent and gates corpLease on condition', () => {
    const patricia = TENANTS.find((t) => t.id === 'perfectPatricia')!
    const corp = TENANTS.find((t) => t.id === 'corpLease')!
    expect(patricia.availableMaxR).toBe(1.0)
    expect(corp.availableMinCondition).toBe(70)
  })
  it('marks the two archetypes that never leave voluntarily', () => {
    const forever = TENANTS.filter((t) => t.stayMax === null)
    expect(forever.map((t) => t.id)).toEqual(['sobStorySteve', 'theHoarder'])
  })
  it('carries the rent modifiers', () => {
    expect(TENANTS.find((t) => t.id === 'corpLease')!.rentMod).toBe(1.2)
    expect(TENANTS.find((t) => t.id === 'contentCrew')!.rentMod).toBe(1.3)
  })
  it('gives Steve an eviction confirmation body and a write-off skip rule', () => {
    const steve = TENANTS.find((t) => t.id === 'sobStorySteve')!
    expect(steve.onSkip).toBe('gone')
    expect(steve.evictBody).toContain('koi')
  })
})

describe('tenant event data', () => {
  it('has all eight events', () => {
    expect(TENANT_EVENTS.map((e) => e.id)).toEqual([
      'burstPipe',
      'roofLeak',
      'noiseComplaint',
      'supportRaccoon',
      'rentStrike',
      'greatReferral',
      'cityInspection',
      'leaseRenewal',
    ])
  })
  it('marks exactly the four PropCo-resolvable minors', () => {
    expect(TENANT_EVENTS.filter((e) => e.minor).map((e) => e.id)).toEqual([
      'burstPipe',
      'roofLeak',
      'noiseComplaint',
      'supportRaccoon',
    ])
  })
})

describe('milestone and vrbo data', () => {
  it('lists the four milestones in ascending threshold order', () => {
    expect(MILESTONES.map((m) => m.id)).toEqual([
      'mogul250',
      'portfolioGuy',
      'sevenFig',
      'genWealth',
    ])
    expect(MILESTONES.map((m) => m.threshold)).toEqual([
      250000, 500000, 1000000, 2500000,
    ])
  })
  it('has four equally-weighted vrbo events', () => {
    expect(VRBO_EVENTS.map((e) => e.id)).toEqual([
      'bachelorParty',
      'filmCrew',
      'influencerSummit',
      'plumbingCatastrophe',
    ])
  })
})

describe('phase 3 brag sets', () => {
  it('ships six landlord brags, three vrbo brags, two crash brags', () => {
    expect(LANDLORD_BRAGS).toHaveLength(6)
    expect(VRBO_BRAGS).toHaveLength(3)
    expect(CRASH_BRAGS).toHaveLength(2)
  })
  it('interpolates the door count', () => {
    expect(LANDLORD_BRAGS.some((b) => b.includes('{properties}'))).toBe(true)
  })
})

const unit = (over: Partial<UnitState> = {}): UnitState => ({
  id: 'P1-u0',
  tenant: null,
  rentR: 1.0,
  openIssue: null,
  evictionWeeksLeft: null,
  ...over,
})

const prop = (over: Partial<Property> = {}): Property => ({
  id: 'P1',
  typeId: 'starter',
  nickname: 'Starter Home on Dundurn',
  districtId: 'northEnd',
  baseValue: 200000,
  condition: 70,
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

const st = (over: Partial<GameState> = {}): GameState =>
  ({
    cash: 10000,
    reputation: 0,
    week: 20,
    rank: 'topProducer',
    marketState: 'normal',
    crash: { weeksLeft: 0, lastCrashWeek: -999 },
    properties: [],
    milestonesUnlocked: [],
    activeChannelIds: [],
    marketPool: [],
    nextListingId: 1,
    ...over,
  }) as GameState

describe('displayedValue and netWorth', () => {
  it('applies the market multiplier', () => {
    const p = prop()
    expect(displayedValue(st({ marketState: 'hot' }), p)).toBe(220000)
    expect(displayedValue(st({ marketState: 'cold' }), p)).toBe(180000)
  })
  it('stacks the crash multiplier on top', () => {
    const s = st({
      marketState: 'cold',
      crash: { weeksLeft: 3, lastCrashWeek: 20 },
    })
    expect(displayedValue(s, prop())).toBe(144000)
  })
  it('nets out mortgage balances and adds cash', () => {
    const p = prop({ mortgage: { balance: 150000 } })
    const s = st({ cash: 5000, properties: [p] })
    expect(netWorth(s)).toBe(5000 + 200000 - 150000)
  })
})

describe('rent', () => {
  it('scales fair rent from 60% to 100% of base across condition', () => {
    expect(fairRent(prop({ condition: 0 }), 400)).toBeCloseTo(240)
    expect(fairRent(prop({ condition: 100 }), 400)).toBeCloseTo(400)
  })
  it('applies the slider and the tenant modifier, rounded to $5', () => {
    const p = prop({ condition: 100 })
    const u = unit({
      rentR: 1.2,
      tenant: {
        archetypeId: 'corpLease',
        name: 'A Corporation',
        tenancyWeeks: 1,
        plannedStayWeeks: 14,
        owed: 0,
      },
    })
    // 400 * 1.2 * 1.2 = 576 -> 575
    expect(chargedRent(p, u, 400)).toBe(575)
  })
})

describe('applicantChance', () => {
  it('matches the spec curve at the checkpoints', () => {
    expect(applicantChance(0.8, false)).toBeCloseTo(0.8, 5)
    expect(applicantChance(1.0, false)).toBeCloseTo(0.7, 5)
    expect(applicantChance(1.2, false)).toBeCloseTo(0.475, 5)
    expect(applicantChance(1.4, false)).toBeCloseTo(0.25, 5)
  })
  it('adds the PropCo bonus before clamping', () => {
    expect(applicantChance(1.0, true)).toBeCloseTo(0.8, 5)
    // 0.7 - 0.45 + 0.1 = 0.35, still above the 0.25 floor
    expect(applicantChance(1.4, true)).toBeCloseTo(0.35, 5)
  })
})

describe('mortgage slots', () => {
  it('grows with the two milestone perks and caps at four', () => {
    expect(mortgageSlots(st())).toBe(2)
    expect(mortgageSlots(st({ milestonesUnlocked: ['mogul250'] }))).toBe(3)
    expect(
      mortgageSlots(st({ milestonesUnlocked: ['mogul250', 'sevenFig'] })),
    ).toBe(4)
  })
  it('counts only financed properties', () => {
    const s = st({
      properties: [prop(), prop({ id: 'P2', mortgage: { balance: 10 } })],
    })
    expect(usedMortgageSlots(s)).toBe(1)
  })
})

describe('listing generation', () => {
  it('prices condition into the ask and leaves no instant equity', () => {
    expect(conditionFactor(40)).toBeCloseTo(0.8333, 4)
    expect(conditionFactor(90)).toBeCloseTo(1.0, 4)
    setSeed(7)
    const l = makeListing(st(), 1)
    expect(l.askPrice).toBe(
      Math.round(l.intrinsicValue * conditionFactor(l.condition)),
    )
    setSeed(null)
  })
})

describe('saleChance', () => {
  it('is base + rep + market delta, clamped', () => {
    expect(saleChance(st({ reputation: 50 }))).toBeCloseTo(0.35, 5)
    expect(saleChance(st({ reputation: 0, marketState: 'cold' }))).toBeCloseTo(
      0.1,
      5,
    )
    expect(saleChance(st({ reputation: 100, marketState: 'hot' }))).toBeCloseTo(
      0.6,
      5,
    )
  })
})

describe('renovation cost and duration', () => {
  it('charges a percentage of current baseValue', () => {
    expect(renoCost(st(), prop({ baseValue: 300000 }), 'full')).toBe(60000)
    expect(renoCost(st(), prop({ baseValue: 300000 }), 'cosmetic')).toBe(24000)
  })
  it('takes a week off once generational wealth lands', () => {
    expect(renoWeeks(st(), 'full')).toBe(5)
    expect(renoWeeks(st({ milestonesUnlocked: ['genWealth'] }), 'full')).toBe(4)
  })
})

describe('vrboOccupancy', () => {
  it('hits 0.70 fully optimized in a normal market, before jitter', () => {
    const p = prop({ isVrbo: true, vrboRenoDone: true, condition: 80 })
    const s = st({ activeChannelIds: ['tiktok'] })
    expect(vrboOccupancy(s, p, 0)).toBeCloseTo(0.7, 5)
  })
  it('is 0.15 unmanaged and penalised under 50 condition', () => {
    const p = prop({ isVrbo: true, condition: 40 })
    expect(vrboOccupancy(st(), p, 0)).toBeCloseTo(0.05, 5)
  })
  it('caps at 0.85', () => {
    const p = prop({ isVrbo: true, vrboRenoDone: true, condition: 80 })
    const s = st({ activeChannelIds: ['tiktok'], marketState: 'hot' })
    expect(vrboOccupancy(s, p, 0.05)).toBeCloseTo(0.85, 5)
  })
})

describe('interp', () => {
  it('replaces every occurrence of every placeholder', () => {
    expect(
      interp('{name} and {name} at {nickname}', {
        name: 'Dave',
        nickname: 'Elm Ridge',
      }),
    ).toBe('Dave and Dave at Elm Ridge')
  })
})
