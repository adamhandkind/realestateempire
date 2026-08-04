/* Cross-cutting Phase 3 acceptance criteria. These do not test a single unit —
   they pin the properties that emerge from the whole system and that no single
   task owns. If one of these fails, the fix is in the implementation, not here. */

import { describe, expect, it } from 'vitest'
import { setSeed } from '../rand'
import {
  conditionFactor,
  displayedValue,
  purchaseBaseValue,
} from '../portfolio'
import { initialState, reducer } from '../../state/reducer'
import type { GameState, Listing } from '../../state/types'

const listing: Listing = {
  id: 'LST1',
  typeId: 'starter',
  intrinsicValue: 200000,
  condition: 60,
  askPrice: Math.round(200000 * conditionFactor(60)),
  blurb: 'Good bones. The bones are load-bearing wallpaper.',
  districtId: 'northEnd',
}

/** Ends a week, clearing any queued decision first — END_WEEK refuses to run
 *  while the choice queue is non-empty, so a naive loop stalls silently. */
function advance(s: GameState): GameState {
  if (s.pendingChoices.length > 0) {
    const c = s.pendingChoices[0]
    return reducer(s, {
      type: 'RESOLVE_PORTFOLIO_CHOICE',
      choiceId: c.id,
      actionTag: c.options[0]?.actionTag ?? 'reject',
    })
  }
  return reducer(s, { type: 'END_WEEK' })
}

describe('buying leaves no instant equity', () => {
  it('values a fresh purchase at exactly what was paid, in a normal market', () => {
    const s: GameState = {
      ...initialState(),
      rank: 'sellerAgent',
      cash: 500000,
      marketPool: [listing],
      nextListingId: 2,
    }
    const out = reducer(s, {
      type: 'BUY_PROPERTY',
      listingId: 'LST1',
      downPct: 1,
    })
    expect(displayedValue(out, out.properties[0])).toBe(listing.askPrice)
    expect(purchaseBaseValue(listing)).toBe(listing.askPrice)
  })

  it('returns 15-25% on cash for a financed buy-reno-sell at 60 condition', () => {
    const ask = listing.askPrice
    const down = Math.round(ask * 0.2)
    const balance = ask - down
    const baseValue = purchaseBaseValue(listing)
    const renoCost = Math.round(baseValue * 0.2)
    const after = Math.round(baseValue * 1.3)
    const interest = Math.round(balance * 0.0015) * 5
    const cashIn = down + renoCost + interest
    const profit = after - balance - cashIn
    const roi = profit / cashIn
    expect(roi).toBeGreaterThan(0.15)
    expect(roi).toBeLessThan(0.25)
  })
})

describe('the market Markov chain never jumps', () => {
  it('only ever moves through normal', () => {
    setSeed(77)
    let s: GameState = { ...initialState(), rank: 'topProducer', cash: 200000 }
    /* A crash slams the market to cold outside the chain — it is not a Markov
       step. Each crash therefore breaks the run into a separate chain, and
       only transitions WITHIN a chain are the thing under test. */
    const chains: string[][] = [[s.marketState]]
    let crashed = false
    for (let i = 0; i < 600; i++) {
      s = advance(s)
      if (s.crash.weeksLeft > 0) {
        crashed = true
        continue
      }
      if (crashed) {
        chains.push([s.marketState])
        crashed = false
        continue
      }
      const chain = chains[chains.length - 1]
      if (s.marketState !== chain[chain.length - 1]) chain.push(s.marketState)
      if (s.gameOver) break
    }
    setSeed(null)
    const seen = chains.flat()
    for (const chain of chains)
      for (let i = 1; i < chain.length; i++) {
        const from = chain[i - 1]
        const to = chain[i]
        expect(from === 'hot' && to === 'cold').toBe(false)
        expect(from === 'cold' && to === 'hot').toBe(false)
      }
    /* The run has to actually exercise a transition for the above to mean
       anything. */
    expect(seen.length).toBeGreaterThan(1)
  })
})

describe('only diegetic numbers reach the log', () => {
  it('never writes a bare probability into a log line', () => {
    setSeed(21)
    let s: GameState = { ...initialState(), rank: 'topProducer', cash: 400000 }
    for (let i = 0; i < 120 && !s.gameOver; i++) s = advance(s)
    setSeed(null)
    const suspicious = s.log.filter((l) =>
      /\b0\.\d+\b|\d+% chance/i.test(l.text),
    )
    expect(suspicious.map((l) => l.text)).toEqual([])
  })
})
