/* The End Week phases that touch the portfolio. Each phase takes the state and
   a WeekCtx, returns the new state, and records money and events on the ctx
   rows the Week Summary renders. Phase order is fixed by the Phase 3 spec and
   enforced by a test — do not reorder.

   Two settled decisions, both load-bearing:

   1. Condition decay. An occupied unit contributes its archetype's
      conditionPerWeek; a property with zero occupied units decays
      P3.CONDITION_DECAY_VACANT. The two rules in the spec are the same number
      seen from two sides — nothing is double-counted.

   2. Tenant-event ordering: roll new events first, then tick open issues, then
      let PropCo settle minors. A minor can be born and settled in the same
      week, which is the point of paying PropCo. */

import { MILESTONES } from '../data/milestones'
import { P3 } from '../data/p3'
import { RENO_COMPLETE_LINE } from '../data/properties'
import { CREW_DAMAGE, CREW_VIRAL, DAVE_BAD, DAVE_GOOD } from '../data/tenants'
import { MACHINE_TITLE, VRBO_EVENTS } from '../data/vrbo'
import {
  INSPECTION_PASS_LINE,
  NOISE_QUIT_LINE,
  PROPCO_FIX_PREFIX,
  RENEWAL_BODY,
  TENANT_EVENTS,
  TENANT_EVENT_LINES,
  TENANT_FIX_LINES,
} from '../data/tenantEvents'
import type {
  GameState,
  MilestoneDef,
  PortfolioSummaryRow,
  Property,
  SummaryLine,
  TenantEventDef,
  UnitState,
} from '../state/types'
import { clampRep } from './economy'
import { withLog } from './log'
import {
  anyUnitOccupied,
  applicantChance,
  baseRentOf,
  chargedRent,
  displayedValue,
  fillPool,
  hoaOf,
  interp,
  makeTenant,
  MARKET_LINES,
  netWorth,
  pickApplicant,
  regeneratePool,
  renoOf,
  rollNextMarket,
  saleChance,
  tenantOf,
  totalUnitCount,
  vrboIncome,
  vrboJitter,
  vrboOccupancy,
  weeklyInterest,
} from './portfolio'
import { chance, money, pick, randInt, weightedPick } from './rand'

export interface WeekCtx {
  rows: Map<string, PortfolioSummaryRow>
}

export const newWeekCtx = (): WeekCtx => ({ rows: new Map() })

export function rowOf(ctx: WeekCtx, p: Property): PortfolioSummaryRow {
  const existing = ctx.rows.get(p.id)
  if (existing) return existing
  const row: PortfolioSummaryRow = {
    nickname: p.nickname,
    rentIn: 0,
    moneyOut: 0,
    net: 0,
    events: [],
  }
  ctx.rows.set(p.id, row)
  return row
}

/** Every phase edits properties through this so no phase hand-rolls a map. */
function patch(
  s: GameState,
  propertyId: string,
  fn: (p: Property) => Property,
): GameState {
  return {
    ...s,
    properties: s.properties.map((p) => (p.id === propertyId ? fn(p) : p)),
  }
}

function patchUnit(
  s: GameState,
  propertyId: string,
  unitId: string,
  fn: (u: UnitState) => UnitState,
): GameState {
  return patch(s, propertyId, (p) => ({
    ...p,
    units: p.units.map((u) => (u.id === unitId ? fn(u) : u)),
  }))
}

/** Placeholders every tenant/event line may use. */
const vars = (p: Property, u: UnitState) => ({
  nickname: p.nickname,
  name: u.tenant?.name ?? 'The tenant',
  tenantName: u.tenant?.name ?? 'The tenant',
  owed: String(Math.round(u.tenant?.owed ?? 0)),
})

/** Vacates a unit and logs the archetype's leave line. */
export function moveOut(s: GameState, p: Property, u: UnitState): GameState {
  const a = u.tenant ? tenantOf(u.tenant.archetypeId) : null
  const line = a && a.leave.length ? interp(pick(a.leave), vars(p, u)) : null
  let out = patchUnit(s, p.id, u.id, (x) => ({
    ...x,
    tenant: null,
    openIssue: null,
    evictionWeeksLeft: null,
  }))
  if (line) out = withLog(out, 'event', line)
  return out
}

/* ------------------------------------------------- rent collection */

