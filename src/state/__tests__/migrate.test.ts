import { describe, expect, it } from 'vitest'
import { migrate } from '../migrate'
import { initialState } from '../reducer'

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
    /* The original entry, plus Phase 7's inaugural-Goldies announcement and
       Phase 9's "start posting more" line. */
    expect(s.log).toHaveLength(3)
    expect(s.log[2].text).toBe('something happened')
    expect(s.log[1].text).toContain('Golden Lockbox Awards')
    expect(s.log[0].text).toContain('start posting more')
  })

  it('fills every new v2 field with a default', () => {
    const s = migrate(V1_SAVE)!
    expect(s.version).toBe(9)
    expect(s.reputation).toBe(0)
    expect(s.activeChannelIds).toEqual([])
    expect(s.outfitPresets).toEqual([null, null, null])
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
      null,
      null,
    ])
    expect(s.gagCounters).toEqual({
      vrboOffers: 5,
      nextVrboWeek: 30,
      vrboOwned: false,
      vrboDeclinedForever: false,
      daveReviewLine: false,
      chipPromoRanks: [],
      blaineDrySpell: false,
    })
    expect(s.channelMuteUntil).toEqual({ radio: 10 })
  })

  it('fills in a partially-present nested object field by field', () => {
    const s = migrate({ ...V1_SAVE, gagCounters: { vrboOffers: 3 } })!
    expect(s.gagCounters.vrboOffers).toBe(3)
    // A migrating player gets two weeks of peace before the wholesaler
    // finds them again. V1_SAVE is at week 22.
    expect(s.gagCounters.nextVrboWeek).toBe(24)
  })

  it('migrates a null leads array to an empty array instead of throwing', () => {
    expect(() => migrate({ ...V1_SAVE, leads: null })).not.toThrow()
    const s = migrate({ ...V1_SAVE, leads: null })!
    expect(s.leads).toEqual([])
  })
})

describe('v2 -> v3 migration', () => {
  it('adds every Phase 3 field with its default', () => {
    /* A genuine v2 save has none of the Phase 3 keys on it at all. Seller
       Agent is the first rank with anything on the market, so this is the
       earliest save that migrates into a full four-listing pool. */
    const v2: Record<string, unknown> = {
      ...initialState(),
      version: 2,
      week: 31,
      cash: 42000,
      rank: 'sellerAgent',
    }
    delete v2.peakNetWorth
    delete v2.firstP3Week
    const out = migrate(v2)!
    expect(out.version).toBe(9)
    expect(out.properties).toEqual([])
    expect(out.marketState).toBe('normal')
    expect(out.crash).toEqual({ weeksLeft: 0, lastCrashWeek: -999 })
    expect(out.marketPool).toHaveLength(4)
    expect(out.milestonesUnlocked).toEqual([])
    expect(out.propCoActive).toBe(false)
    expect(out.pendingChoices).toEqual([])
    expect(out.nextPropertyId).toBe(1)
    expect(out.nextChoiceId).toBe(1)
    expect(out.peakNetWorth).toBe(42000)
    expect(out.firstP3Week).toBe(31)
    expect(out.gagCounters.vrboOwned).toBe(false)
    expect(out.gagCounters.vrboDeclinedForever).toBe(false)
  })

  it('keeps Phase 2 progress intact', () => {
    const v2 = {
      ...initialState(),
      version: 2,
      reputation: 55,
      activeChannelIds: ['tiktok'],
      rank: 'topProducer',
    }
    const out = migrate(v2)!
    expect(out.reputation).toBe(55)
    expect(out.activeChannelIds).toEqual(['tiktok'])
    expect(out.rank).toBe('topProducer')
  })

  it('chain-migrates a v1 save', () => {
    const v1 = { version: 1, week: 3, cash: 900, rank: 'sellerAgent' }
    const out = migrate(v1)!
    expect(out.version).toBe(9)
    expect(out.reputation).toBe(0)
    expect(out.marketPool).toHaveLength(4)
  })

  it('rejects an unknown version', () => {
    expect(migrate({ version: 10 })).toBeNull()
  })

  it('preserves an existing Phase 3 save', () => {
    const v3 = { ...initialState(), milestonesUnlocked: ['mogul250'] }
    expect(migrate(v3)!.milestonesUnlocked).toEqual(['mogul250'])
  })
})

