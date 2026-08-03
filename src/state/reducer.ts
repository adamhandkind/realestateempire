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
  PRESET_SLOTS,
  rankIndex,
  repUnlocked,
  SLOTS,
  swagOf,
  weeklyUpkeep,
} from '../logic/economy'
import {
  applyEvent,
  scheduleNextVrbo,
  selectEvent,
  shouldCringe,
  vrboDue,
} from '../logic/events'
import { arch, closeChance, makeLead } from '../logic/leads'
import { P3 } from '../data/p3'
import {
  anyUnitOccupied,
  clamp,
  fillPool,
  hasFreeMortgageSlot,
  interp,
  makeTenant,
  netWorth,
  nicknameFor,
  occupiedUnitCount,
  pickApplicant,
  purchaseBaseValue,
  regeneratePool,
  renoBlockReason,
  renoCost,
  renoOf,
  renoWeeks,
  tenantOf,
  typeOf,
} from '../logic/portfolio'
import {
  billPortfolio,
  checkMilestones,
  collectRent,
  newWeekCtx,
  resolveVrbo,
  rollApplicants,
  rollFlips,
  rollTenantEvents,
  rotatePool,
  tickMarket,
  tickProperties,
} from '../logic/portfolioWeek'
import {
  VRBO_DECLINE_FOREVER_LINE,
  VRBO_NICKNAME,
  VRBO_OFFER_BODY,
} from '../data/vrbo'
import { RENO_OCCUPIED_REFUSAL } from '../data/properties'
import { TENANT_FIX_LINES } from '../data/tenantEvents'
import { withLog } from '../logic/log'
import {
  activeChannels,
  channelOf,
  isChannelLocked,
  rollInbound,
  weeklyChannelRep,
  weeklyChannelSpend,
} from '../logic/marketing'
import { chance, money, pick, randInt, roundTo } from '../logic/rand'
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
  Property,
  RankDef,
  SummaryLine,
  UnitState,
  WeekSummary,
} from './types'

export function initialState(): GameState {
  const base: GameState = {
    version: 3,
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
    outfitPresets: Array(PRESET_SLOTS).fill(null),
    gagCounters: {
      vrboOffers: 0,
      nextVrboWeek: 6,
      vrboOwned: false,
      vrboDeclinedForever: false,
    },
    channelMuteUntil: {},
    pendingChoice: null,
    properties: [],
    marketPool: [],
    marketState: 'normal',
    nextMarketState: 'normal',
    crash: { weeksLeft: 0, lastCrashWeek: -999 },
    milestonesUnlocked: [],
    propCoActive: false,
    pendingChoices: [],
    nextPropertyId: 1,
    nextListingId: 1,
    nextChoiceId: 1,
    peakNetWorth: START_CASH,
    firstP3Week: 1,
  }
  /* The pool is seeded as soon as anything is eligible so the Portfolio tab is
     never empty. Nothing unlocks below Seller Agent, so a week-one game keeps
     an empty pool and nextListingId 1 until the first listing is drawn. */
  return fillPool(base)
}

function spendAp(state: GameState, n: number): GameState {
  return { ...state, ap: state.ap - n }
}

/** Replaces one property in place. Every property action goes through this so
 *  no case has to hand-roll an array map. */
function patchProperty(
  state: GameState,
  propertyId: string,
  fn: (p: Property) => Property,
): GameState {
  return {
    ...state,
    properties: state.properties.map((p) => (p.id === propertyId ? fn(p) : p)),
  }
}

function patchUnit(
  state: GameState,
  propertyId: string,
  unitId: string,
  fn: (u: UnitState) => UnitState,
): GameState {
  return patchProperty(state, propertyId, (p) => ({
    ...p,
    units: p.units.map((u) => (u.id === unitId ? fn(u) : u)),
  }))
}

