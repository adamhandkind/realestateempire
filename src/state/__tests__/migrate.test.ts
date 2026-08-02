import { describe, expect, it } from 'vitest'
import { migrate } from '../migrate'

/** A realistic mid-game Phase 1 save: no v2 fields anywhere. */
const V1_SAVE = {
  version: 1,
  week: 22,
  cash: 41250,
  careerEarnings: 88300,
  ap: 3,
  rank: 'sellerAgent',
  stats: { hustle: 5, swagger: 7, ego: 6 },
  permBonuses: { hustle: 1, swagger: 2 },
  leads: [
    {
      id: 'Labc',
      archetypeId: 'luxLorenzo',
      clientName: 'Dana Vandermolen',
      stage: 'ready',
      salePrice: 615000,
      patience: 3,
      maxPatience: 5,
      retriedClose: false,
      createdWeek: 20,
      intro: 'x',
      referralBonus: false,
    },
  ],
  ownedSwagIds: ['discountSuit', 'gasSunnies'],
  equipped: { outfit: 'discountSuit' },
  counters: { showingsRun: 40, dealsClosed: 11, leadsLost: 9 },
  activeModifiers: [],
  log: [{ week: 21, text: 'something happened', kind: 'event' }],
  gameOver: false,
}

describe('migrate', () => {
  it('preserves every v1 field', () => {
    const s = migrate(V1_SAVE)!
    expect(s.week).toBe(22)
    expect(s.cash).toBe(41250)
    expect(s.careerEarnings).toBe(88300)
    expect(s.rank).toBe('sellerAgent')
    expect(s.leads).toHaveLength(1)
    expect(s.leads[0].clientName).toBe('Dana Vandermolen')
    expect(s.ownedSwagIds).toEqual(['discountSuit', 'gasSunnies'])
    expect(s.equipped.outfit).toBe('discountSuit')
    expect(s.counters.dealsClosed).toBe(11)
    expect(s.log).toHaveLength(1)
  })

  it('fills every new v2 field with a default', () => {
    const s = migrate(V1_SAVE)!
    expect(s.version).toBe(2)
    expect(s.reputation).toBe(0)
    expect(s.activeChannelIds).toEqual([])
    expect(s.outfitPresets).toEqual([])
    expect(s.gagCounters.vrboOffers).toBe(0)
    expect(s.channelMuteUntil).toEqual({})
    expect(s.pendingChoice).toBeNull()
    expect(s.permBonuses.ego).toBe(0)
  })

  it('keeps v1 permBonuses values while adding ego', () => {
    const s = migrate(V1_SAVE)!
    expect(s.permBonuses.hustle).toBe(1)
    expect(s.permBonuses.swagger).toBe(2)
  })

  it('never restores transient UI fields from disk', () => {
    const s = migrate({ ...V1_SAVE, summary: { week: 9 }, promo: 'Top Producer' })!
    expect(s.summary).toBeNull()
    expect(s.promo).toBeNull()
  })

  it('leaves an already-v2 save alone', () => {
    const v2 = migrate(V1_SAVE)!
    v2.reputation = 64
    v2.activeChannelIds = ['billboard']
    const again = migrate(v2)!
    expect(again.reputation).toBe(64)
    expect(again.activeChannelIds).toEqual(['billboard'])
  })

  it('rejects a non-save', () => {
    expect(migrate({ hello: 'world' })).toBeNull()
    expect(migrate(null)).toBeNull()
  })

  it('leaves a hand-built v2 save with populated v2 fields untouched', () => {
    const v2Shaped = {
      ...V1_SAVE,
      version: 2,
      permBonuses: { hustle: 1, swagger: 2, ego: 3 },
      reputation: 42,
      activeChannelIds: ['radio'],
      outfitPresets: [{ name: 'Casual', equipped: { outfit: 'discountSuit' } }],
      gagCounters: { vrboOffers: 5, nextVrboWeek: 30 },
      channelMuteUntil: { radio: 10 },
      pendingChoice: null,
    }
    const s = migrate(v2Shaped)!
    expect(s.reputation).toBe(42)
    expect(s.activeChannelIds).toEqual(['radio'])
    expect(s.outfitPresets).toEqual([
      { name: 'Casual', equipped: { outfit: 'discountSuit' } },
    ])
    expect(s.gagCounters).toEqual({ vrboOffers: 5, nextVrboWeek: 30 })
    expect(s.channelMuteUntil).toEqual({ radio: 10 })
  })

  it('fills in a partially-present nested object field by field', () => {
    const s = migrate({ ...V1_SAVE, gagCounters: { vrboOffers: 3 } })!
    expect(s.gagCounters.vrboOffers).toBe(3)
    expect(s.gagCounters.nextVrboWeek).toBe(0)
  })

  it('migrates a null leads array to an empty array instead of throwing', () => {
    expect(() => migrate({ ...V1_SAVE, leads: null })).not.toThrow()
    const s = migrate({ ...V1_SAVE, leads: null })!
    expect(s.leads).toEqual([])
  })
})
