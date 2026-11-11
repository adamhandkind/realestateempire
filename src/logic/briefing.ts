/* The Today briefing: what a player sees first when they open the game.

   Three questions, answered from the state alone:
     - What happened?          rent, offers and auction results, projects,
                               the neighbourhood and the market
     - What needs attention?   vacancies, loan payments, open issues,
                               renovation decisions, clients about to walk
     - What can I do next?     bid, renovate, refinance, list, or hold cash

   Pure, like the rest of logic/: no React, no storage, no randomness. It
   decides nothing about the game; it only reads it. The last week's summary
   is transient (never saved), so when it is gone — after a refresh — "what
   happened" falls back to last week's log lines. */

import { P3 } from '../data/p3'
import { LOSE_AT } from '../data/ranks'
import { weeklyExpenses } from './economy'
import { inCity } from './cityMode'
import { weeklyChannelSpend } from './marketing'
import {
  baseRentOf,
  chargedRent,
  displayedValue,
  hasFreeMortgageSlot,
  hoaOf,
  MARKET_LINES,
  refiQuote,
  renoBlockReason,
  renoCost,
  renoOf,
  renoWeeks,
  saleChance,
  totalUnitCount,
  typeOf,
  weeklyInterest,
} from './portfolio'
import { money } from './rand'
import type {
  Action,
  GameState,
  LogKind,
  Property,
  RenoProjectId,
  WeekSummary,
} from '../state/types'

/** Where a briefing item sends the player. Matches the game's tab ids. */
export type BriefingTarget = 'portfolio' | 'leads' | 'city' | 'marketing' | 'office'

export type Tone = 'good' | 'bad' | 'neutral'

export interface HappenedItem {
  kind: 'rent' | 'offers' | 'project' | 'neighbourhood' | 'money' | 'news'
  icon: string
  text: string
  tone: Tone
  /** Signed, when the line is about money. */
  amount?: number
}

export type AttentionLevel = 'urgent' | 'soon' | 'fyi'

export interface AttentionItem {
  id: string
  level: AttentionLevel
  icon: string
  title: string
  detail: string
  target: BriefingTarget
  /** A one-tap fix, when there is one. */
  action?: Action
  actionLabel?: string
}

export type MoveId = 'bid' | 'renovate' | 'refinance' | 'list' | 'leads' | 'hold'

export interface NextMove {
  id: MoveId
  icon: string
  title: string
  detail: string
  /** False greys the card out; `why` says what's missing. */
  available: boolean
  why?: string
  target?: BriefingTarget
  action?: Action
  actionLabel?: string
}

export interface Runway {
  cash: number
  /** Everything billed at the end of the week. */
  bills: number
  /** Rent expected from tenants who are paying. */
  rent: number
  /** Weeks of cash at the current burn; null when the week pays for itself. */
  weeks: number | null
}

export interface Briefing {
  week: number
  /** The week the "what happened" column is about. */
  reportWeek: number
  /** Net cash change over that week, when the summary is still in hand. */
  net: number | null
  happened: HappenedItem[]
  attention: AttentionItem[]
  moves: NextMove[]
  runway: Runway
}

/** What the shared city adds: the morning report, and your sealed offers. */
export interface BriefingExtras {
  summary?: WeekSummary | null
  /** One line per offer the last tick settled ("You won…", "Outbid on…"). */
  offers?: string[]
  /** Offers you have in for the next tick. */
  openBids?: number
}

const LEVEL_ORDER: Record<AttentionLevel, number> = { urgent: 0, soon: 1, fyi: 2 }

/* ------------------------------------------------------------ money flow */

/** What the end of the week will bill, before any surprises. */
export function weeklyBills(s: GameState): number {
  const interest = s.properties.reduce((t, p) => t + weeklyInterest(p), 0)
  const hoa = s.properties.reduce((t, p) => t + hoaOf(p), 0)
  const propCo = s.propCoActive ? totalUnitCount(s) * P3.PROPCO_PER_UNIT : 0
  const vrbo = s.properties.some((p) => p.isVrbo) ? P3.VRBO.UPKEEP : 0
  return weeklyExpenses(s) + weeklyChannelSpend(s) + interest + hoa + propCo + vrbo
}