const propertyOf = (s: GameState, id: string): Property | undefined =>
  s.properties.find((p) => p.id === id)

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
    case 'TOGGLE_CHANNEL': {
      const c = channelOf(action.channelId)
      if (!c) return state
      const on = state.activeChannelIds.includes(c.id)
      /* A locked channel can't be started, but one already running can always
         be stopped — reputation can decay below the bar you signed up at. */
      if (!on && isChannelLocked(state, c)) return state
      const activeChannelIds = on
        ? state.activeChannelIds.filter((id) => id !== c.id)
        : [...state.activeChannelIds, c.id]
      return sync(
        withLog(
          { ...state, activeChannelIds },
          'flavor',
          on
            ? 'You pulled the plug on ' +
                c.name +
                '. The silence is cheaper and worse.'
            : 'You signed up for ' + c.name + '. ' + c.flavor,
        ),
      )
    }
    case 'SAVE_PRESET': {
      if (action.index < 0 || action.index >= PRESET_SLOTS) return state
      const outfitPresets = Array.from(
        { length: PRESET_SLOTS },
        (_, i) => state.outfitPresets[i] ?? null,
      )
      outfitPresets[action.index] = {
        name: action.name,
        equipped: { ...state.equipped },
      }
      return sync(
        withLog(
          { ...state, outfitPresets },
          'flavor',
          'You saved this look as “' +
            action.name +
            '” so you can become this person again on command.',
        ),
      )
    }
    case 'RENAME_PRESET': {
      const existing = state.outfitPresets[action.index]
      if (!existing) return state
      const outfitPresets = Array.from(
        { length: PRESET_SLOTS },
        (_, i) => state.outfitPresets[i] ?? null,
      )
      outfitPresets[action.index] = { ...existing, name: action.name }
      return { ...state, outfitPresets }
    }
    case 'LOAD_PRESET': {
      const preset = state.outfitPresets[action.index]
      if (!preset) return state
      const equipped: GameState['equipped'] = {}
      SLOTS.forEach((slot) => {
        const id = preset.equipped[slot.id]
        if (id && state.ownedSwagIds.includes(id)) equipped[slot.id] = id
      })
      return sync(
        withLog(
          { ...state, equipped },
          'flavor',
          'You changed into “' +
            preset.name +
            '” in a parking garage in under a minute.',
        ),
      )
    }
    case 'RESOLVE_CHOICE_EVENT': {
      const pc = state.pendingChoice
      if (!pc) return state
      if (!pc.options.some((o) => o.key === action.key)) return state
      let s: GameState = { ...state, pendingChoice: null }
      switch (action.key) {
        case 'decline':
          s = withLog(
            s,
            'flavor',
            'You declined the 424/7 VRBO. He said “for now?” You said nothing. He wrote “for now” on his hand.',
          )
          break
        case 'declineForever':
          s = {
            ...s,
            gagCounters: { ...s.gagCounters, vrboDeclinedForever: true },
          }
          s = withLog(
            s,
            'flavor',
            'You told him never to call again. He said "respect" and meant it. ' +
              VRBO_DECLINE_FOREVER_LINE,
          )
          break
        case 'buyVrbo': {
          const id = 'C' + s.nextChoiceId
          s = {
            ...s,
            nextChoiceId: s.nextChoiceId + 1,
            pendingChoices: [
              ...s.pendingChoices,
              {
                id,
                kind: 'vrboBuy',
                title: 'THE 424/7 VRBO',
                body: VRBO_OFFER_BODY,
                options: [],
                payload: { askPrice: P3.VRBO.PRICE },
              },
            ],
          }
          break
        }
        case 'humble':
          s = { ...s, reputation: clampRep(s.reputation + 8) }
          s = withLog(
            s,
            'event',
            'On air you credited your clients, your team, and the city itself. Four separate people called it “refreshing.” The duck segment ran long and nobody minded.',
          )
          break
        case 'ego':
          s = {
            ...s,
            reputation: clampRep(s.reputation + 4),
            permBonuses: { ...s.permBonuses, ego: s.permBonuses.ego + 1 },
          }
          s = withLog(
            s,
            'event',
            'You pointed at the camera and said your own name twice. The clip is now the station’s most-shared segment of the year, for reasons the station has not examined.',
          )
          break
        case 'cease':
          s = { ...s, cash: s.cash - 500, reputation: clampRep(s.reputation + 2) }
          s = withLog(
            s,
            'money',
            'A lawyer wrote one paragraph. Chadwick’s billboard came down within a day and the story of it going down did better than the ad ever did.',
          )
          break
        case 'eat':
          s = { ...s, reputation: clampRep(s.reputation - 3) }
          s = withLog(
            s,
            'event',
            'You let it go. Half the city now cannot tell which of you is which, and the half that can prefers his font.',
          )
          break
        case 'attend': {
          s = { ...s, cash: s.cash - 500, reputation: clampRep(s.reputation + 5) }
          const lead = makeLead(s)
          s = { ...s, leads: [...s.leads, lead] }
          s = withLog(
            s,
            'money',
            'You went, you shook every hand in the room, and you left with ' +
              lead.clientName +
              ' and a small trophy for attending.',
          )
          break
        }
        case 'skip':
          s = withLog(
            s,
            'flavor',
            'You watched the gala from the parking lot with the engine running, which is technically also networking.',
          )
          break
        default:
          break
      }
      return sync(s)
    }
    case 'BUY_PROPERTY': {
      const l = state.marketPool.find((x) => x.id === action.listingId)
      if (!l) return state
      const financed = action.downPct < 1
      if (action.downPct < P3.DOWN_MIN || action.downPct > 1)
        return withLog(
          state,
          'flavor',
          'The bank laughed. Twenty percent down is the floor, not an opening bid.',
        )
      if (financed && !hasFreeMortgageSlot(state))
        return withLog(
          state,
          'flavor',
          'The underwriter counted your mortgages, then counted them again. No.',
        )
      const down = Math.round(l.askPrice * action.downPct)
      if (state.cash < down)
        return withLog(
          state,
          'flavor',
          "You ran the numbers twice and got the same answer twice. You can't cover the down payment.",
        )
      const id = 'P' + state.nextPropertyId
      const type = typeOf(l.typeId)!
      const property: Property = {
        id,
        typeId: l.typeId,
        nickname: nicknameFor(l.typeId),
        baseValue: purchaseBaseValue(l),
        condition: l.condition,
        mortgage: financed ? { balance: l.askPrice - down } : null,
        units: Array.from({ length: type.units }, (_, i) => ({
          id: id + '-u' + i,
          tenant: null,
          rentR: 1.0,
          openIssue: null,
          evictionWeeksLeft: null,
        })),
        renovation: null,
        listedForSale: false,
        boughtWeek: state.week,
        isVrbo: false,
        vrboProfitStreak: 0,
        vrboRenoDone: false,
      }
      let s: GameState = {
        ...state,
        cash: state.cash - down,
        properties: [...state.properties, property],
        marketPool: state.marketPool.filter((x) => x.id !== l.id),
        nextPropertyId: state.nextPropertyId + 1,
      }
      s = fillPool(s)
      return sync(
        withLog(
          s,
          'money',
          'Purchased ' +
            property.nickname +
            ' for ' +
            money(l.askPrice) +
            '. ' +
            (financed
              ? 'The bank owns most of it. You own the vibes.'
              : "Cash. The seller's agent looked frightened."),
        ),
      )
    }
    case 'RENAME_PROPERTY': {
      if (!propertyOf(state, action.propertyId)) return state
      const nickname = action.nickname.slice(0, 24).trim()
      if (!nickname) return state
      return patchProperty(state, action.propertyId, (p) => ({ ...p, nickname }))
    }
    case 'SET_RENT': {
      const p = propertyOf(state, action.propertyId)
      const u = p?.units.find((x) => x.id === action.unitId)
      if (!p || !u) return state
      const stepped = roundTo(action.r / P3.RENT_R_STEP, 1) * P3.RENT_R_STEP
      const r = clamp(
        Math.round(stepped * 100) / 100,
        P3.RENT_R_MIN,
        P3.RENT_R_MAX,
      )
      let s = patchUnit(state, p.id, u.id, (x) => ({ ...x, rentR: r }))
      if (u.tenant && r - u.rentR > 0.1)
        s = withLog(
          s,
          'flavor',
          'You raised the rent. ' +
            u.tenant.name +
            ' left a review of your character in the group chat.',
        )
      return s
    }
    case 'LIST_FOR_SALE': {
      const p = propertyOf(state, action.propertyId)
      if (!p || p.listedForSale) return state
      if (state.ap < 1) return state
      if (p.renovation)
        return withLog(
          state,
          'flavor',
          'Nobody buys a house with the drywall off. Finish the job first.',
        )
      const s = patchProperty(spendAp(state, 1), p.id, (x) => ({
        ...x,
        listedForSale: true,
      }))
      return sync(
        withLog(
          s,
          'flavor',
          'You listed ' +
            p.nickname +
            '. The photos make the hallway look longer than it is. That is the job.',
        ),
      )
    }
    case 'DELIST': {
      const p = propertyOf(state, action.propertyId)
      if (!p || !p.listedForSale) return state
      const s = patchProperty(state, p.id, (x) => ({
        ...x,
        listedForSale: false,
      }))
      return sync(
        withLog(
          s,
          'flavor',
          'You pulled ' +
            p.nickname +
            ' off the market. Timing, you tell people.',
        ),
      )
    }
    case 'PAY_PRINCIPAL': {
      const p = propertyOf(state, action.propertyId)
      if (!p || !p.mortgage) return state
      const pay = Math.min(P3.PRINCIPAL_CHUNK, p.mortgage.balance)
      if (state.cash < pay)
        return withLog(
          state,
          'flavor',
          'You looked at the balance, then at your account, then away.',
        )
      const remaining = p.mortgage.balance - pay
      let s = patchProperty({ ...state, cash: state.cash - pay }, p.id, (x) => ({
        ...x,
        mortgage: remaining > 0 ? { balance: remaining } : null,
      }))
      s = withLog(
        s,
        'money',
        remaining > 0
          ? 'You put ' +
              money(pay) +
              ' straight at the principal on ' +
              p.nickname +
              '. The balance moved. Slightly.'
          : 'One deed, fully yours. You read it twice.',
      )
      return sync(s)
    }
    case 'START_RENOVATION': {
      const p = propertyOf(state, action.propertyId)
      if (!p) return state
      const proj = renoOf(action.projectId)
      if (proj.requiresVacant && anyUnitOccupied(p))
        return withLog(state, 'flavor', RENO_OCCUPIED_REFUSAL)
      const blocked = renoBlockReason(state, p, action.projectId)
      if (blocked) return withLog(state, 'flavor', blocked)
      const cost = renoCost(p, action.projectId)
      const weeks = renoWeeks(state, action.projectId)
      const s = patchProperty(
        { ...state, cash: state.cash - cost },
        p.id,
        (x) => ({
          ...x,
          renovation: { projectId: action.projectId, weeksLeft: weeks },
        }),
      )
      return sync(
        withLog(
          s,
          'money',
          'You booked a ' +
            proj.label +
            ' at ' +
            p.nickname +
            ' for ' +
            money(cost) +
            '. ' +
            weeks +
            ' weeks of dust and one portable toilet.',
        ),
      )
    }
    case 'EMERGENCY_REPAIR': {
      const p = propertyOf(state, action.propertyId)
      if (!p || state.ap < 1) return state
      if (state.cash < P3.EMERGENCY_REPAIR_COST)
        return withLog(
          state,
          'flavor',
          'The contractor wants a deposit. You want a miracle. Neither happens.',
        )
      const condition = Math.min(100, p.condition + P3.EMERGENCY_REPAIR_COND)
      let s = patchProperty(
        spendAp({ ...state, cash: state.cash - P3.EMERGENCY_REPAIR_COST }, 1),
        p.id,
        (x) => ({
          ...x,
          condition,
          /* A rent strike ends the moment the building stops being like that. */
          units:
            condition >= P3.LOW_CONDITION
              ? x.units.map((u) =>
                  u.openIssue?.eventId === 'rentStrike'
                    ? { ...u, openIssue: null }
                    : u,
                )
              : x.units,
        }),
      )
      s = withLog(
        s,
        'money',
        'You threw money directly at the building. It absorbed it.',
      )
      return sync(s)
    }
    case 'HANDLE_ISSUE': {
      const p = propertyOf(state, action.propertyId)
      const u = p?.units.find((x) => x.id === action.unitId)
      if (!p || !u || !u.openIssue || state.ap < 1) return state
      /* A rent strike is not a receipt problem. Only condition clears it. */
      if (u.openIssue.eventId === 'rentStrike')
        return withLog(
          state,
          'flavor',
          'You offered money. They wanted the building fixed. Those are different things.',
        )
      if (state.cash < u.openIssue.fixCost)
        return withLog(
          state,
          'flavor',
          'The trades want paying up front now. Word gets around.',
        )
      const eventId = u.openIssue.eventId
      let s: GameState = { ...state, cash: state.cash - u.openIssue.fixCost }
      s = patchUnit(spendAp(s, 1), p.id, u.id, (x) => ({
        ...x,
        openIssue: null,
      }))
      if (eventId === 'cityInspection')
        s = patchProperty(s, p.id, (x) => ({
          ...x,
          condition: Math.max(x.condition, P3.INSPECTION_REPAIR_TO),
        }))
      s = withLog(
        s,
        'money',
        interp(TENANT_FIX_LINES[eventId] ?? 'It is handled.', {
          nickname: p.nickname,
          name: u.tenant?.name ?? 'The tenant',
          tenantName: u.tenant?.name ?? 'The tenant',
        }),
      )
      return sync(s)
    }
    case 'EVICT': {
      const p = propertyOf(state, action.propertyId)
      const u = p?.units.find((x) => x.id === action.unitId)
      if (!p || !u || !u.tenant || u.evictionWeeksLeft !== null) return state
      if (state.ap < 1) return state
      if (state.cash < P3.EVICT_COST)
        return withLog(
          state,
          'flavor',
          'Evictions cost money you do not have. They stay. For now.',
        )
      const weeks =
        u.tenant.archetypeId === 'theHoarder'
          ? P3.EVICT_WEEKS_HOARDER
          : P3.EVICT_WEEKS
      const name = u.tenant.name
      let s = patchUnit(
        spendAp({ ...state, cash: state.cash - P3.EVICT_COST }, 1),
        p.id,
        u.id,
        (x) => ({ ...x, evictionWeeksLeft: weeks }),
      )
      s = withLog(
        s,
        'money',
        'You filed on ' +
          name +
          '. ' +
          money(P3.EVICT_COST) +
          ' in paper and ' +
          weeks +
          ' weeks of both of you pretending not to see each other.',
      )
      return sync(s)
    }
    case 'TOGGLE_PROPCO': {
      if (!state.propCoActive) {
        if (occupiedUnitCount(state) < P3.PROPCO_MIN_OCCUPIED_UNITS)
          return withLog(
            state,
            'flavor',
            'PropCo has a minimum. Three occupied units, or they "can’t build a relationship."',
          )
        return sync(
          withLog(
            { ...state, propCoActive: true },
            'flavor',
            "PropCo answered on the first ring: 'so here's the thing…'",
          ),
        )
      }
      return sync(
        withLog(
          { ...state, propCoActive: false },
          'flavor',
          "You cancelled PropCo. They said 'so here's the thing—' and you hung up for the last time.",
        ),
      )
    }
    case 'BUY_VRBO': {
      if (state.gagCounters.vrboOwned) return state
      const financed = action.downPct < 1
      if (action.downPct < P3.DOWN_MIN || action.downPct > 1) return state
      if (financed && !hasFreeMortgageSlot(state))
        return withLog(
          state,
          'flavor',
          'The underwriter looked at the words "short-term rental" and stopped reading.',
        )
      const down = Math.round(P3.VRBO.PRICE * action.downPct)
      if (state.cash < down)
        return withLog(
          state,
          'flavor',
          'You cannot cover the down payment on the MACHINE. The MACHINE waits.',
        )
      const id = 'P' + state.nextPropertyId
      const property: Property = {
        id,
        typeId: 'vrbo',
        nickname: VRBO_NICKNAME,
        baseValue: P3.VRBO.PRICE,
        condition: 70,
        mortgage: financed ? { balance: P3.VRBO.PRICE - down } : null,
        units: [],
        renovation: null,
        listedForSale: false,
        boughtWeek: state.week,
        isVrbo: true,
        vrboProfitStreak: 0,
        vrboRenoDone: false,
      }
      let s: GameState = {
        ...state,
        cash: state.cash - down,
        properties: [...state.properties, property],
        nextPropertyId: state.nextPropertyId + 1,
        gagCounters: { ...state.gagCounters, vrboOwned: true },
        pendingChoices: state.pendingChoices.filter((c) => c.kind !== 'vrboBuy'),
      }
      s = withLog(
        s,
        'money',
        'You bought the 424/7 VRBO for ' +
          money(P3.VRBO.PRICE) +
          '. The wholesaler wept and immediately posted about it.',
      )
      return sync(s)
    }
    case 'RESOLVE_PORTFOLIO_CHOICE': {
      const c = state.pendingChoices.find((x) => x.id === action.choiceId)
      if (!c) return state
      let s: GameState = {
        ...state,
        pendingChoices: state.pendingChoices.filter((x) => x.id !== c.id),
      }
      if (c.kind === 'lowball' && action.actionTag === 'accept') {
        const p = propertyOf(s, c.payload.propertyId as string)
        if (p) {
          const price = c.payload.offerAmount as number
          const proceeds = price - (p.mortgage?.balance ?? 0)
          s = {
            ...s,
            cash: s.cash + proceeds,
            properties: s.properties.filter((x) => x.id !== p.id),
          }
          s = withLog(
            s,
            'money',
            'SOLD: ' +
              p.nickname +
              ' for ' +
              money(price) +
              '. Larry shook your hand with both of his.',
          )
        }
      } else if (c.kind === 'lowball') {
        s = withLog(
          s,
          'flavor',
          'You held firm. The offer expired and so did the small talk.',
        )
      } else if (c.kind === 'renewal') {
        const propertyId = c.payload.propertyId as string
        const unitId = c.payload.unitId as string
        const p = propertyOf(s, propertyId)
        const u = p?.units.find((x) => x.id === unitId)
        if (p && u && u.tenant) {
          if (action.actionTag === 'raise') {
            const r = clamp(
              Math.round((u.rentR + P3.RENEWAL_RAISE) * 100) / 100,
              P3.RENT_R_MIN,
              P3.RENT_R_MAX,
            )
            s = patchUnit(s, p.id, u.id, (x) => ({ ...x, rentR: r }))
            if (chance(P3.RENEWAL_LEAVE_CHANCE)) {
              const a = tenantOf(u.tenant.archetypeId)
              s = patchUnit(s, p.id, u.id, (x) => ({
                ...x,
                tenant: null,
                openIssue: null,
                evictionWeeksLeft: null,
              }))
              s = withLog(
                s,
                'event',
                interp(pick(a.leave), {
                  name: u.tenant.name,
                  owed: String(Math.round(u.tenant.owed)),
                  nickname: p.nickname,
                }),
              )
            } else {
              s = withLog(
                s,
                'money',
                u.tenant.name +
                  ' signed the higher number, slowly, while maintaining eye contact.',
              )
            }
          } else {
            s = patchUnit(s, p.id, u.id, (x) => ({
              ...x,
              tenant: x.tenant
                ? {
                    ...x.tenant,
                    plannedStayWeeks:
                      x.tenant.plannedStayWeeks + P3.RENEWAL_STAY_BONUS_WEEKS,
                  }
                : null,
            }))
            s = withLog(
              s,
              'flavor',
              'You kept the rent where it was. ' +
                u.tenant.name +
                ' is staying, and said so twice.',
            )
          }
        }
      }
      return sync(s)
    }
    case 'END_WEEK':
      /* Unresolved decisions block the week. The button is disabled too, but
         the reducer is the source of truth. */
      if (state.pendingChoices.length > 0) return state
      return endWeek(state)
    case 'DEBUG_SET_MARKET':
      return sync(
        regeneratePool({
          ...state,
          marketState: action.marketState,
          nextMarketState: action.marketState,
        }),
      )
    case 'DEBUG_FORCE_CRASH':
      return sync(applyEvent(state, 'marketCrash').state)
    case 'DEBUG_FILL_VACANCIES': {
      let s = state
      state.properties.forEach((p) => {
        if (p.isVrbo) return
        p.units.forEach((u) => {
          if (u.tenant) return
          const a = pickApplicant(p, u.rentR)
          if (!a) return
          const tenant = makeTenant(a)
          s = patchUnit(s, p.id, u.id, (x) => ({ ...x, tenant }))
        })
      })
      return sync(s)
    }
    case 'DEBUG_CASH':
      return sync({ ...state, cash: state.cash + 100000 })
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

  /* 4-9. the portfolio week */
  const ctx = newWeekCtx()
  s = collectRent(s, ctx)
  s = rollApplicants(s, ctx)
  s = rollTenantEvents(s, ctx)
  s = resolveVrbo(s, ctx)
  s = rollFlips(s, ctx)
  s = tickProperties(s, ctx)

  /* 10. market transition / crash countdown */
  const market = tickMarket(s)
  s = market.state

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

  /* 12. pool rotation — skipped when step 10 already rebuilt the pool */
  s = rotatePool(s, market.regenerated)

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

  /* 13b. portfolio billing */
  const bills = billPortfolio(s, ctx)
  s = bills.state
  bills.lines.forEach((l) => money_out.push(l))

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

  /* 4b. the 424/7 VRBO, on its own guaranteed 6–9 week clock */
  if (vrboDue(s) && !s.pendingChoice) {
    const r = applyEvent(s, 'vrboSpam')
    s = scheduleNextVrbo(r.state)
    events.push(r.label)
  }

  /* 5. promotion. Unlike the inbound gate above, this reads reputation AFTER
        this week's channel gain — promotion has always used live earnings and
        deals, and reputation is no different. */
  /* 16. milestones come before promotions — a mortgage slot earned this week
     is available the moment the player looks at the market. */
  const ms = checkMilestones(s)
  s = ms.state
  ms.unlocked.forEach((m) => events.push(m.label))

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

  /* 17. peak first, so the recap can show what it was worth at its best */
  s = { ...s, peakNetWorth: Math.max(s.peakNetWorth, netWorth(s)) }
  if (s.cash < LOSE_AT) {
    s = withLog(
      s,
      'event',
      'Your card declined at the printer. Then at the gas station. Then, memorably, at the open house you were catering.',
    )
    if (s.properties.some((p) => p.mortgage))
      s = withLog(
        s,
        'event',
        'The leverage worked until it didn’t. A wholesaler is already calling about your portfolio.',
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
    portfolio: Array.from(ctx.rows.values()),
  }
  return { ...s, summary, promo: promo ? promo.name : null }
}