export function collectRent(state: GameState, ctx: WeekCtx): GameState {
  let s = state
  for (const p of state.properties) {
    if (p.isVrbo || p.renovation) continue
    for (const u of p.units) {
      if (!u.tenant || u.evictionWeeksLeft !== null) continue
      const row = rowOf(ctx, p)
      const a = tenantOf(u.tenant.archetypeId)
      if (u.openIssue) {
        row.events.push('Rent withheld — ' + u.openIssue.eventId)
        s = withLog(
          s,
          'money',
          u.tenant.name +
            ' is not paying rent until the thing at ' +
            p.nickname +
            ' is fixed. That is how that works.',
        )
        continue
      }
      const rent = chargedRent(p, u, baseRentOf(p))
      if (chance(a.payChance)) {
        let gross = rent
        if (a.onSkip === 'recoverHalfLater' && u.tenant.owed > 0) {
          gross += Math.round(u.tenant.owed * P3.ARREARS_RECOVERY)
          s = patchUnit(s, p.id, u.id, (x) => ({
            ...x,
            tenant: x.tenant ? { ...x.tenant, owed: 0 } : null,
          }))
        }
        const net = state.propCoActive
          ? Math.round(gross * (1 - P3.PROPCO_RENT_CUT))
          : gross
        s = { ...s, cash: s.cash + net }
        row.rentIn += net
      } else if (a.onSkip === 'gone') {
        s = patchUnit(s, p.id, u.id, (x) => ({
          ...x,
          tenant: x.tenant ? { ...x.tenant, owed: 0 } : null,
        }))
        if (a.skip.length)
          s = withLog(s, 'event', interp(pick(a.skip), vars(p, u)))
        row.events.push('Rent written off')
      } else {
        s = patchUnit(s, p.id, u.id, (x) => ({
          ...x,
          tenant: x.tenant ? { ...x.tenant, owed: x.tenant.owed + rent } : null,
        }))
        if (a.skip.length)
          s = withLog(s, 'event', interp(pick(a.skip), vars(p, u)))
        row.events.push('Rent late')
      }
    }
  }
  return s
}

/* ---------------------------------------------------- applicants */

export function rollApplicants(state: GameState, ctx: WeekCtx): GameState {
  let s = state
  for (const p of state.properties) {
    if (p.isVrbo || p.renovation) continue
    for (const u of p.units) {
      if (u.tenant) continue
      if (!chance(applicantChance(u.rentR, state.propCoActive))) continue
      const a = pickApplicant(p, u.rentR)
      if (!a) continue
      const tenant = makeTenant(a)
      s = patchUnit(s, p.id, u.id, (x) => ({ ...x, tenant }))
      rowOf(ctx, p).events.push(a.label + ' moved in')
      s = withLog(
        s,
        'event',
        interp(pick(a.intro), { ...vars(p, u), name: tenant.name }),
      )
    }
  }
  return s
}

/* -------------------------------------------------- tenant events */

function eventWeight(
  e: TenantEventDef,
  ctx: { property: Property; unit: UnitState; state: GameState },
): number {
  return e.condition(ctx) ? e.weight * e.weightMult(ctx) : 0
}