/** Rent from units with a tenant who is paying (not mid-eviction). */
export function expectedRent(s: GameState): number {
  return s.properties.reduce(
    (t, p) =>
      t +
      p.units.reduce(
        (u, unit) =>
          unit.tenant && unit.evictionWeeksLeft === null
            ? u + chargedRent(p, unit, baseRentOf(p))
            : u,
        0,
      ),
    0,
  )
}

export function runwayOf(s: GameState): Runway {
  const bills = weeklyBills(s)
  const rent = expectedRent(s)
  const burn = bills - rent
  return {
    cash: s.cash,
    bills,
    rent,
    weeks: burn > 0 ? Math.max(0, Math.floor((s.cash - LOSE_AT) / burn)) : null,
  }
}

/* -------------------------------------------------------- what happened */

const sum = (lines: [string, number][]) => lines.reduce((t, [, n]) => t + n, 0)

const plural = (n: number, one: string, many = one + 's') => n + ' ' + (n === 1 ? one : many)

const LOG_ICON: Record<LogKind, string> = {
  money: '💵',
  deal: '🤝',
  event: '📰',
  promotion: '🎉',
  flavor: '💬',
}

/** Portfolio row events worth surfacing on their own, and how they read. */
const ROW_EVENTS: { match: (e: string) => boolean; icon: string; tone: Tone; kind: HappenedItem['kind'] }[] = [
  { match: (e) => e === 'SOLD', icon: '🔨', tone: 'good', kind: 'offers' },
  { match: (e) => e === 'Lowball offer', icon: '📨', tone: 'neutral', kind: 'offers' },
  { match: (e) => e === 'Renovation complete', icon: '🛠️', tone: 'good', kind: 'project' },
  { match: (e) => e.endsWith('moved in'), icon: '🔑', tone: 'good', kind: 'rent' },
  { match: (e) => e === 'Referral filled a vacancy', icon: '🔑', tone: 'good', kind: 'rent' },
  { match: (e) => e.startsWith('Rent') || e === 'Tenant moved out', icon: '⚠️', tone: 'bad', kind: 'rent' },
  { match: (e) => e === 'Eviction complete', icon: '📦', tone: 'neutral', kind: 'rent' },
  { match: (e) => e.startsWith('Inspection'), icon: '📋', tone: 'neutral', kind: 'news' },
]

function happenedFromSummary(s: GameState, sm: WeekSummary, offers: string[]): HappenedItem[] {
  const out: HappenedItem[] = []

  /* Rent. */
  const rentIn = sm.portfolio.reduce((t, r) => t + r.rentIn, 0)
  if (sm.portfolio.length > 0) {
    const paying = sm.portfolio.filter((r) => r.rentIn > 0).length
    out.push({
      kind: 'rent',
      icon: '🏠',
      text:
        rentIn > 0
          ? 'Rent received from ' + plural(paying, 'property', 'properties') + '.'
          : 'No rent came in. Not one door paid.',
      tone: rentIn > 0 ? 'good' : 'bad',
      amount: rentIn,
    })
  }

  /* Offers and auction results: the city's tick first, then your own sales. */
  offers.forEach((o) =>
    out.push({
      kind: 'offers',
      icon: /won|bought|accepted/i.test(o) ? '🔨' : '📨',
      text: o,
      tone: /won|bought|accepted/i.test(o) ? 'good' : /outbid|rejected|lost/i.test(o) ? 'bad' : 'neutral',
    }),
  )

  /* Property-level news. */
  sm.portfolio.forEach((r) =>
    r.events.forEach((e) => {
      const rule = ROW_EVENTS.find((x) => x.match(e))
      if (!rule) return
      out.push({ kind: rule.kind, icon: rule.icon, text: r.nickname + ': ' + e, tone: rule.tone })
    }),
  )

  /* Projects still under way. */
  out.push(...projectProgress(s))

  /* The neighbourhood. */
  sm.territory?.rows.forEach((row) => {
    const pts = Math.round(row.delta * 10) / 10
    if (pts === 0) return
    out.push({
      kind: 'neighbourhood',
      icon: pts > 0 ? '📈' : '📉',
      text:
        row.name + ': your share ' + (pts > 0 ? 'up ' : 'down ') + Math.abs(pts).toFixed(1) + '%' +
        (row.holder ? ' · held by ' + row.holder : '') + '.',
      tone: pts > 0 ? 'good' : 'bad',
    })
  })
  sm.territory?.rivalMoves.forEach((m) =>
    out.push({ kind: 'neighbourhood', icon: '🕴️', text: m, tone: 'neutral' }),
  )
  out.push(marketLine(s))

  /* Whatever else the week threw at you. */
  sm.events.forEach((e) => out.push({ kind: 'news', icon: '📰', text: e, tone: 'neutral' }))

  return out
}

