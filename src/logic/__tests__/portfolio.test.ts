import { describe, expect, it } from 'vitest'
import {
  PROPERTY_TYPES,
  RENO_PROJECTS,
  STREET_NAMES,
} from '../../data/properties'

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