export function rollTenantEvents(state: GameState, ctx: WeekCtx): GameState {
  let s = state

  /* (a) new events on units with nothing already open */
  for (const p of state.properties) {
    if (p.isVrbo || p.renovation) continue
    for (const u of p.units) {
      if (!u.tenant || u.evictionWeeksLeft !== null || u.openIssue) continue
      const p2 = s.properties.find((x) => x.id === p.id)!
      const u2 = p2.units.find((x) => x.id === u.id)!
      if (!u2.tenant) continue
      const roll =
        P3.TENANT_EVENT_BASE * (p2.condition < P3.LOW_CONDITION ? 2 : 1)
      if (!chance(roll)) continue
      const eCtx = { property: p2, unit: u2, state: s }
      const e = weightedPick(TENANT_EVENTS, (x) => eventWeight(x, eCtx))
      if (!e) continue
      s = applyTenantEvent(s, ctx, p2, u2, e)
    }
  }

  /* (b) tick everything that is still open */
  for (const p of s.properties) {
    for (const u of p.units) {
      if (!u.openIssue) continue
      const weeksOpen = u.openIssue.weeksOpen + 1
      s = patchUnit(s, p.id, u.id, (x) => ({
        ...x,
        openIssue: x.openIssue ? { ...x.openIssue, weeksOpen } : null,
      }))
      s = patch(s, p.id, (x) => ({
        ...x,
        condition: Math.max(0, x.condition - 3),
      }))
      if (u.openIssue.eventId === 'noiseComplaint' && weeksOpen >= 2) {
        const current = s.properties.find((x) => x.id === p.id)!
        s = moveOut(s, current, u)
        s = withLog(s, 'event', NOISE_QUIT_LINE)
        rowOf(ctx, p).events.push('Noise complaint ended the tenancy')
      }
    }
  }

  /* (c) PropCo settles the minors it is paid to settle */
  if (s.propCoActive) {
    for (const p of s.properties) {
      for (const u of p.units) {
        if (!u.openIssue) continue
        const def = TENANT_EVENTS.find((e) => e.id === u.openIssue!.eventId)
        if (!def || !def.minor) continue
        if (s.cash < u.openIssue.fixCost) continue
        const cost = u.openIssue.fixCost
        const eventId = u.openIssue.eventId
        s = { ...s, cash: s.cash - cost }
        s = patchUnit(s, p.id, u.id, (x) => ({ ...x, openIssue: null }))
        const row = rowOf(ctx, p)
        row.moneyOut += cost
        row.events.push('PropCo fixed ' + eventId)
        s = withLog(
          s,
          'money',
          PROPCO_FIX_PREFIX +
            interp(TENANT_FIX_LINES[eventId] ?? 'It is handled.', vars(p, u)),
        )
      }
    }
  }

  return s
}

function applyTenantEvent(
  state: GameState,
  ctx: WeekCtx,
  p: Property,
  u: UnitState,
  e: TenantEventDef,
): GameState {
  let s = state
  const row = rowOf(ctx, p)
  const v = vars(p, u)
  const openIssue = (fixCost: number, conditionDelta = 0): GameState => {
    let out = patchUnit(s, p.id, u.id, (x) => ({
      ...x,
      openIssue: { eventId: e.id, weeksOpen: 0, fixCost },
    }))
    if (conditionDelta)
      out = patch(out, p.id, (x) => ({
        ...x,
        condition: Math.max(0, x.condition + conditionDelta),
      }))
    return withLog(out, 'event', interp(TENANT_EVENT_LINES[e.id], v))
  }

  switch (e.id) {
    case 'burstPipe':
      row.events.push('Burst pipe')
      return openIssue(e.fixCost, -5)
    case 'roofLeak':
      row.events.push('Roof leak')
      return openIssue(e.fixCost, -8)
    case 'noiseComplaint':
      row.events.push('Noise complaint')
      return openIssue(0)
    case 'supportRaccoon':
      row.events.push('Support raccoon')
      return openIssue(e.fixCost)
    case 'rentStrike':
      row.events.push('Rent strike')
      return openIssue(0)
    case 'greatReferral': {
      const vacant = p.units.filter((x) => x.tenant === null)
      if (!vacant.length) return s
      const target = pick(vacant)
      const a = tenantOf('perfectPatricia')
      const tenant = makeTenant(a)
      s = patchUnit(s, p.id, target.id, (x) => ({ ...x, tenant }))
      row.events.push('Referral filled a vacancy')
      return withLog(s, 'event', TENANT_EVENT_LINES.greatReferral)
    }
    case 'cityInspection': {
      if (p.condition >= P3.INSPECTION_PASS_COND) {
        row.events.push('Inspection passed')
        return withLog(s, 'event', interp(INSPECTION_PASS_LINE, v))
      }
      const fixCost =
        (P3.INSPECTION_PASS_COND - p.condition) * P3.INSPECTION_REPAIR_PER_POINT
      s = { ...s, cash: s.cash - P3.INSPECTION_FINE }
      row.moneyOut += P3.INSPECTION_FINE
      row.events.push('Inspection failed')
      return patchUnit(
        withLog(s, 'event', interp(TENANT_EVENT_LINES.cityInspection, v)),
        p.id,
        u.id,
        (x) => ({
          ...x,
          openIssue: {
            eventId: e.id,
            weeksOpen: 0,
            fixCost: Math.round(fixCost),
          },
        }),
      )
    }
    case 'leaseRenewal': {
      const id = 'C' + s.nextChoiceId
      row.events.push('Lease renewal')
      return {
        ...s,
        nextChoiceId: s.nextChoiceId + 1,
        pendingChoices: [
          ...s.pendingChoices,
          {
            id,
            kind: 'renewal',
            title: 'Lease renewal at ' + p.nickname,
            body: interp(RENEWAL_BODY, v),
            options: [
              { label: 'Raise rent 10%', actionTag: 'raise' },
              { label: 'Keep them happy', actionTag: 'keep' },
            ],
            payload: { propertyId: p.id, unitId: u.id },
          },
        ],
      }
    }
    default:
      return s
  }
}

