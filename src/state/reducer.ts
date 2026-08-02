import { ASSIST_FLAVORS, SIDE_HUSTLES } from '../data/flavor'
import {
  AP_PER_WEEK,
  DESK_FEE,
  LOSE_AT,
  START_CASH,
  bragFor,
  clampRep,
  commissionFor,
  crossedThresholds,
  deriveStats,
  nextRank,
  rankIndex,
  repUnlocked,
  swagOf,
  weeklyUpkeep,
} from '../logic/economy'
import { applyEvent, selectEvent, shouldCringe } from '../logic/events'
import { arch, closeChance, makeLead } from '../logic/leads'
import { withLog } from '../logic/log'
import {
  activeChannels,
  rollInbound,
  weeklyChannelRep,
  weeklyChannelSpend,
} from '../logic/marketing'
import { chance, money, pick, randInt } from '../logic/rand'
import { INBOUND_LINES } from '../data/marketing'
import {
  REP_DECAY_PER_WEEK,
  REP_FREE_LEAD_AT,
  REP_INBOUND_AT,
  REP_PER_DEAL,
} from '../data/reputation'
import type {
  Action,
  GameState,
  Lead,
  RankDef,
  SummaryLine,
  WeekSummary,
} from './types'

export function initialState(): GameState {
  return {
    version: 2,
    week: 1,
    cash: START_CASH,
    careerEarnings: 0,
    ap: AP_PER_WEEK,
    rank: 'receptionist',
    stats: { hustle: 1, swagger: 1, ego: 0 },
    permBonuses: { hustle: 0, swagger: 0, ego: 0 },
    leads: [],
    ownedSwagIds: [],
    equipped: {},
    counters: { showingsRun: 0, dealsClosed: 0, leadsLost: 0 },
    activeModifiers: [],
    log: [
      {
        week: 1,
        kind: 'flavor',
        text: 'Day one. The broker points at a folding table near the printer and calls it “your desk.” Assist showings and pick up side work until somebody trusts you with a lockbox.',
      },
    ],
    gameOver: false,
    summary: null,
    promo: null,
    reputation: 0,
    activeChannelIds: [],
    outfitPresets: [],
    gagCounters: { vrboOffers: 0, nextVrboWeek: 0 },
    channelMuteUntil: {},
    pendingChoice: null,
  }
}

function spendAp(state: GameState, n: number): GameState {
  return { ...state, ap: state.ap - n }
}

/** Stats are derived, so every state change re-syncs them. */
function sync(state: GameState): GameState {
  return { ...state, stats: deriveStats(state) }
}

