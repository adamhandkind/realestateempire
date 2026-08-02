import { describe, expect, it } from 'vitest'
import { initialState, reducer } from '../reducer'
import type { GameState } from '../types'

const at = (over: Partial<GameState> = {}): GameState => ({
  ...initialState(),
  rank: 'topProducer',
  reputation: 60,
  cash: 900000,
  ...over,
})

describe('TOGGLE_CHANNEL', () => {
  it('turns an unlocked channel on and off', () => {
    const on = reducer(at(), { type: 'TOGGLE_CHANNEL', channelId: 'instagram' })
    expect(on.activeChannelIds).toEqual(['instagram'])
    const off = reducer(on, { type: 'TOGGLE_CHANNEL', channelId: 'instagram' })
    expect(off.activeChannelIds).toEqual([])
  })

  it('logs switching a channel on and off', () => {
    const on = reducer(at(), { type: 'TOGGLE_CHANNEL', channelId: 'instagram' })
    expect(on.log[0].text).toContain('Instagram')
    const off = reducer(on, { type: 'TOGGLE_CHANNEL', channelId: 'instagram' })
    expect(off.log[0].text).not.toEqual(on.log[0].text)
  })

  it('refuses a rank-locked channel', () => {
    const s = reducer(at({ rank: 'buyerAgent' }), {
      type: 'TOGGLE_CHANNEL',
      channelId: 'tvCommercial',
    })
    expect(s.activeChannelIds).toEqual([])
  })

  it('refuses a rep-locked channel', () => {
    const s = reducer(at({ reputation: 10, rank: 'sellerAgent' }), {
      type: 'TOGGLE_CHANNEL',
      channelId: 'billboard',
    })
    expect(s.activeChannelIds).toEqual([])
  })

  it('ignores an unknown channel id', () => {
    const s = reducer(at(), { type: 'TOGGLE_CHANNEL', channelId: 'skywriting' })
    expect(s.activeChannelIds).toEqual([])
  })

  it('lets a channel be switched off even after it becomes locked', () => {
    // The player turned on the billboard at rep 60, then reputation decayed.
    const running = reducer(at(), { type: 'TOGGLE_CHANNEL', channelId: 'billboard' })
    const slipped = { ...running, reputation: 5 }
    const off = reducer(slipped, { type: 'TOGGLE_CHANNEL', channelId: 'billboard' })
    expect(off.activeChannelIds).toEqual([])
  })

  it('costs no action points', () => {
    const s = reducer(at({ ap: 3 }), { type: 'TOGGLE_CHANNEL', channelId: 'instagram' })
    expect(s.ap).toBe(3)
  })
})

describe('presets', () => {
  const equipped = { outfit: 'discountSuit', accessory: 'gasSunnies' }
  const owner = (over: Partial<GameState> = {}) =>
    at({ equipped, ownedSwagIds: ['discountSuit', 'gasSunnies'], ...over })

  it('saves the current loadout into a slot', () => {
    const s = reducer(owner(), { type: 'SAVE_PRESET', index: 0, name: 'Full Gremlin' })
    expect(s.outfitPresets[0]).toEqual({ name: 'Full Gremlin', equipped })
  })

  it('supports three independent slots', () => {
    let s = reducer(owner(), { type: 'SAVE_PRESET', index: 0, name: 'A' })
    s = reducer({ ...s, equipped: {} }, { type: 'SAVE_PRESET', index: 2, name: 'C' })
    expect(s.outfitPresets[0].name).toBe('A')
    expect(s.outfitPresets[2]).toEqual({ name: 'C', equipped: {} })
  })

  it('rejects an out-of-range slot', () => {
    expect(reducer(owner(), { type: 'SAVE_PRESET', index: 3, name: 'nope' }).outfitPresets)
      .toEqual([])
    expect(reducer(owner(), { type: 'SAVE_PRESET', index: -1, name: 'nope' }).outfitPresets)
      .toEqual([])
  })

  it('snapshots the loadout rather than aliasing it', () => {
    const s = reducer(owner(), { type: 'SAVE_PRESET', index: 0, name: 'Snap' })
    const changed = reducer(s, { type: 'EQUIP_SWAG', itemId: 'gasSunnies' })
    expect(changed.outfitPresets[0].equipped).toEqual(equipped)
  })

  it('loads a preset back in one action', () => {
    const saved = reducer(owner(), { type: 'SAVE_PRESET', index: 1, name: 'Otis Mode' })
    const stripped = { ...saved, equipped: {} }
    const loaded = reducer(stripped, { type: 'LOAD_PRESET', index: 1 })
    expect(loaded.equipped).toEqual(equipped)
  })

  it('drops preset entries for items no longer owned', () => {
    const saved = reducer(
      at({ equipped, ownedSwagIds: ['discountSuit'] }),
      { type: 'SAVE_PRESET', index: 0, name: 'Stale' },
    )
    const loaded = reducer({ ...saved, equipped: {} }, { type: 'LOAD_PRESET', index: 0 })
    expect(loaded.equipped).toEqual({ outfit: 'discountSuit' })
  })

  it('recomputes derived stats when a preset is loaded', () => {
    const saved = reducer(owner(), { type: 'SAVE_PRESET', index: 0, name: 'Loud' })
    const stripped = { ...saved, equipped: {} }
    const loaded = reducer(stripped, { type: 'LOAD_PRESET', index: 0 })
    expect(loaded.stats.swagger).toBeGreaterThan(1)
  })

  it('does nothing when loading an empty slot', () => {
    const s = reducer(owner(), { type: 'LOAD_PRESET', index: 0 })
    expect(s.equipped).toEqual(equipped)
  })

  it('renames a saved preset without touching its loadout', () => {
    const saved = reducer(owner(), { type: 'SAVE_PRESET', index: 0, name: 'Old' })
    const renamed = reducer(saved, { type: 'RENAME_PRESET', index: 0, name: 'New' })
    expect(renamed.outfitPresets[0].name).toBe('New')
    expect(renamed.outfitPresets[0].equipped).toEqual(equipped)
  })

  it('does nothing when renaming an empty slot', () => {
    const s = reducer(owner(), { type: 'RENAME_PRESET', index: 0, name: 'Ghost' })
    expect(s.outfitPresets).toEqual([])
  })

  it('costs no action points to save or wear a loadout', () => {
    const saved = reducer(owner({ ap: 2 }), { type: 'SAVE_PRESET', index: 0, name: 'A' })
    expect(saved.ap).toBe(2)
    expect(reducer(saved, { type: 'LOAD_PRESET', index: 0 }).ap).toBe(2)
  })
})
