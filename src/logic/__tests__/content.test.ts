import { describe, expect, it } from 'vitest'
import { initialState } from '../../state/reducer'
import {
  activeCrew,
  biasCount,
  computeChances,
  postAvailable,
  unlockedCrewFor,
} from '../content'
import { postOf } from '../../data/posts'
import { captionOf } from '../../data/captions'
import type { GameState } from '../../state/types'

const base = (over: Partial<GameState> = {}): GameState => ({
  ...initialState(),
  ...over,
})

describe('crew unlock', () => {
  it('starts at none', () => {
    expect(unlockedCrewFor(base())).toBe('none')
  })
  it('freelancer at rep 25', () => {
    expect(unlockedCrewFor(base({ reputation: 25 }))).toBe('freelancer')
  })
  it('freelancer at Buyer Agent rank', () => {
    expect(unlockedCrewFor(base({ rank: 'buyerAgent', reputation: 0 }))).toBe(
      'freelancer',
    )
  })
  it('team at rep 60', () => {
    expect(unlockedCrewFor(base({ reputation: 60 }))).toBe('team')
  })
  it('team at Top Producer rank', () => {
    expect(unlockedCrewFor(base({ rank: 'topProducer', reputation: 0 }))).toBe(
      'team',
    )
  })
})

describe('post availability', () => {
  it('basic always available', () => {
    expect(postAvailable(base(), postOf('marketUpdate')!)).toBe(true)
  })
  it('produced needs freelancer', () => {
    expect(postAvailable(base({ unlockedCrew: 'none' }), postOf('luxuryCar')!)).toBe(
      false,
    )
    expect(
      postAvailable(base({ unlockedCrew: 'freelancer' }), postOf('luxuryCar')!),
    ).toBe(true)
  })
  it('premium needs team', () => {
    expect(
      postAvailable(base({ unlockedCrew: 'freelancer' }), postOf('dancingTour')!),
    ).toBe(false)
    expect(postAvailable(base({ unlockedCrew: 'team' }), postOf('dancingTour')!)).toBe(
      true,
    )
  })
})

describe('chance math (§6.1)', () => {
  it('composes base + mods + caption + ego + underdog', () => {
    const s = base({ reputation: 10, postEgo: 0, unlockedCrew: 'none' })
    const { viral, embarrass } = computeChances(
      s,
      postOf('marketUpdate')!,
      captionOf('professional')!,
    )
    expect(viral).toBeCloseTo(0.05, 5)
    expect(embarrass).toBeCloseTo(0, 5)
  })
  it('crew lowers the embarrass floor and raises viral', () => {
    const s = base({ reputation: 40, unlockedCrew: 'team' })
    const { viral, embarrass } = computeChances(
      s,
      postOf('dancingTour')!,
      captionOf('unhinged')!,
    )
    expect(viral).toBeCloseTo(0.48, 5)
    expect(embarrass).toBeCloseTo(0.172, 5)
  })
  it('clamps to 0.80', () => {
    const s = base({
      reputation: 5,
      unlockedCrew: 'team',
      stats: { ...initialState().stats, ego: 20 },
    })
    const { viral, embarrass } = computeChances(
      s,
      postOf('dancingTour')!,
      captionOf('unhinged')!,
    )
    expect(viral).toBeCloseTo(0.8, 5)
    expect(embarrass).toBeGreaterThanOrEqual(0)
    expect(embarrass).toBeLessThanOrEqual(0.8)
  })
})

describe('biasCount', () => {
  it('counts entries for an archetype', () => {
    const s = base({
      pendingLeadBias: [
        { archetypeId: 'flipBro', weeksLeft: 1 },
        { archetypeId: 'flipBro', weeksLeft: 1 },
        { archetypeId: 'cashChad', weeksLeft: 1 },
      ],
    })
    expect(biasCount(s, 'flipBro')).toBe(2)
    expect(biasCount(s, 'cashChad')).toBe(1)
    expect(biasCount(s, 'firstTimer')).toBe(0)
  })
})

describe('activeCrew', () => {
  it('returns the def for the unlocked tier', () => {
    expect(activeCrew(base({ unlockedCrew: 'team' })).id).toBe('team')
  })
})
