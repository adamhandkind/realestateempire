import { describe, expect, it } from 'vitest'
import { ARCHETYPES } from '../../data/archetypes'
import { CHANNELS, INBOUND_LINES, TIKTOK_GHOST_RATE } from '../../data/marketing'
import { initialState } from '../../state/reducer'
import {
  activeChannels,
  channelOf,
  isChannelLocked,
  isChannelMuted,
  rollInbound,
  weeklyChannelRep,
  weeklyChannelSpend,
} from '../marketing'
import { setSeed } from '../rand'
import type { GameState } from '../../state/types'

const at = (over: Partial<GameState> = {}): GameState => ({
  ...initialState(),
  rank: 'topProducer',
  reputation: 80,
  ...over,
})

describe('channel data', () => {
  it('defines all nine channels', () => {
    expect(CHANNELS.map((c) => c.id)).toEqual([
      'flyerBlitz',
      'facebookAds',
      'instagram',
      'tiktok',
      'newspaperColumn',
      'communitySponsorship',
      'benchDomination',
      'billboard',
      'tvCommercial',
    ])
  })

  it('totals roughly $5,400/wk and +17 rep/wk with everything active', () => {
    expect(CHANNELS.reduce((t, c) => t + c.weeklyCost, 0)).toBe(5400)
    expect(CHANNELS.reduce((t, c) => t + c.repPerWeek, 0)).toBe(17)
  })

  it('gives every channel a log line and a plausible inbound chance', () => {
    CHANNELS.forEach((c) => {
      expect(INBOUND_LINES[c.id]).toBeTruthy()
      expect(c.inboundChance).toBeGreaterThan(0)
      expect(c.inboundChance).toBeLessThanOrEqual(1)
    })
  })

  it('only skews toward archetypes that actually exist', () => {
    const known = new Set(ARCHETYPES.map((a) => a.id))
    CHANNELS.forEach((c) => {
      c.leadPool.forEach((id) => expect(known).toContain(id))
    })
  })
})

describe('locking', () => {
  it('locks the billboard below rep 30', () => {
    expect(
      isChannelLocked(at({ reputation: 29, rank: 'sellerAgent' }), channelOf('billboard')!),
    ).toBe(true)
    expect(
      isChannelLocked(at({ reputation: 30, rank: 'sellerAgent' }), channelOf('billboard')!),
    ).toBe(false)
  })

  it('locks the TV commercial below Top Producer', () => {
    expect(
      isChannelLocked(at({ rank: 'sellerAgent' }), channelOf('tvCommercial')!),
    ).toBe(true)
    expect(isChannelLocked(at(), channelOf('tvCommercial')!)).toBe(false)
  })

  it('locks seller-rank channels for a buyer agent', () => {
    expect(
      isChannelLocked(at({ rank: 'buyerAgent' }), channelOf('benchDomination')!),
    ).toBe(true)
    expect(isChannelLocked(at({ rank: 'buyerAgent' }), channelOf('flyerBlitz')!)).toBe(
      false,
    )
  })

  it('returns undefined for an unknown channel id', () => {
    expect(channelOf('skywriting')).toBeUndefined()
  })
})

describe('weekly totals', () => {
  const s = at({ activeChannelIds: ['flyerBlitz', 'billboard', 'tvCommercial'] })

  it('sums the spend of active channels only', () => {
    expect(weeklyChannelSpend(s)).toBe(100 + 1000 + 2500)
    expect(weeklyChannelSpend(at())).toBe(0)
  })

  it('sums rep per week of active channels only', () => {
    expect(weeklyChannelRep(s)).toBe(0 + 3 + 5)
  })

  it('returns the active channel definitions in table order', () => {
    const scrambled = at({
      activeChannelIds: ['tvCommercial', 'flyerBlitz', 'billboard'],
    })
    expect(activeChannels(scrambled).map((c) => c.id)).toEqual([
      'flyerBlitz',
      'billboard',
      'tvCommercial',
    ])
  })

  it('ignores an unknown id sitting in activeChannelIds', () => {
    expect(weeklyChannelSpend(at({ activeChannelIds: ['skywriting'] }))).toBe(0)
  })
})

describe('muting', () => {
  it('treats a channel as muted until its mute week', () => {
    const s = at({ week: 10, channelMuteUntil: { tiktok: 12 } })
    expect(isChannelMuted(s, 'tiktok')).toBe(true)
    expect(isChannelMuted({ ...s, week: 12 }, 'tiktok')).toBe(false)
    expect(isChannelMuted(s, 'billboard')).toBe(false)
  })
})

describe('rollInbound', () => {
  it('produces nothing for a muted channel even at 100% chance', () => {
    const s = at({ week: 5, channelMuteUntil: { tiktok: 9 } })
    const forced = { ...channelOf('tiktok')!, inboundChance: 1 }
    setSeed(3)
    expect(rollInbound(s, forced)).toBeNull()
  })

  it('always produces a lead at 100% chance, tagged with the channel', () => {
    setSeed(5)
    const forced = { ...channelOf('billboard')!, inboundChance: 1 }
    const lead = rollInbound(at(), forced)
    expect(lead).not.toBeNull()
    expect(lead!.channelId).toBe('billboard')
  })

  it('never produces a lead at 0% chance', () => {
    setSeed(6)
    const forced = { ...channelOf('billboard')!, inboundChance: 0 }
    expect(rollInbound(at(), forced)).toBeNull()
  })

  it('never produces an archetype the player cannot legally have', () => {
    setSeed(7)
    // A buyer agent at rep 0 must never receive a seller-band or rep-gated client.
    const s = at({ rank: 'buyerAgent', reputation: 0 })
    const forced = { ...channelOf('billboard')!, inboundChance: 1 }
    for (let i = 0; i < 200; i++) {
      const l = rollInbound(s, forced)!
      expect(['oldMoneyOtis', 'celebrityCleo', 'luxLorenzo', 'techTyler']).not.toContain(
        l.archetypeId,
      )
    }
  })

  it('skews toward its lead pool most of the time', () => {
    setSeed(99)
    const forced = { ...channelOf('billboard')!, inboundChance: 1 }
    const s = at()
    let inPool = 0
    for (let i = 0; i < 200; i++) {
      const l = rollInbound(s, forced)!
      if (forced.leadPool.includes(l.archetypeId)) inPool++
    }
    expect(inPool).toBeGreaterThan(135)
  })

  it('sends a share of TikTok leads to ghostGary', () => {
    setSeed(123)
    const forced = { ...channelOf('tiktok')!, inboundChance: 1 }
    const s = at()
    let gary = 0
    for (let i = 0; i < 400; i++) {
      if (rollInbound(s, forced)!.archetypeId === 'ghostGary') gary++
    }
    expect(TIKTOK_GHOST_RATE).toBe(0.3)
    expect(gary).toBeGreaterThan(80)
    expect(gary).toBeLessThan(170)
  })
})
