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

import { P3 } from '../data/p3'
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
  PortfolioSummaryRow,
  Property,
  TenantEventDef,
  UnitState,
} from '../state/types'
import { withLog } from './log'
import {
  applicantChance,
  baseRentOf,
  chargedRent,
  interp,
  makeTenant,
  pickApplicant,
  tenantOf,
} from './portfolio'
import { chance, pick, weightedPick } from './rand'

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
