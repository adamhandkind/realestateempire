import { MILESTONES } from '../data/milestones'
import { P3, PRICE_ROUND } from '../data/p3'
import { PROPERTY_TYPES, RENO_PROJECTS, STREET_NAMES } from '../data/properties'
import { TENANTS } from '../data/tenants'
import { FIRST_NAMES, LAST_NAMES } from '../data/archetypes'
import type {
  GameState,
  Listing,
  MarketState,
  Property,
  PropertyTypeDef,
  PropertyTypeId,
  RenoProjectDef,
  RenoProjectId,
  TenantArchetype,
  UnitState,
} from '../state/types'
import { hasFlag } from './characters'
import { rankIndex } from './economy'
import { DISTRICTS } from '../data/districts'
import { districtsForType, isDominant, perkActive, priceMultOf } from './territory'
import { pick, rand, randInt, roundTo, weightedPick } from './rand'

export const clamp = (n: number, lo: number, hi: number): number =>
  Math.max(lo, Math.min(hi, n))

/** Fills `{placeholder}` tokens. Every content string goes through this. */
export function interp(text: string, vars: Record<string, string>): string {
  return Object.keys(vars).reduce(
    (t, k) => t.split('{' + k + '}').join(vars[k]),
    text,
  )
}

/* ------------------------------------------------------------- lookups */

export const typeOf = (id: PropertyTypeId): PropertyTypeDef | undefined =>
  PROPERTY_TYPES.find((t) => t.id === id)
export const renoOf = (id: RenoProjectId): RenoProjectDef =>
  RENO_PROJECTS.find((r) => r.id === id)!
export const tenantOf = (id: string): TenantArchetype =>
  TENANTS.find((t) => t.id === id)!

/** The VRBO is not in PROPERTY_TYPES, so it has no rent or HOA of its own. */
export const baseRentOf = (p: Property): number =>
  typeOf(p.typeId)?.baseRentPerUnit ?? 0
export const hoaOf = (p: Property): number => typeOf(p.typeId)?.hoaWeekly ?? 0
export const labelOf = (id: PropertyTypeId): string =>
  typeOf(id)?.label ?? 'The 424/7 VRBO'

/* --------------------------------------------------------------- value */

export const crashMult = (s: GameState): number =>
  s.crash.weeksLeft > 0 ? P3.CRASH.valueMult : 1

/** The ONLY value shown, sold, or summed. Never read `baseValue` directly. */
export const displayedValue = (s: GameState, p: Property): number =>
  Math.round(p.baseValue * P3.VALUE_MULT[s.marketState] * crashMult(s))

export const netWorth = (s: GameState): number =>
  s.cash +
  s.properties.reduce(
    (t, p) => t + displayedValue(s, p) - (p.mortgage?.balance ?? 0),
    0,
  )

/* ---------------------------------------------------------------- rent */

export const fairRent = (p: Property, baseRent: number): number =>
  baseRent *
  (P3.FAIR_RENT_FLOOR + (P3.FAIR_RENT_COND_WEIGHT * p.condition) / 100)

export const tenantRentMod = (u: UnitState): number =>
  u.tenant ? tenantOf(u.tenant.archetypeId).rentMod : 1

export const chargedRent = (
  p: Property,
  u: UnitState,
  baseRent: number,
): number =>
  roundTo(fairRent(p, baseRent) * u.rentR * tenantRentMod(u), P3.RENT_ROUND)

/* ------------------------------------------------------------ mortgage */

export const mortgageSlots = (s: GameState): number =>
  Math.min(
    P3.MAX_MORTGAGE_SLOTS,
    P3.BASE_MORTGAGE_SLOTS +
      (s.milestonesUnlocked.includes('mogul250') ? 1 : 0) +
      (s.milestonesUnlocked.includes('sevenFig') ? 1 : 0),
  )

export const usedMortgageSlots = (s: GameState): number =>
  s.properties.filter((p) => p.mortgage !== null).length

export const hasFreeMortgageSlot = (s: GameState): boolean =>
  usedMortgageSlots(s) < mortgageSlots(s)

export const weeklyInterest = (p: Property): number =>
  Math.round((p.mortgage?.balance ?? 0) * P3.MORTGAGE_WEEKLY_RATE)

/* -------------------------------------------------------- market pool */

/** 0.833 at condition 40, 1.0 at condition 90. */
export const conditionFactor = (condition: number): number =>
  0.7 + condition / 300

export function eligibleTypes(s: GameState): PropertyTypeDef[] {
  return PROPERTY_TYPES.filter(
    (t) => rankIndex(s.rank) >= rankIndex(t.unlockRank),
  )
}

/** Type first, then a district that actually has that kind of building — a
 *  luxury listing can only surface in Dufferin or Tutela Heights. */
