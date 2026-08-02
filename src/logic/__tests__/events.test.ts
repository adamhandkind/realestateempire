import { describe, expect, it } from 'vitest'
import { EVENTS, VRBO_PITCHES } from '../../data/events'
import { endWeek, initialState, reducer } from '../../state/reducer'
import {
  applyEvent,
  badReviewWeight,
  scheduleNextVrbo,
  vrboDue,
} from '../events'
import { setSeed } from '../rand'
import type { EventDef, GameState } from '../../state/types'

const def = (id: string): EventDef => EVENTS.find((e) => e.id === id)!
const at = (over: Partial<GameState> = {}): GameState => ({
  ...initialState(),
  week: 12,
  rank: 'sellerAgent',
  cash: 40000,
  reputation: 55,
  ...over,
})

describe('event table', () => {
  it('registers all seven new events', () => {
    ;[
      'viralSuccess',
      'badReview',
      'vrboSpam',
      'tvInterview',
      'algorithmChange',
      'copycatAgent',
      'charityGala',
    ].forEach((id) => expect(EVENTS.some((e) => e.id === id)).toBe(true))
  })

  it('keeps every Phase 1 event registered', () => {
    ;[
      'ghosted',
      'lockbox',
      'poached',
      'referral',
      'hotMarket',
      'rateSpike',
      'lostPaperwork',
      'openHouseDisaster',
      'fiveStarReview',
    ].forEach((id) => expect(EVENTS.some((e) => e.id === id)).toBe(true))
  })

  it('gates viralSuccess on having a channel active', () => {
    expect(def('viralSuccess').condition(at())).toBe(false)
    expect(def('viralSuccess').condition(at({ activeChannelIds: ['tiktok'] }))).toBe(true)
  })

  it('gates badReview on three closed deals', () => {
    const s = at()
    expect(def('badReview').condition(s)).toBe(false)
    s.counters = { ...s.counters, dealsClosed: 3 }
    expect(def('badReview').condition(s)).toBe(true)
  })

  it('gates tvInterview on rep 50 and charityGala on rep 30', () => {
    expect(def('tvInterview').condition(at({ reputation: 49 }))).toBe(false)
    expect(def('tvInterview').condition(at({ reputation: 50 }))).toBe(true)
    expect(def('charityGala').condition(at({ reputation: 29 }))).toBe(false)
    expect(def('charityGala').condition(at({ reputation: 30 }))).toBe(true)
  })

  it('gates algorithmChange on TikTok being active', () => {
    expect(def('algorithmChange').condition(at())).toBe(false)
    expect(def('algorithmChange').condition(at({ activeChannelIds: ['tiktok'] }))).toBe(
      true,
    )
  })

  it('gates copycatAgent on billboard or bench', () => {
    expect(def('copycatAgent').condition(at())).toBe(false)
    expect(def('copycatAgent').condition(at({ activeChannelIds: ['billboard'] }))).toBe(
      true,
    )
    expect(
      def('copycatAgent').condition(at({ activeChannelIds: ['benchDomination'] })),
    ).toBe(true)
  })

  it('gates vrboSpam on the seller ranks', () => {
    expect(def('vrboSpam').condition(at({ rank: 'buyerAgent' }))).toBe(false)
    expect(def('vrboSpam').condition(at({ rank: 'sellerAgent' }))).toBe(true)
    expect(def('vrboSpam').condition(at({ rank: 'topProducer' }))).toBe(true)
  })
})

describe('community sponsorship suppresses bad reviews', () => {
  it('halves the badReview weight while active', () => {
    expect(badReviewWeight(at())).toBe(8)
    expect(badReviewWeight(at({ activeChannelIds: ['communitySponsorship'] }))).toBe(4)
  })
})