/* ------------------------------------------------------- the VRBO */

export function resolveVrbo(state: GameState, ctx: WeekCtx): GameState {
  const p = state.properties.find((x) => x.isVrbo)
  if (!p) return state
  let s = state
  const row = rowOf(ctx, p)

  if (p.renovation) {
    /* The crew has the keys; nobody is booking it. */
    row.occupancyPct = 0
    return s
  }

  const occ = vrboOccupancy(s, p, vrboJitter())
  const income = vrboIncome(occ)
  const out = P3.VRBO.UPKEEP + weeklyInterest(p)
  const net = income - out

  s = { ...s, cash: s.cash + income }
  row.rentIn += income
  row.occupancyPct = Math.round(occ * 100)
  row.net = net

  const condition = Math.max(
    0,
    p.condition - (occ > 0 ? P3.VRBO.COND_DECAY : P3.CONDITION_DECAY_VACANT),
  )
  const streak = net > 0 ? p.vrboProfitStreak + 1 : 0
  s = patch(s, p.id, (x) => ({ ...x, condition, vrboProfitStreak: streak }))

  /* Its own 15% roll, flat weights. */
  if (chance(P3.VRBO.EVENT_CHANCE)) {
    const e = pick(VRBO_EVENTS)
    s = { ...s, cash: s.cash + e.cash }
    if (e.cash < 0) row.moneyOut += -e.cash
    if (e.cash > 0) row.rentIn += e.cash
    if (e.rep) s = { ...s, reputation: clampRep(s.reputation + e.rep) }
    if (e.condition)
      s = patch(s, p.id, (x) => ({
        ...x,
        condition: Math.max(0, x.condition + e.condition),
      }))
    row.events.push(e.id)
    s = withLog(s, 'event', e.line)
  }

  if (
    streak >= P3.VRBO.STREAK_TARGET &&
    !s.milestonesUnlocked.includes('theMachine')
  ) {
    s = {
      ...s,
      milestonesUnlocked: [...s.milestonesUnlocked, 'theMachine'],
      reputation: clampRep(s.reputation + P3.VRBO.MACHINE_REP),
      promo: MACHINE_TITLE,
    }
    s = withLog(
      s,
      'promotion',
      'THE MACHINE. 424/7. Fully operational. Eight profitable weeks in a row and a man in a rented Lamborghini has started quoting you.',
    )
  }

  return s
}

/* -------------------------------------------------------- flips */

export function rollFlips(state: GameState, ctx: WeekCtx): GameState {
  let s = state
  for (const p of state.properties) {
    if (!p.listedForSale) continue
    const current = s.properties.find((x) => x.id === p.id)
    if (!current) continue
    const row = rowOf(ctx, current)
    if (chance(saleChance(s))) {
      const tenanted = anyUnitOccupied(current)
      const price = tenanted
        ? Math.round(displayedValue(s, current) * (1 - P3.TENANTED_SALE_PENALTY))
        : displayedValue(s, current)
      const proceeds = price - (current.mortgage?.balance ?? 0)
      s = {
        ...s,
        cash: s.cash + proceeds,
        properties: s.properties.filter((x) => x.id !== current.id),
      }
      row.events.push('SOLD')
      s = withLog(
        s,
        'money',
        'SOLD: ' +
          current.nickname +
          ' for ' +
          money(price) +
          '.' +
          (tenanted ? ' Tenant included, like a fixture.' : ''),
      )
    } else if (chance(P3.LOWBALL_CHANCE)) {
      const offer = Math.round(
        (displayedValue(s, current) *
          randInt(P3.LOWBALL_PCT_MIN, P3.LOWBALL_PCT_MAX)) /
          100,
      )
      const id = 'C' + s.nextChoiceId
      s = {
        ...s,
        nextChoiceId: s.nextChoiceId + 1,
        pendingChoices: [
          ...s.pendingChoices,
          {
            id,
            kind: 'lowball',
            title: 'Offer on ' + current.nickname,
            body: pick([
              'A buyer offers ' +
                money(offer) +
                ". His agent calls it 'more than fair.' It is neither.",
              'Lowball incoming: ' +
                money(offer) +
                '. The buyer’s name is… Larry. Of course it is.',
            ]),
            options: [
              { label: 'Take the money', actionTag: 'accept' },
              { label: 'Hold firm', actionTag: 'reject' },
            ],
            payload: { propertyId: current.id, offerAmount: offer },
          },
        ],
      }
      row.events.push('Lowball offer')
    }
  }
  return s
}

