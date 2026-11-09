/* A bot that plays one check-in: what a reasonable player does with a week.

   It exists for two jobs. The balance tests use it to ask "how far does a
   strong player get in a 52-week season?", and the city tests use it to fill
   a shared city with players who actually do things. It only ever sends
   actions a real client could send, plus "I'd like to buy that" intents that
   the caller turns into a BUY_PROPERTY (single player) or a bid (the city).

   Its dice are its own, so a run replays exactly. */

import { CHANNELS } from '../data/marketing'
import { SWAG } from '../data/swag'
import { atLeastRank, isSwagLocked } from '../logic/economy'
import { isChannelLocked } from '../logic/marketing'
import { displayedValue, eligibleTypes, hasFreeMortgageSlot, renoBlockReason, renoCost } from '../logic/portfolio'
import type { Action, GameState, Listing } from '../state/types'

/** The property ladder, tent to tower. */
const LADDER = ['starter', 'condo', 'townhouse', 'duplex', 'apartment', 'luxury']

export type BotStyle = 'strong' | 'casual'

export interface BotDice {
  next(): number
}

export function botDice(seed: number): BotDice {
  let a = seed >>> 0
  return {
    next() {
      a = (a + 0x6d2b79f5) >>> 0
      let t = a
      t = Math.imul(t ^ (t >>> 15), t | 1)
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    },
  }
}

export interface BuyIntent {
  listing: Listing
  /** What the bot is willing to pay. */
  amount: number
  downPct: number
}

export interface BotHooks {
  apply: (a: Action) => void
  get: () => GameState
  /** The listings the bot may want. Single player: state.marketPool. */
  listings: () => Listing[]
  /** Called at most once a check-in with the bot's favourite listing. */
  buy?: (intent: BuyIntent) => void
}

/** The defaults an absent player gets. Same answers the city's tick uses. */
export function safeChoiceTag(tags: string[]): string {
  for (const t of ['reject', 'keep', 'concede', 'decline', 'skip', 'humble', 'eat'])
    if (tags.includes(t)) return t
  return tags[tags.length - 1] ?? 'reject'
}

/** Clears whatever is on screen: calls, choices, the composer, a ceremony. */
function clearModals(h: BotHooks, d: BotDice, style: BotStyle): void {
  for (let guard = 0; guard < 40; guard++) {
    const s = h.get()
    if (s.gameOver) return
    if (s.call) {
      if (s.call.phase === 'awaitingTactic') h.apply({ type: 'PLAY_TACTIC', tacticId: 'empathize' })
      else if (s.call.phase === 'resolved') h.apply({ type: 'CLOSE_CALL_MODAL' })
      else h.apply({ type: 'ADVANCE_CALL' })
      continue
    }
    if (s.ceremony) {
      h.apply({ type: 'CLOSE_CEREMONY' })
      continue
    }
    if (s.pendingChoice) {
      h.apply({ type: 'RESOLVE_CHOICE_EVENT', key: safeChoiceTag(s.pendingChoice.options.map((o) => o.key)) as never })
      continue
    }
    if (s.pendingChoices.length) {
      const c = s.pendingChoices[0]
      const tags = c.options.map((o) => o.actionTag)
      /* A strong player takes a decent lowball in a cold market. */
      const tag = style === 'strong' && tags.includes('accept') && s.marketState !== 'hot' ? 'accept' : safeChoiceTag(tags)
      h.apply({ type: 'RESOLVE_PORTFOLIO_CHOICE', choiceId: c.id, actionTag: tag })
      continue
    }
    if (s.postComposerPending) {
      if (style === 'strong' && d.next() < 0.7) h.apply({ type: 'CREATE_POST', postId: 'marketUpdate', captionId: 'professional' })
      if (h.get().postComposerPending) h.apply({ type: 'SKIP_POST' })
      continue
    }
    return
  }
}

