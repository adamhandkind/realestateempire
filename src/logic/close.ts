/**
 * The close outcome, shared by both paths that can produce one: the instant
 * dice roll and the Phase 8 phone call. It starts at the roll — AP has already
 * been spent and the lead has already been validated by the caller.
 *
 * Nothing in here knows which path called it. That is the entire point: the
 * call cannot drift away from the dice.
 */

import { arch } from './leads'
import { charLine, hasFlag, pushStatModifier } from './characters'
import { chance, money, pick } from './rand'
import { clampRep, commissionFor, sync } from './economy'
import { gain, pluralityOwner } from './territory'
import { P5 } from '../data/p5'
import { P6, PLAYER } from '../data/p6'
import { REP_PER_DEAL } from '../data/reputation'
import { UNDERCUT_SUFFIX } from '../data/rivals'
import { withLog } from './log'
import type { GameState, Lead } from '../state/types'

/** A failed close costs the accent, and the accent was the swagger. Does not
 *  stack: a slip while one is already live is a no-op. */
function applyAccentSlip(state: GameState): GameState {
  if (!hasFlag(state, 'accentSlip')) return state
  const pushed = pushStatModifier(state, {
    stat: 'swagger',
    delta: -1,
    expiresWeek: state.week + P5.ACCENT_SLIP_WEEKS,
    label: 'Accent Slip',
  })
  if (!pushed) return state
  const line = charLine(state, 'accentSlip')
  return line ? withLog(pushed, 'event', line) : pushed
}

/** What the close paid and whether it landed. The reducer needs the payout to
 *  fill in `call.outcome`; the dice path ignores it.
 *
 *  A struct rather than a callback or a split pair of success/failure
 *  functions: either of those would have meant duplicating the branch that
 *  decides success, which is exactly the drift this extraction exists to
 *  prevent. One roll, one branch, one return shape. */
export interface CloseResult {
  state: GameState
  success: boolean
  payout: number
}

export function resolveClose(
  state: GameState,
  lead: Lead,
  finalChance: number,
): CloseResult {
  const a = arch(lead.archetypeId)
  const success = chance(finalChance)

  if (!success) {
    let s = applyAccentSlip(state)
    if (lead.retriedClose) {
      s = {
        ...s,
        leads: s.leads.filter((l) => l.id !== lead.id),
        counters: { ...s.counters, leadsLost: s.counters.leadsLost + 1 },
      }
      return {
        state: sync(
          withLog(
            s,
            'event',
            lead.clientName +
              ' walked for good. Second time at the table, second time watching a pen go back in a pocket.',
          ),
        ),
        success: false,
        payout: 0,
      }
    }
    s = {
      ...s,
      leads: s.leads.map((l) =>
        l.id === lead.id
          ? { ...l, patience: Math.max(0, l.patience - 1), retriedClose: true }
          : l,
      ),
    }
    return {
      state: sync(
        withLog(
          s,
          'event',
          lead.clientName +
            ' needed to “sleep on it,” which is a thing people say while backing toward a door. One more shot at this.',
        ),
      ),
      success: false,
      payout: 0,
    }
  }

  const isReferralCut = state.rank === 'junior'
  const raw = commissionFor(lead.salePrice, state.rank).earnings
  /* §9.6 — the Zambonis are undercutting, and it is their block. */
  const undercut =
    state.rivalEffects.undercutWeeksLeft > 0 &&
    pluralityOwner(state, lead.districtId) === 'zambonis'
  const earnings = undercut ? Math.round(raw * P6.UNDERCUT_COMMISSION_MULT) : raw
  let s: GameState = {
    ...state,
    cash: state.cash + earnings,
    careerEarnings: state.careerEarnings + earnings,
    leads: state.leads.map((l) => (l.id === lead.id ? { ...l, sold: true } : l)),
    counters: { ...state.counters, dealsClosed: state.counters.dealsClosed + 1 },
    reputation: clampRep(state.reputation + REP_PER_DEAL),
    /* Closing here is the loudest thing you can do here. */
    weekDealDistricts: state.weekDealDistricts.includes(lead.districtId)
      ? state.weekDealDistricts
      : [...state.weekDealDistricts, lead.districtId],
  }
  s = gain(s, lead.districtId, PLAYER, P6.GAIN_DEAL)
  const line =
    lead.clientName +
    ' ' +
    pick(a.successes) +
    ' The house sold for ' +
    money(lead.salePrice) +
    '; ' +
    (isReferralCut
      ? 'the agent who signed it slid you a referral cut of ' +
        money(earnings) +
        ' and a compliment about your handwriting.'
      : 'your share came to ' + money(earnings) + '.')
  return {
    state: sync(withLog(s, 'deal', line + (undercut ? UNDERCUT_SUFFIX : ''))),
    success: true,
    payout: earnings,
  }
}
