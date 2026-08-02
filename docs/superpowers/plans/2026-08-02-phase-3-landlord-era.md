# Phase 3 "Landlord Era" Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a property market, financing, renovations, flipping, rentals with tenants and issues, a global market cycle with crashes, net-worth milestones, the PropCo service, and the purchasable 424/7 VRBO to the existing Phase 2 build.

**Architecture:** All property math lives in one pure module (`src/logic/portfolio.ts`) that imports only from `data/` and `logic/rand`. Content lives in new `data/` files. The reducer gains new action cases and a rewritten `endWeek` whose step order is fixed by §12 of the spec. A new `PortfolioTab` and its subcomponents render market + owned views; the header gains net worth and a market dial.

**Tech Stack:** TypeScript, React 19, Vite, Vitest. `npm test` runs the suite; `npm run build` type-checks.

---

## Naming adaptations (the spec permits these; nothing else changes)

The spec's assumed primitives do not all exist in this codebase. These are the exact substitutions every task below uses:

| Spec name | This codebase |
|---|---|
| `C.PRICE_ROUND` | `PRICE_ROUND` (new, `5000`) exported from `src/data/p3.ts` |
| the "single constants object" | new `src/data/p3.ts` exporting `P3` |
| `roundTo`, `weightedPick` | new exports added to `src/logic/rand.ts` |
| `LAST_NAMES` | new export added to `src/data/archetypes.ts` |
| `getStats` | existing `deriveStats` in `src/logic/economy.ts` |
| `PendingChoice` (§3, the queue item) | **`PortfolioChoice`** — the name `PendingChoice` is already taken by the Phase 2 choice-event modal and must not be reused |
| `s.pendingChoices` | same name, holds `PortfolioChoice[]` |
| `RESOLVE_CHOICE` action | **`RESOLVE_PORTFOLIO_CHOICE`** (Phase 2's `RESOLVE_CHOICE_EVENT` already exists) |
| `milestones has 'x'` | `s.milestonesUnlocked.includes('x')` |

---

## File Structure

**Create:**
- `src/data/p3.ts` — the `P3` constants object + `PRICE_ROUND`.
- `src/data/properties.ts` — property type table, blurbs, renovation project table, `STREET_NAMES`.
- `src/data/tenants.ts` — the 8 tenant archetypes with all content strings.
- `src/data/tenantEvents.ts` — the 8 tenant events with weights/conditions/content.
- `src/data/milestones.ts` — the 4 net-worth milestones.
- `src/data/vrbo.ts` — the 4 VRBO events, the machine celebration copy, the buy-offer copy.
- `src/logic/portfolio.ts` — every pure property computation (values, rent, applicants, occupancy, sale chance, listing generation).
- `src/logic/portfolioWeek.ts` — the End Week phases that mutate portfolio state (rent collection, applicants, tenant events, VRBO, flips, decay/renovation/eviction ticks, market transition, pool rotation, milestones).
- `src/components/PortfolioTab.tsx`, `src/components/portfolio/ListingCard.tsx`, `src/components/portfolio/PropertyCard.tsx`, `src/components/portfolio/UnitRow.tsx`, `src/components/portfolio/BuyModal.tsx`, `src/components/PortfolioChoiceModal.tsx`.
- Tests alongside: `src/logic/__tests__/portfolio.test.ts`, `src/logic/__tests__/portfolioWeek.test.ts`, `src/state/__tests__/portfolioActions.test.ts`, plus additions to the existing `migrate.test.ts` and `endWeek.test.ts`.

**Modify:**
- `src/state/types.ts` — new types, `version: 3`, new `GameState` fields, new `Action` members.
- `src/state/reducer.ts` — `initialState`, new action cases, rewritten `endWeek`.
- `src/state/migrate.ts` — v2 → v3.
- `src/logic/rand.ts` — `roundTo`, `weightedPick`.
- `src/data/archetypes.ts` — `LAST_NAMES`.
- `src/data/events.ts` — the `marketCrash` event.
- `src/data/brags.ts` — landlord/vrbo/crash brag sets.
- `src/logic/economy.ts` — re-export `bragFor` change for the new sets.
- `src/components/Header.tsx`, `src/App.tsx`, `src/components/WeekSummaryModal.tsx`, `src/components/OfficeTab.tsx` (debug panel), `src/styles.css`.

**Import direction:** `data/` imports nothing from `logic/` or `state/` except types. `logic/` imports `data/` + `logic/`. `state/` imports both. Components import `state/` + `logic/`.

---

### Task 1: Missing Phase 1 primitives

**Files:**
- Modify: `src/logic/rand.ts`
- Modify: `src/data/archetypes.ts`
- Test: `src/logic/__tests__/rand.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `src/logic/__tests__/rand.test.ts`:

```ts
import { roundTo, weightedPick, setSeed } from '../rand'

describe('roundTo', () => {
  it('rounds to the nearest step', () => {
    expect(roundTo(1237, 5)).toBe(1235)
    expect(roundTo(1238, 5)).toBe(1240)
    expect(roundTo(212345, 5000)).toBe(210000)
  })
  it('treats a step of 0 or 1 as a plain round', () => {
    expect(roundTo(1237.6, 1)).toBe(1238)
    expect(roundTo(1237.6, 0)).toBe(1238)
  })
})

describe('weightedPick', () => {
  it('never returns a zero-weight entry', () => {
    setSeed(42)
    const items = [
      { id: 'a', weight: 0 },
      { id: 'b', weight: 5 },
    ]
    for (let i = 0; i < 200; i++)
      expect(weightedPick(items, (x) => x.weight)!.id).toBe('b')
    setSeed(null)
  })
  it('returns null when every weight is zero or the list is empty', () => {
    expect(weightedPick([], () => 1)).toBeNull()
    expect(weightedPick([{ w: 0 }], (x) => x.w)).toBeNull()
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/logic/__tests__/rand.test.ts`
Expected: FAIL — `roundTo` and `weightedPick` are not exported from `../rand`.

- [ ] **Step 3: Implement the primitives**

Append to `src/logic/rand.ts`:

```ts
/** Rounds `n` to the nearest multiple of `step`. A step of 0 or 1 is a plain
 *  round, which keeps callers from special-casing "no rounding". */
export const roundTo = (n: number, step: number): number =>
  step > 1 ? Math.round(n / step) * step : Math.round(n)

/** Weighted choice over an arbitrary list. Returns null when nothing is
 *  eligible, so callers can fall through to a different pool. */
export function weightedPick<T>(items: T[], weightOf: (item: T) => number): T | null {
  const pool = items.filter((i) => weightOf(i) > 0)
  const total = pool.reduce((t, i) => t + weightOf(i), 0)
  if (total <= 0) return null
  let roll = rand() * total
  for (const i of pool) {
    roll -= weightOf(i)
    if (roll <= 0) return i
  }
  return pool[pool.length - 1]
}
```

- [ ] **Step 4: Add the shared surname pool**

Append to `src/data/archetypes.ts`:

```ts
/** Every archetype surname, de-duplicated. Tenants draw from this pool —
 *  they have no archetype-specific surnames of their own. */
export const LAST_NAMES: string[] = Array.from(
  new Set(ARCHETYPES.flatMap((a) => a.surnames)),
)
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run src/logic/__tests__/rand.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/logic/rand.ts src/data/archetypes.ts src/logic/__tests__/rand.test.ts
git commit -m "feat: add roundTo, weightedPick, and a shared surname pool"
```

---

### Task 2: The P3 constants

**Files:**
- Create: `src/data/p3.ts`

- [ ] **Step 1: Write the file**

Create `src/data/p3.ts`:

```ts
/* Phase 3 tuning. These numbers ARE the design — the VRBO is supposed to lose
   money unmanaged, and buying at market is supposed to yield zero instant
   equity. Do not "fix" them. */

/** Sale prices round to the nearest $5,000, same as Phase 1 lead prices. */
export const PRICE_ROUND = 5000

export const P3 = {
  MARKET_POOL_SIZE: 4,
  DOWN_MIN: 0.2,
  DOWN_STEP: 0.05,
  MORTGAGE_WEEKLY_RATE: 0.0015, // interest-only, on balance
  PRINCIPAL_CHUNK: 10000,
  BASE_MORTGAGE_SLOTS: 2,
  MAX_MORTGAGE_SLOTS: 4,
  CONDITION_DECAY_OCCUPIED: 1,
  CONDITION_DECAY_VACANT: 0.5,
  LOW_CONDITION: 50,
  FAIR_RENT_FLOOR: 0.6,
  FAIR_RENT_COND_WEIGHT: 0.4,
  RENT_R_MIN: 0.7,
  RENT_R_MAX: 1.4,
  RENT_R_STEP: 0.05,
  RENT_ROUND: 5,
  APPLICANT_BASE: 0.7,
  APPLICANT_SLOPE: 1.125,
  APPLICANT_MIN: 0.25,
  APPLICANT_MAX: 0.8,
  TENANT_EVENT_BASE: 0.15,
  EVICT_COST: 800,
  EVICT_WEEKS: 4,
  EVICT_WEEKS_HOARDER: 6,
  ARREARS_RECOVERY: 0.5,
  PROPCO_PER_UNIT: 60,
  PROPCO_RENT_CUT: 0.08,
  PROPCO_MIN_OCCUPIED_UNITS: 3,
  HOA_CONDO_WEEKLY: 80,
  FLIP_BASE: 0.25,
  FLIP_REP_FACTOR: 0.002,
  FLIP_MIN: 0.05,
  FLIP_MAX: 0.75,
  LOWBALL_CHANCE: 0.15,
  LOWBALL_PCT_MIN: 88,
  LOWBALL_PCT_MAX: 94,
  TENANTED_SALE_PENALTY: 0.05,
  MARKET_STAY: 0.8,
  VALUE_MULT: { hot: 1.1, normal: 1.0, cold: 0.9 },
  FLIP_DELTA: { hot: 0.15, normal: 0, cold: -0.15 },
  POOL_PRICE_MULT: { hot: 1.1, normal: 1.0, cold: 0.9 },
  CRASH: {
    weight: 3,
    minWeekInPhase: 8,
    cooldownWeeks: 40,
    duration: 6,
    valueMult: 0.8,
    poolMult: 0.75,
  },
  EMERGENCY_REPAIR_COST: 1000,
  EMERGENCY_REPAIR_COND: 15,
  INSPECTION_PASS_COND: 55,
  INSPECTION_FINE: 500,
  INSPECTION_REPAIR_PER_POINT: 40,
  INSPECTION_REPAIR_TO: 60,
  RENEWAL_MIN_TENANCY: 10,
  RENEWAL_RAISE: 0.1,
  RENEWAL_LEAVE_CHANCE: 0.3,
  RENEWAL_STAY_BONUS_WEEKS: 4,
  VRBO: {
    PRICE: 480000,
    NIGHTLY: 750,
    BASE_OCC: 0.15,
    RENO_OCC: 0.35,
    MKT_OCC: 0.2,
    HOT_OCC: 0.1,
    OCC_CAP: 0.85,
    OCC_JITTER: 0.05,
    UPKEEP: 1700,
    COND_DECAY: 1.5,
    LOW_COND_OCC_PENALTY: 0.1,
    MIN_DECLINES: 3,
    STREAK_TARGET: 8,
    EVENT_CHANCE: 0.15,
    MACHINE_REP: 15,
  },
} as const
```

- [ ] **Step 2: Type-check**

Run: `npx tsc -b`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/data/p3.ts
git commit -m "feat: add Phase 3 tuning constants"
```

---

### Task 3: Phase 3 types

**Files:**
- Modify: `src/state/types.ts`

- [ ] **Step 1: Add the domain types**

Insert into `src/state/types.ts`, immediately after the `OutfitPreset` interface:

```ts
/* ------------------------------------------------------------- phase 3 */

export type MarketState = 'hot' | 'normal' | 'cold'
export type PropertyTypeId =
  | 'starter'
  | 'condo'
  | 'townhouse'
  | 'duplex'
  | 'apartment'
  | 'luxury'
  | 'vrbo'
export type RenoProjectId = 'cosmetic' | 'full' | 'luxuryPkg'

export interface PropertyTypeDef {
  id: PropertyTypeId
  label: string
  band: { min: number; max: number }
  units: number
  baseRentPerUnit: number
  hoaWeekly: number
  unlockRank: RankId
  renoEligible: RenoProjectId[]
  weight: number
  blurbs: string[]
}

export interface RenoProjectDef {
  id: RenoProjectId
  label: string
  /** Fraction of baseValue charged at start. */
  costPct: number
  weeks: number
  /** baseValue multiplier applied on completion. */
  valueMult: number
  /** Condition delta (`cosmetic`) or absolute target (`full`, `luxuryPkg`). */
  conditionAdd: number | null
  conditionSet: number | null
  requiresVacant: boolean
  requiresTopProducer: boolean
}

export interface TenantArchetype {
  id: string
  label: string
  qualityTier: 1 | 2 | 3
  weight: number
  payChance: number
  onSkip: 'recoverHalfLater' | 'gone'
  /** Baseline condition change per week. Negative wears the place down. */
  conditionPerWeek: number
  stayMin: number
  /** `null` means "never leaves voluntarily" — plannedStayWeeks is Infinity. */
  stayMax: number | null
  rentMod: number
  /** Gates checked at move-in against the property and the rent ratio. */
  availableMinCondition: number
  availableMaxR: number
  intro: string[]
  leave: string[]
  skip: string[]
  /** Only Steve has one; shown as the eviction confirmation body. */
  evictBody?: string
}

export interface TenantEventContext {
  property: Property
  unit: UnitState
  state: GameState
}

export interface TenantEventDef {
  id: string
  weight: number
  minor: boolean
  fixCost: number
  condition: (ctx: TenantEventContext) => boolean
  /** Multiplier applied on top of `weight` for this context. */
  weightMult: (ctx: TenantEventContext) => number
}

export interface MilestoneDef {
  id: string
  threshold: number
  label: string
  line: string
}

export interface OpenIssue {
  eventId: string
  weeksOpen: number
  fixCost: number
}

export interface UnitState {
  id: string
  tenant: null | {
    archetypeId: string
    name: string
    tenancyWeeks: number
    /** `Infinity` for archetypes that never leave voluntarily. */
    plannedStayWeeks: number
    owed: number
  }
  /** 0.70–1.40. Persists through vacancy. */
  rentR: number
  openIssue: OpenIssue | null
  /** Non-null means an eviction is in progress: no rent, tenant still present. */
  evictionWeeksLeft: number | null
}

export interface Property {
  id: string
  typeId: PropertyTypeId
  nickname: string
  /** Market-state-independent. Renovations modify THIS. */
  baseValue: number
  condition: number
  mortgage: { balance: number } | null
  /** Empty for the VRBO. */
  units: UnitState[]
  renovation: { projectId: RenoProjectId; weeksLeft: number } | null
  listedForSale: boolean
  boughtWeek: number
  isVrbo: boolean
  vrboProfitStreak: number
  /** Set true when a `full` renovation completes on the VRBO. */
  vrboRenoDone: boolean
}

export interface Listing {
  id: string
  typeId: PropertyTypeId
  intrinsicValue: number
  condition: number
  askPrice: number
  blurb: string
}

/** The generic choice queue. Distinct from Phase 2's `PendingChoice`, which is
 *  the single-slot choice-EVENT modal and is unchanged. */
export interface PortfolioChoice {
  id: string
  kind: 'lowball' | 'renewal' | 'vrboBuy'
  title: string
  body: string
  options: { label: string; actionTag: string }[]
  payload: Record<string, unknown>
}

export interface PortfolioSummaryRow {
  nickname: string
  rentIn: number
  moneyOut: number
  net: number
  events: string[]
  /** VRBO only — the diegetic occupancy percentage. */
  occupancyPct?: number
}
```

- [ ] **Step 2: Extend `WeekSummary` and `GameState`**

In `src/state/types.ts`, add to `WeekSummary`, after the `marketing` field:

```ts
  portfolio: PortfolioSummaryRow[]
```

Change `GameState`'s `version: 2` to `version: 3`, and add these fields after `pendingChoice`:

```ts
  properties: Property[]
  marketPool: Listing[]
  marketState: MarketState
  /** Pre-rolled at step 10 so Market Insight can't be save-scummed. */
  nextMarketState: MarketState
  /** `weeksLeft: 0` means no crash is active. */
  crash: { weeksLeft: number; lastCrashWeek: number }
  milestonesUnlocked: string[]
  propCoActive: boolean
  pendingChoices: PortfolioChoice[]
  nextPropertyId: number
  nextListingId: number
  nextChoiceId: number
  peakNetWorth: number
  /** The week Phase 3 state was first created. Gates the crash event. */
  firstP3Week: number
```

Replace the `gagCounters` field with:

```ts
  gagCounters: {
    vrboOffers: number
    nextVrboWeek: number
    vrboOwned: boolean
    /** Set by "Decline (forever)". Stops all future offers. */
    vrboDeclinedForever: boolean
  }
```

- [ ] **Step 3: Add the new actions**

Add to the `Action` union in `src/state/types.ts`:

```ts
  | { type: 'BUY_PROPERTY'; listingId: string; downPct: number }
  | { type: 'SET_RENT'; propertyId: string; unitId: string; r: number }
  | { type: 'RENAME_PROPERTY'; propertyId: string; nickname: string }
  | { type: 'START_RENOVATION'; propertyId: string; projectId: RenoProjectId }
  | { type: 'LIST_FOR_SALE'; propertyId: string }
  | { type: 'DELIST'; propertyId: string }
  | { type: 'RESOLVE_PORTFOLIO_CHOICE'; choiceId: string; actionTag: string }
  | { type: 'HANDLE_ISSUE'; propertyId: string; unitId: string }
  | { type: 'EMERGENCY_REPAIR'; propertyId: string }
  | { type: 'EVICT'; propertyId: string; unitId: string }
  | { type: 'PAY_PRINCIPAL'; propertyId: string }
  | { type: 'TOGGLE_PROPCO' }
  | { type: 'BUY_VRBO'; downPct: number }
  | { type: 'DEBUG_SET_MARKET'; marketState: MarketState }
  | { type: 'DEBUG_FORCE_CRASH' }
  | { type: 'DEBUG_FILL_VACANCIES' }
  | { type: 'DEBUG_CASH' }
```

- [ ] **Step 4: Type-check — errors here are expected**

Run: `npx tsc -b`
Expected: FAIL. `initialState` (`src/state/reducer.ts:55`) and `migrate` (`src/state/migrate.ts:28`) do not yet produce `version: 3` or the new fields. Task 5 fixes both. Do not touch them here.

- [ ] **Step 5: Commit**

```bash
git add src/state/types.ts
git commit -m "feat: add Phase 3 domain types"
```

---

### Task 4: Property, renovation, and street data

**Files:**
- Create: `src/data/properties.ts`
- Test: `src/logic/__tests__/portfolio.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/logic/__tests__/portfolio.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  PROPERTY_TYPES,
  RENO_PROJECTS,
  STREET_NAMES,
} from '../../data/properties'

describe('property data', () => {
  it('lists the six buyable types and no vrbo entry', () => {
    expect(PROPERTY_TYPES.map((t) => t.id)).toEqual([
      'starter',
      'condo',
      'townhouse',
      'duplex',
      'apartment',
      'luxury',
    ])
  })
  it('gives every type exactly two blurbs', () => {
    PROPERTY_TYPES.forEach((t) => expect(t.blurbs).toHaveLength(2))
  })
  it('gates apartment and luxury behind Top Producer', () => {
    const gated = PROPERTY_TYPES.filter((t) => t.unlockRank === 'topProducer')
    expect(gated.map((t) => t.id)).toEqual(['apartment', 'luxury'])
  })
  it('offers the luxury package only to townhouse and luxury', () => {
    const lux = PROPERTY_TYPES.filter((t) =>
      t.renoEligible.includes('luxuryPkg'),
    )
    expect(lux.map((t) => t.id)).toEqual(['townhouse', 'luxury'])
  })
  it('has three renovation projects and twelve streets', () => {
    expect(RENO_PROJECTS.map((r) => r.id)).toEqual([
      'cosmetic',
      'full',
      'luxuryPkg',
    ])
    expect(STREET_NAMES).toHaveLength(12)
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/logic/__tests__/portfolio.test.ts`
Expected: FAIL — cannot resolve `../../data/properties`.

- [ ] **Step 3: Write the data file**

Create `src/data/properties.ts`:

```ts
import type { PropertyTypeDef, RenoProjectDef } from '../state/types'

/** The buyable types. The VRBO is not here — it is never in the market pool. */
export const PROPERTY_TYPES: PropertyTypeDef[] = [
  {
    id: 'starter',
    label: 'Starter Home',
    band: { min: 160000, max: 260000 },
    units: 1,
    baseRentPerUnit: 400,
    hoaWeekly: 0,
    unlockRank: 'sellerAgent',
    renoEligible: ['cosmetic', 'full'],
    weight: 12,
    blurbs: [
      'Good bones. The bones are load-bearing wallpaper.',
      'Priced to move. The previous owner certainly did.',
    ],
  },
  {
    id: 'condo',
    label: 'Condo',
    band: { min: 200000, max: 320000 },
    units: 1,
    baseRentPerUnit: 450,
    hoaWeekly: 80,
    unlockRank: 'sellerAgent',
    renoEligible: ['cosmetic', 'full'],
    weight: 10,
    blurbs: [
      'Amenities include a gym no one has ever used.',
      "HOA is 'very involved.'",
    ],
  },
  {
    id: 'townhouse',
    label: 'Townhouse',
    band: { min: 260000, max: 400000 },
    units: 1,
    baseRentPerUnit: 550,
    hoaWeekly: 0,
    unlockRank: 'sellerAgent',
    renoEligible: ['cosmetic', 'full', 'luxuryPkg'],
    weight: 10,
    blurbs: [
      'Three floors of vertical living. The stairs are cardio.',
      'End unit. Only one shared wall of mystery sounds.',
    ],
  },
  {
    id: 'duplex',
    label: 'Duplex',
    band: { min: 300000, max: 480000 },
    units: 2,
    baseRentPerUnit: 400,
    hoaWeekly: 0,
    unlockRank: 'sellerAgent',
    renoEligible: ['cosmetic', 'full'],
    weight: 8,
    blurbs: [
      'Live in one, rent the other, referee both.',
      'Two doors. Two mailboxes. Two sets of problems.',
    ],
  },
  {
    id: 'apartment',
    label: 'Apartment Building',
    band: { min: 600000, max: 900000 },
    units: 4,
    baseRentPerUnit: 380,
    hoaWeekly: 0,
    unlockRank: 'topProducer',
    renoEligible: ['cosmetic', 'full'],
    weight: 5,
    blurbs: [
      'Four units of pure cash flow (results may vary).',
      "The furnace is 'a character.'",
    ],
  },
  {
    id: 'luxury',
    label: 'Luxury Home',
    band: { min: 700000, max: 1200000 },
    units: 1,
    baseRentPerUnit: 1400,
    hoaWeekly: 0,
    unlockRank: 'topProducer',
    renoEligible: ['cosmetic', 'full', 'luxuryPkg'],
    weight: 5,
    blurbs: [
      "Marble in rooms that don't need marble.",
      'The listing photos required a drone AND a boat.',
    ],
  },
]

export const RENO_PROJECTS: RenoProjectDef[] = [
  {
    id: 'cosmetic',
    label: 'Cosmetic Refresh',
    costPct: 0.08,
    weeks: 2,
    valueMult: 1.08,
    conditionAdd: 20,
    conditionSet: null,
    requiresVacant: false,
    requiresTopProducer: false,
  },
  {
    id: 'full',
    label: 'Full Renovation',
    costPct: 0.2,
    weeks: 5,
    valueMult: 1.3,
    conditionAdd: null,
    conditionSet: 100,
    requiresVacant: true,
    requiresTopProducer: false,
  },
  {
    id: 'luxuryPkg',
    label: 'Luxury Package',
    costPct: 0.3,
    weeks: 6,
    valueMult: 1.45,
    conditionAdd: null,
    conditionSet: 100,
    requiresVacant: true,
    requiresTopProducer: true,
  },
]

/** Shown when a `full` or `luxuryPkg` job is blocked by a sitting tenant. */
export const RENO_OCCUPIED_REFUSAL = "You can't gut it around Patricia."

export const RENO_COMPLETE_LINE =
  'Renovation complete at {nickname}. It smells like new paint and margin.'

/** Shown on a renovating card. `{n}` and `{total}` are the week counters. */
export const RENO_PROGRESS_LINE =
  'Week {n} of {total} — currently arguing with a subfloor'

export const STREET_NAMES: string[] = [
  'Maplecrest',
  'Birchwood',
  'Dundurn',
  'Elm Ridge',
  'Copperfield',
  'Grand River',
  'Willow Bend',
  'Stonegate',
  'Harrow Lane',
  'Cedar Hollow',
  'Fairview',
  'Old Mill',
]
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/logic/__tests__/portfolio.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/data/properties.ts src/logic/__tests__/portfolio.test.ts
git commit -m "feat: add property type, renovation, and street data"
```

---

### Task 5: Tenant archetype data

**Files:**
- Create: `src/data/tenants.ts`
- Test: `src/logic/__tests__/portfolio.test.ts`

Content strings use these placeholders, filled by `interp()` in Task 9: `{name}`, `{nickname}`, `{owed}`.

- [ ] **Step 1: Write the failing test**

Append to `src/logic/__tests__/portfolio.test.ts`:

```ts
import { TENANTS } from '../../data/tenants'

describe('tenant data', () => {
  it('has all eight archetypes', () => {
    expect(TENANTS.map((t) => t.id)).toEqual([
      'perfectPatricia',
      'corpLease',
      'lateLenny',
      'diyDave',
      'partyPaulie',
      'sobStorySteve',
      'contentCrew',
      'theHoarder',
    ])
  })
  it('caps Patricia at fair rent and gates corpLease on condition', () => {
    const patricia = TENANTS.find((t) => t.id === 'perfectPatricia')!
    const corp = TENANTS.find((t) => t.id === 'corpLease')!
    expect(patricia.availableMaxR).toBe(1.0)
    expect(corp.availableMinCondition).toBe(70)
  })
  it('marks the two archetypes that never leave voluntarily', () => {
    const forever = TENANTS.filter((t) => t.stayMax === null)
    expect(forever.map((t) => t.id)).toEqual(['sobStorySteve', 'theHoarder'])
  })
  it('carries the rent modifiers', () => {
    expect(TENANTS.find((t) => t.id === 'corpLease')!.rentMod).toBe(1.2)
    expect(TENANTS.find((t) => t.id === 'contentCrew')!.rentMod).toBe(1.3)
  })
  it('gives Steve an eviction confirmation body and a write-off skip rule', () => {
    const steve = TENANTS.find((t) => t.id === 'sobStorySteve')!
    expect(steve.onSkip).toBe('gone')
    expect(steve.evictBody).toContain('koi')
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/logic/__tests__/portfolio.test.ts`
Expected: FAIL — cannot resolve `../../data/tenants`.

- [ ] **Step 3: Write the data file**

Create `src/data/tenants.ts`:

```ts
import type { TenantArchetype } from '../state/types'

/* Order matters only for the test above; the applicant system picks by tier
   and weight, never by index. Condition rules that need code (Dave's monthly
   coin flip, the content house's monthly roll) live in logic/portfolioWeek.ts
   and are keyed off these ids. */
export const TENANTS: TenantArchetype[] = [
  {
    id: 'perfectPatricia',
    label: 'Perfect Patricia',
    qualityTier: 1,
    weight: 8,
    payChance: 1.0,
    onSkip: 'recoverHalfLater',
    conditionPerWeek: -0.5,
    stayMin: 20,
    stayMax: 40,
    rentMod: 1.0,
    availableMinCondition: 0,
    availableMaxR: 1.0,
    intro: [
      'Patricia-type applicant. References: four. Holiday card: pre-addressed.',
      '{name} asked where to submit rent EARLY.',
    ],
    leave: [
      '{name} moved out, left the place cleaner than move-in, and a note. You kept the note.',
    ],
    skip: [],
  },
  {
    id: 'corpLease',
    label: 'Corporate Lease',
    qualityTier: 1,
    weight: 6,
    payChance: 1.0,
    onSkip: 'recoverHalfLater',
    conditionPerWeek: -0.5,
    stayMin: 12,
    stayMax: 16,
    rentMod: 1.2,
    availableMinCondition: 70,
    availableMaxR: 1.4,
    intro: [
      'A corporation now rents this unit. It pays +20% and feels nothing.',
    ],
    leave: [
      'The corporate lease ended precisely on schedule. The unit smells like nothing.',
    ],
    skip: [],
  },
  {
    id: 'lateLenny',
    label: 'Late-Rent Lenny',
    qualityTier: 2,
    weight: 10,
    payChance: 0.75,
    onSkip: 'recoverHalfLater',
    conditionPerWeek: -1,
    stayMin: 15,
    stayMax: 30,
    rentMod: 1.0,
    availableMinCondition: 0,
    availableMaxR: 1.4,
    intro: ['{name} seems great. His Venmo history is a saga.'],
    leave: [
      "{name} moved out owing ${owed}. The group chat says he's 'good for it.'",
    ],
    skip: [
      "{name}'s rent is 'coming Friday.' Which Friday remains theoretical.",
      '{name} sent half a rent payment and a thumbs-up emoji.',
    ],
  },
  {
    id: 'diyDave',
    label: 'DIY Dave',
    qualityTier: 2,
    weight: 8,
    payChance: 0.9,
    onSkip: 'recoverHalfLater',
    conditionPerWeek: -1,
    stayMin: 15,
    stayMax: 30,
    rentMod: 1.0,
    availableMinCondition: 0,
    availableMaxR: 1.4,
    intro: [
      "{name} asked if he 'minds if he improves things.' You said no. He heard yes.",
    ],
    leave: [
      '{name} moved out. The unit now has one skylight you did not commission.',
    ],
    skip: [
      "{name} deducted 'materials' from rent. The materials are visible from the street.",
    ],
  },
  {
    id: 'partyPaulie',
    label: 'Party Animal',
    qualityTier: 3,
    weight: 10,
    payChance: 0.95,
    onSkip: 'recoverHalfLater',
    conditionPerWeek: -3,
    stayMin: 10,
    stayMax: 20,
    rentMod: 1.0,
    availableMinCondition: 0,
    availableMaxR: 1.4,
    intro: [
      '{name} asked about the noise policy in a way that answered the noise policy.',
    ],
    leave: [
      '{name} moved out. The neighbors sent a fruit basket. To you.',
    ],
    skip: ['{name} paid late; the DJ was paid on time.'],
  },
  {
    id: 'sobStorySteve',
    label: 'Sob Story Steve',
    qualityTier: 3,
    weight: 8,
    payChance: 0.55,
    onSkip: 'gone',
    conditionPerWeek: -1,
    stayMin: 0,
    stayMax: null,
    rentMod: 1.0,
    availableMinCondition: 0,
    availableMaxR: 1.4,
    intro: ["{name}'s references were all 'going through something.'"],
    leave: [
      '{name} left. His final story was genuinely moving. You checked your wallet afterward.',
    ],
    skip: [
      "{name}'s rent was eaten by a medical thing involving a parrot.",
      "{name} can't pay: his car, his cousin, and Mercury are all in retrograde.",
      'This week’s story involved a boat he does not own.',
    ],
    evictBody:
      "Steve looks up. 'You know what, you're right. I'll be out by Friday. It's just… my grandmother's koi surgery was this Friday.' (There is no koi. There may not be a grandmother.)",
  },
  {
    id: 'contentCrew',
    label: 'Content House Crew',
    qualityTier: 3,
    weight: 6,
    payChance: 0.9,
    onSkip: 'recoverHalfLater',
    conditionPerWeek: -2.5,
    stayMin: 8,
    stayMax: 16,
    rentMod: 1.3,
    availableMinCondition: 0,
    availableMaxR: 1.4,
    intro: ['Four roommates, one brand, one ring light per human.'],
    leave: ["The content house 'pivoted to Bali.' The unit echoes."],
    skip: [],
  },
  {
    id: 'theHoarder',
    label: 'The Collector',
    qualityTier: 3,
    weight: 6,
    payChance: 0.85,
    onSkip: 'recoverHalfLater',
    conditionPerWeek: -2,
    stayMin: 0,
    stayMax: null,
    rentMod: 1.0,
    availableMinCondition: 0,
    availableMaxR: 1.4,
    intro: [
      '{name} arrived with a moving truck. Then another. Then a third, unexplained.',
    ],
    leave: [
      "{name} is out. The crew found: 14 identical toasters, a canoe, and a filing cabinet labeled 'MISC 1994.'",
    ],
    skip: ["{name} paid in exact cash from an envelope marked 'ENVELOPES.'"],
  },
]

/** DIY Dave's every-fourth-week coin flip. */
export const DAVE_GOOD = "{name} retiled the bathroom. It's… good? It's good."
export const DAVE_BAD =
  "{name} removed a wall. He is 'pretty sure' it wasn't load-bearing."

/** The content house's every-fourth-week coin flip. */
export const CREW_VIRAL =
  "The content house posted a tour. Comments ask who the landlord is. It's you. You're famous-adjacent."
export const CREW_DAMAGE = 'A challenge video happened. The drywall lost.'
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/logic/__tests__/portfolio.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/data/tenants.ts src/logic/__tests__/portfolio.test.ts
git commit -m "feat: add the eight tenant archetypes"
```

---

### Task 6: Tenant event data

**Files:**
- Create: `src/data/tenantEvents.ts`
- Test: `src/logic/__tests__/portfolio.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `src/logic/__tests__/portfolio.test.ts`:

```ts
import { TENANT_EVENTS } from '../../data/tenantEvents'

describe('tenant event data', () => {
  it('has all eight events', () => {
    expect(TENANT_EVENTS.map((e) => e.id)).toEqual([
      'burstPipe',
      'roofLeak',
      'noiseComplaint',
      'supportRaccoon',
      'rentStrike',
      'greatReferral',
      'cityInspection',
      'leaseRenewal',
    ])
  })
  it('marks exactly the four PropCo-resolvable minors', () => {
    expect(TENANT_EVENTS.filter((e) => e.minor).map((e) => e.id)).toEqual([
      'burstPipe',
      'roofLeak',
      'noiseComplaint',
      'supportRaccoon',
    ])
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/logic/__tests__/portfolio.test.ts`
Expected: FAIL — cannot resolve `../../data/tenantEvents`.

- [ ] **Step 3: Write the data file**

Create `src/data/tenantEvents.ts`:

```ts
import type { TenantEventDef } from '../state/types'

/* Same convention as data/events.ts: the gate predicate belongs beside the
   weight it gates. These are pure and read-only. */
export const TENANT_EVENTS: TenantEventDef[] = [
  {
    id: 'burstPipe',
    weight: 10,
    minor: true,
    fixCost: 300,
    condition: () => true,
    weightMult: () => 1,
  },
  {
    id: 'roofLeak',
    weight: 6,
    minor: true,
    fixCost: 600,
    condition: () => true,
    weightMult: ({ property }) =>
      property.typeId === 'duplex' || property.typeId === 'apartment' ? 2 : 1,
  },
  {
    id: 'noiseComplaint',
    weight: 8,
    minor: true,
    fixCost: 0,
    condition: () => true,
    weightMult: ({ unit }) =>
      unit.tenant?.archetypeId === 'partyPaulie' ? 3 : 1,
  },
  {
    id: 'supportRaccoon',
    weight: 8,
    minor: true,
    fixCost: 150,
    condition: () => true,
    weightMult: () => 1,
  },
  {
    id: 'rentStrike',
    weight: 6,
    minor: false,
    fixCost: 0,
    condition: ({ property }) => property.condition < 40,
    weightMult: () => 1,
  },
  {
    id: 'greatReferral',
    weight: 4,
    minor: false,
    fixCost: 0,
    condition: ({ property }) =>
      property.units.some(
        (u) => u.tenant?.archetypeId === 'perfectPatricia',
      ) && property.units.some((u) => u.tenant === null),
    weightMult: () => 1,
  },
  {
    id: 'cityInspection',
    weight: 6,
    minor: false,
    fixCost: 0,
    condition: () => true,
    weightMult: () => 1,
  },
  {
    id: 'leaseRenewal',
    weight: 6,
    minor: false,
    fixCost: 0,
    condition: ({ unit }) =>
      !!unit.tenant &&
      unit.tenant.tenancyWeeks >= 10 &&
      unit.tenant.archetypeId !== 'sobStorySteve' &&
      unit.tenant.archetypeId !== 'theHoarder',
    weightMult: () => 1,
  },
]

/** Fired when the issue opens. `{nickname}` and `{tenantName}` interpolate. */
export const TENANT_EVENT_LINES: Record<string, string> = {
  burstPipe:
    'A pipe burst in {nickname}. The tenant sent a video. The video has audio.',
  roofLeak: 'The roof at {nickname} has opinions about rain now.',
  noiseComplaint:
    'The neighbors at {nickname} have filed a complaint, in writing, with adjectives.',
  supportRaccoon:
    "There is a raccoon in {nickname}. The tenant says it's a support raccoon. It has a small vest.",
  rentStrike:
    "{tenantName} is withholding rent until 'the building stops being like this.' Honestly? Fair.",
  greatReferral: 'Patricia knows another Patricia. The Patricia network provides.',
  cityInspection:
    'Inspection failed. The clipboard came out. The clipboard never lies. −$500 + mandated repairs.',
}

/** Fired when the issue closes. */
export const TENANT_FIX_LINES: Record<string, string> = {
  burstPipe:
    "Plumber came, charged $300, said 'you don't want to know.' You did not ask.",
  roofLeak: 'Roofer patched it and pointed at three future problems. $600.',
  noiseComplaint:
    'You had The Conversation. Volume: reduced. Respect: mutual, allegedly.',
  supportRaccoon:
    "$150 cleaning. The raccoon left with dignity and a granola bar. You'll see him again.",
  cityInspection:
    'The mandated repairs are done. The clipboard has moved on to someone else.',
}

export const INSPECTION_PASS_LINE =
  'City inspection at {nickname}: passed. The inspector almost smiled.'

export const NOISE_QUIT_LINE =
  'The neighbors win. The unit is silent and empty.'

export const RENEWAL_BODY =
  "{tenantName}'s lease is up. They 'love it here' but also 'have options.'"

export const PROPCO_FIX_PREFIX =
  "PropCo handled it. 'So here's the thing—' you hung up. "
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/logic/__tests__/portfolio.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/data/tenantEvents.ts src/logic/__tests__/portfolio.test.ts
git commit -m "feat: add tenant event table and copy"
```

---

### Task 7: Milestone and VRBO data

**Files:**
- Create: `src/data/milestones.ts`
- Create: `src/data/vrbo.ts`
- Test: `src/logic/__tests__/portfolio.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `src/logic/__tests__/portfolio.test.ts`:

```ts
import { MILESTONES } from '../../data/milestones'
import { VRBO_EVENTS } from '../../data/vrbo'

describe('milestone and vrbo data', () => {
  it('lists the four milestones in ascending threshold order', () => {
    expect(MILESTONES.map((m) => m.id)).toEqual([
      'mogul250',
      'portfolioGuy',
      'sevenFig',
      'genWealth',
    ])
    expect(MILESTONES.map((m) => m.threshold)).toEqual([
      250000, 500000, 1000000, 2500000,
    ])
  })
  it('has four equally-weighted vrbo events', () => {
    expect(VRBO_EVENTS.map((e) => e.id)).toEqual([
      'bachelorParty',
      'filmCrew',
      'influencerSummit',
      'plumbingCatastrophe',
    ])
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/logic/__tests__/portfolio.test.ts`
Expected: FAIL — cannot resolve `../../data/milestones`.

- [ ] **Step 3: Write `src/data/milestones.ts`**

```ts
import type { MilestoneDef } from '../state/types'

/* Perks are applied by id in logic/portfolio.ts:
   mogul250 + sevenFig → +1 mortgage slot each
   portfolioGuy       → Market Insight (the dial's ghost needle)
   genWealth          → renovations take one week less */
export const MILESTONES: MilestoneDef[] = [
  {
    id: 'mogul250',
    threshold: 250000,
    label: 'Technically a Mogul',
    line: "Net worth: a quarter million. You said 'portfolio' out loud at a barbecue and meant it.",
  },
  {
    id: 'portfolioGuy',
    threshold: 500000,
    label: 'Portfolio Guy',
    line: "Half a million. Your accountant asked if you're 'doing okay emotionally.'",
  },
  {
    id: 'sevenFig',
    threshold: 1000000,
    label: 'Seven Figures (Gross)',
    line: 'MILLIONAIRE (on paper) (the paper is mortgaged) (still counts).',
  },
  {
    id: 'genWealth',
    threshold: 2500000,
    label: 'Generational Wealth (Self-Described)',
    line: "You now say 'my guy' about four different tradespeople. To Be Continued in Phase 4.",
  },
]
```

- [ ] **Step 4: Write `src/data/vrbo.ts`**

```ts
export interface VrboEventDef {
  id: string
  cash: number
  rep: number
  condition: number
  line: string
}

/** Equal weights — a flat `pick`. */
export const VRBO_EVENTS: VrboEventDef[] = [
  {
    id: 'bachelorParty',
    cash: -800,
    rep: 2,
    condition: 0,
    line: 'A bachelor party happened. The reviews are five stars. The hot tub is not.',
  },
  {
    id: 'filmCrew',
    cash: 2500,
    rep: 0,
    condition: 0,
    line: "A film crew rented it for a movie called 'Equity 2'. No further questions.",
  },
  {
    id: 'influencerSummit',
    cash: 0,
    rep: 3,
    condition: -5,
    line: 'An influencer summit. The content is up. The towels are gone.',
  },
  {
    id: 'plumbingCatastrophe',
    cash: -1200,
    rep: 0,
    condition: -10,
    line: 'All of the plumbing. Everywhere. At once.',
  },
]

export const VRBO_NICKNAME = 'The 424/7 VRBO'

export const VRBO_TOOLTIP =
  'Breaks even at 424 hours/week of bookings. There are 168 hours in a week.'

/** Replaces the pitch body once the offer converts into a real purchase. */
export const VRBO_OFFER_BODY =
  "The wholesaler's voice cracks. 'Look. $480,000. That's BELOW my course price-per-unit math. This property is a MACHINE waiting for an operator.'"

export const VRBO_DECLINE_FOREVER_LINE = "You'll always wonder."

export const MACHINE_TITLE = 'THE MACHINE'
export const MACHINE_SUBTITLE = '424/7. Fully operational.'
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run src/logic/__tests__/portfolio.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/data/milestones.ts src/data/vrbo.ts src/logic/__tests__/portfolio.test.ts
git commit -m "feat: add milestone and VRBO content data"
```

---

### Task 8: Landlord, VRBO, and crash brags

**Files:**
- Modify: `src/data/brags.ts`
- Modify: `src/logic/economy.ts:152-161`
- Test: `src/logic/__tests__/portfolio.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `src/logic/__tests__/portfolio.test.ts`:

```ts
import { CRASH_BRAGS, LANDLORD_BRAGS, VRBO_BRAGS } from '../../data/brags'

describe('phase 3 brag sets', () => {
  it('ships six landlord brags, three vrbo brags, two crash brags', () => {
    expect(LANDLORD_BRAGS).toHaveLength(6)
    expect(VRBO_BRAGS).toHaveLength(3)
    expect(CRASH_BRAGS).toHaveLength(2)
  })
  it('interpolates the door count', () => {
    expect(LANDLORD_BRAGS.some((b) => b.includes('{properties}'))).toBe(true)
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/logic/__tests__/portfolio.test.ts`
Expected: FAIL — no such exports in `../../data/brags`.

- [ ] **Step 3: Append the sets to `src/data/brags.ts`**

```ts
/** Joins the rotation at the first property. `{properties}` is the door count. */
export const LANDLORD_BRAGS: string[] = [
  'Blessed to provide housing 🙏 #passiveincome (I was awake at 3am about a pipe)',
  'They pay ME to own things. Look it up.',
  'Portfolio update: {properties} doors 🚪 (a duplex is two doors, this is legal)',
  "Cash flow isn't a river. It's a MINDSET. 🌊",
  'Just approved my own repair request. Synergy.',
  'Property #{properties}. My grandkids will inherit these group chats.',
]

/** Joins the rotation at The Machine. */
export const VRBO_BRAGS: string[] = [
  'The Machine ran at 71% occupancy this week. The Machine does not sleep. 🏗️',
  'People said 424 hours a week was impossible. The Machine said nothing. The Machine BOOKED.',
  'Asked The Machine for a day off. Request denied. Respect.',
]

/** In the rotation only while a crash is active. */
export const CRASH_BRAGS: string[] = [
  'Buying opportunities everywhere if you know where to look 👀 (down. look down. prices are down.)',
  'Warren Buffett said be greedy when others are fearful. Anyway I bought a duplex.',
]
```

- [ ] **Step 4: Widen `bragFor` to draw from the unlocked sets**

Replace `bragFor` in `src/logic/economy.ts` (currently lines 152–161) with:

```ts
export function bragFor(state: GameState): string {
  const pool = [...BRAG_TEMPLATES[state.rank]]
  if (state.properties.length > 0) pool.push(...LANDLORD_BRAGS)
  if (state.milestonesUnlocked.includes('theMachine')) pool.push(...VRBO_BRAGS)
  if (state.crash.weeksLeft > 0) pool.push(...CRASH_BRAGS)
  const t = pick(pool)
  return t
    .replace('{week}', String(state.week))
    .replace('{cash}', money(state.cash))
    .replace('{earnings}', money(state.careerEarnings))
    .replace('{deals}', String(state.counters.dealsClosed))
    .replace('{showings}', String(state.counters.showingsRun))
    .replace('{leads}', String(state.leads.length))
    .replace('{properties}', String(state.properties.length))
}
```

Update the import at the top of `src/logic/economy.ts`:

```ts
import {
  BRAG_TEMPLATES,
  CRASH_BRAGS,
  LANDLORD_BRAGS,
  VRBO_BRAGS,
} from '../data/brags'
```

`'theMachine'` is a milestone id created at runtime by the VRBO streak (Task 15); it is deliberately not in `MILESTONES`, which only holds the four net-worth tiers.

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run src/logic/__tests__/portfolio.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/data/brags.ts src/logic/economy.ts src/logic/__tests__/portfolio.test.ts
git commit -m "feat: add landlord, VRBO, and crash brag sets"
```

---

### Task 9: The pure portfolio math module

**Files:**
- Create: `src/logic/portfolio.ts`
- Test: `src/logic/__tests__/portfolio.test.ts`

This module is pure except where it draws randomness. It imports `data/` and `logic/rand` only — never `state/reducer`.

- [ ] **Step 1: Write the failing tests**

Append to `src/logic/__tests__/portfolio.test.ts`:

```ts
import { setSeed } from '../rand'
import {
  applicantChance,
  chargedRent,
  conditionFactor,
  displayedValue,
  fairRent,
  interp,
  makeListing,
  mortgageSlots,
  netWorth,
  renoCost,
  renoWeeks,
  saleChance,
  usedMortgageSlots,
  vrboOccupancy,
} from '../portfolio'
import type { GameState, Property, UnitState } from '../../state/types'

const unit = (over: Partial<UnitState> = {}): UnitState => ({
  id: 'P1-u0',
  tenant: null,
  rentR: 1.0,
  openIssue: null,
  evictionWeeksLeft: null,
  ...over,
})

const prop = (over: Partial<Property> = {}): Property => ({
  id: 'P1',
  typeId: 'starter',
  nickname: 'Starter Home on Dundurn',
  baseValue: 200000,
  condition: 70,
  mortgage: null,
  units: [unit()],
  renovation: null,
  listedForSale: false,
  boughtWeek: 1,
  isVrbo: false,
  vrboProfitStreak: 0,
  vrboRenoDone: false,
  ...over,
})

const st = (over: Partial<GameState> = {}): GameState =>
  ({
    cash: 10000,
    reputation: 0,
    week: 20,
    rank: 'topProducer',
    marketState: 'normal',
    crash: { weeksLeft: 0, lastCrashWeek: -999 },
    properties: [],
    milestonesUnlocked: [],
    activeChannelIds: [],
    ...over,
  }) as GameState

describe('displayedValue and netWorth', () => {
  it('applies the market multiplier', () => {
    const p = prop()
    expect(displayedValue(st({ marketState: 'hot' }), p)).toBe(220000)
    expect(displayedValue(st({ marketState: 'cold' }), p)).toBe(180000)
  })
  it('stacks the crash multiplier on top', () => {
    const s = st({ marketState: 'cold', crash: { weeksLeft: 3, lastCrashWeek: 20 } })
    expect(displayedValue(s, prop())).toBe(144000)
  })
  it('nets out mortgage balances and adds cash', () => {
    const p = prop({ mortgage: { balance: 150000 } })
    const s = st({ cash: 5000, properties: [p] })
    expect(netWorth(s)).toBe(5000 + 200000 - 150000)
  })
})

describe('rent', () => {
  it('scales fair rent from 60% to 100% of base across condition', () => {
    expect(fairRent(prop({ condition: 0 }), 400)).toBeCloseTo(240)
    expect(fairRent(prop({ condition: 100 }), 400)).toBeCloseTo(400)
  })
  it('applies the slider and the tenant modifier, rounded to $5', () => {
    const p = prop({ condition: 100 })
    const u = unit({
      rentR: 1.2,
      tenant: {
        archetypeId: 'corpLease',
        name: 'A Corporation',
        tenancyWeeks: 1,
        plannedStayWeeks: 14,
        owed: 0,
      },
    })
    // 400 * 1.2 * 1.2 = 576 → 575
    expect(chargedRent(p, u, 400)).toBe(575)
  })
})

describe('applicantChance', () => {
  it('matches the spec curve at the checkpoints', () => {
    expect(applicantChance(0.8, false)).toBeCloseTo(0.8, 5)
    expect(applicantChance(1.0, false)).toBeCloseTo(0.7, 5)
    expect(applicantChance(1.2, false)).toBeCloseTo(0.475, 5)
    expect(applicantChance(1.4, false)).toBeCloseTo(0.25, 5)
  })
  it('adds the PropCo bonus before clamping', () => {
    expect(applicantChance(1.0, true)).toBeCloseTo(0.8, 5)
    expect(applicantChance(1.4, true)).toBeCloseTo(0.3, 5)
  })
})

describe('mortgage slots', () => {
  it('grows with the two milestone perks and caps at four', () => {
    expect(mortgageSlots(st())).toBe(2)
    expect(mortgageSlots(st({ milestonesUnlocked: ['mogul250'] }))).toBe(3)
    expect(
      mortgageSlots(st({ milestonesUnlocked: ['mogul250', 'sevenFig'] })),
    ).toBe(4)
  })
  it('counts only financed properties', () => {
    const s = st({
      properties: [prop(), prop({ id: 'P2', mortgage: { balance: 10 } })],
    })
    expect(usedMortgageSlots(s)).toBe(1)
  })
})

describe('listing generation', () => {
  it('prices condition into the ask and leaves no instant equity', () => {
    expect(conditionFactor(40)).toBeCloseTo(0.8333, 4)
    expect(conditionFactor(90)).toBeCloseTo(1.0, 4)
    setSeed(7)
    const l = makeListing(st(), 1)
    expect(l.askPrice).toBe(
      Math.round(l.intrinsicValue * conditionFactor(l.condition)),
    )
    setSeed(null)
  })
})

describe('saleChance', () => {
  it('is base + rep + market delta, clamped', () => {
    expect(saleChance(st({ reputation: 50 }))).toBeCloseTo(0.35, 5)
    expect(saleChance(st({ reputation: 0, marketState: 'cold' }))).toBeCloseTo(
      0.1,
      5,
    )
    expect(saleChance(st({ reputation: 100, marketState: 'hot' }))).toBeCloseTo(
      0.6,
      5,
    )
  })
})

describe('renovation cost and duration', () => {
  it('charges a percentage of current baseValue', () => {
    expect(renoCost(prop({ baseValue: 300000 }), 'full')).toBe(60000)
    expect(renoCost(prop({ baseValue: 300000 }), 'cosmetic')).toBe(24000)
  })
  it('takes a week off once generational wealth lands', () => {
    expect(renoWeeks(st(), 'full')).toBe(5)
    expect(renoWeeks(st({ milestonesUnlocked: ['genWealth'] }), 'full')).toBe(4)
  })
})

describe('vrboOccupancy', () => {
  it('hits 0.70 fully optimized in a normal market, before jitter', () => {
    const p = prop({ isVrbo: true, vrboRenoDone: true, condition: 80 })
    const s = st({ activeChannelIds: ['tiktok'] })
    expect(vrboOccupancy(s, p, 0)).toBeCloseTo(0.7, 5)
  })
  it('is 0.15 unmanaged and penalised under 50 condition', () => {
    const p = prop({ isVrbo: true, condition: 40 })
    expect(vrboOccupancy(st(), p, 0)).toBeCloseTo(0.05, 5)
  })
  it('caps at 0.85', () => {
    const p = prop({ isVrbo: true, vrboRenoDone: true, condition: 80 })
    const s = st({ activeChannelIds: ['tiktok'], marketState: 'hot' })
    expect(vrboOccupancy(s, p, 0.05)).toBeCloseTo(0.85, 5)
  })
})

describe('interp', () => {
  it('replaces every occurrence of every placeholder', () => {
    expect(interp('{name} and {name} at {nickname}', {
      name: 'Dave',
      nickname: 'Elm Ridge',
    })).toBe('Dave and Dave at Elm Ridge')
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/logic/__tests__/portfolio.test.ts`
Expected: FAIL — cannot resolve `../portfolio`.

- [ ] **Step 3: Write `src/logic/portfolio.ts`**

```ts
import { MILESTONES } from '../data/milestones'
import { P3, PRICE_ROUND } from '../data/p3'
import { PROPERTY_TYPES, RENO_PROJECTS, STREET_NAMES } from '../data/properties'
import { TENANTS } from '../data/tenants'
import { LAST_NAMES, FIRST_NAMES } from '../data/archetypes'
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
import { rankIndex } from './economy'
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
  baseRent * (P3.FAIR_RENT_FLOOR + (P3.FAIR_RENT_COND_WEIGHT * p.condition) / 100)

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

export function makeListing(s: GameState, id: number): Listing {
  const types = eligibleTypes(s)
  const t = weightedPick(types, (x) => x.weight) ?? types[0]
  const condition = randInt(40, 90)
  const intrinsicValue = roundTo(
    randInt(t.band.min, t.band.max),
    PRICE_ROUND,
  )
  const askPrice = Math.round(
    intrinsicValue *
      conditionFactor(condition) *
      P3.POOL_PRICE_MULT[s.marketState] *
      (s.crash.weeksLeft > 0 ? P3.CRASH.poolMult : 1),
  )
  return {
    id: 'LST' + id,
    typeId: t.id,
    intrinsicValue,
    condition,
    askPrice,
    blurb: pick(t.blurbs),
  }
}

/** Tops the pool back up to MARKET_POOL_SIZE, advancing nextListingId. */
export function fillPool(s: GameState): GameState {
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

export const applicantChance = (r: number, propCo: boolean): number =>
  clamp(
    P3.APPLICANT_BASE -
      (r - 1.0) * P3.APPLICANT_SLOPE +
      (propCo ? 0.1 : 0),
    P3.APPLICANT_MIN,
    P3.APPLICANT_MAX,
  )

export const tenantAvailable = (
  t: TenantArchetype,
  p: Property,
  r: number,
): boolean => p.condition >= t.availableMinCondition && r <= t.availableMaxR

/** Tier weights from the rent ratio. Index 0 is tier 1. */
export function tierWeights(r: number): [number, number, number] {
  const p = r - 1.0
  return [
    Math.max(0, 30 - 100 * p),
    40,
    30 + 80 * Math.max(0, p),
  ]
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

export function makeTenant(a: TenantArchetype): NonNullable<UnitState['tenant']> {
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

export const saleChance = (s: GameState): number =>
  clamp(
    P3.FLIP_BASE +
      s.reputation * P3.FLIP_REP_FACTOR +
      P3.FLIP_DELTA[s.marketState],
    P3.FLIP_MIN,
    P3.FLIP_MAX,
  )

/* ---------------------------------------------------------- renovations */

export const renoCost = (p: Property, id: RenoProjectId): number =>
  Math.round(p.baseValue * renoOf(id).costPct)

export const renoWeeks = (s: GameState, id: RenoProjectId): number =>
  Math.max(1, renoOf(id).weeks - (s.milestonesUnlocked.includes('genWealth') ? 1 : 0))

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

/** Every gate on starting a project, as one predicate with a reason. */
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
  if (proj.requiresVacant && anyUnitOccupied(p)) return null // caller uses RENO_OCCUPIED_REFUSAL
  if (s.cash < renoCost(p, id)) return 'The deposit alone would clear you out.'
  return null
}

/* ----------------------------------------------------------------- vrbo */

/** `jitter` is the pre-rolled ±0.05 wobble; callers pass 0 to see the mean. */
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

export const hasMarketInsight = (s: GameState): boolean =>
  s.milestonesUnlocked.includes('portfolioGuy')

/* -------------------------------------------------------- market cycle */

/** The 80/20 Markov step. Never jumps hot↔cold. */
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
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/logic/__tests__/portfolio.test.ts`
Expected: PASS. (`npx tsc -b` still fails on `reducer.ts`/`migrate.ts` — Task 10.)

- [ ] **Step 5: Commit**

```bash
git add src/logic/portfolio.ts src/logic/__tests__/portfolio.test.ts
git commit -m "feat: add the pure portfolio math module"
```

---

### Task 10: initialState, migration v2 → v3

**Files:**
- Modify: `src/state/reducer.ts:54-86`
- Modify: `src/state/migrate.ts`
- Test: `src/state/__tests__/migrate.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `src/state/__tests__/migrate.test.ts`:

```ts
import { migrate } from '../migrate'
import { initialState } from '../reducer'

describe('v2 → v3 migration', () => {
  it('adds every Phase 3 field with its default', () => {
    const v2 = { ...initialState(), version: 2, week: 31, cash: 42000 }
    const out = migrate(v2)!
    expect(out.version).toBe(3)
    expect(out.properties).toEqual([])
    expect(out.marketState).toBe('normal')
    expect(out.crash).toEqual({ weeksLeft: 0, lastCrashWeek: -999 })
    expect(out.marketPool).toHaveLength(4)
    expect(out.milestonesUnlocked).toEqual([])
    expect(out.propCoActive).toBe(false)
    expect(out.pendingChoices).toEqual([])
    expect(out.nextPropertyId).toBe(1)
    expect(out.nextListingId).toBe(5)
    expect(out.nextChoiceId).toBe(1)
    expect(out.peakNetWorth).toBe(42000)
    expect(out.firstP3Week).toBe(31)
    expect(out.gagCounters.vrboOwned).toBe(false)
    expect(out.gagCounters.vrboDeclinedForever).toBe(false)
  })

  it('keeps Phase 2 progress intact', () => {
    const v2 = {
      ...initialState(),
      version: 2,
      reputation: 55,
      activeChannelIds: ['tiktok'],
      rank: 'topProducer',
    }
    const out = migrate(v2)!
    expect(out.reputation).toBe(55)
    expect(out.activeChannelIds).toEqual(['tiktok'])
    expect(out.rank).toBe('topProducer')
  })

  it('chain-migrates a v1 save', () => {
    const v1 = { version: 1, week: 3, cash: 900, rank: 'junior' }
    const out = migrate(v1)!
    expect(out.version).toBe(3)
    expect(out.reputation).toBe(0)
    expect(out.marketPool.length).toBe(4)
  })

  it('rejects an unknown version', () => {
    expect(migrate({ version: 9 })).toBeNull()
  })

  it('does not carry a Phase 3 save backwards', () => {
    const v3 = { ...initialState(), milestonesUnlocked: ['mogul250'] }
    expect(migrate(v3)!.milestonesUnlocked).toEqual(['mogul250'])
  })
})
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run src/state/__tests__/migrate.test.ts`
Expected: FAIL — `version` is 2 and the Phase 3 fields are missing.

- [ ] **Step 3: Extend `initialState`**

In `src/state/reducer.ts`, change `version: 2` to `version: 3` and replace the `gagCounters` line, then append the new fields before the closing brace:

```ts
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
```

Then make the pool exist from turn one. `initialState` currently does
`return { version: 2, ... }` directly; change it to bind that same object
literal — with every field it already has plus the ones added above — to a
local and return it through `fillPool`:

```ts
export function initialState(): GameState {
  const base: GameState = {
    version: 3,
    week: 1,
    /* every other existing field, unchanged, plus the Phase 3 fields above */
    firstP3Week: 1,
  }
  /* A fresh game opens with four listings already on the board, so the
     Portfolio tab is never empty on week one. This consumes listing ids 1–4
     and leaves nextListingId at 5. */
  return fillPool(base)
}
```

Add the import to `src/state/reducer.ts`:

```ts
import { fillPool } from '../logic/portfolio'
```

- [ ] **Step 4: Rewrite the migration**

Replace `src/state/migrate.ts` wholesale:

```ts
/* v1/v2 → v3 save migration. The localStorage key never changes
   (`res_save_v1`); only `GameState.version` moves. Every field added in a later
   phase gets a default here, so a player who refreshes mid-game lands in v3
   with their progress intact and nothing to re-earn. */

import { RANKS } from '../data/ranks'
import { PRESET_SLOTS } from '../data/swag'
import { fillPool } from '../logic/portfolio'
import { initialState } from './reducer'
import type { GameState } from './types'

interface AnySave {
  version?: number
  permBonuses?: { hustle?: number; swagger?: number; ego?: number }
  [k: string]: unknown
}

const num = (v: unknown, fallback: number): number =>
  typeof v === 'number' && Number.isFinite(v) ? v : fallback

/** Returns a fully-populated v3 state, or null if `raw` isn't one of ours. */
export function migrate(raw: unknown): GameState | null {
  if (!raw || typeof raw !== 'object') return null
  const s = raw as AnySave
  if (s.version !== 1 && s.version !== 2 && s.version !== 3) return null

  const base = initialState()
  const merged = { ...base, ...s } as GameState
  const gag = s.gagCounters as
    | {
        vrboOffers?: number
        nextVrboWeek?: number
        vrboOwned?: boolean
        vrboDeclinedForever?: boolean
      }
    | undefined
  const crash = s.crash as
    | { weeksLeft?: number; lastCrashWeek?: number }
    | undefined
  const week = num(s.week, base.week)
  const cash = num(s.cash, base.cash)

  const out: GameState = {
    ...merged,
    version: 3,
    permBonuses: {
      hustle: s.permBonuses?.hustle ?? base.permBonuses.hustle,
      swagger: s.permBonuses?.swagger ?? base.permBonuses.swagger,
      ego: s.permBonuses?.ego ?? base.permBonuses.ego,
    },
    reputation: num(s.reputation, base.reputation),
    activeChannelIds: Array.isArray(s.activeChannelIds)
      ? (s.activeChannelIds as string[])
      : base.activeChannelIds,
    outfitPresets: Array.isArray(s.outfitPresets)
      ? Array.from(
          { length: PRESET_SLOTS },
          (_, i) => (s.outfitPresets as GameState['outfitPresets'])[i] ?? null,
        )
      : base.outfitPresets,
    gagCounters: {
      vrboOffers: gag?.vrboOffers ?? base.gagCounters.vrboOffers,
      nextVrboWeek: gag?.nextVrboWeek ?? week + 2,
      vrboOwned: gag?.vrboOwned ?? false,
      vrboDeclinedForever: gag?.vrboDeclinedForever ?? false,
    },
    channelMuteUntil:
      s.channelMuteUntil && typeof s.channelMuteUntil === 'object'
        ? (s.channelMuteUntil as Record<string, number>)
        : base.channelMuteUntil,
    pendingChoice:
      (s.pendingChoice as GameState['pendingChoice'] | undefined) ??
      base.pendingChoice,
    /* transient UI fields never come back from disk */
    summary: null,
    promo: null,
    leads: Array.isArray(s.leads) ? (s.leads as GameState['leads']) : base.leads,
    counters:
      s.counters && typeof s.counters === 'object'
        ? { ...base.counters, ...(s.counters as object) }
        : base.counters,
    rank: RANKS.some((r) => r.id === s.rank)
      ? (s.rank as GameState['rank'])
      : base.rank,
    /* ---- phase 3 ---- */
    properties: Array.isArray(s.properties)
      ? (s.properties as GameState['properties'])
      : [],
    marketPool: Array.isArray(s.marketPool)
      ? (s.marketPool as GameState['marketPool'])
      : [],
    marketState:
      (s.marketState as GameState['marketState'] | undefined) ?? 'normal',
    nextMarketState:
      (s.nextMarketState as GameState['marketState'] | undefined) ?? 'normal',
    crash: {
      weeksLeft: num(crash?.weeksLeft, 0),
      lastCrashWeek: num(crash?.lastCrashWeek, -999),
    },
    milestonesUnlocked: Array.isArray(s.milestonesUnlocked)
      ? (s.milestonesUnlocked as string[])
      : [],
    propCoActive: s.propCoActive === true,
    pendingChoices: Array.isArray(s.pendingChoices)
      ? (s.pendingChoices as GameState['pendingChoices'])
      : [],
    nextPropertyId: num(s.nextPropertyId, 1),
    nextListingId: num(s.nextListingId, 1),
    nextChoiceId: num(s.nextChoiceId, 1),
    peakNetWorth: num(s.peakNetWorth, cash),
    firstP3Week: num(s.firstP3Week, week),
  }

  /* A v1/v2 save arrives with an empty pool; a v3 save keeps the one it had.
     `nextListingId` lands on 5 for a fresh migration because fillPool consumed
     ids 1–4. */
  return fillPool(out)
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run src/state/__tests__/migrate.test.ts && npx tsc -b`
Expected: migrate tests PASS. `tsc` now fails only on `WeekSummary.portfolio` being absent in `endWeek` — Task 16 fixes that. If you want a clean type-check now, add `portfolio: []` to the `summary` object literal at the end of `endWeek` in `src/state/reducer.ts`.

- [ ] **Step 6: Commit**

```bash
git add src/state/reducer.ts src/state/migrate.ts src/state/__tests__/migrate.test.ts
git commit -m "feat: migrate saves to v3 and seed the market pool"
```

---

### Task 11: Buying, renting, listing, and financing actions

**Files:**
- Modify: `src/state/reducer.ts`
- Test: `src/state/__tests__/portfolioActions.test.ts`

Every invalid action is a no-op that still writes an in-fiction log line, so the
player is never left wondering why a button did nothing.

- [ ] **Step 1: Write the failing tests**

Create `src/state/__tests__/portfolioActions.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { setSeed } from '../../logic/rand'
import { initialState, reducer } from '../reducer'
import type { GameState, Listing, Property } from '../types'

const listing = (over: Partial<Listing> = {}): Listing => ({
  id: 'LST1',
  typeId: 'starter',
  intrinsicValue: 200000,
  condition: 60,
  askPrice: 180000,
  blurb: 'Good bones. The bones are load-bearing wallpaper.',
  ...over,
})

const owned = (over: Partial<Property> = {}): Property => ({
  id: 'P1',
  typeId: 'starter',
  nickname: 'Starter Home on Dundurn',
  baseValue: 180000,
  condition: 60,
  mortgage: null,
  units: [
    {
      id: 'P1-u0',
      tenant: null,
      rentR: 1.0,
      openIssue: null,
      evictionWeeksLeft: null,
    },
  ],
  renovation: null,
  listedForSale: false,
  boughtWeek: 1,
  isVrbo: false,
  vrboProfitStreak: 0,
  vrboRenoDone: false,
  ...over,
})

const base = (over: Partial<GameState> = {}): GameState => ({
  ...initialState(),
  rank: 'sellerAgent',
  cash: 200000,
  marketPool: [listing()],
  ...over,
})

describe('BUY_PROPERTY', () => {
  it('takes the down payment and finances the rest', () => {
    setSeed(3)
    const s = reducer(base(), {
      type: 'BUY_PROPERTY',
      listingId: 'LST1',
      downPct: 0.2,
    })
    setSeed(null)
    expect(s.cash).toBe(200000 - 36000)
    expect(s.properties).toHaveLength(1)
    expect(s.properties[0].mortgage).toEqual({ balance: 144000 })
    expect(s.properties[0].baseValue).toBe(180000)
    expect(s.properties[0].condition).toBe(60)
    expect(s.properties[0].units).toHaveLength(1)
    expect(s.properties[0].units[0].rentR).toBe(1.0)
    expect(s.marketPool.some((l) => l.id === 'LST1')).toBe(false)
    expect(s.marketPool).toHaveLength(4)
  })

  it('takes no mortgage slot on a cash purchase', () => {
    const s = reducer(base(), {
      type: 'BUY_PROPERTY',
      listingId: 'LST1',
      downPct: 1,
    })
    expect(s.cash).toBe(20000)
    expect(s.properties[0].mortgage).toBeNull()
  })

  it('refuses under 20% down', () => {
    const s = base()
    expect(
      reducer(s, { type: 'BUY_PROPERTY', listingId: 'LST1', downPct: 0.1 })
        .properties,
    ).toHaveLength(0)
  })

  it('refuses when every mortgage slot is used', () => {
    const s = base({
      properties: [
        owned({ id: 'P1', mortgage: { balance: 1 } }),
        owned({ id: 'P2', mortgage: { balance: 1 } }),
      ],
    })
    const out = reducer(s, {
      type: 'BUY_PROPERTY',
      listingId: 'LST1',
      downPct: 0.2,
    })
    expect(out.properties).toHaveLength(2)
  })

  it('refuses when the down payment exceeds cash', () => {
    const s = base({ cash: 1000 })
    expect(
      reducer(s, { type: 'BUY_PROPERTY', listingId: 'LST1', downPct: 0.2 })
        .properties,
    ).toHaveLength(0)
  })
})

describe('SET_RENT', () => {
  it('clamps to the slider range and costs no AP', () => {
    const s = base({ properties: [owned()] })
    const hi = reducer(s, {
      type: 'SET_RENT',
      propertyId: 'P1',
      unitId: 'P1-u0',
      r: 2,
    })
    expect(hi.properties[0].units[0].rentR).toBe(1.4)
    expect(hi.ap).toBe(s.ap)
    const lo = reducer(s, {
      type: 'SET_RENT',
      propertyId: 'P1',
      unitId: 'P1-u0',
      r: 0.1,
    })
    expect(lo.properties[0].units[0].rentR).toBe(0.7)
  })
  it('snaps to the 0.05 step', () => {
    const s = reducer(base({ properties: [owned()] }), {
      type: 'SET_RENT',
      propertyId: 'P1',
      unitId: 'P1-u0',
      r: 1.13,
    })
    expect(s.properties[0].units[0].rentR).toBeCloseTo(1.15, 5)
  })
})

describe('LIST_FOR_SALE / DELIST', () => {
  it('costs 1 AP to list and nothing to delist', () => {
    const s = base({ properties: [owned()], ap: 5 })
    const listed = reducer(s, { type: 'LIST_FOR_SALE', propertyId: 'P1' })
    expect(listed.properties[0].listedForSale).toBe(true)
    expect(listed.ap).toBe(4)
    const back = reducer(listed, { type: 'DELIST', propertyId: 'P1' })
    expect(back.properties[0].listedForSale).toBe(false)
    expect(back.ap).toBe(4)
  })
  it('refuses to list a property that is mid-renovation', () => {
    const s = base({
      properties: [owned({ renovation: { projectId: 'full', weeksLeft: 3 } })],
    })
    expect(
      reducer(s, { type: 'LIST_FOR_SALE', propertyId: 'P1' }).properties[0]
        .listedForSale,
    ).toBe(false)
  })
})

describe('PAY_PRINCIPAL', () => {
  it('pays a $10k chunk', () => {
    const s = base({ properties: [owned({ mortgage: { balance: 25000 } })] })
    const out = reducer(s, { type: 'PAY_PRINCIPAL', propertyId: 'P1' })
    expect(out.cash).toBe(190000)
    expect(out.properties[0].mortgage).toEqual({ balance: 15000 })
  })
  it('clears the mortgage and frees the slot on the last payment', () => {
    const s = base({ properties: [owned({ mortgage: { balance: 4000 } })] })
    const out = reducer(s, { type: 'PAY_PRINCIPAL', propertyId: 'P1' })
    expect(out.cash).toBe(196000)
    expect(out.properties[0].mortgage).toBeNull()
  })
  it('refuses when cash will not cover the chunk', () => {
    const s = base({ cash: 500, properties: [owned({ mortgage: { balance: 25000 } })] })
    expect(
      reducer(s, { type: 'PAY_PRINCIPAL', propertyId: 'P1' }).properties[0]
        .mortgage,
    ).toEqual({ balance: 25000 })
  })
})

describe('TOGGLE_PROPCO', () => {
  const tenanted = (id: string) =>
    owned({
      id,
      units: [
        {
          id: id + '-u0',
          tenant: {
            archetypeId: 'lateLenny',
            name: 'Lenny Pham',
            tenancyWeeks: 2,
            plannedStayWeeks: 20,
            owed: 0,
          },
          rentR: 1,
          openIssue: null,
          evictionWeeksLeft: null,
        },
      ],
    })

  it('refuses to enable under three occupied units', () => {
    const s = base({ properties: [tenanted('P1'), tenanted('P2')] })
    expect(reducer(s, { type: 'TOGGLE_PROPCO' }).propCoActive).toBe(false)
  })
  it('enables at three occupied units and always disables', () => {
    const s = base({
      properties: [tenanted('P1'), tenanted('P2'), tenanted('P3')],
    })
    const on = reducer(s, { type: 'TOGGLE_PROPCO' })
    expect(on.propCoActive).toBe(true)
    expect(reducer(on, { type: 'TOGGLE_PROPCO' }).propCoActive).toBe(false)
  })
})

describe('RENAME_PROPERTY', () => {
  it('caps the nickname at 24 characters', () => {
    const s = reducer(base({ properties: [owned()] }), {
      type: 'RENAME_PROPERTY',
      propertyId: 'P1',
      nickname: 'A'.repeat(40),
    })
    expect(s.properties[0].nickname).toHaveLength(24)
  })
})
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run src/state/__tests__/portfolioActions.test.ts`
Expected: FAIL — the reducer has no `BUY_PROPERTY` case, so every assertion sees unchanged state.

- [ ] **Step 3: Add a shared property helper to `src/state/reducer.ts`**

Add near `spendAp`:

```ts
/** Replaces one property in place. Every property action goes through this so
 *  no case has to hand-roll an array map. */
function patchProperty(
  state: GameState,
  propertyId: string,
  fn: (p: Property) => Property,
): GameState {
  return {
    ...state,
    properties: state.properties.map((p) =>
      p.id === propertyId ? fn(p) : p,
    ),
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
```

- [ ] **Step 4: Add the action cases**

Add to the `switch` in `reducer()` in `src/state/reducer.ts`:

```ts
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
          'You pulled ' + p.nickname + ' off the market. Timing, you tell people.',
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
    case 'TOGGLE_PROPCO': {
      if (!state.propCoActive) {
        if (occupiedUnitCount(state) < P3.PROPCO_MIN_OCCUPIED_UNITS)
          return withLog(
            state,
            'flavor',
            'PropCo has a minimum. Three occupied units, or they “can’t build a relationship.”',
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
```

- [ ] **Step 5: Add the imports**

Add to the imports at the top of `src/state/reducer.ts`:

```ts
import { P3 } from '../data/p3'
import {
  clamp,
  fillPool,
  hasFreeMortgageSlot,
  nicknameFor,
  occupiedUnitCount,
  purchaseBaseValue,
  typeOf,
} from '../logic/portfolio'
import { roundTo } from '../logic/rand'
import type { Property, UnitState } from './types'
```

(`money`, `chance`, `pick`, `randInt` are already imported from `../logic/rand`; extend that existing import rather than adding a second one.)

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run src/state/__tests__/portfolioActions.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/state/reducer.ts src/state/__tests__/portfolioActions.test.ts
git commit -m "feat: add buy, rent, list, principal, and PropCo actions"
```

---

### Task 12: Renovation, repair, issue, and eviction actions

**Files:**
- Modify: `src/state/reducer.ts`
- Test: `src/state/__tests__/portfolioActions.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `src/state/__tests__/portfolioActions.test.ts`:

```ts
const tenant = (archetypeId: string, name = 'Dave Okafor') => ({
  archetypeId,
  name,
  tenancyWeeks: 3,
  plannedStayWeeks: 20,
  owed: 0,
})

describe('START_RENOVATION', () => {
  it('charges 20% of baseValue and starts a five-week full reno', () => {
    const s = reducer(base({ properties: [owned({ baseValue: 200000 })] }), {
      type: 'START_RENOVATION',
      propertyId: 'P1',
      projectId: 'full',
    })
    expect(s.cash).toBe(160000)
    expect(s.properties[0].renovation).toEqual({
      projectId: 'full',
      weeksLeft: 5,
    })
  })
  it('refuses a full reno while anybody is living there', () => {
    const occupied = owned({
      units: [
        {
          id: 'P1-u0',
          tenant: tenant('lateLenny'),
          rentR: 1,
          openIssue: null,
          evictionWeeksLeft: null,
        },
      ],
    })
    const s = reducer(base({ properties: [occupied] }), {
      type: 'START_RENOVATION',
      propertyId: 'P1',
      projectId: 'full',
    })
    expect(s.properties[0].renovation).toBeNull()
    expect(s.log[0].text).toContain("You can't gut it around Patricia.")
  })
  it('allows a cosmetic refresh with a tenant in place', () => {
    const occupied = owned({
      units: [
        {
          id: 'P1-u0',
          tenant: tenant('lateLenny'),
          rentR: 1,
          openIssue: null,
          evictionWeeksLeft: null,
        },
      ],
    })
    const s = reducer(base({ properties: [occupied] }), {
      type: 'START_RENOVATION',
      propertyId: 'P1',
      projectId: 'cosmetic',
    })
    expect(s.properties[0].renovation).toEqual({
      projectId: 'cosmetic',
      weeksLeft: 2,
    })
  })
  it('refuses the luxury package below Top Producer', () => {
    const s = reducer(
      base({ rank: 'sellerAgent', properties: [owned({ typeId: 'townhouse' })] }),
      { type: 'START_RENOVATION', propertyId: 'P1', projectId: 'luxuryPkg' },
    )
    expect(s.properties[0].renovation).toBeNull()
  })
  it('refuses a project the type is not eligible for', () => {
    const s = reducer(base({ rank: 'topProducer', properties: [owned()] }), {
      type: 'START_RENOVATION',
      propertyId: 'P1',
      projectId: 'luxuryPkg',
    })
    expect(s.properties[0].renovation).toBeNull()
  })
})

describe('EMERGENCY_REPAIR', () => {
  it('costs 1 AP and $1,000 for +15 condition', () => {
    const s = reducer(base({ properties: [owned({ condition: 30 })], ap: 5 }), {
      type: 'EMERGENCY_REPAIR',
      propertyId: 'P1',
    })
    expect(s.cash).toBe(199000)
    expect(s.ap).toBe(4)
    expect(s.properties[0].condition).toBe(45)
  })
  it('caps condition at 100', () => {
    const s = reducer(base({ properties: [owned({ condition: 95 })] }), {
      type: 'EMERGENCY_REPAIR',
      propertyId: 'P1',
    })
    expect(s.properties[0].condition).toBe(100)
  })
  it('clears a rent strike once condition reaches 50', () => {
    const striking = owned({
      condition: 38,
      units: [
        {
          id: 'P1-u0',
          tenant: tenant('lateLenny'),
          rentR: 1,
          openIssue: { eventId: 'rentStrike', weeksOpen: 2, fixCost: 0 },
          evictionWeeksLeft: null,
        },
      ],
    })
    const s = reducer(base({ properties: [striking] }), {
      type: 'EMERGENCY_REPAIR',
      propertyId: 'P1',
    })
    expect(s.properties[0].condition).toBe(53)
    expect(s.properties[0].units[0].openIssue).toBeNull()
  })
})

describe('HANDLE_ISSUE', () => {
  it('pays the fix cost, closes the issue, and logs the fix line', () => {
    const broken = owned({
      units: [
        {
          id: 'P1-u0',
          tenant: tenant('lateLenny'),
          rentR: 1,
          openIssue: { eventId: 'burstPipe', weeksOpen: 1, fixCost: 300 },
          evictionWeeksLeft: null,
        },
      ],
    })
    const s = reducer(base({ properties: [broken], ap: 5 }), {
      type: 'HANDLE_ISSUE',
      propertyId: 'P1',
      unitId: 'P1-u0',
    })
    expect(s.cash).toBe(199700)
    expect(s.ap).toBe(4)
    expect(s.properties[0].units[0].openIssue).toBeNull()
    expect(s.log[0].text).toContain('You did not ask.')
  })
  it('restores condition to 60 when fixing a failed inspection', () => {
    const failed = owned({
      condition: 35,
      units: [
        {
          id: 'P1-u0',
          tenant: tenant('lateLenny'),
          rentR: 1,
          openIssue: { eventId: 'cityInspection', weeksOpen: 1, fixCost: 800 },
          evictionWeeksLeft: null,
        },
      ],
    })
    const s = reducer(base({ properties: [failed] }), {
      type: 'HANDLE_ISSUE',
      propertyId: 'P1',
      unitId: 'P1-u0',
    })
    expect(s.properties[0].condition).toBe(60)
  })
  it('refuses to fix a rent strike with money', () => {
    const striking = owned({
      condition: 30,
      units: [
        {
          id: 'P1-u0',
          tenant: tenant('lateLenny'),
          rentR: 1,
          openIssue: { eventId: 'rentStrike', weeksOpen: 1, fixCost: 0 },
          evictionWeeksLeft: null,
        },
      ],
    })
    const s = reducer(base({ properties: [striking] }), {
      type: 'HANDLE_ISSUE',
      propertyId: 'P1',
      unitId: 'P1-u0',
    })
    expect(s.properties[0].units[0].openIssue).not.toBeNull()
  })
})

describe('EVICT', () => {
  const withTenant = (archetypeId: string) =>
    owned({
      units: [
        {
          id: 'P1-u0',
          tenant: tenant(archetypeId),
          rentR: 1,
          openIssue: null,
          evictionWeeksLeft: null,
        },
      ],
    })

  it('costs 1 AP and $800 and starts a four-week clock', () => {
    const s = reducer(base({ properties: [withTenant('lateLenny')], ap: 5 }), {
      type: 'EVICT',
      propertyId: 'P1',
      unitId: 'P1-u0',
    })
    expect(s.cash).toBe(199200)
    expect(s.ap).toBe(4)
    expect(s.properties[0].units[0].evictionWeeksLeft).toBe(4)
    expect(s.properties[0].units[0].tenant).not.toBeNull()
  })
  it('gives the Collector six weeks', () => {
    const s = reducer(base({ properties: [withTenant('theHoarder')] }), {
      type: 'EVICT',
      propertyId: 'P1',
      unitId: 'P1-u0',
    })
    expect(s.properties[0].units[0].evictionWeeksLeft).toBe(6)
  })
  it('does not restart a running eviction', () => {
    const started = reducer(base({ properties: [withTenant('lateLenny')] }), {
      type: 'EVICT',
      propertyId: 'P1',
      unitId: 'P1-u0',
    })
    const again = reducer(started, {
      type: 'EVICT',
      propertyId: 'P1',
      unitId: 'P1-u0',
    })
    expect(again.cash).toBe(started.cash)
  })
})
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run src/state/__tests__/portfolioActions.test.ts`
Expected: FAIL — no `START_RENOVATION`, `EMERGENCY_REPAIR`, `HANDLE_ISSUE`, or `EVICT` case.

- [ ] **Step 3: Add the action cases to `src/state/reducer.ts`**

```ts
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
        (x) => ({ ...x, renovation: { projectId: action.projectId, weeksLeft: weeks } }),
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
      const condition = Math.min(
        100,
        p.condition + P3.EMERGENCY_REPAIR_COND,
      )
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
      s = patchUnit(spendAp(s, 1), p.id, u.id, (x) => ({ ...x, openIssue: null }))
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
```

- [ ] **Step 4: Extend the imports in `src/state/reducer.ts`**

```ts
import { RENO_OCCUPIED_REFUSAL } from '../data/properties'
import { TENANT_FIX_LINES } from '../data/tenantEvents'
import {
  anyUnitOccupied,
  interp,
  renoBlockReason,
  renoCost,
  renoOf,
  renoWeeks,
} from '../logic/portfolio'
```

Merge these into the existing `../logic/portfolio` import added in Task 11 rather than duplicating it.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run src/state/__tests__/portfolioActions.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/state/reducer.ts src/state/__tests__/portfolioActions.test.ts
git commit -m "feat: add renovation, repair, issue, and eviction actions"
```

---

### Task 13: The choice queue, the VRBO offer, and BUY_VRBO

**Files:**
- Modify: `src/state/reducer.ts`
- Modify: `src/logic/events.ts:307-327` (the `vrboSpam` case)
- Test: `src/state/__tests__/portfolioActions.test.ts`

The Phase 2 `vrboSpam` event keeps its own schedule and its own single-slot
`pendingChoice`. Once the gag has run three times and the player is Top
Producer, that modal gains a third option; taking it queues a `vrboBuy`
`PortfolioChoice`, which the Buy modal resolves into `BUY_VRBO`.

- [ ] **Step 1: Write the failing tests**

Append to `src/state/__tests__/portfolioActions.test.ts`:

```ts
import { applyEvent } from '../../logic/events'
import type { PortfolioChoice } from '../types'

describe('the VRBO offer conversion', () => {
  it('offers only decline while under three prior offers', () => {
    const s = base({ rank: 'topProducer', gagCounters: { ...initialState().gagCounters, vrboOffers: 1 } })
    const out = applyEvent(s, 'vrboSpam').state
    expect(out.pendingChoice!.options.map((o) => o.key)).toEqual(['decline'])
  })

  it('adds decline-forever and buy at three offers as Top Producer', () => {
    const s = base({
      rank: 'topProducer',
      gagCounters: { ...initialState().gagCounters, vrboOffers: 3 },
    })
    const out = applyEvent(s, 'vrboSpam').state
    expect(out.pendingChoice!.options.map((o) => o.key)).toEqual([
      'decline',
      'declineForever',
      'buyVrbo',
    ])
    expect(out.pendingChoice!.body).toContain('MACHINE waiting for an operator')
  })

  it('stays a one-button gag below Top Producer', () => {
    const s = base({
      rank: 'sellerAgent',
      gagCounters: { ...initialState().gagCounters, vrboOffers: 5 },
    })
    expect(
      applyEvent(s, 'vrboSpam').state.pendingChoice!.options,
    ).toHaveLength(1)
  })

  it('stops offering once declined forever', () => {
    const s = base({
      rank: 'topProducer',
      gagCounters: {
        ...initialState().gagCounters,
        vrboOffers: 5,
        vrboDeclinedForever: true,
      },
    })
    expect(
      applyEvent(s, 'vrboSpam').state.pendingChoice!.options,
    ).toHaveLength(1)
  })
})

describe('RESOLVE_CHOICE_EVENT: the two new VRBO keys', () => {
  it('declineForever sets the flag and mourns', () => {
    const s = base({
      rank: 'topProducer',
      gagCounters: { ...initialState().gagCounters, vrboOffers: 3 },
    })
    const offered = applyEvent(s, 'vrboSpam').state
    const out = reducer(offered, {
      type: 'RESOLVE_CHOICE_EVENT',
      key: 'declineForever',
    })
    expect(out.gagCounters.vrboDeclinedForever).toBe(true)
    expect(out.log[0].text).toContain("You'll always wonder.")
  })

  it('buyVrbo queues a vrboBuy choice', () => {
    const s = base({
      rank: 'topProducer',
      gagCounters: { ...initialState().gagCounters, vrboOffers: 3 },
    })
    const offered = applyEvent(s, 'vrboSpam').state
    const out = reducer(offered, { type: 'RESOLVE_CHOICE_EVENT', key: 'buyVrbo' })
    expect(out.pendingChoice).toBeNull()
    expect(out.pendingChoices[0].kind).toBe('vrboBuy')
  })
})

describe('BUY_VRBO', () => {
  const offering = (over: Partial<GameState> = {}) =>
    base({
      rank: 'topProducer',
      cash: 200000,
      pendingChoices: [
        {
          id: 'C1',
          kind: 'vrboBuy',
          title: 'THE 424/7 VRBO',
          body: 'x',
          options: [],
          payload: {},
        } as PortfolioChoice,
      ],
      ...over,
    })

  it('creates the property, takes the slot, and clears the choice', () => {
    const s = reducer(offering(), { type: 'BUY_VRBO', downPct: 0.2 })
    expect(s.cash).toBe(200000 - 96000)
    const v = s.properties[0]
    expect(v.typeId).toBe('vrbo')
    expect(v.nickname).toBe('The 424/7 VRBO')
    expect(v.baseValue).toBe(480000)
    expect(v.condition).toBe(70)
    expect(v.units).toEqual([])
    expect(v.isVrbo).toBe(true)
    expect(v.mortgage).toEqual({ balance: 384000 })
    expect(s.gagCounters.vrboOwned).toBe(true)
    expect(s.pendingChoices).toHaveLength(0)
  })

  it('refuses a second VRBO', () => {
    const once = reducer(offering(), { type: 'BUY_VRBO', downPct: 0.2 })
    const twice = reducer(
      { ...once, pendingChoices: offering().pendingChoices },
      { type: 'BUY_VRBO', downPct: 0.2 },
    )
    expect(twice.properties).toHaveLength(1)
  })
})

describe('RESOLVE_PORTFOLIO_CHOICE', () => {
  const lowball = (): PortfolioChoice => ({
    id: 'C1',
    kind: 'lowball',
    title: 'Offer on Starter Home on Dundurn',
    body: 'A buyer offers $170,000.',
    options: [
      { label: 'Take the money', actionTag: 'accept' },
      { label: 'Hold firm', actionTag: 'reject' },
    ],
    payload: { propertyId: 'P1', offerAmount: 170000 },
  })

  it('accepting sells at the offer and settles the mortgage', () => {
    const s = base({
      cash: 1000,
      properties: [owned({ mortgage: { balance: 100000 }, listedForSale: true })],
      pendingChoices: [lowball()],
    })
    const out = reducer(s, {
      type: 'RESOLVE_PORTFOLIO_CHOICE',
      choiceId: 'C1',
      actionTag: 'accept',
    })
    expect(out.cash).toBe(1000 + 70000)
    expect(out.properties).toHaveLength(0)
    expect(out.pendingChoices).toHaveLength(0)
  })

  it('rejecting keeps the property and pops the queue', () => {
    const s = base({
      properties: [owned({ listedForSale: true })],
      pendingChoices: [lowball()],
    })
    const out = reducer(s, {
      type: 'RESOLVE_PORTFOLIO_CHOICE',
      choiceId: 'C1',
      actionTag: 'reject',
    })
    expect(out.properties).toHaveLength(1)
    expect(out.pendingChoices).toHaveLength(0)
  })

  it('a renewal raise bumps rentR by 0.10', () => {
    setSeed(11)
    const s = base({
      properties: [
        owned({
          units: [
            {
              id: 'P1-u0',
              tenant: {
                archetypeId: 'lateLenny',
                name: 'Lenny Pham',
                tenancyWeeks: 12,
                plannedStayWeeks: 25,
                owed: 0,
              },
              rentR: 1.0,
              openIssue: null,
              evictionWeeksLeft: null,
            },
          ],
        }),
      ],
      pendingChoices: [
        {
          id: 'C1',
          kind: 'renewal',
          title: 'Lease renewal',
          body: 'x',
          options: [
            { label: 'Raise rent 10%', actionTag: 'raise' },
            { label: 'Keep them happy', actionTag: 'keep' },
          ],
          payload: { propertyId: 'P1', unitId: 'P1-u0' },
        } as PortfolioChoice,
      ],
    })
    const out = reducer(s, {
      type: 'RESOLVE_PORTFOLIO_CHOICE',
      choiceId: 'C1',
      actionTag: 'raise',
    })
    setSeed(null)
    expect(out.properties[0].units[0].rentR).toBeCloseTo(1.1, 5)
  })

  it('keeping them happy adds four weeks of tenancy', () => {
    const s = base({
      properties: [
        owned({
          units: [
            {
              id: 'P1-u0',
              tenant: {
                archetypeId: 'lateLenny',
                name: 'Lenny Pham',
                tenancyWeeks: 12,
                plannedStayWeeks: 25,
                owed: 0,
              },
              rentR: 1.0,
              openIssue: null,
              evictionWeeksLeft: null,
            },
          ],
        }),
      ],
      pendingChoices: [
        {
          id: 'C1',
          kind: 'renewal',
          title: 'Lease renewal',
          body: 'x',
          options: [
            { label: 'Raise rent 10%', actionTag: 'raise' },
            { label: 'Keep them happy', actionTag: 'keep' },
          ],
          payload: { propertyId: 'P1', unitId: 'P1-u0' },
        } as PortfolioChoice,
      ],
    })
    const out = reducer(s, {
      type: 'RESOLVE_PORTFOLIO_CHOICE',
      choiceId: 'C1',
      actionTag: 'keep',
    })
    expect(out.properties[0].units[0].tenant!.plannedStayWeeks).toBe(29)
  })
})
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run src/state/__tests__/portfolioActions.test.ts`
Expected: FAIL — `'declineForever'` is not a `ChoiceKey`, and the new cases do not exist.

- [ ] **Step 3: Widen `ChoiceKey` in `src/state/types.ts`**

```ts
export type ChoiceKey =
  | 'decline'
  | 'declineForever'
  | 'buyVrbo'
  | 'humble'
  | 'ego'
  | 'cease'
  | 'eat'
  | 'attend'
  | 'skip'
```

- [ ] **Step 4: Grow the `vrboSpam` offer in `src/logic/events.ts`**

Replace the body of the `case 'vrboSpam':` block with:

```ts
    case 'vrboSpam': {
      const n = s.gagCounters.vrboOffers
      const converts =
        n >= P3.VRBO.MIN_DECLINES &&
        s.rank === 'topProducer' &&
        !s.gagCounters.vrboOwned &&
        !s.gagCounters.vrboDeclinedForever
      const options: PendingChoice['options'] = [
        {
          key: 'decline',
          label: 'Decline (for now)',
          hint: converts
            ? 'The word “for now” is doing a lot of work.'
            : 'There is no other button. There will be, one day.',
        },
      ]
      if (converts) {
        options.push({
          key: 'declineForever',
          label: 'Decline (forever)',
          hint: 'He never calls again. You never find out.',
        })
        options.push({
          key: 'buyVrbo',
          label: 'Buy it — $480,000',
          hint: 'A MACHINE waiting for an operator.',
        })
      }
      s = {
        ...s,
        gagCounters: { ...s.gagCounters, vrboOffers: n + 1 },
        pendingChoice: {
          id: 'vrboSpam',
          title: 'THE 424/7 VRBO',
          body: converts
            ? VRBO_OFFER_BODY
            : VRBO_PITCHES[Math.min(n, VRBO_PITCHES.length - 1)],
          options,
        },
      }
      label = 'The 424/7 VRBO'
      break
    }
```

Add to the imports of `src/logic/events.ts`:

```ts
import { P3 } from '../data/p3'
import { VRBO_OFFER_BODY } from '../data/vrbo'
import type { PendingChoice } from '../state/types'
```

- [ ] **Step 5: Handle the two new keys in `RESOLVE_CHOICE_EVENT`**

Add these cases inside the existing `switch (action.key)` in `src/state/reducer.ts`:

```ts
        case 'declineForever':
          s = {
            ...s,
            gagCounters: { ...s.gagCounters, vrboDeclinedForever: true },
          }
          s = withLog(
            s,
            'flavor',
            'You told him never to call again. He said “respect” and meant it. ' +
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
```

- [ ] **Step 6: Add `BUY_VRBO` and `RESOLVE_PORTFOLIO_CHOICE` to the reducer**

```ts
    case 'BUY_VRBO': {
      if (state.gagCounters.vrboOwned) return state
      const financed = action.downPct < 1
      if (action.downPct < P3.DOWN_MIN || action.downPct > 1) return state
      if (financed && !hasFreeMortgageSlot(state))
        return withLog(
          state,
          'flavor',
          'The underwriter looked at the words “short-term rental” and stopped reading.',
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
        mortgage: financed
          ? { balance: P3.VRBO.PRICE - down }
          : null,
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
```

- [ ] **Step 7: Extend the reducer imports**

```ts
import {
  VRBO_DECLINE_FOREVER_LINE,
  VRBO_NICKNAME,
  VRBO_OFFER_BODY,
} from '../data/vrbo'
import { tenantOf } from '../logic/portfolio'
```

- [ ] **Step 8: Run the tests to verify they pass**

Run: `npx vitest run src/state/__tests__/portfolioActions.test.ts`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add src/state/types.ts src/state/reducer.ts src/logic/events.ts src/state/__tests__/portfolioActions.test.ts
git commit -m "feat: convert the VRBO gag into a purchase and add the choice queue"
```

---

### Task 14: Week phases — rent, applicants, tenant events

**Files:**
- Create: `src/logic/portfolioWeek.ts`
- Test: `src/logic/__tests__/portfolioWeek.test.ts`

**One reconciliation you must not re-litigate.** §12 step 9 says occupied
properties decay 1/week and vacant ones 0.5/week; §8 also gives every tenant a
`conditionPerWeek`. These are the same number seen from two sides. The rule
implemented here: **an occupied unit contributes its archetype's
`conditionPerWeek`; a property with zero occupied units decays
`P3.CONDITION_DECAY_VACANT`.** `P3.CONDITION_DECAY_OCCUPIED` is the fallback if
an archetype id is ever unknown. Nothing is double-counted.

**Ordering inside step 6**, also fixed: (a) roll new events on units with no
open issue, (b) tick every open issue (`weeksOpen += 1`, condition −3, the
noiseComplaint 2-week quit), (c) PropCo auto-resolves minors. A minor can
therefore be born and settled in the same End Week, which is the point of
paying PropCo.

- [ ] **Step 1: Write the failing tests**

Create `src/logic/__tests__/portfolioWeek.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { setSeed } from '../rand'
import { collectRent, newWeekCtx, rollApplicants, rollTenantEvents } from '../portfolioWeek'
import { initialState } from '../../state/reducer'
import type { GameState, Property, UnitState } from '../../state/types'

const unit = (over: Partial<UnitState> = {}): UnitState => ({
  id: 'P1-u0',
  tenant: null,
  rentR: 1.0,
  openIssue: null,
  evictionWeeksLeft: null,
  ...over,
})

const withTenant = (archetypeId: string, over = {}) =>
  unit({
    tenant: {
      archetypeId,
      name: 'Tenant Name',
      tenancyWeeks: 4,
      plannedStayWeeks: 30,
      owed: 0,
      ...over,
    },
  })

const prop = (over: Partial<Property> = {}): Property => ({
  id: 'P1',
  typeId: 'starter',
  nickname: 'Starter Home on Dundurn',
  baseValue: 200000,
  condition: 100,
  mortgage: null,
  units: [unit()],
  renovation: null,
  listedForSale: false,
  boughtWeek: 1,
  isVrbo: false,
  vrboProfitStreak: 0,
  vrboRenoDone: false,
  ...over,
})

const st = (over: Partial<GameState> = {}): GameState => ({
  ...initialState(),
  cash: 0,
  rank: 'topProducer',
  ...over,
})

describe('collectRent', () => {
  it('collects the charged rent from a tenant who always pays', () => {
    const s = st({ properties: [prop({ units: [withTenant('perfectPatricia')] })] })
    const ctx = newWeekCtx()
    const out = collectRent(s, ctx)
    expect(out.cash).toBe(400) // baseRent 400 × fair(cond 100) × r 1.0
    expect(ctx.rows.get('P1')!.rentIn).toBe(400)
  })

  it('withholds rent while an issue is open', () => {
    const s = st({
      properties: [
        prop({
          units: [
            { ...withTenant('perfectPatricia'), openIssue: { eventId: 'burstPipe', weeksOpen: 1, fixCost: 300 } },
          ],
        }),
      ],
    })
    expect(collectRent(s, newWeekCtx()).cash).toBe(0)
  })

  it('collects nothing during an eviction', () => {
    const s = st({
      properties: [
        prop({ units: [{ ...withTenant('perfectPatricia'), evictionWeeksLeft: 2 }] }),
      ],
    })
    expect(collectRent(s, newWeekCtx()).cash).toBe(0)
  })

  it('collects nothing while the crew is in', () => {
    const s = st({
      properties: [
        prop({
          units: [withTenant('perfectPatricia')],
          renovation: { projectId: 'cosmetic', weeksLeft: 1 },
        }),
      ],
    })
    expect(collectRent(s, newWeekCtx()).cash).toBe(0)
  })

  it('adds a missed payment to arrears and recovers half on the next payment', () => {
    setSeed(1)
    let s = st({ properties: [prop({ units: [withTenant('lateLenny')] })] })
    /* Force the miss, then force the payment, by driving payChance directly. */
    s = {
      ...s,
      properties: [
        prop({ units: [{ ...withTenant('lateLenny'), tenant: { archetypeId: 'lateLenny', name: 'Lenny', tenancyWeeks: 4, plannedStayWeeks: 30, owed: 800 } }] }),
      ],
    }
    const out = collectRent({ ...s }, newWeekCtx())
    setSeed(null)
    /* Either he paid (400 + half of 800 = 800) or he did not (owed grew). */
    const owed = out.properties[0].units[0].tenant!.owed
    expect(out.cash === 800 ? owed : out.cash).toBeDefined()
    if (out.cash === 800) expect(owed).toBe(0)
    else expect(owed).toBe(1200)
  })

  it('writes off Steve entirely when he skips', () => {
    setSeed(2)
    const s = st({
      properties: [
        prop({
          units: [
            {
              ...withTenant('sobStorySteve'),
              tenant: { archetypeId: 'sobStorySteve', name: 'Steve', tenancyWeeks: 6, plannedStayWeeks: Infinity, owed: 0 },
            },
          ],
        }),
      ],
    })
    const out = collectRent(s, newWeekCtx())
    setSeed(null)
    expect(out.properties[0].units[0].tenant!.owed).toBe(0)
  })

  it('skims 8% for PropCo on every dollar collected', () => {
    const s = st({
      propCoActive: true,
      properties: [prop({ units: [withTenant('perfectPatricia')] })],
    })
    expect(collectRent(s, newWeekCtx()).cash).toBe(368) // 400 − 8%
  })
})

describe('rollApplicants', () => {
  it('never places Patricia above fair rent', () => {
    setSeed(5)
    let placed = 0
    for (let i = 0; i < 200; i++) {
      const s = st({ properties: [prop({ units: [unit({ rentR: 1.4 })] })] })
      const out = rollApplicants(s, newWeekCtx())
      const t = out.properties[0].units[0].tenant
      if (t?.archetypeId === 'perfectPatricia') placed++
    }
    setSeed(null)
    expect(placed).toBe(0)
  })

  it('never places a corporate lease below condition 70', () => {
    setSeed(6)
    let placed = 0
    for (let i = 0; i < 200; i++) {
      const s = st({ properties: [prop({ condition: 50, units: [unit()] })] })
      const out = rollApplicants(s, newWeekCtx())
      if (out.properties[0].units[0].tenant?.archetypeId === 'corpLease') placed++
    }
    setSeed(null)
    expect(placed).toBe(0)
  })

  it('leaves renovating and occupied units alone', () => {
    const s = st({
      properties: [
        prop({ units: [unit()], renovation: { projectId: 'full', weeksLeft: 2 } }),
      ],
    })
    expect(rollApplicants(s, newWeekCtx()).properties[0].units[0].tenant).toBeNull()
  })
})

describe('rollTenantEvents', () => {
  it('ticks an open issue and drains condition by 3', () => {
    const s = st({
      properties: [
        prop({
          condition: 80,
          units: [
            {
              ...withTenant('perfectPatricia'),
              openIssue: { eventId: 'burstPipe', weeksOpen: 0, fixCost: 300 },
            },
          ],
        }),
      ],
    })
    const out = rollTenantEvents(s, newWeekCtx())
    expect(out.properties[0].condition).toBe(77)
  })

  it('ends the tenancy when a noise complaint sits for two weeks', () => {
    const s = st({
      properties: [
        prop({
          units: [
            {
              ...withTenant('partyPaulie'),
              openIssue: { eventId: 'noiseComplaint', weeksOpen: 1, fixCost: 0 },
            },
          ],
        }),
      ],
    })
    const out = rollTenantEvents(s, newWeekCtx())
    expect(out.properties[0].units[0].tenant).toBeNull()
    expect(out.properties[0].units[0].openIssue).toBeNull()
  })

  it('lets PropCo pay for and close a minor issue', () => {
    const s = st({
      cash: 5000,
      propCoActive: true,
      properties: [
        prop({
          units: [
            {
              ...withTenant('perfectPatricia'),
              openIssue: { eventId: 'burstPipe', weeksOpen: 0, fixCost: 300 },
            },
          ],
        }),
      ],
    })
    const out = rollTenantEvents(s, newWeekCtx())
    expect(out.cash).toBe(4700)
    expect(out.properties[0].units[0].openIssue).toBeNull()
  })

  it('leaves a major issue for the player even with PropCo on', () => {
    const s = st({
      cash: 5000,
      propCoActive: true,
      properties: [
        prop({
          condition: 30,
          units: [
            {
              ...withTenant('perfectPatricia'),
              openIssue: { eventId: 'rentStrike', weeksOpen: 0, fixCost: 0 },
            },
          ],
        }),
      ],
    })
    expect(
      rollTenantEvents(s, newWeekCtx()).properties[0].units[0].openIssue,
    ).not.toBeNull()
  })
})
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run src/logic/__tests__/portfolioWeek.test.ts`
Expected: FAIL — cannot resolve `../portfolioWeek`.

- [ ] **Step 3: Write the first half of `src/logic/portfolioWeek.ts`**

```ts
/* The End Week phases that touch the portfolio. Each phase takes the state and
   a WeekCtx, returns the new state, and records money and events on the ctx
   rows the Week Summary renders. Phase order is fixed by the Phase 3 spec §12
   and enforced by a test — do not reorder. */

import { P3 } from '../data/p3'
import { PROPCO_FIX_PREFIX, RENEWAL_BODY, TENANT_EVENTS, TENANT_EVENT_LINES, TENANT_FIX_LINES, INSPECTION_PASS_LINE, NOISE_QUIT_LINE } from '../data/tenantEvents'
import { CREW_DAMAGE, CREW_VIRAL, DAVE_BAD, DAVE_GOOD, TENANTS } from '../data/tenants'
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
import { chance, pick, rand, weightedPick } from './rand'

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
function moveOut(s: GameState, p: Property, u: UnitState): GameState {
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

/* ------------------------------------------------- §12.4 rent collection */

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

/* ---------------------------------------------------- §12.5 applicants */

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

/* -------------------------------------------------- §12.6 tenant events */

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
          openIssue: { eventId: e.id, weeksOpen: 0, fixCost: Math.round(fixCost) },
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
```

The unused imports (`CREW_DAMAGE`, `CREW_VIRAL`, `DAVE_BAD`, `DAVE_GOOD`,
`TENANTS`, `rand`) are consumed by Task 15 in the same file — leave them in
place if your linter allows, or add them in Task 15 instead.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/logic/__tests__/portfolioWeek.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/logic/portfolioWeek.ts src/logic/__tests__/portfolioWeek.test.ts
git commit -m "feat: add rent collection, applicant, and tenant event week phases"
```

---

### Task 15: Week phases — VRBO, flips, ticks, market, billing, milestones

**Files:**
- Modify: `src/logic/portfolioWeek.ts`
- Test: `src/logic/__tests__/portfolioWeek.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `src/logic/__tests__/portfolioWeek.test.ts`:

```ts
import {
  billPortfolio,
  checkMilestones,
  resolveVrbo,
  rollFlips,
  tickMarket,
  tickProperties,
} from '../portfolioWeek'

const vrbo = (over: Partial<Property> = {}): Property => ({
  ...prop({
    id: 'V1',
    typeId: 'vrbo',
    nickname: 'The 424/7 VRBO',
    baseValue: 480000,
    condition: 70,
    units: [],
    isVrbo: true,
  }),
  ...over,
})

describe('resolveVrbo', () => {
  it('loses roughly $1,500 a week unmanaged and financed', () => {
    setSeed(9)
    let cash = 0
    for (let i = 0; i < 10; i++) {
      const s = st({
        gagCounters: { ...initialState().gagCounters, vrboOwned: true },
        properties: [vrbo({ mortgage: { balance: 384000 } })],
      })
      const ctx = newWeekCtx()
      const out = resolveVrbo(s, ctx)
      cash += ctx.rows.get('V1')!.net
    }
    setSeed(null)
    expect(cash / 10).toBeLessThan(-1000)
    expect(cash / 10).toBeGreaterThan(-2000)
  })

  it('clears roughly +$1,400 a week fully optimised', () => {
    setSeed(9)
    let net = 0
    for (let i = 0; i < 10; i++) {
      const s = st({
        activeChannelIds: ['tiktok'],
        gagCounters: { ...initialState().gagCounters, vrboOwned: true },
        properties: [
          vrbo({ mortgage: { balance: 384000 }, vrboRenoDone: true, condition: 90 }),
        ],
      })
      const ctx = newWeekCtx()
      resolveVrbo(s, ctx)
      net += ctx.rows.get('V1')!.net
    }
    setSeed(null)
    expect(net / 10).toBeGreaterThan(900)
  })

  it('resets the streak on any unprofitable week and fires The Machine at eight', () => {
    const s = st({
      activeChannelIds: ['tiktok'],
      properties: [
        vrbo({ vrboRenoDone: true, condition: 90, vrboProfitStreak: 7 }),
      ],
    })
    const out = resolveVrbo(s, newWeekCtx())
    expect(out.properties[0].vrboProfitStreak).toBe(8)
    expect(out.milestonesUnlocked).toContain('theMachine')
    expect(out.reputation).toBe(15)
  })

  it('wears the building down whether or not anyone books', () => {
    const s = st({ properties: [vrbo({ condition: 50 })] })
    expect(resolveVrbo(s, newWeekCtx()).properties[0].condition).toBe(48.5)
  })
})

describe('rollFlips', () => {
  it('sells at displayed value and settles the mortgage', () => {
    setSeed(4)
    const s = st({
      reputation: 100,
      marketState: 'hot',
      cash: 0,
      properties: [
        prop({ listedForSale: true, mortgage: { balance: 100000 }, baseValue: 200000 }),
      ],
    })
    let sold = false
    for (let i = 0; i < 40 && !sold; i++) {
      const out = rollFlips(s, newWeekCtx())
      if (out.properties.length === 0) {
        expect(out.cash).toBe(220000 - 100000)
        sold = true
      }
    }
    setSeed(null)
    expect(sold).toBe(true)
  })

  it('discounts a tenanted sale by 5%', () => {
    setSeed(4)
    const tenanted = prop({
      listedForSale: true,
      baseValue: 200000,
      units: [withTenant('perfectPatricia')],
    })
    let sold = false
    for (let i = 0; i < 60 && !sold; i++) {
      const out = rollFlips(
        st({ reputation: 100, marketState: 'hot', cash: 0, properties: [tenanted] }),
        newWeekCtx(),
      )
      if (out.properties.length === 0) {
        expect(out.cash).toBe(Math.round(220000 * 0.95))
        sold = true
      }
    }
    setSeed(null)
    expect(sold).toBe(true)
  })

  it('never touches an unlisted property', () => {
    const s = st({ reputation: 100, properties: [prop()] })
    expect(rollFlips(s, newWeekCtx()).properties).toHaveLength(1)
  })
})

describe('tickProperties', () => {
  it('decays a vacant property by half a point', () => {
    const s = st({ properties: [prop({ condition: 80 })] })
    expect(tickProperties(s, newWeekCtx()).properties[0].condition).toBe(79.5)
  })

  it('decays by the tenant archetype rate when occupied', () => {
    const s = st({
      properties: [prop({ condition: 80, units: [withTenant('partyPaulie')] })],
    })
    expect(tickProperties(s, newWeekCtx()).properties[0].condition).toBe(77)
  })

  it('completes a renovation and applies its effects', () => {
    const s = st({
      properties: [
        prop({
          condition: 40,
          baseValue: 200000,
          renovation: { projectId: 'full', weeksLeft: 1 },
        }),
      ],
    })
    const out = tickProperties(s, newWeekCtx())
    expect(out.properties[0].renovation).toBeNull()
    expect(out.properties[0].baseValue).toBe(260000)
    expect(out.properties[0].condition).toBe(100)
  })

  it('marks the VRBO renovated when a full job finishes there', () => {
    const s = st({
      properties: [vrbo({ renovation: { projectId: 'full', weeksLeft: 1 } })],
    })
    expect(tickProperties(s, newWeekCtx()).properties[0].vrboRenoDone).toBe(true)
  })

  it('completes an eviction on schedule and empties the unit', () => {
    const s = st({
      properties: [
        prop({
          units: [{ ...withTenant('lateLenny'), evictionWeeksLeft: 1 }],
        }),
      ],
    })
    const out = tickProperties(s, newWeekCtx())
    expect(out.properties[0].units[0].tenant).toBeNull()
    expect(out.properties[0].units[0].evictionWeeksLeft).toBeNull()
  })

  it('moves a tenant out when the planned stay runs out', () => {
    const s = st({
      properties: [
        prop({
          units: [
            {
              ...withTenant('perfectPatricia'),
              tenant: {
                archetypeId: 'perfectPatricia',
                name: 'Patricia Reyes',
                tenancyWeeks: 19,
                plannedStayWeeks: 20,
                owed: 0,
              },
            },
          ],
        }),
      ],
    })
    expect(tickProperties(s, newWeekCtx()).properties[0].units[0].tenant).toBeNull()
  })
})

describe('tickMarket', () => {
  it('counts down an active crash and freezes transitions', () => {
    const s = st({
      marketState: 'cold',
      nextMarketState: 'hot',
      crash: { weeksLeft: 3, lastCrashWeek: 10 },
    })
    const out = tickMarket(s)
    expect(out.state.crash.weeksLeft).toBe(2)
    expect(out.state.marketState).toBe('cold')
    expect(out.regenerated).toBe(false)
  })

  it('applies the pre-rolled next state and regenerates the pool on a change', () => {
    const s = st({ marketState: 'normal', nextMarketState: 'hot' })
    const out = tickMarket(s)
    expect(out.state.marketState).toBe('hot')
    expect(out.regenerated).toBe(true)
    expect(out.state.marketPool).toHaveLength(4)
  })

  it('never jumps hot to cold', () => {
    setSeed(12)
    for (let i = 0; i < 300; i++) {
      const out = tickMarket(st({ marketState: 'hot', nextMarketState: 'hot' }))
      expect(out.state.nextMarketState).not.toBe('cold')
    }
    setSeed(null)
  })
})

describe('billPortfolio', () => {
  it('bills interest, HOA, PropCo, and VRBO upkeep', () => {
    const s = st({
      cash: 100000,
      propCoActive: true,
      properties: [
        prop({ typeId: 'condo', mortgage: { balance: 200000 } }),
        vrbo({ mortgage: { balance: 384000 } }),
      ],
    })
    const out = billPortfolio(s, newWeekCtx())
    // interest 300 + 576, HOA 80, PropCo 60 × 1 unit, VRBO upkeep 1700
    expect(out.state.cash).toBe(100000 - 300 - 576 - 80 - 60 - 1700)
    expect(out.lines.map((l) => l[0])).toEqual([
      'Mortgage interest',
      'HOA fees',
      'PropCo',
      'VRBO upkeep',
    ])
  })
})

describe('checkMilestones', () => {
  it('unlocks every milestone the net worth has passed, in order', () => {
    const s = st({ cash: 1200000 })
    const out = checkMilestones(s)
    expect(out.state.milestonesUnlocked).toEqual([
      'mogul250',
      'portfolioGuy',
      'sevenFig',
    ])
    expect(out.unlocked.map((m) => m.id)).toContain('sevenFig')
  })
  it('does not re-unlock', () => {
    const s = st({ cash: 300000, milestonesUnlocked: ['mogul250'] })
    expect(checkMilestones(s).unlocked).toHaveLength(0)
  })
})
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run src/logic/__tests__/portfolioWeek.test.ts`
Expected: FAIL — `resolveVrbo`, `rollFlips`, `tickProperties`, `tickMarket`, `billPortfolio`, and `checkMilestones` are not exported.

- [ ] **Step 3: Append the remaining phases to `src/logic/portfolioWeek.ts`**

```ts
/* ------------------------------------------------------- §12.7 the VRBO */

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

  if (streak >= P3.VRBO.STREAK_TARGET && !s.milestonesUnlocked.includes('theMachine')) {
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

/* -------------------------------------------------------- §12.8 flips */

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

/* -------------------- §12.9 decay, renovation, eviction, tenancy ticks */

export function tickProperties(state: GameState, ctx: WeekCtx): GameState {
  let s = state

  for (const p of state.properties) {
    const live = () => s.properties.find((x) => x.id === p.id)

    /* condition decay — the VRBO handled its own in step 7 */
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
            condition: Math.max(0, Math.min(100, x.condition + (good ? 10 : -15))),
          }))
          s = withLog(
            s,
            'event',
            interp(good ? DAVE_GOOD : DAVE_BAD, { name: cur.tenant.name }),
          )
          rowOf(ctx, p).events.push(good ? 'Dave improved things' : 'Dave removed a wall')
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

/* ------------------------------------------ §12.10 market and the crash */

export function tickMarket(state: GameState): {
  state: GameState
  regenerated: boolean
} {
  if (state.crash.weeksLeft > 0) {
    const weeksLeft = state.crash.weeksLeft - 1
    let s: GameState = {
      ...state,
      crash: { ...state.crash, weeksLeft },
    }
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

/* ------------------------------------------------ §12.12 pool rotation */

/** Drops the oldest listing and adds one. Skipped when the pool was already
 *  thrown away and rebuilt this week. */
export function rotatePool(state: GameState, regenerated: boolean): GameState {
  if (regenerated) return state
  return fillPool({ ...state, marketPool: state.marketPool.slice(1) })
}

/* ------------------------------------------------------ §12.13 billing */

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

  /* Every row's net is now knowable. The VRBO already set its own in step 7. */
  ctx.rows.forEach((row) => {
    if (row.occupancyPct === undefined) row.net = row.rentIn - row.moneyOut
  })

  return { state: s, lines }
}

/* --------------------------------------------------- §12.16 milestones */

export function checkMilestones(state: GameState): {
  state: GameState
  unlocked: MilestoneDef[]
} {
  let s = state
  const unlocked: MilestoneDef[] = []
  /* One at a time: mogul250 adds a mortgage slot, which does not change net
     worth, but genWealth's perk reads the list, so order is preserved. */
  for (const m of MILESTONES) {
    if (s.milestonesUnlocked.includes(m.id)) continue
    if (netWorth(s) < m.threshold) continue
    s = { ...s, milestonesUnlocked: [...s.milestonesUnlocked, m.id] }
    s = withLog(s, 'promotion', m.line)
    unlocked.push(m)
  }
  return { state: s, unlocked }
}
```

- [ ] **Step 4: Extend the imports of `src/logic/portfolioWeek.ts`**

```ts
import { MILESTONES } from '../data/milestones'
import { RENO_COMPLETE_LINE } from '../data/properties'
import { MACHINE_TITLE, VRBO_EVENTS } from '../data/vrbo'
import type { MilestoneDef, SummaryLine } from '../state/types'
import { clampRep } from './economy'
import {
  anyUnitOccupied,
  displayedValue,
  fillPool,
  hoaOf,
  MARKET_LINES,
  netWorth,
  regeneratePool,
  renoOf,
  rollNextMarket,
  saleChance,
  totalUnitCount,
  vrboIncome,
  vrboJitter,
  vrboOccupancy,
  weeklyInterest,
} from './portfolio'
import { money, randInt } from './rand'
```

Merge with the existing `./portfolio` and `./rand` imports rather than adding
second copies.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run src/logic/__tests__/portfolioWeek.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/logic/portfolioWeek.ts src/logic/__tests__/portfolioWeek.test.ts
git commit -m "feat: add VRBO, flip, tick, market, billing, and milestone phases"
```

---

### Task 16: The market crash event

**Files:**
- Modify: `src/state/types.ts` (the `EventId` union)
- Modify: `src/data/events.ts`
- Modify: `src/logic/events.ts`
- Test: `src/logic/__tests__/events.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `src/logic/__tests__/events.test.ts`:

```ts
import { EVENTS } from '../../data/events'
import { applyEvent } from '../events'
import { initialState } from '../../state/reducer'

describe('marketCrash', () => {
  const def = () => EVENTS.find((e) => e.id === 'marketCrash')!

  it('is weighted 3 and gated on the phase-3 start, cooldown, and no active crash', () => {
    expect(def().weight).toBe(3)
    const early = { ...initialState(), week: 5, firstP3Week: 1 }
    expect(def().condition(early)).toBe(false)
    const ready = { ...initialState(), week: 20, firstP3Week: 1 }
    expect(def().condition(ready)).toBe(true)
    const during = {
      ...ready,
      crash: { weeksLeft: 2, lastCrashWeek: 18 },
    }
    expect(def().condition(during)).toBe(false)
    const cooling = {
      ...ready,
      week: 40,
      crash: { weeksLeft: 0, lastCrashWeek: 20 },
    }
    expect(def().condition(cooling)).toBe(false)
  })

  it('goes cold for six weeks and rebuilds the pool', () => {
    const s = { ...initialState(), week: 30, firstP3Week: 1, marketState: 'hot' as const }
    const out = applyEvent(s, 'marketCrash').state
    expect(out.crash).toEqual({ weeksLeft: 6, lastCrashWeek: 30 })
    expect(out.marketState).toBe('cold')
    expect(out.marketPool).toHaveLength(4)
    expect(out.log[0].text).toContain('generational buying opportunity')
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/logic/__tests__/events.test.ts`
Expected: FAIL — `'marketCrash'` is not an `EventId`.

- [ ] **Step 3: Add `'marketCrash'` to the `EventId` union in `src/state/types.ts`**

```ts
  | 'charityGala'
  | 'marketCrash'
```

- [ ] **Step 4: Add the table entry to `src/data/events.ts`**

```ts
  {
    id: 'marketCrash',
    weight: 3,
    condition: (s) =>
      s.week >= s.firstP3Week + 8 &&
      s.crash.weeksLeft === 0 &&
      s.week - s.crash.lastCrashWeek >= 40,
  },
```

- [ ] **Step 5: Add the effect to `applyEvent` in `src/logic/events.ts`**

```ts
    case 'marketCrash': {
      s = {
        ...s,
        crash: { weeksLeft: P3.CRASH.duration, lastCrashWeek: s.week },
        marketState: 'cold',
        nextMarketState: 'cold',
      }
      s = regeneratePool(s)
      s = withLog(
        s,
        'event',
        "MARKET CRASH. A man in a rented Lamborghini calls it 'a generational buying opportunity.' He is selling a course. He is also, annoyingly, correct.",
      )
      label = 'Market crash'
      break
    }
```

Add `import { regeneratePool } from './portfolio'` to `src/logic/events.ts`.

- [ ] **Step 6: Run the test to verify it passes**

Run: `npx vitest run src/logic/__tests__/events.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/state/types.ts src/data/events.ts src/logic/events.ts src/logic/__tests__/events.test.ts
git commit -m "feat: add the market crash event"
```

---

### Task 17: END_WEEK v3

**Files:**
- Modify: `src/state/reducer.ts:442-664`
- Test: `src/state/__tests__/endWeek.test.ts`

The numbered order in §12 is law. The existing Phase 1/2 steps keep their
behaviour; the portfolio phases slot in around them.

Final order, top to bottom:

| § | What |
|---|---|
| 0 | refuse if `pendingChoices.length > 0` |
| 1 | init summary (including `portfolio: []`) |
| 2–3 | archive sold leads, patience tick, ghost rolls *(existing)* |
| 4 | `collectRent` |
| 5 | `rollApplicants` |
| 6 | `rollTenantEvents` |
| 7 | `resolveVrbo` |
| 8 | `rollFlips` |
| 9 | `tickProperties` |
| 10 | `tickMarket` |
| 11 | marketing resolution *(existing)* |
| 12 | `rotatePool` |
| 13 | desk fee + swag upkeep *(existing)* then `billPortfolio` |
| 14 | rep decay *(existing)* |
| 15 | event roll + cringe + VRBO gag *(existing)* |
| 16 | `checkMilestones`, then the promotion loop *(existing)* |
| 17 | `peakNetWorth` update, then the game-over check |
| 18 | brag, week++, ap reset, summary |

- [ ] **Step 1: Write the failing tests**

Append to `src/state/__tests__/endWeek.test.ts`:

```ts
import { endWeek, initialState, reducer } from '../reducer'
import type { GameState } from '../types'

describe('END_WEEK v3', () => {
  it('refuses to run while a decision is queued', () => {
    const s: GameState = {
      ...initialState(),
      pendingChoices: [
        {
          id: 'C1',
          kind: 'lowball',
          title: 'x',
          body: 'y',
          options: [],
          payload: {},
        },
      ],
    }
    expect(reducer(s, { type: 'END_WEEK' }).week).toBe(s.week)
  })

  it('collects rent before it bills interest', () => {
    const s: GameState = {
      ...initialState(),
      cash: 10000,
      rank: 'topProducer',
      properties: [
        {
          id: 'P1',
          typeId: 'starter',
          nickname: 'Starter Home on Dundurn',
          baseValue: 200000,
          condition: 100,
          mortgage: { balance: 100000 },
          units: [
            {
              id: 'P1-u0',
              tenant: {
                archetypeId: 'perfectPatricia',
                name: 'Patricia Reyes',
                tenancyWeeks: 2,
                plannedStayWeeks: 30,
                owed: 0,
              },
              rentR: 1.0,
              openIssue: null,
              evictionWeeksLeft: null,
            },
          ],
          renovation: null,
          listedForSale: false,
          boughtWeek: 1,
          isVrbo: false,
          vrboProfitStreak: 0,
          vrboRenoDone: false,
        },
      ],
    }
    const out = endWeek(s)
    const row = out.summary!.portfolio.find((r) => r.nickname.includes('Dundurn'))!
    expect(row.rentIn).toBe(400)
    expect(row.moneyOut).toBe(150) // 100,000 × 0.0015
    expect(row.net).toBe(250)
  })

  it('tracks the net worth peak and reports it after a wipeout', () => {
    const s: GameState = { ...initialState(), cash: 50000 }
    const rich = endWeek(s)
    expect(rich.peakNetWorth).toBeGreaterThanOrEqual(50000 - 500)
    const broke = endWeek({ ...rich, cash: -2000 })
    expect(broke.gameOver).toBe(true)
    expect(broke.peakNetWorth).toBeGreaterThan(0)
  })

  it('rotates one listing out of the pool each week', () => {
    const s = { ...initialState(), rank: 'sellerAgent' as const }
    const first = s.marketPool[0].id
    const out = endWeek(s)
    expect(out.marketPool).toHaveLength(4)
    expect(out.marketPool.some((l) => l.id === first)).toBe(false)
  })

  it('always leaves the summary with a portfolio section', () => {
    expect(endWeek(initialState()).summary!.portfolio).toEqual([])
  })
})
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run src/state/__tests__/endWeek.test.ts`
Expected: FAIL — `summary.portfolio` is missing and the choice gate does not exist.

- [ ] **Step 3: Gate the action**

In `reducer()` in `src/state/reducer.ts`:

```ts
    case 'END_WEEK':
      /* Unresolved decisions block the week. The button is disabled too, but
         the reducer is the source of truth. */
      if (state.pendingChoices.length > 0) return state
      return endWeek(state)
```

- [ ] **Step 4: Slot the portfolio phases into `endWeek`**

Immediately after the ghost-roll block that ends with `s = { ...s, leads: survivors }`, insert:

```ts
  /* 4–9. the portfolio week */
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
```

Directly after the marketing block (the one ending with the
`crossedThresholds(...)` loop), insert:

```ts
  /* 12. pool rotation — skipped when step 10 already rebuilt the pool */
  s = rotatePool(s, market.regenerated)
```

Directly after the existing swag-upkeep billing block, insert:

```ts
  /* 13b. portfolio billing */
  const bills = billPortfolio(s, ctx)
  s = bills.state
  bills.lines.forEach((l) => money_out.push(l))
```

Directly before the existing promotion block (`let promo: RankDef | null = null`), insert:

```ts
  /* 16. milestones come before promotions — a mortgage slot earned this week
     is available the moment the player looks at the market. */
  const ms = checkMilestones(s)
  s = ms.state
  ms.unlocked.forEach((m) => events.push(m.label))
```

Replace the lose-check block with:

```ts
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
```

Add `portfolio` to the summary object literal:

```ts
    portfolio: Array.from(ctx.rows.values()),
```

- [ ] **Step 5: Add the imports**

```ts
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
import { netWorth } from '../logic/portfolio'
```

- [ ] **Step 6: Run the whole suite**

Run: `npm test`
Expected: PASS, including every pre-existing Phase 1 and Phase 2 test. If
`endWeek.test.ts`'s original step-order test fails, the portfolio phases went in
at the wrong point — re-read the table above rather than editing that test.

- [ ] **Step 7: Type-check and commit**

```bash
npx tsc -b
```

```bash
git add src/state/reducer.ts src/state/__tests__/endWeek.test.ts
git commit -m "feat: rewrite END_WEEK with the phase 3 order"
```

---

### Task 18: Portfolio tab — market view

**Files:**
- Create: `src/components/portfolio/ListingCard.tsx`
- Create: `src/components/portfolio/BuyModal.tsx`
- Create: `src/components/PortfolioTab.tsx`
- Modify: `src/App.tsx`
- Modify: `src/styles.css`

- [ ] **Step 1: Write `src/components/portfolio/BuyModal.tsx`**

Shows the full money math before commit. Down slider steps 5% from 20% to 100%.

```tsx
import { useState } from 'react'
import { P3 } from '../../data/p3'
import { hasFreeMortgageSlot } from '../../logic/portfolio'
import { money } from '../../logic/rand'
import type { GameState } from '../../state/types'

export default function BuyModal({
  state,
  askPrice,
  title,
  blurb,
  onCancel,
  onBuy,
}: {
  state: GameState
  askPrice: number
  title: string
  blurb: string
  onCancel: () => void
  onBuy: (downPct: number) => void
}) {
  const [downPct, setDownPct] = useState(P3.DOWN_MIN)
  const down = Math.round(askPrice * downPct)
  const balance = askPrice - down
  const interest = Math.round(balance * P3.MORTGAGE_WEEKLY_RATE)
  const financed = downPct < 1
  const noSlot = financed && !hasFreeMortgageSlot(state)
  const broke = state.cash < down
  const reason = noSlot
    ? 'Every mortgage slot is spoken for.'
    : broke
      ? "You can't cover the down payment."
      : null

  return (
    <div className="res-modal">
      <div className="res-card">
        <h2 className="res-display">{title}</h2>
        <p style={{ fontSize: 13.5, lineHeight: 1.6 }}>{blurb}</p>
        <div className="res-line">
          <span>Ask price</span>
          <b>{money(askPrice)}</b>
        </div>
        <label className="res-slider-row">
          <span>Down payment · {Math.round(downPct * 100)}%</span>
          <input
            type="range"
            min={P3.DOWN_MIN * 100}
            max={100}
            step={P3.DOWN_STEP * 100}
            value={downPct * 100}
            onChange={(e) => setDownPct(Number(e.target.value) / 100)}
          />
        </label>
        <div className="res-line">
          <span>Down</span>
          <b>{money(down)}</b>
        </div>
        <div className="res-line">
          <span>Mortgage balance</span>
          <b>{money(balance)}</b>
        </div>
        <div className="res-line">
          <span>Weekly interest</span>
          <b>{money(interest)}</b>
        </div>
        <div className="res-line">
          <span>Cash after</span>
          <b>{money(state.cash - down)}</b>
        </div>
        {reason && <p className="res-warn">{reason}</p>}
        <button className="res-go" disabled={!!reason} onClick={() => onBuy(downPct)}>
          Buy it
        </button>
        <button className="res-tab" onClick={onCancel}>
          Walk away
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Write `src/components/portfolio/ListingCard.tsx`**

```tsx
import { labelOf } from '../../logic/portfolio'
import { money } from '../../logic/rand'
import type { GameState, Listing } from '../../state/types'

export default function ListingCard({
  state,
  listing,
  onOpen,
}: {
  state: GameState
  listing: Listing
  onOpen: () => void
}) {
  const handyman = listing.condition < 50
  return (
    <div className="res-card res-listing">
      {state.crash.weeksLeft > 0 && (
        <div className="res-ribbon">CRASH PRICING</div>
      )}
      <h3>{labelOf(listing.typeId)}</h3>
      <p className="res-blurb">{listing.blurb}</p>
      <div className="res-bar" aria-label="condition">
        <i
          style={{ width: listing.condition + '%' }}
          className={handyman ? 'low' : ''}
        />
      </div>
      {handyman && <span className="res-chip warn">handyman special</span>}
      <div className="res-line">
        <span>Ask</span>
        <b>{money(listing.askPrice)}</b>
      </div>
      <button className="res-go" onClick={onOpen}>
        Financing preview
      </button>
    </div>
  )
}
```

- [ ] **Step 3: Write `src/components/PortfolioTab.tsx`**

```tsx
import { useState } from 'react'
import { P3 } from '../data/p3'
import {
  labelOf,
  mortgageSlots,
  netWorth,
  occupiedUnitCount,
  usedMortgageSlots,
} from '../logic/portfolio'
import { money } from '../logic/rand'
import type { Action, GameState } from '../state/types'
import ListingCard from './portfolio/ListingCard'
import BuyModal from './portfolio/BuyModal'
import PropertyCard from './portfolio/PropertyCard'

export default function PortfolioTab({
  state,
  dispatch,
}: {
  state: GameState
  dispatch: (a: Action) => void
}) {
  const [view, setView] = useState<'market' | 'owned'>('market')
  const [buying, setBuying] = useState<string | null>(null)
  const listing = state.marketPool.find((l) => l.id === buying)

  return (
    <section>
      <div className="res-hrow">
        <div>
          <div className="res-meta">Net worth</div>
          <div className="res-display res-brass">{money(netWorth(state))}</div>
        </div>
        <div className="res-meta">
          Mortgages {usedMortgageSlots(state)}/{mortgageSlots(state)}
        </div>
        <button
          className={'res-tab' + (state.propCoActive ? ' on' : '')}
          onClick={() => dispatch({ type: 'TOGGLE_PROPCO' })}
        >
          PropCo {state.propCoActive ? 'ON' : 'OFF'} ·{' '}
          {money(P3.PROPCO_PER_UNIT)}/unit/wk
          {!state.propCoActive &&
          occupiedUnitCount(state) < P3.PROPCO_MIN_OCCUPIED_UNITS
            ? ' (needs 3 occupied units)'
            : ''}
        </button>
      </div>

      <nav className="res-tabs">
        <button
          className={'res-tab' + (view === 'market' ? ' on' : '')}
          onClick={() => setView('market')}
        >
          Market
        </button>
        <button
          className={'res-tab' + (view === 'owned' ? ' on' : '')}
          onClick={() => setView('owned')}
        >
          Owned ({state.properties.length})
        </button>
      </nav>

      {view === 'market' && (
        <div className="res-grid">
          {state.marketPool.map((l) => (
            <ListingCard
              key={l.id}
              state={state}
              listing={l}
              onOpen={() => setBuying(l.id)}
            />
          ))}
        </div>
      )}

      {view === 'owned' && (
        <div className="res-grid">
          {state.properties.length === 0 && (
            <p className="res-blurb">
              You own nothing. The market tab is right there, quietly judging you.
            </p>
          )}
          {state.properties.map((p) => (
            <PropertyCard key={p.id} state={state} property={p} dispatch={dispatch} />
          ))}
        </div>
      )}

      {listing && (
        <BuyModal
          state={state}
          askPrice={listing.askPrice}
          title={labelOf(listing.typeId)}
          blurb={listing.blurb}
          onCancel={() => setBuying(null)}
          onBuy={(downPct) => {
            dispatch({ type: 'BUY_PROPERTY', listingId: listing.id, downPct })
            setBuying(null)
          }}
        />
      )}
    </section>
  )
}
```

- [ ] **Step 4: Register the tab in `src/App.tsx`**

Change the tab type and list:

```tsx
type TabId = 'office' | 'leads' | 'portfolio' | 'closet' | 'log'

const TABS: [TabId, string][] = [
  ['office', 'Office'],
  ['leads', 'Leads'],
  ['portfolio', 'Portfolio'],
  ['closet', 'Closet'],
  ['log', 'Log'],
]
```

Add the render branch beside the others:

```tsx
      {tab === 'portfolio' && <PortfolioTab state={state} dispatch={dispatch} />}
```

and the import:

```tsx
import PortfolioTab from './components/PortfolioTab'
```

- [ ] **Step 5: Add the styles**

Append to `src/styles.css`:

```css
.res-grid { display: grid; gap: 12px; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); margin-top: 12px; }
.res-listing { position: relative; }
.res-ribbon { position: absolute; top: 8px; right: -6px; background: #8c2b2b; color: #f5f2ea; font-size: 11px; letter-spacing: .08em; padding: 3px 10px; }
.res-blurb { font-size: 12.5px; line-height: 1.5; opacity: .85; }
.res-bar { height: 8px; background: #2a2722; border-radius: 4px; overflow: hidden; margin: 8px 0; }
.res-bar > i { display: block; height: 100%; background: #c9a227; }
.res-bar > i.low { background: #8c2b2b; }
.res-brass { color: #c9a227; }
.res-warn { color: #d98c8c; font-size: 12.5px; }
.res-slider-row { display: flex; flex-direction: column; gap: 4px; font-size: 12.5px; margin: 8px 0; }
.res-vrbo { border: 1px solid #c9a227; background: linear-gradient(160deg, rgba(201,162,39,.18), transparent 65%); }
.res-machine { color: #c9a227; font-weight: 700; }
```

- [ ] **Step 6: Verify it renders**

Create `.claude/launch.json` if it does not exist:

```json
{
  "version": "0.0.1",
  "configurations": [
    { "name": "res-dev", "runtimeExecutable": "npm", "runtimeArgs": ["run", "dev"], "port": 5173 }
  ]
}
```

Start the preview with `preview_start {name: "res-dev"}`, open the Portfolio
tab, confirm four listing cards render and the financing preview shows a live
down payment and weekly interest. Check the console for errors.

- [ ] **Step 7: Commit**

```bash
git add src/components/PortfolioTab.tsx src/components/portfolio src/App.tsx src/styles.css .claude/launch.json
git commit -m "feat: add the portfolio tab market view"
```

---

### Task 19: Portfolio tab — owned view

**Files:**
- Create: `src/components/portfolio/UnitRow.tsx`
- Create: `src/components/portfolio/PropertyCard.tsx`

- [ ] **Step 1: Write `src/components/portfolio/UnitRow.tsx`**

```tsx
import { P3 } from '../../data/p3'
import { baseRentOf, chargedRent, tenantOf } from '../../logic/portfolio'
import { money } from '../../logic/rand'
import type { Action, Property, UnitState } from '../../state/types'

export default function UnitRow({
  property,
  unit,
  dispatch,
  onEvict,
}: {
  property: Property
  unit: UnitState
  dispatch: (a: Action) => void
  onEvict: (unit: UnitState) => void
}) {
  const t = unit.tenant
  const a = t ? tenantOf(t.archetypeId) : null
  const rent = chargedRent(property, unit, baseRentOf(property))

  return (
    <div className="res-unit">
      <div className="res-line">
        <span>
          {t ? t.name : 'Vacant'}
          {a ? ' · ' + a.label : ''}
        </span>
        <b>{money(rent)}/wk</b>
      </div>

      {t && t.owed > 0 && (
        <span className="res-chip warn">owes {money(t.owed)}</span>
      )}
      {unit.openIssue && (
        <span className="res-chip issue">
          {unit.openIssue.eventId}
          {unit.openIssue.fixCost > 0
            ? ' · ' + money(unit.openIssue.fixCost)
            : ' · needs repairs, not money'}
        </span>
      )}
      {unit.evictionWeeksLeft !== null && (
        <span className="res-chip warn">
          eviction · {unit.evictionWeeksLeft} weeks left
        </span>
      )}

      <label className="res-slider-row">
        <span>Rent multiplier · {unit.rentR.toFixed(2)}×</span>
        <input
          type="range"
          min={P3.RENT_R_MIN * 100}
          max={P3.RENT_R_MAX * 100}
          step={P3.RENT_R_STEP * 100}
          value={unit.rentR * 100}
          onChange={(e) =>
            dispatch({
              type: 'SET_RENT',
              propertyId: property.id,
              unitId: unit.id,
              r: Number(e.target.value) / 100,
            })
          }
        />
      </label>

      <div className="res-actions">
        {unit.openIssue && unit.openIssue.eventId !== 'rentStrike' && (
          <button
            className="res-tab"
            onClick={() =>
              dispatch({
                type: 'HANDLE_ISSUE',
                propertyId: property.id,
                unitId: unit.id,
              })
            }
          >
            Handle it · {money(unit.openIssue.fixCost)} · 1 AP
          </button>
        )}
        {t && unit.evictionWeeksLeft === null && (
          <button className="res-tab" onClick={() => onEvict(unit)}>
            Evict · {money(P3.EVICT_COST)} · 1 AP
          </button>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Write `src/components/portfolio/PropertyCard.tsx`**

The eviction confirmation shows Steve's final story and the "I'm still evicting
him" button; every other tenant gets the plain confirmation.

```tsx
import { useState } from 'react'
import { P3 } from '../../data/p3'
import { RENO_PROGRESS_LINE } from '../../data/properties'
import { VRBO_TOOLTIP } from '../../data/vrbo'
import {
  displayedValue,
  interp,
  labelOf,
  renoBlockReason,
  renoCost,
  renoOf,
  renoWeeks,
  tenantOf,
  typeOf,
} from '../../logic/portfolio'
import { money } from '../../logic/rand'
import type {
  Action,
  GameState,
  Property,
  RenoProjectId,
  UnitState,
} from '../../state/types'
import UnitRow from './UnitRow'

export default function PropertyCard({
  state,
  property: p,
  dispatch,
}: {
  state: GameState
  property: Property
  dispatch: (a: Action) => void
}) {
  const [renaming, setRenaming] = useState(false)
  const [name, setName] = useState(p.nickname)
  const [evicting, setEvicting] = useState<UnitState | null>(null)

  const row = state.summary?.portfolio.find((r) => r.nickname === p.nickname)
  const projects: RenoProjectId[] = p.isVrbo
    ? ['full']
    : ((typeOf(p.typeId)?.renoEligible ?? []) as RenoProjectId[])
  const handyman = p.condition < P3.LOW_CONDITION
  const evictArch = evicting?.tenant ? tenantOf(evicting.tenant.archetypeId) : null

  return (
    <div className={'res-card' + (p.isVrbo ? ' res-vrbo' : '')}>
      {renaming ? (
        <input
          value={name}
          maxLength={24}
          autoFocus
          onChange={(e) => setName(e.target.value)}
          onBlur={() => {
            dispatch({ type: 'RENAME_PROPERTY', propertyId: p.id, nickname: name })
            setRenaming(false)
          }}
        />
      ) : (
        <h3
          onClick={() => setRenaming(true)}
          title={p.isVrbo ? VRBO_TOOLTIP : 'Click to rename'}
        >
          {p.nickname}
          {state.milestonesUnlocked.includes('theMachine') && p.isVrbo && (
            <span className="res-machine"> ⚙</span>
          )}
        </h3>
      )}
      <div className="res-meta">{labelOf(p.typeId)}</div>

      <div className="res-bar" aria-label="condition">
        <i style={{ width: p.condition + '%' }} className={handyman ? 'low' : ''} />
      </div>
      {handyman && <span className="res-chip warn">handyman special</span>}

      <div className="res-line">
        <span>Value</span>
        <b>{money(displayedValue(state, p))}</b>
      </div>
      {p.mortgage && (
        <>
          <div className="res-line">
            <span>Mortgage</span>
            <b>{money(p.mortgage.balance)}</b>
          </div>
          <button
            className="res-tab"
            onClick={() => dispatch({ type: 'PAY_PRINCIPAL', propertyId: p.id })}
          >
            Pay {money(P3.PRINCIPAL_CHUNK)} principal
          </button>
        </>
      )}
      {row && (
        <div className="res-line">
          <span>Last week</span>
          <b className={row.net >= 0 ? 'res-mint' : 'res-loss'}>{money(row.net)}</b>
        </div>
      )}

      {p.isVrbo && (
        <>
          <div className="res-line">
            <span>Occupancy</span>
            <b>{row?.occupancyPct ?? 0}%</b>
          </div>
          <div className="res-line">
            <span>Profitable weeks</span>
            <b>
              {p.vrboProfitStreak}/{P3.VRBO.STREAK_TARGET}
            </b>
          </div>
        </>
      )}

      {p.renovation ? (
        <p className="res-blurb">
          {interp(RENO_PROGRESS_LINE, {
            n: String(renoOf(p.renovation.projectId).weeks - p.renovation.weeksLeft + 1),
            total: String(renoOf(p.renovation.projectId).weeks),
          })}
        </p>
      ) : (
        <div className="res-actions">
          {projects.map((id) => {
            const blocked = renoBlockReason(state, p, id)
            return (
              <button
                key={id}
                className="res-tab"
                disabled={!!blocked}
                title={blocked ?? ''}
                onClick={() =>
                  dispatch({ type: 'START_RENOVATION', propertyId: p.id, projectId: id })
                }
              >
                {renoOf(id).label} · {money(renoCost(p, id))} ·{' '}
                {renoWeeks(state, id)} wks
              </button>
            )
          })}
          <button
            className="res-tab"
            onClick={() => dispatch({ type: 'EMERGENCY_REPAIR', propertyId: p.id })}
          >
            Emergency repair · {money(P3.EMERGENCY_REPAIR_COST)} · 1 AP
          </button>
          <button
            className="res-tab"
            onClick={() =>
              dispatch(
                p.listedForSale
                  ? { type: 'DELIST', propertyId: p.id }
                  : { type: 'LIST_FOR_SALE', propertyId: p.id },
              )
            }
          >
            {p.listedForSale ? 'Delist' : 'List for sale · 1 AP'}
          </button>
        </div>
      )}

      {p.units.map((u) => (
        <UnitRow
          key={u.id}
          property={p}
          unit={u}
          dispatch={dispatch}
          onEvict={setEvicting}
        />
      ))}

      {evicting && (
        <div className="res-modal">
          <div className="res-card">
            <h2 className="res-display">EVICT {evicting.tenant?.name}</h2>
            <p style={{ fontSize: 13.5, lineHeight: 1.6 }}>
              {evictArch?.evictBody ??
                'Paper, process, and four weeks of avoiding eye contact in the driveway.'}
            </p>
            <div className="res-line">
              <span>Filing cost</span>
              <b>{money(P3.EVICT_COST)}</b>
            </div>
            <div className="res-line">
              <span>Weeks without rent</span>
              <b>
                {evicting.tenant?.archetypeId === 'theHoarder'
                  ? P3.EVICT_WEEKS_HOARDER
                  : P3.EVICT_WEEKS}
              </b>
            </div>
            <button
              className="res-go"
              onClick={() => {
                dispatch({ type: 'EVICT', propertyId: p.id, unitId: evicting.id })
                setEvicting(null)
              }}
            >
              {evictArch?.evictBody ? "I'm still evicting him" : 'File the paperwork'}
            </button>
            <button className="res-tab" onClick={() => setEvicting(null)}>
              Not this week
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 3: Add the remaining styles**

Append to `src/styles.css`:

```css
.res-unit { border-top: 1px solid #2a2722; padding-top: 8px; margin-top: 8px; }
.res-actions { display: flex; flex-wrap: wrap; gap: 6px; margin: 8px 0; }
.res-chip.issue { background: #8c2b2b; color: #f5f2ea; animation: res-pulse 1.4s infinite; }
.res-mint { color: #7fd1a8; }
.res-loss { color: #d98c8c; }
@keyframes res-pulse { 0%,100% { opacity: 1 } 50% { opacity: .55 } }
```

- [ ] **Step 4: Verify in the preview**

Reload the preview, use the debug `+$100k` button (Task 22) or buy a listing,
then confirm the owned card shows the condition bar, the rent slider, and a
renovate menu whose blocked entries carry a tooltip. Check the console.

- [ ] **Step 5: Commit**

```bash
git add src/components/portfolio src/styles.css
git commit -m "feat: add the owned-property card and unit rows"
```

---

### Task 20: The portfolio choice modal and the End Week gate

**Files:**
- Create: `src/components/PortfolioChoiceModal.tsx`
- Modify: `src/App.tsx`

- [ ] **Step 1: Write `src/components/PortfolioChoiceModal.tsx`**

Renders `pendingChoices[0]` only. A `vrboBuy` choice renders the Buy modal
instead of plain option buttons.

```tsx
import { P3 } from '../data/p3'
import { VRBO_NICKNAME } from '../data/vrbo'
import type { Action, GameState } from '../state/types'
import BuyModal from './portfolio/BuyModal'

export default function PortfolioChoiceModal({
  state,
  dispatch,
}: {
  state: GameState
  dispatch: (a: Action) => void
}) {
  const c = state.pendingChoices[0]
  if (!c) return null

  if (c.kind === 'vrboBuy') {
    return (
      <BuyModal
        state={state}
        askPrice={P3.VRBO.PRICE}
        title={VRBO_NICKNAME}
        blurb={c.body}
        onCancel={() =>
          dispatch({
            type: 'RESOLVE_PORTFOLIO_CHOICE',
            choiceId: c.id,
            actionTag: 'cancel',
          })
        }
        onBuy={(downPct) => dispatch({ type: 'BUY_VRBO', downPct })}
      />
    )
  }

  return (
    <div className="res-modal">
      <div className="res-card">
        <h2 className="res-display">{c.title}</h2>
        <p style={{ fontSize: 13.5, lineHeight: 1.6 }}>{c.body}</p>
        {c.options.map((o) => (
          <button
            key={o.actionTag}
            className="res-go"
            onClick={() =>
              dispatch({
                type: 'RESOLVE_PORTFOLIO_CHOICE',
                choiceId: c.id,
                actionTag: o.actionTag,
              })
            }
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Wire it into `src/App.tsx`**

Add the import and render it beside `WeekSummaryModal`:

```tsx
import PortfolioChoiceModal from './components/PortfolioChoiceModal'
```

```tsx
      <PortfolioChoiceModal state={state} dispatch={dispatch} />
```

Replace the End Week button with the gated version:

```tsx
      <button
        className="res-end res-display"
        disabled={state.pendingChoices.length > 0}
        title={state.pendingChoices.length > 0 ? 'Decisions await' : ''}
        onClick={() => dispatch({ type: 'END_WEEK' })}
      >
        {state.pendingChoices.length > 0
          ? 'DECISIONS AWAIT'
          : 'END WEEK ' + state.week}
      </button>
```

- [ ] **Step 3: Verify**

In the preview, use the debug panel's Force Crash and then list a property to
generate a lowball; confirm the modal blocks End Week and that resolving one
choice reveals the next.

- [ ] **Step 4: Commit**

```bash
git add src/components/PortfolioChoiceModal.tsx src/App.tsx
git commit -m "feat: add the portfolio choice modal and gate End Week on it"
```

---

### Task 21: Header net worth, market dial, crash banner, summary section

**Files:**
- Modify: `src/components/Header.tsx`
- Modify: `src/App.tsx`
- Modify: `src/components/WeekSummaryModal.tsx`
- Modify: `src/styles.css`

- [ ] **Step 1: Add net worth and the dial to `src/components/Header.tsx`**

Add the imports:

```tsx
import { hasMarketInsight, netWorth } from '../logic/portfolio'
```

Insert inside `res-hrow`, after the cash block:

```tsx
        <div>
          <div className="res-meta">Net worth</div>
          <div className="res-display res-brass">{money(netWorth(state))}</div>
        </div>
        <div className="res-dial" aria-label={'market: ' + state.marketState}>
          {(['cold', 'normal', 'hot'] as const).map((m) => (
            <span
              key={m}
              className={
                'res-dial-seg' +
                (state.marketState === m ? ' on' : '') +
                (hasMarketInsight(state) && state.nextMarketState === m
                  ? ' next'
                  : '')
              }
            >
              {m}
            </span>
          ))}
        </div>
```

- [ ] **Step 2: Add the crash banner in `src/App.tsx`**

Beside the existing `modDelta` banner:

```tsx
      {state.crash.weeksLeft > 0 && (
        <div className="res-banner res-crash">
          📉 MARKET CRASH — {state.crash.weeksLeft} weeks left. Everything is
          worth less. Everything is also cheaper.
        </div>
      )}
```

- [ ] **Step 3: Add the Portfolio section to `src/components/WeekSummaryModal.tsx`**

Insert before the totals block:

```tsx
      {state.summary!.portfolio.length > 0 && (
        <>
          <h3>Portfolio</h3>
          {state.summary!.portfolio.map((r) => (
            <div key={r.nickname} className="res-summary-row">
              <div className="res-line">
                <span>{r.nickname}</span>
                <b className={r.net >= 0 ? 'res-mint' : 'res-loss'}>
                  {money(r.net)}
                </b>
              </div>
              <div className="res-meta">
                In {money(r.rentIn)} · Out {money(r.moneyOut)}
                {r.occupancyPct !== undefined
                  ? ' · ' + r.occupancyPct + '% occupancy'
                  : ''}
              </div>
              {r.events.length > 0 && (
                <div className="res-meta">{r.events.join(' · ')}</div>
              )}
            </div>
          ))}
        </>
      )}
```

- [ ] **Step 4: Add the styles**

```css
.res-dial { display: flex; gap: 4px; font-size: 11px; letter-spacing: .08em; }
.res-dial-seg { padding: 2px 8px; border: 1px solid #2a2722; opacity: .4; }
.res-dial-seg.on { opacity: 1; border-color: #c9a227; color: #c9a227; }
.res-dial-seg.next { border-style: dashed; opacity: .75; }
.res-crash { background: #3a1d1d; border-color: #8c2b2b; }
.res-summary-row { margin-bottom: 8px; }
```

- [ ] **Step 5: Verify in the preview**

Confirm net worth renders in brass beside cash and count-updates after End
Week; force a crash from the debug panel and confirm the banner and the dial.
Take a screenshot for the user.

- [ ] **Step 6: Commit**

```bash
git add src/components/Header.tsx src/App.tsx src/components/WeekSummaryModal.tsx src/styles.css
git commit -m "feat: add net worth, the market dial, crash banner, and summary section"
```

---

### Task 22: Debug panel additions

**Files:**
- Modify: `src/state/reducer.ts`
- Modify: `src/components/OfficeTab.tsx`

- [ ] **Step 1: Add the four debug cases to the reducer**

```ts
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
      s.properties.forEach((p) => {
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
```

Extend the imports with `makeTenant`, `pickApplicant`, and `regeneratePool`
from `../logic/portfolio`, and `applyEvent` is already imported from
`../logic/events`.

- [ ] **Step 2: Add the buttons to `src/components/OfficeTab.tsx`**

Add beside the existing export/import controls:

```tsx
      <div className="res-actions">
        <button className="res-tab" onClick={() => dispatch({ type: 'DEBUG_CASH' })}>
          +$100k
        </button>
        <button
          className="res-tab"
          onClick={() => dispatch({ type: 'DEBUG_FORCE_CRASH' })}
        >
          Force crash
        </button>
        <button
          className="res-tab"
          onClick={() => dispatch({ type: 'DEBUG_FILL_VACANCIES' })}
        >
          Fill vacancies
        </button>
        {(['cold', 'normal', 'hot'] as const).map((m) => (
          <button
            key={m}
            className="res-tab"
            onClick={() => dispatch({ type: 'DEBUG_SET_MARKET', marketState: m })}
          >
            Market: {m}
          </button>
        ))}
      </div>
```

- [ ] **Step 3: Verify and commit**

Run: `npm test && npx tsc -b`
Expected: PASS, no type errors.

```bash
git add src/state/reducer.ts src/components/OfficeTab.tsx
git commit -m "feat: add the phase 3 debug controls"
```

---

### Task 23: Acceptance verification

**Files:**
- Create: `src/logic/__tests__/acceptance.test.ts`

These are the §16 criteria that no earlier task pinned down.

- [ ] **Step 1: Write the acceptance tests**

```ts
import { describe, expect, it } from 'vitest'
import { setSeed } from '../rand'
import { conditionFactor, displayedValue, purchaseBaseValue } from '../portfolio'
import { initialState, reducer } from '../../state/reducer'
import type { GameState, Listing } from '../../state/types'

const listing: Listing = {
  id: 'LST1',
  typeId: 'starter',
  intrinsicValue: 200000,
  condition: 60,
  askPrice: Math.round(200000 * conditionFactor(60)),
  blurb: 'Good bones. The bones are load-bearing wallpaper.',
}

describe('§16.3 — buying leaves no instant equity', () => {
  it('values a fresh purchase at exactly what was paid, in a normal market', () => {
    const s: GameState = {
      ...initialState(),
      rank: 'sellerAgent',
      cash: 500000,
      marketPool: [listing],
    }
    const out = reducer(s, {
      type: 'BUY_PROPERTY',
      listingId: 'LST1',
      downPct: 1,
    })
    expect(displayedValue(out, out.properties[0])).toBe(listing.askPrice)
    expect(purchaseBaseValue(listing)).toBe(listing.askPrice)
  })

  it('returns 15–25% on cash for a financed buy-reno-sell at 60 condition', () => {
    /* 20% down on 173,333 = 34,667 cash in.
       Full reno costs 20% of baseValue (34,667) and lifts baseValue by 30%.
       Sale at normal market clears the 138,666 balance. */
    const ask = listing.askPrice
    const down = Math.round(ask * 0.2)
    const balance = ask - down
    const baseValue = purchaseBaseValue(listing)
    const renoCost = Math.round(baseValue * 0.2)
    const after = Math.round(baseValue * 1.3)
    const interest = Math.round(balance * 0.0015) * 5 // five weeks of the job
    const cashIn = down + renoCost + interest
    const profit = after - balance - cashIn
    const roi = profit / cashIn
    expect(roi).toBeGreaterThan(0.15)
    expect(roi).toBeLessThan(0.25)
  })
})

describe('§16.8 — the Markov chain never jumps', () => {
  it('only ever moves through normal', () => {
    setSeed(77)
    let s: GameState = { ...initialState(), rank: 'topProducer' }
    const seen: string[] = [s.marketState]
    for (let i = 0; i < 400; i++) {
      s = reducer(s, { type: 'END_WEEK' })
      if (s.marketState !== seen[seen.length - 1]) seen.push(s.marketState)
      if (s.gameOver) break
    }
    setSeed(null)
    for (let i = 1; i < seen.length; i++) {
      const from = seen[i - 1]
      const to = seen[i]
      expect(from === 'hot' && to === 'cold').toBe(false)
      expect(from === 'cold' && to === 'hot').toBe(false)
    }
  })
})

describe('§16.12 — only diegetic numbers reach the log', () => {
  it('never writes a bare probability into a log line', () => {
    setSeed(21)
    let s: GameState = { ...initialState(), rank: 'topProducer', cash: 400000 }
    for (let i = 0; i < 60 && !s.gameOver; i++)
      s = reducer(s, { type: 'END_WEEK' })
    setSeed(null)
    const suspicious = s.log.filter((l) => /\b0\.\d+\b|\d+% chance/i.test(l.text))
    expect(suspicious).toEqual([])
  })
})
```

- [ ] **Step 2: Run them**

Run: `npx vitest run src/logic/__tests__/acceptance.test.ts`
Expected: PASS. If the ROI test fails, do NOT retune `P3` — re-read §5 and check
that `purchaseBaseValue` uses `intrinsicValue × conditionFactor` and that
`renoCost` reads the post-purchase `baseValue`.

- [ ] **Step 3: Run everything**

```bash
npm test
```

```bash
npx tsc -b && npm run lint
```

Expected: all suites pass, no type errors, no lint errors.

- [ ] **Step 4: Walk the game in the preview**

With the preview open: debug `+$100k` ×5, buy a starter home financed, set rent
to 0.80×, End Week until a tenant moves in, confirm the rent lands in the Week
Summary's Portfolio section, start a cosmetic refresh, and confirm the card
shows the progress line. Screenshot the owned view for the user.

- [ ] **Step 5: Commit**

```bash
git add src/logic/__tests__/acceptance.test.ts
git commit -m "test: pin the phase 3 acceptance criteria"
```

---

## Spec coverage map

| Spec § | Task |
|---|---|
| §2 constants | 2 |
| §3 types, displayedValue, netWorth, fairRent, slots | 3, 9 |
| §4 property/reno data | 4 |
| §5 pool generation and purchase math | 9, 23 |
| §6 reducer actions | 11, 12, 13 |
| §7 applicants | 9, 14 |
| §8 tenants and rent collection | 5, 14, 15 |
| §9 tenant events | 6, 14 |
| §10 market cycle, crash, flips | 9, 15, 16 |
| §11 the VRBO | 7, 13, 15 |
| §12 END_WEEK order | 17 |
| §13 milestones, brags, streets | 4, 7, 8, 15 |
| §14 UI contract | 18, 19, 20, 21 |
| §15 migration | 10 |
| §16 acceptance | 23 (plus the per-task tests) |