export function makeListing(s: GameState, id: number): Listing {
  const types = eligibleTypes(s)
  const t = weightedPick(types, (x) => x.weight) ?? types[0]
  const candidates = districtsForType(t.id)
  const districtId = candidates.length ? pick(candidates) : DISTRICTS[0].id
  const condition = randInt(40, 90)
  const intrinsicValue = roundTo(
    randInt(t.band.min, t.band.max) * priceMultOf(districtId),
    PRICE_ROUND,
  )
  let askPrice = Math.round(
    intrinsicValue *
      conditionFactor(condition) *
      P3.POOL_PRICE_MULT[s.marketState] *
      (s.crash.weeksLeft > 0 ? P3.CRASH.poolMult : 1),
  )
  /* You are 'old Eagle Place' now, and the ask reflects it. */
  if (districtId === 'eaglePlace' && perkActive(s, 'localsDeal'))
    askPrice = Math.round(askPrice * 0.9)
  return {
    id: 'LST' + id,
    typeId: t.id,
    intrinsicValue,
    condition,
    askPrice,
    blurb: pick(t.blurbs),
    districtId,
  }
}

/** Tops the pool back up to MARKET_POOL_SIZE, advancing nextListingId.
 *  Nothing is for sale below Seller Agent, so a low-rank state keeps an empty
 *  pool rather than asking makeListing to draw from no eligible types. */
export function fillPool(s: GameState): GameState {
  if (eligibleTypes(s).length === 0) return s
  let next = s.nextListingId
  const pool = [...s.marketPool]
  while (pool.length < P3.MARKET_POOL_SIZE) pool.push(makeListing(s, next++))
  return { ...s, marketPool: pool, nextListingId: next }
}

/** Throws the whole pool away and builds a fresh one. */
export function regeneratePool(s: GameState): GameState {
  return fillPool({ ...s, marketPool: [] })
}

/** What a bought listing is worth: exactly what you paid for its condition. */
export const purchaseBaseValue = (l: Listing): number =>
  Math.round(l.intrinsicValue * conditionFactor(l.condition))

export function nicknameFor(typeId: PropertyTypeId): string {
  return labelOf(typeId) + ' on ' + pick(STREET_NAMES)
}

/* ----------------------------------------------------------- applicants */

/** `bonus` is added before the clamp — Echo Place's `roomForRent` perk is the
 *  only thing that passes one. */
export const applicantChance = (
  r: number,
  propCo: boolean,
  bonus = 0,
): number =>
  clamp(
    P3.APPLICANT_BASE - (r - 1.0) * P3.APPLICANT_SLOPE + (propCo ? 0.1 : 0) + bonus,
    P3.APPLICANT_MIN,
    P3.APPLICANT_MAX,
  )

/** Every student on Colborne knows your sign. */
export const applicantBonusFor = (s: GameState, p: Property): number =>
  p.districtId === 'echoPlace' && perkActive(s, 'roomForRent') ? 0.15 : 0

export const tenantAvailable = (
  t: TenantArchetype,
  p: Property,
  r: number,
): boolean => p.condition >= t.availableMinCondition && r <= t.availableMaxR

/** Tier weights from the rent ratio. Index 0 is tier 1. */
export function tierWeights(r: number): [number, number, number] {
  const p = r - 1.0
  return [Math.max(0, 30 - 100 * p), 40, 30 + 80 * Math.max(0, p)]
}

/** Draws a tier, then an archetype in it. Falls to the next worse tier when a
 *  tier has nobody available. Returns null when nothing qualifies at all. */
export function pickApplicant(p: Property, r: number): TenantArchetype | null {
  const w = tierWeights(r)
  const tiers: (1 | 2 | 3)[] = [1, 2, 3]
  const drawn = weightedPick(tiers, (t) => w[t - 1])
  const start = drawn ?? 3
  for (let tier = start; tier <= 3; tier++) {
    const pool = TENANTS.filter(
      (t) => t.qualityTier === tier && tenantAvailable(t, p, r),
    )
    const hit = weightedPick(pool, (t) => t.weight)
    if (hit) return hit
  }
  return null
}

export function makeTenant(
  a: TenantArchetype,
): NonNullable<UnitState['tenant']> {
  return {
    archetypeId: a.id,
    name: pick(FIRST_NAMES) + ' ' + pick(LAST_NAMES),
    tenancyWeeks: 0,
    plannedStayWeeks:
      a.stayMax === null ? Infinity : randInt(a.stayMin, a.stayMax),
    owed: 0,
  }
}

/* ---------------------------------------------------------------- flips */

/** Cold markets — and the crash's implied cold — never slow HER sales. Note
 *  this is the SPEED of a sale only; crash price multipliers still apply, so
 *  she sells faster in a downturn, not for more. */
export const flipMarketDelta = (s: GameState): number => {
  const raw = P3.FLIP_DELTA[s.marketState]
  return hasFlag(s, 'flipColdImmune') ? Math.max(0, raw) : raw
}