function happenedFromLog(s: GameState, reportWeek: number, offers: string[]): HappenedItem[] {
  const out: HappenedItem[] = offers.map((o) => ({
    kind: 'offers' as const,
    icon: '📨',
    text: o,
    tone: 'neutral' as const,
  }))
  s.log
    .filter((e) => e.week === reportWeek && e.kind !== 'flavor')
    .slice(0, 6)
    .forEach((e) => out.push({ kind: e.kind === 'money' ? 'money' : 'news', icon: LOG_ICON[e.kind], text: e.text, tone: 'neutral' }))
  out.push(...projectProgress(s))
  out.push(marketLine(s))
  return out
}

function projectProgress(s: GameState): HappenedItem[] {
  return s.properties
    .filter((p) => p.renovation)
    .map((p) => {
      const r = p.renovation!
      const total = Math.max(renoWeeks(s, r.projectId), r.weeksLeft)
      const done = total - r.weeksLeft
      return {
        kind: 'project' as const,
        icon: '🚧',
        text:
          renoOf(r.projectId).label +
          ' at ' +
          p.nickname +
          ': ' +
          Math.round((done / total) * 100) +
          '% done, ' +
          plural(r.weeksLeft, 'week') +
          ' to go.',
        tone: 'neutral' as const,
      }
    })
}

function marketLine(s: GameState): HappenedItem {
  if (s.crash.weeksLeft > 0)
    return {
      kind: 'neighbourhood',
      icon: '📉',
      text: 'Market crash: ' + plural(s.crash.weeksLeft, 'week') + ' left. Values are down 20%. So are prices.',
      tone: 'bad',
    }
  return {
    kind: 'neighbourhood',
    icon: s.marketState === 'hot' ? '🔥' : s.marketState === 'cold' ? '🧊' : '🌤️',
    text: MARKET_LINES[s.marketState],
    tone: s.marketState === 'hot' ? 'good' : s.marketState === 'cold' ? 'bad' : 'neutral',
  }
}

/* ---------------------------------------------------- needs attention */