describe('applyEvent — new outcomes', () => {
  it('viralSuccess grants ten reputation and three inbound leads', () => {
    setSeed(61)
    const r = applyEvent(at({ activeChannelIds: ['tiktok'], reputation: 40 }), 'viralSuccess')
    expect(r.state.reputation).toBe(50)
    expect(r.state.leads).toHaveLength(3)
  })

  it('badReview costs eight reputation and two hundred dollars', () => {
    setSeed(62)
    const r = applyEvent(at({ reputation: 40 }), 'badReview')
    expect(r.state.reputation).toBe(32)
    expect(r.cashDelta).toBe(-200)
  })

  it('algorithmChange mutes TikTok for two weeks without refunding it', () => {
    setSeed(63)
    const r = applyEvent(at({ week: 12, activeChannelIds: ['tiktok'] }), 'algorithmChange')
    expect(r.state.channelMuteUntil.tiktok).toBe(14)
    expect(r.state.activeChannelIds).toContain('tiktok')
    expect(r.cashDelta).toBe(0)
  })

  it('cringeEvent leaves reputation alone below fifty', () => {
    setSeed(64)
    const r = applyEvent(at({ reputation: 49 }), 'cringeEvent')
    expect(r.state.reputation).toBe(49)
  })

  it('cringeEvent costs five reputation at fifty and above', () => {
    setSeed(65)
    const r = applyEvent(at({ reputation: 60 }), 'cringeEvent')
    expect(r.state.reputation).toBe(55)
  })

  it('cringeEvent still costs a hundred dollars either way', () => {
    setSeed(66)
    expect(applyEvent(at({ reputation: 10 }), 'cringeEvent').cashDelta).toBe(-100)
    expect(applyEvent(at({ reputation: 80 }), 'cringeEvent').cashDelta).toBe(-100)
  })
})

describe('choice events', () => {
  it('vrboSpam raises a decline-only modal and bumps the counter', () => {
    setSeed(71)
    const r = applyEvent(at(), 'vrboSpam')
    expect(r.state.pendingChoice!.id).toBe('vrboSpam')
    expect(r.state.pendingChoice!.options).toHaveLength(1)
    expect(r.state.pendingChoice!.options[0].key).toBe('decline')
    expect(r.state.gagCounters.vrboOffers).toBe(1)
  })

  it('escalates the VRBO pitch on each offer', () => {
    expect(VRBO_PITCHES).toHaveLength(5)
    setSeed(72)
    const first = applyEvent(at(), 'vrboSpam')
    const second = applyEvent(first.state, 'vrboSpam')
    expect(first.state.pendingChoice!.body).toBe(VRBO_PITCHES[0])
    expect(second.state.pendingChoice!.body).toBe(VRBO_PITCHES[1])
  })

  it('clamps the pitch at the last one', () => {
    setSeed(73)
    const r = applyEvent(
      at({ gagCounters: { vrboOffers: 40, nextVrboWeek: 0 } }),
      'vrboSpam',
    )
    expect(r.state.pendingChoice!.body).toBe(VRBO_PITCHES[4])
  })

  it('tvInterview humble path adds eight reputation', () => {
    setSeed(74)
    const raised = applyEvent(at({ reputation: 55 }), 'tvInterview').state
    const done = reducer(raised, { type: 'RESOLVE_CHOICE_EVENT', key: 'humble' })
    expect(done.reputation).toBe(63)
    expect(done.pendingChoice).toBeNull()
  })

  it('tvInterview ego path adds four reputation and a permanent ego point', () => {
    setSeed(75)
    const raised = applyEvent(at({ reputation: 55 }), 'tvInterview').state
    const done = reducer(raised, { type: 'RESOLVE_CHOICE_EVENT', key: 'ego' })
    expect(done.reputation).toBe(59)
    expect(done.permBonuses.ego).toBe(1)
  })

  it('copycat: paying five hundred buys two reputation, doing nothing costs three', () => {
    setSeed(76)
    const raised = applyEvent(at({ reputation: 50, cash: 40000 }), 'copycatAgent').state
    const paid = reducer(raised, { type: 'RESOLVE_CHOICE_EVENT', key: 'cease' })
    expect(paid.reputation).toBe(52)
    expect(paid.cash).toBe(39500)
    const ate = reducer(raised, { type: 'RESOLVE_CHOICE_EVENT', key: 'eat' })
    expect(ate.reputation).toBe(47)
    expect(ate.cash).toBe(40000)
  })

  it('gala: attending costs five hundred, adds five rep and a lead', () => {
    setSeed(77)
    const raised = applyEvent(at({ reputation: 40, leads: [] }), 'charityGala').state
    const went = reducer(raised, { type: 'RESOLVE_CHOICE_EVENT', key: 'attend' })
    expect(went.reputation).toBe(45)
    expect(went.cash).toBe(39500)
    expect(went.leads).toHaveLength(1)
    const skipped = reducer(raised, { type: 'RESOLVE_CHOICE_EVENT', key: 'skip' })
    expect(skipped.reputation).toBe(40)
    expect(skipped.leads).toHaveLength(0)
  })

  it('clears the modal on any valid answer', () => {
    setSeed(78)
    const raised = applyEvent(at(), 'charityGala').state
    expect(reducer(raised, { type: 'RESOLVE_CHOICE_EVENT', key: 'skip' }).pendingChoice)
      .toBeNull()
  })

  it('ignores a resolve action when no modal is open', () => {
    const s = at()
    expect(reducer(s, { type: 'RESOLVE_CHOICE_EVENT', key: 'skip' })).toEqual(s)
  })

  it('ignores an answer that is not one of the offered options', () => {
    setSeed(79)
    const raised = applyEvent(at(), 'vrboSpam').state
    const s = reducer(raised, { type: 'RESOLVE_CHOICE_EVENT', key: 'attend' })
    expect(s.pendingChoice).not.toBeNull()
  })
})