/* -------------------- decay, renovation, eviction, tenancy ticks */

export function tickProperties(state: GameState, ctx: WeekCtx): GameState {
  let s = state

  for (const p of state.properties) {
    const live = () => s.properties.find((x) => x.id === p.id)

    /* condition decay — the VRBO handled its own in its phase */
    if (!p.isVrbo && !p.renovation) {
      const occupied = p.units.filter((u) => u.tenant !== null)
      const delta = occupied.length
        ? occupied.reduce(
            (t, u) =>
              t +
              (tenantOf(u.tenant!.archetypeId)?.conditionPerWeek ??
                -P3.CONDITION_DECAY_OCCUPIED),
            0,
          )
        : -P3.CONDITION_DECAY_VACANT
      s = patch(s, p.id, (x) => ({
        ...x,
        condition: Math.max(0, Math.min(100, x.condition + delta)),
      }))
    }

    /* renovation */
    const r = live()?.renovation
    if (r) {
      const weeksLeft = r.weeksLeft - 1
      if (weeksLeft > 0) {
        s = patch(s, p.id, (x) => ({
          ...x,
          renovation: { projectId: r.projectId, weeksLeft },
        }))
      } else {
        const proj = renoOf(r.projectId)
        s = patch(s, p.id, (x) => ({
          ...x,
          renovation: null,
          baseValue: Math.round(x.baseValue * proj.valueMult),
          condition:
            proj.conditionSet !== null
              ? proj.conditionSet
              : Math.min(100, x.condition + (proj.conditionAdd ?? 0)),
          vrboRenoDone:
            x.isVrbo && r.projectId === 'full' ? true : x.vrboRenoDone,
        }))
        rowOf(ctx, p).events.push('Renovation complete')
        s = withLog(
          s,
          'money',
          interp(RENO_COMPLETE_LINE, { nickname: p.nickname }),
        )
      }
    }

    /* evictions and tenancies */
    for (const u of p.units) {
      const cur = live()?.units.find((x) => x.id === u.id)
      if (!cur || !cur.tenant) continue

      if (cur.evictionWeeksLeft !== null) {
        const left = cur.evictionWeeksLeft - 1
        if (left > 0) {
          s = patchUnit(s, p.id, u.id, (x) => ({
            ...x,
            evictionWeeksLeft: left,
          }))
        } else {
          s = moveOut(s, live()!, cur)
          rowOf(ctx, p).events.push('Eviction complete')
        }
        continue
      }

      const tenancyWeeks = cur.tenant.tenancyWeeks + 1
      s = patchUnit(s, p.id, u.id, (x) => ({
        ...x,
        tenant: x.tenant ? { ...x.tenant, tenancyWeeks } : null,
      }))

      /* the two monthly personality rolls */
      if (tenancyWeeks % 4 === 0) {
        if (cur.tenant.archetypeId === 'diyDave') {
          const good = chance(0.5)
          s = patch(s, p.id, (x) => ({
            ...x,
            condition: Math.max(
              0,
              Math.min(100, x.condition + (good ? 10 : -15)),
            ),
          }))
          s = withLog(
            s,
            'event',
            interp(good ? DAVE_GOOD : DAVE_BAD, { name: cur.tenant.name }),
          )
          rowOf(ctx, p).events.push(
            good ? 'Dave improved things' : 'Dave removed a wall',
          )
        } else if (cur.tenant.archetypeId === 'contentCrew') {
          if (chance(0.5)) {
            s = { ...s, reputation: clampRep(s.reputation + 3) }
            s = withLog(s, 'event', CREW_VIRAL)
            rowOf(ctx, p).events.push('The content house went viral')
          } else {
            s = { ...s, cash: s.cash - 400 }
            s = patch(s, p.id, (x) => ({
              ...x,
              condition: Math.max(0, x.condition - 5),
            }))
            rowOf(ctx, p).moneyOut += 400
            s = withLog(s, 'event', CREW_DAMAGE)
            rowOf(ctx, p).events.push('Challenge video damage')
          }
        }
      }

      if (tenancyWeeks >= cur.tenant.plannedStayWeeks) {
        const now = s.properties.find((x) => x.id === p.id)!
        const nowUnit = now.units.find((x) => x.id === u.id)!
        s = moveOut(s, now, nowUnit)
        rowOf(ctx, p).events.push('Tenant moved out')
      }
    }
  }

  return s
}