/** One check-in's worth of moves. */
export function playCheckIn(h: BotHooks, d: BotDice, style: BotStyle = 'strong'): void {
  if (h.get().callsEnabled) h.apply({ type: 'SET_CALLS_ENABLED', enabled: false })
  clearModals(h, d, style)

  /* Gear first: Hustle means more leads, Swagger means more closes. */
  if (style === 'strong') {
    for (const it of [...SWAG].sort((a, b) => a.price - b.price)) {
      const s = h.get()
      if (s.ownedSwagIds.includes(it.id) || it.shopHidden || isSwagLocked(it, s.rank)) continue
      if (it.ego >= 2 || it.hustle + it.swagger === 0) continue
      if (s.cash < it.price * 4 + 2000) continue
      h.apply({ type: 'BUY_SWAG', itemId: it.id })
      if (h.get().ownedSwagIds.includes(it.id)) h.apply({ type: 'EQUIP_SWAG', itemId: it.id })
    }
    /* One or two channels once there's money to spend on being seen. */
    const s = h.get()
    const affordable = CHANNELS.filter((c) => !isChannelLocked(s, c)).sort((a, b) => b.inboundChance / b.weeklyCost - a.inboundChance / a.weeklyCost)
    const want = s.cash > 20000 ? 2 : s.cash > 4000 ? 1 : 0
    const on = s.activeChannelIds.length
    if (on < want && affordable[on] && !s.activeChannelIds.includes(affordable[on].id))
      h.apply({ type: 'TOGGLE_CHANNEL', channelId: affordable[on].id })
    if (on > want && s.activeChannelIds.length) h.apply({ type: 'TOGGLE_CHANNEL', channelId: s.activeChannelIds[0] })
  }

  /* Spend the AP. */
  for (let guard = 0; guard < 12; guard++) {
    clearModals(h, d, style)
    const s = h.get()
    if (s.gameOver || s.ap < 1) break
    if (style === 'casual' && d.next() < 0.25) break
    const before = s.ap
    if (s.rank === 'receptionist') {
      h.apply(s.counters.showingsRun < 8 ? { type: 'ASSIST_SHOWING' } : { type: 'SIDE_HUSTLE' })
    } else {
      const live = s.leads.filter((l) => !l.sold)
      const ready = live.filter((l) => l.stage === 'ready').sort((a, b) => b.salePrice - a.salePrice)
      const warm = live.filter((l) => l.stage !== 'ready').sort((a, b) => (a.stage === 'shown' ? -1 : 1) - (b.stage === 'shown' ? -1 : 1) || b.salePrice - a.salePrice)
      if (ready[0]) h.apply({ type: 'ATTEMPT_CLOSE', leadId: ready[0].id })
      else if (warm[0] && (warm.length > 1 || s.ap > 1)) h.apply({ type: 'RUN_SHOWING', leadId: warm[0].id })
      else h.apply({ type: 'WORK_PHONES' })
    }
    if (h.get().ap === before) h.apply({ type: 'SIDE_HUSTLE' })
    if (h.get().ap === before) break
  }
  clearModals(h, d, style)

  /* Property. Seller's Agent and up. */
  const s = h.get()
  if (!atLeastRank(s.rank, 'sellerAgent')) return
  for (const p of s.properties) {
    if (p.isVrbo || p.renovation) continue
    const now = h.get()
    const vacant = p.units.every((u) => !u.tenant)
    /* Flip: gut it while empty, sell once it's done and the market is warm. */
    if (vacant && p.condition < 80 && !renoBlockReason(now, p, 'full') && now.cash > renoCost(now, p, 'full') + 15000)
      h.apply({ type: 'START_RENOVATION', propertyId: p.id, projectId: 'full' })
    else if (style === 'strong' && p.condition >= 95 && !p.listedForSale && now.marketState !== 'cold' && vacant)
      h.apply({ type: 'LIST_FOR_SALE', propertyId: p.id })
    else if (p.listedForSale && now.marketState === 'cold') h.apply({ type: 'DELIST', propertyId: p.id })
    if (p.mortgage && now.cash > 60000 + p.mortgage.balance / 4) h.apply({ type: 'PAY_PRINCIPAL', propertyId: p.id })
  }
  /* Out of mortgages as a Top Producer: sell the smallest rung to climb. */
  const top = h.get()
  if (style === 'strong' && top.rank === 'topProducer' && !hasFreeMortgageSlot(top) && !top.properties.some((p) => p.listedForSale)) {
    const rung = [...top.properties]
      .filter((p) => !p.isVrbo && !p.renovation)
      .sort((a, b) => LADDER.indexOf(a.typeId) - LADDER.indexOf(b.typeId) || a.baseValue - b.baseValue)[0]
    if (rung && top.marketState !== 'cold') h.apply({ type: 'LIST_FOR_SALE', propertyId: rung.id })
  }
  if (!h.buy) return
  const after = h.get()
  const reserve = style === 'strong' ? 8000 : 25000
  const types = new Set(eligibleTypes(after).map((t) => t.id))
  const options = h
    .listings()
    .filter((l) => types.has(l.typeId))
    /* Saving up for the top of the ladder. */
    .filter((l) => !(style === 'strong' && after.rank === 'topProducer') || LADDER.indexOf(l.typeId) >= 4)
    .filter((l) => after.cash >= l.askPrice * 0.2 + reserve)
    /* A strong Top Producer climbs the ladder: the biggest building it can
       carry. Otherwise, cheapest relative to what it'll be worth fixed up. */
    .sort((a, b) =>
      style === 'strong' && after.rank === 'topProducer'
        ? LADDER.indexOf(b.typeId) - LADDER.indexOf(a.typeId)
        : a.askPrice / a.intrinsicValue - b.askPrice / b.intrinsicValue,
    )
  const pick = options[0]
  if (!pick) return
  const winter = after.marketState === 'cold'
  const amount = Math.round(pick.askPrice * (style === 'strong' ? (winter ? 0.95 : 1.02) : 1))
  h.buy({ listing: pick, amount, downPct: 0.2 })
}

/** Value now, for logging in tests. */
export const holdingsValue = (s: GameState): number =>
  s.properties.reduce((t, p) => t + displayedValue(s, p), 0)