export function reducer(state: GameState, action: Action): GameState {
  if (
    state.gameOver &&
    action.type !== 'RESTART' &&
    action.type !== 'IMPORT_SAVE'
  )
    return state
  switch (action.type) {
    case 'WORK_PHONES': {
      if (state.ap < 1) return state
      const st = deriveStats(state)
      let n = 1 + Math.floor(st.hustle / 3) + (chance(0.5) ? 1 : -1)
      n = Math.max(1, Math.min(4, n))
      let s = spendAp(state, 1)
      const fresh = []
      for (let i = 0; i < n; i++) fresh.push(makeLead(s))
      s = { ...s, leads: [...s.leads, ...fresh] }
      const names = fresh.map((l) => l.clientName).join(', ')
      return sync(
        withLog(
          s,
          'flavor',
          'You dialed until your ear got hot. Picked up: ' + names + '.',
        ),
      )
    }
    case 'ASSIST_SHOWING': {
      if (state.ap < 1 || state.rank !== 'receptionist') return state
      let s = spendAp(state, 1)
      s = {
        ...s,
        cash: s.cash + 100,
        careerEarnings: s.careerEarnings + 100,
        counters: { ...s.counters, showingsRun: s.counters.showingsRun + 1 },
      }
      return sync(
        withLog(
          s,
          'money',
          'You ' +
            pick(ASSIST_FLAVORS) +
            '. The agent handed you ' +
            money(100) +
            ' and called it “exposure, plus money.”',
        ),
      )
    }
    case 'SIDE_HUSTLE': {
      if (state.ap < 1) return state
      const amt = randInt(150, 400)
      let s = spendAp(state, 1)
      s = { ...s, cash: s.cash + amt, careerEarnings: s.careerEarnings + amt }
      return sync(
        withLog(
          s,
          'money',
          'You ' +
            pick(SIDE_HUSTLES) +
            '. ' +
            money(amt) +
            ', cash, no questions.',
        ),
      )
    }
    case 'RUN_SHOWING': {
      if (state.ap < 1 || state.rank === 'receptionist') return state
      const lead = state.leads.find((l) => l.id === action.leadId)
      if (!lead || lead.stage === 'ready') return state
      const a = arch(lead.archetypeId)
      const advanced = lead.stage === 'new' ? 'shown' : 'ready'
      let s = spendAp(state, 1)
      s = {
        ...s,
        leads: s.leads.map((l) =>
          l.id === lead.id ? { ...l, stage: advanced } : l,
        ),
        counters: { ...s.counters, showingsRun: s.counters.showingsRun + 1 },
      }
      let text =
        'You walked ' +
        lead.clientName +
        ' through a ' +
        a.label.toLowerCase() +
        "'s idea of a dream home. " +
        (advanced === 'ready'
          ? 'They stopped asking questions and started asking about the paperwork.'
          : "They didn't leave immediately. In this business that's a milestone.")
      if (state.rank === 'junior') {
        s = { ...s, cash: s.cash + 150, careerEarnings: s.careerEarnings + 150 }
        text += ' The office paid you ' + money(150) + ' for your trouble.'
      }
      return sync(
        withLog(s, state.rank === 'junior' ? 'money' : 'flavor', text),
      )
    }
    case 'ATTEMPT_CLOSE': {
      if (state.ap < 1 || state.rank === 'receptionist') return state
      const lead = state.leads.find((l) => l.id === action.leadId)
      if (!lead || lead.stage !== 'ready' || lead.sold) return state
      const a = arch(lead.archetypeId)
      let s = spendAp(state, 1)
      const success = chance(closeChance(state, lead))
      if (!success) {
        if (lead.retriedClose) {
          s = {
            ...s,
            leads: s.leads.filter((l) => l.id !== lead.id),
            counters: { ...s.counters, leadsLost: s.counters.leadsLost + 1 },
          }
          return sync(
            withLog(
              s,
              'event',
              lead.clientName +
                ' walked for good. Second time at the table, second time watching a pen go back in a pocket.',
            ),
          )
        }
        s = {
          ...s,
          leads: s.leads.map((l) =>
            l.id === lead.id
              ? { ...l, patience: Math.max(0, l.patience - 1), retriedClose: true }
              : l,
          ),
        }
        return sync(
          withLog(
            s,
            'event',
            lead.clientName +
              ' needed to “sleep on it,” which is a thing people say while backing toward a door. One more shot at this.',
          ),
        )
      }
      const isReferralCut = state.rank === 'junior'
      const { earnings } = commissionFor(lead.salePrice, state.rank)
      s = {
        ...s,
        cash: s.cash + earnings,
        careerEarnings: s.careerEarnings + earnings,
        leads: s.leads.map((l) => (l.id === lead.id ? { ...l, sold: true } : l)),
        counters: { ...s.counters, dealsClosed: s.counters.dealsClosed + 1 },
        reputation: clampRep(s.reputation + REP_PER_DEAL),
      }
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
      return sync(withLog(s, 'deal', line))
    }
    case 'BUY_SWAG': {
      const it = swagOf(action.itemId)
      if (!it || state.ownedSwagIds.includes(it.id)) return state
      if (rankIndex(state.rank) < rankIndex(it.unlockRank)) return state
      if (state.cash < it.price) return state
      let s = {
        ...state,
        cash: state.cash - it.price,
        ownedSwagIds: [...state.ownedSwagIds, it.id],
      }
      s = { ...s, equipped: { ...s.equipped, [it.slot]: it.id } }
      return sync(
        withLog(
          s,
          'money',
          'You bought the ' +
            it.name +
            ' and wore it out of the store. ' +
            it.flavor,
        ),
      )
    }
    case 'EQUIP_SWAG': {
      const it = swagOf(action.itemId)
      if (!it || !state.ownedSwagIds.includes(it.id)) return state
      const already = state.equipped[it.slot] === it.id
      const equipped = { ...state.equipped }
      if (already) delete equipped[it.slot]
      else equipped[it.slot] = it.id
      const s = { ...state, equipped }
      return sync(
        withLog(
          s,
          'flavor',
          already
            ? 'You put the ' + it.name + ' away. The room felt quieter.'
            : 'You put on the ' +
                it.name +
                ' and checked your reflection in a parked car.',
        ),
      )
    }
    case 'END_WEEK':
      return endWeek(state)
    case 'IMPORT_SAVE':
      return sync({
        ...initialState(),
        ...action.state,
        summary: null,
        promo: null,
      })
    case 'RESTART':
      return initialState()
    default:
      return state
  }
}

/**
 * Order of operations is load-bearing:
 * archive sold → patience/ghosts → marketing (billing, inbound leads, rep
 * gain) → rep decay check → expenses → event → cringe → promotion →
 * week rolls → lose check → summary.
 */