function attentionItems(s: GameState, runway: Runway, extras: BriefingExtras): AttentionItem[] {
  const out: AttentionItem[] = []

  if (s.pendingChoice)
    out.push({
      id: 'choice',
      level: 'urgent',
      icon: '❓',
      title: s.pendingChoice.title,
      detail: 'A decision is waiting in the Office.',
      target: 'office',
    })
  s.pendingChoices.forEach((c) =>
    out.push({
      id: 'pchoice:' + c.id,
      level: 'urgent',
      icon: '❓',
      title: c.title,
      detail: 'The week will not end until you answer.',
      target: 'portfolio',
    }),
  )

  /* Money: can you cover the week, and when is the bank paid. */
  const after = runway.cash - runway.bills + runway.rent
  const interest = s.properties.reduce((t, p) => t + weeklyInterest(p), 0)
  const mortgages = s.properties.filter((p) => p.mortgage).length
  if (after < LOSE_AT)
    out.push({
      id: 'broke',
      level: 'urgent',
      icon: '🚨',
      title: "You can't cover this week's bills",
      detail:
        'Bills ' + money(runway.bills) + ', rent in ' + money(runway.rent) + ', cash ' + money(runway.cash) +
        '. Close a deal, refinance, or sell before the week ends.',
      target: 'portfolio',
    })
  else if (mortgages > 0)
    out.push({
      id: 'loan',
      level: runway.weeks !== null && runway.weeks < 3 ? 'soon' : 'fyi',
      icon: '🏦',
      title: 'Loan payment due at week’s end: ' + money(interest),
      detail:
        'Interest on ' + plural(mortgages, 'mortgage') +
        (runway.weeks !== null ? '. At this burn you have ' + plural(runway.weeks, 'week') + ' of cash.' : '. Rent covers it.'),
      target: 'portfolio',
    })

  s.properties.forEach((p) => {
    if (p.isVrbo) return
    const vacant = p.units.filter((u) => !u.tenant)
    if (vacant.length > 0 && !p.renovation && !p.listedForSale) {
      const lost = vacant.reduce((t, u) => t + chargedRent(p, u, baseRentOf(p)), 0)
      const pricey = vacant.some((u) => u.rentR > 1.05)
      out.push({
        id: 'vacant:' + p.id,
        level: 'soon',
        icon: '🚪',
        title:
          (p.units.length === 1 ? p.nickname + ' is vacant' : plural(vacant.length, 'vacant unit') + ' at ' + p.nickname),
        detail:
          'About ' + money(lost) + '/wk of rent not coming in.' +
          (pricey ? ' Asking above fair rent scares applicants off; try lowering it.' : ' Applicants arrive at week’s end.'),
        target: 'portfolio',
      })
    }

    p.units.forEach((u) => {
      if (!u.openIssue) return
      const strike = u.openIssue.eventId === 'rentStrike'
      out.push({
        id: 'issue:' + p.id + ':' + u.id,
        level: u.openIssue.weeksOpen >= 2 ? 'urgent' : 'soon',
        icon: '🔧',
        title: 'Open issue at ' + p.nickname + (u.tenant ? ' (' + u.tenant.name + ')' : ''),
        detail: strike
          ? 'Rent strike. Money won’t fix it; the building’s condition will.'
          : 'Open ' + plural(u.openIssue.weeksOpen, 'week') + '. Rent is withheld until it’s fixed.',
        target: 'portfolio',
        ...(strike
          ? { action: { type: 'EMERGENCY_REPAIR' as const, propertyId: p.id }, actionLabel: 'Emergency repair · ' + money(P3.EMERGENCY_REPAIR_COST) }
          : {
              action: { type: 'HANDLE_ISSUE' as const, propertyId: p.id, unitId: u.id },
              actionLabel: 'Fix · ' + money(u.openIssue.fixCost) + ' · 1 AP',
            }),
      })
    })

    if (p.condition < P3.LOW_CONDITION && !p.renovation)
      out.push({
        id: 'cond:' + p.id,
        level: 'soon',
        icon: '🏚️',
        title: p.nickname + ' is falling apart (' + Math.round(p.condition) + '%)',
        detail: 'Low condition fails inspections and drives tenants out. Repair or renovate.',
        target: 'portfolio',
        action: { type: 'EMERGENCY_REPAIR', propertyId: p.id },
        actionLabel: 'Emergency repair · ' + money(P3.EMERGENCY_REPAIR_COST) + ' · 1 AP',
      })

    if (p.renovation && p.renovation.weeksLeft <= 1)
      out.push({
        id: 'renodone:' + p.id,
        level: 'soon',
        icon: '🛠️',
        title: renoOf(p.renovation.projectId).label + ' at ' + p.nickname + ' finishes this week',
        detail: 'Decide what it’s for: rent it out at the new rate, or list it while it’s shiny.',
        target: 'portfolio',
      })

    const evicting = p.units.filter((u) => u.evictionWeeksLeft !== null)
    if (evicting.length > 0)
      out.push({
        id: 'evict:' + p.id,
        level: 'fyi',
        icon: '📦',
        title: 'Eviction under way at ' + p.nickname,
        detail: plural(Math.max(...evicting.map((u) => u.evictionWeeksLeft ?? 0)), 'week') + ' left. No rent until then.',
        target: 'portfolio',
      })

    if (p.listedForSale)
      out.push({
        id: 'listed:' + p.id,
        level: 'fyi',
        icon: '🪧',
        title: p.nickname + ' is on the market',
        detail: 'Asking ' + money(displayedValue(s, p)) + '. About a ' + Math.round(saleChance(s) * 100) + '% chance it sells each week.',
        target: 'portfolio',
        action: { type: 'DELIST', propertyId: p.id },
        actionLabel: 'Delist',
      })
  })

  const walking = s.leads.filter((l) => !l.sold && l.patience <= 1)
  if (walking.length > 0)
    out.push({
      id: 'leads',
      level: 'urgent',
      icon: '⏳',
      title: plural(walking.length, 'client') + ' will walk at week’s end',
      detail: walking.map((l) => l.clientName).join(', ') + '. Show or close them now.',
      target: 'leads',
    })

  if (extras.openBids)
    out.push({
      id: 'bids',
      level: 'fyi',
      icon: '✉️',
      title: plural(extras.openBids, 'sealed offer') + ' in for the next tick',
      detail: 'Results land in tomorrow’s report. Make sure you can cover the down payment.',
      target: 'portfolio',
    })

  return out.sort((a, b) => LEVEL_ORDER[a.level] - LEVEL_ORDER[b.level])
}