/* ------------------------------------------ market and the crash */

export function tickMarket(state: GameState): {
  state: GameState
  regenerated: boolean
} {
  if (state.crash.weeksLeft > 0) {
    const weeksLeft = state.crash.weeksLeft - 1
    let s: GameState = { ...state, crash: { ...state.crash, weeksLeft } }
    if (weeksLeft === 0)
      s = withLog(s, 'event', 'The crash is over. Survivors get equity.')
    return { state: s, regenerated: false }
  }

  const changed = state.nextMarketState !== state.marketState
  let s: GameState = { ...state, marketState: state.nextMarketState }
  if (changed) {
    s = regeneratePool(s)
    s = withLog(s, 'event', MARKET_LINES[s.marketState])
  }
  s = { ...s, nextMarketState: rollNextMarket(s.marketState) }
  return { state: s, regenerated: changed }
}

/* ------------------------------------------------ pool rotation */

/** Drops the oldest listing and adds one. Skipped when the pool was already
 *  thrown away and rebuilt this week. */
export function rotatePool(state: GameState, regenerated: boolean): GameState {
  if (regenerated) return state
  return fillPool({ ...state, marketPool: state.marketPool.slice(1) })
}

/* ------------------------------------------------------ billing */

export function billPortfolio(
  state: GameState,
  ctx: WeekCtx,
): { state: GameState; lines: SummaryLine[] } {
  let s = state
  const lines: SummaryLine[] = []

  const interest = s.properties.reduce((t, p) => {
    const i = weeklyInterest(p)
    if (i) rowOf(ctx, p).moneyOut += i
    return t + i
  }, 0)
  if (interest) {
    s = { ...s, cash: s.cash - interest }
    lines.push(['Mortgage interest', interest])
  }

  const hoa = s.properties.reduce((t, p) => {
    const h = hoaOf(p)
    if (h) rowOf(ctx, p).moneyOut += h
    return t + h
  }, 0)
  if (hoa) {
    s = { ...s, cash: s.cash - hoa }
    lines.push(['HOA fees', hoa])
  }

  if (s.propCoActive) {
    const propCo = totalUnitCount(s) * P3.PROPCO_PER_UNIT
    if (propCo) {
      s = { ...s, cash: s.cash - propCo }
      lines.push(['PropCo', propCo])
    }
  }

  const v = s.properties.find((p) => p.isVrbo)
  if (v) {
    s = { ...s, cash: s.cash - P3.VRBO.UPKEEP }
    rowOf(ctx, v).moneyOut += P3.VRBO.UPKEEP
    lines.push(['VRBO upkeep', P3.VRBO.UPKEEP])
  }

  /* Every row's net is now knowable. The VRBO already set its own. */
  ctx.rows.forEach((row) => {
    if (row.occupancyPct === undefined) row.net = row.rentIn - row.moneyOut
  })

  return { state: s, lines }
}

/* --------------------------------------------------- milestones */

export function checkMilestones(state: GameState): {
  state: GameState
  unlocked: MilestoneDef[]
} {
  let s = state
  const unlocked: MilestoneDef[] = []
  /* One at a time and in order: a milestone's perk can change what the next
     one sees. */
  for (const m of MILESTONES) {
    if (s.milestonesUnlocked.includes(m.id)) continue
    if (netWorth(s) < m.threshold) continue
    s = { ...s, milestonesUnlocked: [...s.milestonesUnlocked, m.id] }
    s = withLog(s, 'promotion', m.line)
    unlocked.push(m)
  }
  return { state: s, unlocked }
}
