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
