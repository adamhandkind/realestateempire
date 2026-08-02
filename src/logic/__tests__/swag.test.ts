import { describe, expect, it } from 'vitest'
import { SLOTS, SWAG } from '../../data/swag'
import { initialState, reducer } from '../../state/reducer'
import { deriveStats, swagOf, weeklyUpkeep } from '../economy'
import type { GameState } from '../../state/types'

const tier4 = () => SWAG.filter((s) => s.tier === 4)

describe('Tier 4 swag', () => {
  it('adds exactly twelve items', () => {
    expect(tier4()).toHaveLength(12)
  })

  it('locks every Tier 4 item behind Top Producer', () => {
    tier4().forEach((it) => expect(it.unlockRank).toBe('topProducer'))
  })

  it('adds the bodyMod slot after office', () => {
    expect(SLOTS.map((s) => s.id)).toEqual([
      'outfit',
      'accessory',
      'vehicle',
      'office',
      'bodyMod',
    ])
  })

  it('gives every body mod zero upkeep and heavy ego', () => {
    const mods = SWAG.filter((s) => s.slot === 'bodyMod')
    expect(mods).toHaveLength(5)
    mods.forEach((m) => {
      expect(m.upkeep).toBe(0)
      expect(m.ego).toBeGreaterThanOrEqual(2)
    })
  })

  it('prices the Lambo at a quarter of a million with $1,500 upkeep', () => {
    const l = swagOf('lamboGold')!
    expect(l.price).toBe(250000)
    expect(l.upkeep).toBe(1500)
    expect(l.slot).toBe('vehicle')
  })

  it('costs about half a million to buy the whole tier', () => {
    const total = tier4().reduce((t, i) => t + i.price, 0)
    expect(total).toBeGreaterThan(450000)
    expect(total).toBeLessThan(550000)
  })

  it('has no duplicate swag ids anywhere in the catalogue', () => {
    expect(new Set(SWAG.map((s) => s.id)).size).toBe(SWAG.length)
  })

  it('gives every Tier 4 item a flavor line and a real slot', () => {
    const slotIds = SLOTS.map((s) => s.id)
    tier4().forEach((it) => {
      expect(it.flavor.length).toBeGreaterThan(0)
      expect(slotIds).toContain(it.slot)
    })
  })
})

describe('bodyMod equipping', () => {
  const rich = (): GameState => ({
    ...initialState(),
    rank: 'topProducer',
    cash: 100000,
  })

  it('equips a body mod on purchase and counts its stats', () => {
    const s = reducer(rich(), { type: 'BUY_SWAG', itemId: 'buttImplants' })
    expect(s.equipped.bodyMod).toBe('buttImplants')
    expect(deriveStats(s).ego).toBe(4)
    expect(deriveStats(s).swagger).toBe(3)
    expect(weeklyUpkeep(s)).toBe(0)
  })

  it('allows only one body mod at a time', () => {
    let s = reducer(rich(), { type: 'BUY_SWAG', itemId: 'buttImplants' })
    s = reducer(s, { type: 'BUY_SWAG', itemId: 'calfImplants' })
    expect(s.equipped.bodyMod).toBe('calfImplants')
    expect(s.ownedSwagIds).toContain('buttImplants')
  })

  it('can take a body mod off and put it back on', () => {
    let s = reducer(rich(), { type: 'BUY_SWAG', itemId: 'theHelmet' })
    s = reducer(s, { type: 'EQUIP_SWAG', itemId: 'theHelmet' })
    expect(s.equipped.bodyMod).toBeUndefined()
    s = reducer(s, { type: 'EQUIP_SWAG', itemId: 'theHelmet' })
    expect(s.equipped.bodyMod).toBe('theHelmet')
  })

  it('refuses a Tier 4 purchase below Top Producer', () => {
    const s = reducer(
      { ...rich(), rank: 'sellerAgent' },
      { type: 'BUY_SWAG', itemId: 'buttImplants' },
    )
    expect(s.ownedSwagIds).not.toContain('buttImplants')
  })

  it('refuses a Tier 4 purchase the player cannot afford', () => {
    const s = reducer(
      { ...rich(), cash: 100 },
      { type: 'BUY_SWAG', itemId: 'lamboGold' },
    )
    expect(s.ownedSwagIds).not.toContain('lamboGold')
  })

  it('counts body-mod upkeep as nothing while charging for the Lambo', () => {
    let s: GameState = { ...rich(), cash: 500000 }
    s = reducer(s, { type: 'BUY_SWAG', itemId: 'buttImplants' })
    s = reducer(s, { type: 'BUY_SWAG', itemId: 'lamboGold' })
    expect(weeklyUpkeep(s)).toBe(1500)
  })
})
