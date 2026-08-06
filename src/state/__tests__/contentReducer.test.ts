import { describe, expect, it } from 'vitest'
import { reducer, initialState, endWeek } from '../reducer'
import { setSeed } from '../../logic/rand'
import type { GameState } from '../types'

const withComposer = (over: Partial<GameState> = {}): GameState => ({
  ...initialState(),
  rngSeed: 1,
  postComposerPending: true,
  postComposerWeek: 5,
  week: 6,
  summary: {
    week: 5,
    moneyIn: [],
    moneyOut: [],
    events: [],
    marketing: { spend: 0, leads: 0, repChange: 0 },
    portfolio: [],
    territory: { rows: [], rivalMoves: [] },
    net: 0,
    promo: null,
    brag: 'x',
    content: null,
  },
  ...over,
})

describe('SET_CONTENT_ENABLED', () => {
  it('toggles the flag', () => {
    const s = reducer(initialState(), { type: 'SET_CONTENT_ENABLED', enabled: false })
    expect(s.contentEnabled).toBe(false)
  })
})

describe('CREATE_POST neutral', () => {
  it('applies base rep×caption, seeds bias, records history, clears pending', () => {
    const s0 = withComposer({ reputation: 40, unlockedCrew: 'none' })
    const s = reducer(s0, {
      type: 'CREATE_POST',
      postId: 'familyAuthenticity',
      captionId: 'professional',
    })
    expect(s.reputation).toBe(44) // +3 * 1.2 = 3.6 -> round 4
    expect(s.postComposerPending).toBe(false)
    expect(s.lastPost?.postId).toBe('familyAuthenticity')
    expect(s.lastPost?.outcome).toBe('neutral')
    expect(s.contentHistory.length).toBe(1)
    expect(s.contentStats.posts).toBe(1)
    expect(s.pendingLeadBias.length).toBeGreaterThan(0)
    expect(s.summary?.content?.postId).toBe('familyAuthenticity')
  })
})

describe('SKIP_POST streak', () => {
  it('decays rep by 1 on the third consecutive skip', () => {
    let s = withComposer({
      reputation: 40,
      contentStats: { posts: 0, viral: 0, embarrassed: 0, skipStreak: 2 },
    })
    s = reducer(s, { type: 'SKIP_POST' })
    expect(s.contentStats.skipStreak).toBe(3)
    expect(s.reputation).toBe(39)
    expect(s.postComposerPending).toBe(false)
    expect(s.summary?.content).toBeNull()
  })
  it('any post resets the streak', () => {
    const s = reducer(
      withComposer({
        reputation: 40,
        contentStats: { posts: 0, viral: 0, embarrassed: 0, skipStreak: 2 },
      }),
      { type: 'CREATE_POST', postId: 'marketUpdate', captionId: 'professional' },
    )
    expect(s.contentStats.skipStreak).toBe(0)
  })
})

describe('DEBUG_FORCE_POST_OUTCOME', () => {
  it('viral applies bonus rep and close modifier', () => {
    let s = withComposer({ reputation: 40, unlockedCrew: 'team' })
    s = reducer(s, { type: 'DEBUG_FORCE_POST_OUTCOME', outcome: 'viral' })
    s = reducer(s, {
      type: 'CREATE_POST',
      postId: 'justListedVideo',
      captionId: 'humble',
    })
    expect(s.lastPost?.outcome).toBe('viral')
    expect(s.contentStats.viral).toBe(1)
    expect(s.activeModifiers.some((m) => m.id === 'viralMoment')).toBe(true)
  })
  it('embarrass applies bigger rep loss at high rep and seeds nothing', () => {
    let s = withComposer({ reputation: 80, unlockedCrew: 'team', pendingLeadBias: [] })
    s = reducer(s, { type: 'DEBUG_FORCE_POST_OUTCOME', outcome: 'embarrass' })
    s = reducer(s, {
      type: 'CREATE_POST',
      postId: 'dancingTour',
      captionId: 'professional',
    })
    expect(s.reputation).toBe(67) // 80 - (8 + 5)
    expect(s.pendingLeadBias.length).toBe(0)
    expect(s.contentStats.embarrassed).toBe(1)
  })
})

describe('endWeek opens the composer', () => {
  it('sets postComposerPending once per week', () => {
    setSeed(999)
    const s = endWeek({ ...initialState(), rngSeed: 999 })
    expect(s.postComposerPending).toBe(true)
    expect(s.postComposerWeek).toBe(s.week)
    expect(s.summary?.content).toBeNull()
  })
  it('does not open when contentEnabled is false', () => {
    setSeed(999)
    const s = endWeek({ ...initialState(), contentEnabled: false, rngSeed: 999 })
    expect(s.postComposerPending).toBe(false)
  })
})

describe('endWeek crew recompute is a high-water mark', () => {
  it('does not downgrade unlockedCrew when rank/rep drop below team threshold', () => {
    setSeed(999)
    const s = endWeek({
      ...initialState(),
      rngSeed: 999,
      unlockedCrew: 'team',
      rank: 'receptionist',
      reputation: 0,
    })
    expect(s.unlockedCrew).toBe('team')
  })
})