export const saleChance = (s: GameState): number =>
  clamp(
    P3.FLIP_BASE + s.reputation * P3.FLIP_REP_FACTOR + flipMarketDelta(s),
    P3.FLIP_MIN,
    P3.FLIP_MAX,
  )

/* ---------------------------------------------------------- renovations */

/** The trades drink where you drink, so Holmedale jobs come in under. */
export const renoCost = (
  s: GameState,
  p: Property,
  id: RenoProjectId,
): number => {
  const raw = p.baseValue * renoOf(id).costPct
  const discount =
    p.districtId === 'holmedale' && perkActive(s, 'tradeRates') ? 0.9 : 1
  return Math.round(raw * discount)
}

export const renoWeeks = (s: GameState, id: RenoProjectId): number =>
  Math.max(
    1,
    renoOf(id).weeks - (s.milestonesUnlocked.includes('genWealth') ? 1 : 0),
  )

/** Filing costs money, unless you are the kind of landlord who simply nods. */
export const evictCost = (s: GameState): number =>
  hasFlag(s, 'freeEvictions') ? 0 : P3.EVICT_COST

export const allUnitsVacant = (p: Property): boolean =>
  p.units.every((u) => u.tenant === null)

export const anyUnitOccupied = (p: Property): boolean =>
  p.units.some((u) => u.tenant !== null)

export const occupiedUnitCount = (s: GameState): number =>
  s.properties.reduce(
    (t, p) => t + p.units.filter((u) => u.tenant !== null).length,
    0,
  )

export const totalUnitCount = (s: GameState): number =>
  s.properties.reduce((t, p) => (p.isVrbo ? t : t + p.units.length), 0)

/** Every gate on starting a project, as one predicate with a reason. The
 *  occupied-unit refusal is the CALLER's job — it has its own line. */
export function renoBlockReason(
  s: GameState,
  p: Property,
  id: RenoProjectId,
): string | null {
  const proj = renoOf(id)
  const eligible = p.isVrbo
    ? id === 'full'
    : (typeOf(p.typeId)?.renoEligible ?? []).includes(id)
  if (!eligible) return 'That crew does not work on this kind of building.'
  if (p.renovation) return 'There is already a crew in there.'
  if (p.listedForSale) return "You can't gut a house you're trying to sell."
  if (proj.requiresTopProducer && s.rank !== 'topProducer')
    return 'The luxury package requires a Top Producer on the paperwork.'
  if (proj.requiresVacant && anyUnitOccupied(p)) return null
  if (s.cash < renoCost(s, p, id)) return 'The deposit alone would clear you out.'
  return null
}

/* ----------------------------------------------------------------- vrbo */

/** `jitter` is the pre-rolled +/-0.05 wobble; callers pass 0 to see the mean. */
export function vrboOccupancy(
  s: GameState,
  p: Property,
  jitter: number,
): number {
  const raw =
    P3.VRBO.BASE_OCC +
    (p.vrboRenoDone ? P3.VRBO.RENO_OCC : 0) +
    (s.activeChannelIds.length > 0 ? P3.VRBO.MKT_OCC : 0) +
    (s.marketState === 'hot' ? P3.VRBO.HOT_OCC : 0) -
    (p.condition < P3.LOW_CONDITION ? P3.VRBO.LOW_COND_OCC_PENALTY : 0)
  return clamp(raw + jitter, 0, P3.VRBO.OCC_CAP)
}

export const vrboJitter = (): number =>
  rand() * (P3.VRBO.OCC_JITTER * 2) - P3.VRBO.OCC_JITTER

export const vrboIncome = (occ: number): number =>
  Math.round(P3.VRBO.NIGHTLY * 7 * occ)

/* ----------------------------------------------------------- milestones */

/** Locked milestones whose threshold the current net worth has reached. */
export function newMilestones(s: GameState): typeof MILESTONES {
  const nw = netWorth(s)
  return MILESTONES.filter(
    (m) => !s.milestonesUnlocked.includes(m.id) && nw >= m.threshold,
  )
}

/** Earned at $500k net worth — or simply known, if you have been doing this
 *  since 1983. */
export const hasMarketInsight = (s: GameState): boolean =>
  s.milestonesUnlocked.includes('portfolioGuy') || hasFlag(s, 'marketInsight')

/* -------------------------------------------------------- market cycle */

/** The 80/20 Markov step. Never jumps hot<->cold. */
export function rollNextMarket(current: MarketState): MarketState {
  if (rand() < P3.MARKET_STAY) return current
  if (current === 'hot' || current === 'cold') return 'normal'
  return rand() < 0.5 ? 'hot' : 'cold'
}

export const MARKET_LINES: Record<MarketState, string> = {
  hot: 'The market is HOT. Open houses have bouncers now.',
  cold: "The market went cold. Agents are updating their LinkedIns to say 'advisor.'",
  normal: 'The market returned to normal. Nobody knows what normal is.',
}