describe('phase 8 migration', () => {
  const v5 = () => ({ ...initialState(), version: 5 }) as unknown

  it('defaults the phase 8 fields on a v5 save', () => {
    const out = migrate(v5())!
    expect(out.version).toBe(9)
    expect(out.call).toBeNull()
    expect(out.callsEnabled).toBe(true)
    expect(out.callStats).toEqual({ calls: 0, perfectCalls: 0, hangups: 0 })
  })

  it('accepts a v7 save', () => {
    const out = migrate({ ...initialState(), version: 7 })
    expect(out).not.toBeNull()
    expect(out!.version).toBe(9)
  })

  /* Phase 7 (the Goldies) also shipped as v6, so a save written by it is the
     realistic upgrade path into Phase 8 — not a hypothetical. Its awards state
     must survive untouched while the call fields get their defaults. */
  it('carries a Phase 7 save forward without disturbing its trophies', () => {
    const v6 = {
      ...initialState(),
      version: 6,
      trophies: [{ awardId: 'hustle', seasonIndex: 1, displayed: true }],
      seasonStartWeek: 14,
      sponsorCringeSeasons: 2,
    }
    delete (v6 as Record<string, unknown>).call
    delete (v6 as Record<string, unknown>).callsEnabled
    delete (v6 as Record<string, unknown>).callStats
    const out = migrate(v6)!
    expect(out.version).toBe(9)
    expect(out.trophies).toHaveLength(1)
    expect(out.seasonStartWeek).toBe(14)
    expect(out.sponsorCringeSeasons).toBe(2)
    expect(out.call).toBeNull()
    expect(out.callsEnabled).toBe(true)
    expect(out.callStats).toEqual({ calls: 0, perfectCalls: 0, hangups: 0 })
  })

  it('rejects a version from the future', () => {
    expect(migrate({ ...initialState(), version: 10 })).toBeNull()
  })

  it('preserves a player toggle of callsEnabled', () => {
    const out = migrate({ ...initialState(), version: 6, callsEnabled: false })!
    expect(out.callsEnabled).toBe(false)
  })

  /* The default path is covered above. This covers the other branch: real
     values surviving a reload. Without it, transposing two of the three keys
     would pass every other test in this file. */
  it('round-trips a non-default callStats', () => {
    const out = migrate({
      ...initialState(),
      version: 6,
      callStats: { calls: 7, perfectCalls: 2, hangups: 1 },
    })!
    expect(out.callStats).toEqual({ calls: 7, perfectCalls: 2, hangups: 1 })
  })

  it('discards a call that was open when the tab died, and says so', () => {
    const mid = {
      ...initialState(),
      version: 6,
      leads: [
        {
          id: 'L1',
          archetypeId: 'luxLorenzo',
          clientName: 'Marta Vance',
          stage: 'ready',
          salePrice: 800000,
          patience: 3,
          maxPatience: 3,
          retriedClose: false,
          createdWeek: 1,
          intro: 'x',
          referralBonus: false,
          districtId: 'downtown',
        },
      ],
      call: {
        leadId: 'L1',
        turn: 2,
        momentum: 12,
        history: [],
        usedTactics: [],
        usedBeatIds: [],
        currentBeatId: 't1_lux',
        revealedTells: [],
        phase: 'awaitingTactic',
        outcome: null,
      },
    }
    const out = migrate(mid)!
    expect(out.call).toBeNull()
    /* The lead survives untouched — no patience drain, no removal. */
    expect(out.leads).toHaveLength(1)
    expect(out.leads[0].patience).toBe(3)
    expect(out.leads[0].retriedClose).toBe(false)
    expect(out.log[0].text).toContain('The line dropped')
    expect(out.log[0].text).toContain('Marta Vance')
  })
})

describe('v9 migration (phase 9)', () => {
  it('defaults new fields and recomputes crew for an established save', () => {
    const v8 = { version: 8, week: 30, reputation: 65, rank: 'topProducer' }
    const out = migrate(v8)!
    expect(out.version).toBe(9)
    expect(out.postEgo).toBe(0)
    expect(out.pendingLeadBias).toEqual([])
    expect(out.contentHistory).toEqual([])
    expect(out.contentStats).toEqual({
      posts: 0,
      viral: 0,
      embarrassed: 0,
      skipStreak: 0,
    })
    expect(out.contentEnabled).toBe(true)
    expect(out.unlockedCrew).toBe('team') // rep 65 / Top Producer
    expect(out.postComposerPending).toBe(false)
    expect(out.debugForcedPostOutcome).toBeNull()
    expect(out.log.some((l) => l.text.includes('start posting more'))).toBe(true)
  })
  it('keeps existing reputation and recomputes freelancer crew', () => {
    const out = migrate({ version: 8, reputation: 42 })!
    expect(out.reputation).toBe(42)
    expect(out.unlockedCrew).toBe('freelancer')
  })
  it('round-trips a v9 save without re-logging the migration line', () => {
    const v9 = migrate({ version: 8, reputation: 42 })!
    const again = migrate(v9)!
    expect(again.version).toBe(9)
    // the migration line fires only for pre-phase-9 saves (no contentStats)
    const count = again.log.filter((l) =>
      l.text.includes('start posting more'),
    ).length
    expect(count).toBeLessThanOrEqual(1)
  })
})
