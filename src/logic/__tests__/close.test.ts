/* Direct coverage for resolveClose — the single outcome path shared by the
   instant dice roll and the Phase 8 phone call. Everything here was previously
   exercised only incidentally through ATTEMPT_CLOSE. */

import { beforeEach, describe, expect, it } from 'vitest'
import { PLAYER, P6 } from '../../data/p6'
import { REP_PER_DEAL } from '../../data/reputation'
import { UNDERCUT_SUFFIX } from '../../data/rivals'
import { commissionFor } from '../economy'
import { resolveClose } from '../close'
import { setSeed } from '../rand'
import { setShares, shareOf } from '../territory'
import { initialState } from '../../state/reducer'
import type { GameState, Lead } from '../../state/types'

const DISTRICT = 'downtown'

const st = (over: Partial<GameState> = {}): GameState => ({
  ...initialState(),
  week: 10,
  rank: 'sellerAgent',
  cash: 50000,
  ...over,
})

const lead = (over: Partial<Lead> = {}): Lead => ({
  id: 'L1',
  archetypeId: 'firstTimer',
  clientName: 'Dale Cooper',
  stage: 'ready',
  salePrice: 300000,
  patience: 3,
  maxPatience: 3,
  retriedClose: false,
  createdWeek: 1,
  intro: 'intro',
  referralBonus: false,
  districtId: DISTRICT,
  ...over,
})

/** Puts the lead's lead on the state so lifecycle assertions have something to
 *  act on. */
const withLead = (s: GameState, l: Lead): GameState => ({ ...s, leads: [l] })

beforeEach(() => setSeed(1))

describe('resolveClose — success', () => {
  it('pays the commission and books the deal', () => {
    const l = lead()
    const s0 = withLead(st(), l)
    const expected = commissionFor(l.salePrice, s0.rank).earnings

    const r = resolveClose(s0, l, 1)

    expect(r.success).toBe(true)
    expect(r.payout).toBe(expected)
    expect(r.state.cash - s0.cash).toBe(expected)
    expect(r.state.careerEarnings - s0.careerEarnings).toBe(expected)
    expect(r.state.leads[0].sold).toBe(true)
    expect(r.state.counters.dealsClosed).toBe(s0.counters.dealsClosed + 1)
    expect(r.state.reputation).toBe(s0.reputation + REP_PER_DEAL)
    expect(r.state.weekDealDistricts).toContain(DISTRICT)
  })

  it('payout equals the cash delta', () => {
    const l = lead()
    const s0 = withLead(st(), l)
    const r = resolveClose(s0, l, 1)
    expect(r.payout).toBe(r.state.cash - s0.cash)
  })

  it('pays territory share in the lead district', () => {
    const l = lead()
    const s0 = withLead(setShares(st(), DISTRICT, { [PLAYER]: 10 }), l)

    const r = resolveClose(s0, l, 1)

    expect(shareOf(r.state, DISTRICT, PLAYER)).toBeGreaterThan(
      shareOf(s0, DISTRICT, PLAYER),
    )
    expect(shareOf(r.state, DISTRICT, PLAYER)).toBeCloseTo(10 + P6.GAIN_DEAL, 5)
  })

  it('does not duplicate an already-listed deal district', () => {
    const l = lead()
    const s0 = withLead(st({ weekDealDistricts: [DISTRICT] }), l)
    const r = resolveClose(s0, l, 1)
    expect(r.state.weekDealDistricts.filter((d) => d === DISTRICT)).toHaveLength(
      1,
    )
  })
})

describe('resolveClose — failure', () => {
  it('first failure costs patience and arms the retry', () => {
    const l = lead({ patience: 3 })
    const s0 = withLead(st(), l)

    const r = resolveClose(s0, l, 0)

    expect(r.success).toBe(false)
    expect(r.payout).toBe(0)
    expect(r.state.leads).toHaveLength(1)
    expect(r.state.leads[0].patience).toBe(2)
    expect(r.state.leads[0].retriedClose).toBe(true)
    expect(r.state.counters.leadsLost).toBe(s0.counters.leadsLost)
  })

  it('does not push patience below zero', () => {
    const l = lead({ patience: 0 })
    const r = resolveClose(withLead(st(), l), l, 0)
    expect(r.state.leads[0].patience).toBe(0)
  })

  it('second failure removes the lead and counts the loss', () => {
    const l = lead({ retriedClose: true })
    const s0 = withLead(st(), l)

    const r = resolveClose(s0, l, 0)

    expect(r.success).toBe(false)
    expect(r.payout).toBe(0)
    expect(r.state.leads).toHaveLength(0)
    expect(r.state.counters.leadsLost).toBe(s0.counters.leadsLost + 1)
  })

  it('pays no cash on either failure', () => {
    const first = lead()
    const second = lead({ retriedClose: true })
    const s0 = st()
    expect(resolveClose(withLead(s0, first), first, 0).state.cash).toBe(s0.cash)
    expect(resolveClose(withLead(s0, second), second, 0).state.cash).toBe(
      s0.cash,
    )
  })
})