/* ------------------------------------------------------ what you can do */

/** The renovation with the best value-added-minus-cost you can start now. */
export function bestRenovation(
  s: GameState,
): { property: Property; projectId: RenoProjectId; cost: number; gain: number; weeks: number } | null {
  let best: ReturnType<typeof bestRenovation> = null
  s.properties.forEach((p) => {
    const ids: RenoProjectId[] = p.isVrbo ? ['full'] : ((typeOf(p.typeId)?.renoEligible ?? []) as RenoProjectId[])
    ids.forEach((id) => {
      if (renoBlockReason(s, p, id)) return
      if (renoOf(id).requiresVacant && p.units.some((u) => u.tenant)) return
      const cost = renoCost(s, p, id)
      const gain = Math.round(displayedValue(s, p) * (renoOf(id).valueMult - 1))
      if (!best || gain - cost > best.gain - best.cost)
        best = { property: p, projectId: id, cost, gain, weeks: renoWeeks(s, id) }
    })
  })
  return best
}

function moves(s: GameState, runway: Runway): NextMove[] {
  const out: NextMove[] = []
  const city = inCity(s)

  /* Bid / buy. */
  const pool = s.marketPool
  const cheapest = pool.reduce<number | null>((m, l) => (m === null || l.askPrice < m ? l.askPrice : m), null)
  const downNeeded = cheapest === null ? 0 : hasFreeMortgageSlot(s) ? cheapest * P3.DOWN_MIN : cheapest
  out.push({
    id: 'bid',
    icon: city ? '🔨' : '🏷️',
    title: city ? 'Bid on a listing' : 'Buy a property',
    detail:
      pool.length === 0
        ? 'Nothing on the market for someone at your level yet.'
        : plural(pool.length, 'listing') + ' up' + (cheapest !== null ? ', from ' + money(cheapest) : '') +
          '. You need about ' + money(downNeeded) + ' down' + (hasFreeMortgageSlot(s) ? '' : ' (all-cash: no mortgage slot free)') +
          (city ? '. Sealed bids settle at the tick.' : '.'),
    available: pool.length > 0 && s.cash >= downNeeded,
    why: pool.length === 0 ? 'No listings' : s.cash < downNeeded ? 'Need ' + money(downNeeded - s.cash) + ' more' : undefined,
    target: 'portfolio',
    actionLabel: city ? 'See listings' : 'Browse the market',
  })

  /* Renovate. */
  const reno = bestRenovation(s)
  out.push({
    id: 'renovate',
    icon: '🛠️',
    title: 'Renovate',
    detail: reno
      ? renoOf(reno.projectId).label + ' at ' + reno.property.nickname + ': ' + money(reno.cost) +
        ', about +' + money(reno.gain) + ' in value, ' + plural(reno.weeks, 'week') + '.'
      : s.properties.length === 0
        ? 'Own something first.'
        : 'No project you can start right now (cash, crews already in, or tenants in the way).',
    available: !!reno,
    why: reno ? undefined : s.properties.length === 0 ? 'No properties' : 'Nothing startable',
    target: 'portfolio',
    actionLabel: 'Pick a project',
  })

  /* Refinance. */
  const refis = s.properties
    .map((p) => ({ p, q: refiQuote(s, p) }))
    .filter((x) => !x.q.blocked)
    .sort((a, b) => b.q.cashOut - a.q.cashOut)
  const refi = refis[0]
  out.push({
    id: 'refinance',
    icon: '🏦',
    title: 'Refinance',
    detail: refi
      ? refi.p.nickname + ': take ' + money(refi.q.cashOut) + ' out (fee ' + money(refi.q.fee) + '). New balance ' +
        money(refi.q.newBalance) + ', interest ' + money(Math.round(refi.q.newBalance * P3.MORTGAGE_WEEKLY_RATE)) + '/wk.'
      : s.properties.length === 0
        ? 'Nothing to borrow against yet.'
        : 'Not enough equity anywhere to be worth the paperwork. Values move with the market.',
    available: !!refi,
    why: refi ? undefined : 'No equity to pull',
    ...(refi
      ? { action: { type: 'REFINANCE' as const, propertyId: refi.p.id }, actionLabel: 'Refinance ' + refi.p.nickname }
      : { target: 'portfolio' as const, actionLabel: 'See properties' }),
  })

  /* List. Prefer a fresh renovation, then the most equity. */
  const listable = s.properties
    .filter((p) => !p.listedForSale && !p.renovation)
    .map((p) => ({ p, equity: displayedValue(s, p) - (p.mortgage?.balance ?? 0) }))
    .sort((a, b) => b.p.condition - a.p.condition || b.equity - a.equity)
  const list = listable[0]
  out.push({
    id: 'list',
    icon: '🪧',
    title: 'List a property',
    detail: list
      ? list.p.nickname + ' would ask ' + money(displayedValue(s, list.p)) + ', about ' + money(list.equity) +
        ' equity. ~' + Math.round(saleChance(s) * 100) + '% chance a week' +
        (list.p.units.some((u) => u.tenant) ? '; tenants knock a little off the price.' : '.')
      : s.properties.length === 0
        ? 'Nothing to sell.'
        : 'Everything is listed or under renovation.',
    available: !!list && s.ap >= 1,
    why: !list ? 'Nothing listable' : s.ap < 1 ? 'Out of AP this week' : undefined,
    ...(list
      ? { action: { type: 'LIST_FOR_SALE' as const, propertyId: list.p.id }, actionLabel: 'List ' + list.p.nickname + ' · 1 AP' }
      : { target: 'portfolio' as const, actionLabel: 'See properties' }),
  })

  /* The agent loop is still the engine of cash. */
  const ready = s.leads.filter((l) => !l.sold)
  out.push({
    id: 'leads',
    icon: '📞',
    title: 'Work your leads',
    detail:
      ready.length > 0
        ? plural(ready.length, 'client') + ' on the board, ' + plural(s.ap, 'AP') + ' left this week.'
        : 'No clients yet. Work the phones or turn on a marketing channel.',
    available: s.ap > 0,
    why: s.ap > 0 ? undefined : 'Out of AP this week',
    target: ready.length > 0 ? 'leads' : 'office',
    actionLabel: ready.length > 0 ? 'Open leads' : 'To the office',
  })

  /* Hold cash. */
  out.push({
    id: 'hold',
    icon: '💰',
    title: 'Hold cash',
    detail:
      'Keep ' + money(s.cash) + ' in the account. Next week bills ' + money(runway.bills) +
      ' against ' + money(runway.rent) + ' rent' +
      (runway.weeks === null ? ': the portfolio pays for itself.' : ': about ' + plural(runway.weeks, 'week') + ' of runway.') +
      (s.marketState === 'cold' || s.crash.weeksLeft > 0 ? ' Prices are soft; cash buys more next week.' : ''),
    available: true,
  })

  return out
}

