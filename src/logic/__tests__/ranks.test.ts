import { describe, expect, it } from 'vitest'
import { LOCKED_RANKS, RANKS } from '../../data/ranks'
import { initialState } from '../../state/reducer'
import { commissionFor, nextRank } from '../economy'
import type { GameState } from '../../state/types'

function sellerAgentAt(over: Partial<GameState>): GameState {
  return {
    ...initialState(),
    rank: 'sellerAgent',
    careerEarnings: 250000,
    counters: { showingsRun: 60, dealsClosed: 25, leadsLost: 0 },
    reputation: 40,
    ...over,
  }
}

describe('Top Producer', () => {
  it('is the fifth rank and pays a 60% split', () => {
    expect(RANKS).toHaveLength(5)
    expect(RANKS[4].id).toBe('topProducer')
    expect(RANKS[4].split).toBe(0.6)
  })

  it('is no longer in the locked list', () => {
    expect(LOCKED_RANKS).toEqual([
      'Team Lead',
      'Managing Broker',
      'Brokerage Owner',
      'Empire Owner',
    ])
  })

  it('promotes when earnings, deals, and rep are all met', () => {
    expect(nextRank(sellerAgentAt({}))?.id).toBe('topProducer')
  })

  it('withholds promotion when reputation is short', () => {
    expect(nextRank(sellerAgentAt({ reputation: 39 }))).toBeNull()
  })

  it('withholds promotion when deals are short', () => {
    const s = sellerAgentAt({})
    s.counters = { ...s.counters, dealsClosed: 24 }
    expect(nextRank(s)).toBeNull()
  })

  it('withholds promotion when earnings are short', () => {
    expect(nextRank(sellerAgentAt({ careerEarnings: 249999 }))).toBeNull()
  })

  it('has no rank beyond Top Producer', () => {
    expect(nextRank(sellerAgentAt({ rank: 'topProducer' }))).toBeNull()
  })

  it('pays 60% of gross commission at Top Producer', () => {
    // 2.5% of 900,000 = 22,500 gross; 60% = 13,500
    expect(commissionFor(900000, 'topProducer')).toEqual({
      gross: 22500,
      earnings: 13500,
    })
  })

  it('leaves Phase 1 promotion gates working', () => {
    const broke = { ...initialState(), careerEarnings: 1500 }
    expect(nextRank(broke)?.id).toBe('junior')
  })
})