describe('resolveClose — undercut', () => {
  /** Zambonis holding plurality in the lead's district, undercut running. */
  const undercutState = (l: Lead): GameState =>
    withLead(
      setShares(
        st({
          rivalEffects: {
            ...initialState().rivalEffects,
            undercutWeeksLeft: 2,
          },
        }),
        DISTRICT,
        { [PLAYER]: 10, zambonis: 60 },
      ),
      l,
    )

  it('shaves the commission by the undercut multiplier', () => {
    const l = lead()
    const s0 = undercutState(l)
    const full = commissionFor(l.salePrice, s0.rank).earnings

    const r = resolveClose(s0, l, 1)

    expect(r.payout).toBe(Math.round(full * P6.UNDERCUT_COMMISSION_MULT))
    expect(r.payout).toBeLessThan(full)
    expect(r.state.cash - s0.cash).toBe(r.payout)
  })

  it('marks the log line with the undercut suffix', () => {
    const l = lead()
    const r = resolveClose(undercutState(l), l, 1)
    expect(r.state.log[0].text).toContain(UNDERCUT_SUFFIX)
  })

  it('does not apply when the Zambonis lack plurality', () => {
    const l = lead()
    const s0 = withLead(
      setShares(
        st({
          rivalEffects: {
            ...initialState().rivalEffects,
            undercutWeeksLeft: 2,
          },
        }),
        DISTRICT,
        { [PLAYER]: 70, zambonis: 5 },
      ),
      l,
    )

    const r = resolveClose(s0, l, 1)

    expect(r.payout).toBe(commissionFor(l.salePrice, s0.rank).earnings)
    expect(r.state.log[0].text).not.toContain(UNDERCUT_SUFFIX)
  })

  it('does not apply when the undercut has expired', () => {
    const l = lead()
    const s0 = withLead(
      setShares(st(), DISTRICT, { [PLAYER]: 10, zambonis: 60 }),
      l,
    )
    expect(s0.rivalEffects.undercutWeeksLeft).toBe(0)

    const r = resolveClose(s0, l, 1)

    expect(r.payout).toBe(commissionFor(l.salePrice, s0.rank).earnings)
    expect(r.state.log[0].text).not.toContain(UNDERCUT_SUFFIX)
  })
})

describe('resolveClose — referral cut', () => {
  it('junior gets the referral-cut wording', () => {
    const l = lead()
    const r = resolveClose(withLead(st({ rank: 'junior' }), l), l, 1)
    expect(r.state.log[0].text).toContain('referral cut')
  })

  it('higher ranks get the plain share wording', () => {
    const l = lead()
    const r = resolveClose(withLead(st({ rank: 'sellerAgent' }), l), l, 1)
    expect(r.state.log[0].text).not.toContain('referral cut')
    expect(r.state.log[0].text).toContain('your share came to')
  })
})

/* Phase 7 kept the season ledger inline in ATTEMPT_CLOSE; the Phase 8 merge
   moved it here so a deal closed on the PHONE feeds the Goldies exactly as a
   deal closed by dice does. Nothing in the suite covered that path, so a
   dropped bump would have gone unnoticed until an award scored wrong. */
describe('resolveClose — the season ledger', () => {
  it('credits a successful close to every stat the Goldies read', () => {
    const s = st()
    const l = lead({ salePrice: 620000 })
    const before = s.season
    const out = resolveClose(withLead(s, l), l, 1).state
    const earnings = commissionFor(l.salePrice, s.rank).earnings
    expect(out.season.dealsClosed).toBe(before.dealsClosed + 1)
    expect(out.season.closeSuccesses).toBe(before.closeSuccesses + 1)
    expect(out.season.commissionEarned).toBe(before.commissionEarned + earnings)
    expect(out.season.repGained).toBe(before.repGained + REP_PER_DEAL)
  })

  it('records the biggest sale as a max, not a sum', () => {
    let s = st()
    s = { ...s, season: { ...s.season, biggestSale: 500000 } }
    const small = lead({ salePrice: 200000 })
    expect(
      resolveClose(withLead(s, small), small, 1).state.season.biggestSale,
    ).toBe(500000)
    const big = lead({ salePrice: 900000 })
    expect(
      resolveClose(withLead(s, big), big, 1).state.season.biggestSale,
    ).toBe(900000)
  })

  it('credits a lost lead when the second attempt fails', () => {
    const s = st()
    const l = lead({ retriedClose: true })
    const out = resolveClose(withLead(s, l), l, 0).state
    expect(out.season.leadsLost).toBe(s.season.leadsLost + 1)
  })

  it('does not credit a lost lead on the FIRST failure', () => {
    const s = st()
    const l = lead({ retriedClose: false })
    const out = resolveClose(withLead(s, l), l, 0).state
    expect(out.season.leadsLost).toBe(s.season.leadsLost)
  })

  it('leaves the ledger alone on a failed close otherwise', () => {
    const s = st()
    const l = lead()
    const out = resolveClose(withLead(s, l), l, 0).state
    expect(out.season.dealsClosed).toBe(s.season.dealsClosed)
    expect(out.season.commissionEarned).toBe(s.season.commissionEarned)
  })
})