/* ---------------------------------------------------------------- entry */

export function buildBriefing(s: GameState, extras: BriefingExtras = {}): Briefing {
  const summary = extras.summary !== undefined ? extras.summary : s.summary
  const offers = extras.offers ?? []
  const reportWeek = summary?.week ?? Math.max(1, s.week - 1)
  const runway = runwayOf(s)
  const happened =
    s.week <= 1 && !summary
      ? [
          {
            kind: 'news' as const,
            icon: '👋',
            text: 'Week one. Nothing has happened yet, which is the last time that will be true.',
            tone: 'neutral' as const,
          },
          marketLine(s),
        ]
      : summary
        ? happenedFromSummary(s, summary, offers)
        : happenedFromLog(s, reportWeek, offers)
  /* The market line can arrive twice: once from the log, once from us. */
  const seen = new Set<string>()
  const unique = happened.filter((h) => !seen.has(h.text) && !!seen.add(h.text))
  return {
    week: s.week,
    reportWeek,
    net: summary ? sum(summary.moneyIn) - sum(summary.moneyOut) : null,
    happened: unique,
    attention: attentionItems(s, runway, extras),
    moves: moves(s, runway),
    runway,
  }
}

/** For a badge on the Today tab. */
export const urgentCount = (b: Briefing): number => b.attention.filter((a) => a.level === 'urgent').length