export function endWeek(state: GameState): GameState {
  let s: GameState = { ...state }
  const money_in: SummaryLine[] = []
  const money_out: SummaryLine[] = []
  const events: string[] = []
  const startCash = s.cash

  if (s.ap > 0)
    s = withLog(
      s,
      'flavor',
      'You spent the rest of the week practicing your signature.',
    )

  /* 0. archive anything that closed this week (the SOLD stamp has had its moment) */
  s = { ...s, leads: s.leads.filter((l) => !l.sold) }

  /* 1. patience + ghost rolls */
  const survivors: Lead[] = []
  s.leads.forEach((l) => {
    const a = arch(l.archetypeId)
    if (a.ghostChance > 0 && chance(a.ghostChance)) {
      s = withLog(s, 'event', l.clientName + ' ' + pick(a.ghosts))
      s = {
        ...s,
        counters: { ...s.counters, leadsLost: s.counters.leadsLost + 1 },
      }
      return
    }
    const p = l.patience - 1
    if (p <= 0) {
      s = withLog(
        s,
        'event',
        l.clientName + ' ran out of runway and ' + pick(a.ghosts),
      )
      s = {
        ...s,
        counters: { ...s.counters, leadsLost: s.counters.leadsLost + 1 },
      }
      return
    }
    survivors.push({ ...l, patience: p })
  })
  s = { ...s, leads: survivors }

  /* 1b. marketing: bill, produce inbound leads, move reputation */
  const repBefore = s.reputation
  const spend = weeklyChannelSpend(s)
  let inboundCount = 0

  if (spend > 0) {
    s = { ...s, cash: s.cash - spend }
    money_out.push(['Marketing', spend])
  }

  if (repUnlocked(s.reputation, REP_INBOUND_AT)) {
    activeChannels(s).forEach((c) => {
      const lead = rollInbound(s, c)
      if (!lead) return
      inboundCount++
      s = { ...s, leads: [...s.leads, lead] }
      s = withLog(
        s,
        'event',
        INBOUND_LINES[c.id] + ' ' + lead.clientName + ' is on the board.',
      )
    })
  }

  if (repUnlocked(s.reputation, REP_FREE_LEAD_AT)) {
    const lead = makeLead(s)
    inboundCount++
    s = { ...s, leads: [...s.leads, lead] }
    s = withLog(
      s,
      'event',
      'Your face IS the marketing now. ' +
        lead.clientName +
        ' called without being asked, having seen you somewhere they cannot place.',
    )
  }

  /* 1c. reputation movement, then the out-of-sight decay */
  const repGain = weeklyChannelRep(s)
  if (repGain) s = { ...s, reputation: clampRep(s.reputation + repGain) }
  if (s.activeChannelIds.length === 0) {
    const decayed = clampRep(s.reputation - REP_DECAY_PER_WEEK)
    if (decayed < s.reputation) {
      s = { ...s, reputation: decayed }
      s = withLog(
        s,
        'flavor',
        'Nobody saw your face anywhere this week. Out of sight, out of mind, out of the group chat.',
      )
    }
  }

  crossedThresholds(repBefore, s.reputation).forEach((t) => {
    s = withLog(s, 'event', t.toast)
  })

  /* 2. expenses */
  const desk = s.rank === 'receptionist' ? 0 : DESK_FEE
  const upkeep = weeklyUpkeep(s)
  if (desk) {
    s = { ...s, cash: s.cash - desk }
    money_out.push(['Desk fee', desk])
    s = withLog(
      s,
      'money',
      'The brokerage took its desk fee, as brokerages do, for the desk you barely sit at.',
    )
  }
  if (upkeep) {
    s = { ...s, cash: s.cash - upkeep }
    money_out.push(['Swag upkeep', upkeep])
    s = withLog(
      s,
      'money',
      "Insurance, storage, and dry cleaning on the image. Looking like this isn't free.",
    )
  }

  /* 3. random event (30%) */
  const chosen = selectEvent(s)
  if (chosen) {
    const r = applyEvent(s, chosen.id)
    s = r.state
    events.push(r.label)
    if (r.cashDelta > 0) money_in.push([r.label, r.cashDelta])
    if (r.cashDelta < 0) money_out.push([r.label, -r.cashDelta])
  }

  /* 4. cringe event (independent, ego >= 8) */
  if (shouldCringe(s)) {
    const r = applyEvent(s, 'cringeEvent')
    s = r.state
    events.push(r.label)
    money_out.push([r.label, -r.cashDelta])
  }

  /* 5. promotion. Unlike the inbound gate above, this reads reputation AFTER
        this week's channel gain — promotion has always used live earnings and
        deals, and reputation is no different. */
  let promo: RankDef | null = null
  const nxt = nextRank(s)
  if (nxt) {
    s = { ...s, rank: nxt.id }
    promo = nxt
    s = withLog(
      s,
      'promotion',
      'PROMOTED: ' +
        nxt.name +
        '. They printed a certificate. Someone spelled your name right on the second try.',
    )
  }

  /* 6. tidy modifiers, roll the week */
  s = {
    ...s,
    activeModifiers: s.activeModifiers.filter((m) => m.expiresWeek > s.week),
    week: s.week + 1,
    ap: AP_PER_WEEK,
  }
  s = sync(s)

  /* 7. lose check */
  if (s.cash < LOSE_AT) {
    s = withLog(
      s,
      'event',
      'Your card declined at the printer. Then at the gas station. Then, memorably, at the open house you were catering.',
    )
    s = { ...s, gameOver: true }
  }

  const summary: WeekSummary = {
    week: state.week,
    moneyIn: money_in,
    moneyOut: money_out,
    events,
    marketing: {
      spend,
      leads: inboundCount,
      repChange: s.reputation - repBefore,
    },
    net: s.cash - startCash,
    promo: promo ? promo.name : null,
    brag: bragFor(s),
  }
  return { ...s, summary, promo: promo ? promo.name : null }
}