describe('vrbo cadence', () => {
  it('is due once the stored week arrives', () => {
    expect(
      vrboDue(at({ week: 12, gagCounters: { vrboOffers: 1, nextVrboWeek: 15 } })),
    ).toBe(false)
    expect(
      vrboDue(at({ week: 15, gagCounters: { vrboOffers: 1, nextVrboWeek: 15 } })),
    ).toBe(true)
  })

  it('is not due for a buyer agent', () => {
    expect(
      vrboDue(
        at({ rank: 'buyerAgent', week: 20, gagCounters: { vrboOffers: 0, nextVrboWeek: 1 } }),
      ),
    ).toBe(false)
  })

  it('schedules the next offer six to nine weeks out', () => {
    setSeed(81)
    const s = scheduleNextVrbo(at({ week: 20 }))
    expect(s.gagCounters.nextVrboWeek).toBeGreaterThanOrEqual(26)
    expect(s.gagCounters.nextVrboWeek).toBeLessThanOrEqual(29)
  })

  it('eventually surfaces the offer during End Week', () => {
    setSeed(81)
    // Reputation 20 keeps the TV interview (50) and gala (30) out of the pool,
    // but an ordinary roll can still pre-empt with its own modal. A pre-empted
    // offer never reschedules, so it stays due and lands a week or two later.
    let s = at({
      week: 20,
      reputation: 20,
      gagCounters: { vrboOffers: 0, nextVrboWeek: 20 },
    })
    for (let i = 0; i < 5 && s.gagCounters.vrboOffers === 0; i++) {
      s = endWeek(s)
      if (s.pendingChoice)
        s = reducer(s, {
          type: 'RESOLVE_CHOICE_EVENT',
          key: s.pendingChoice.options[0].key,
        })
    }
    expect(s.gagCounters.vrboOffers).toBeGreaterThanOrEqual(1)
  })

  it('does not stack a second modal over an open one', () => {
    setSeed(82)
    const s = endWeek(
      at({
        week: 20,
        gagCounters: { vrboOffers: 0, nextVrboWeek: 20 },
        pendingChoice: {
          id: 'charityGala',
          title: 'T',
          body: 'B',
          options: [{ key: 'skip', label: 'L', hint: 'H' }],
        },
      }),
    )
    expect(s.pendingChoice!.id).toBe('charityGala')
  })
})
