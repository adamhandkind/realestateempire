# Phase 2 — "Brand & Body" Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the Phase 1 Real Estate Simulator with marketing channels, a Reputation meter, Tier 4 body-mod swag, Rank 5 (Top Producer), four new client archetypes, eight new/upgraded events, and the 424/7 VRBO running gag — migrating existing v1 saves to GameState v2 without data loss.

**Architecture:** The existing shape is preserved exactly: typed content arrays in `src/data/`, pure helpers in `src/logic/`, one reducer in `src/state/reducer.ts`, all randomness through `src/logic/rand.ts`, one component per tab. Phase 2 adds two new logic modules (`marketing.ts`, `migrate.ts`), three new data modules (`marketing.ts`, `reputation.ts`, extended `swag/archetypes/events/brags`), a `Marketing` tab, a `RepMeter` header component, and a `ChoiceModal` for the four new decision events. `GameState.version` becomes `2`; `loadSave()` routes every parsed save through `migrate()`.

**Tech Stack:** Vite 8, React 19, TypeScript 6, oxlint, Vitest (added in Task 1 — the repo currently has no test runner).

---

## File Structure

**New files**

| File | Responsibility |
|---|---|
| `src/data/marketing.ts` | The 9 `Channel` definitions. Constant data only. |
| `src/data/reputation.ts` | Rep constants + the `REP_THRESHOLDS` table (data-driven unlocks) + toast copy. |
| `src/logic/marketing.ts` | Pure marketing math: billing total, inbound-lead rolls, weekly rep delta, threshold crossings. |
| `src/state/migrate.ts` | `migrate(unknown): GameState` — v1 → v2 upgrade, defaults for every new field. |
| `src/components/MarketingTab.tsx` | Channel cards, toggles, live spend/wk total. |
| `src/components/RepMeter.tsx` | Header fame bar with ticks at 15/30/50/75/90. |
| `src/components/ChoiceModal.tsx` | Renders `state.pendingChoice` (tvInterview / copycat / gala / vrbo). |
| `src/components/Toast.tsx` | Transient threshold-crossing toast. |
| `src/logic/__tests__/*.test.ts`, `src/state/__tests__/*.test.ts` | Vitest suites. |

**Modified files**

| File | Change |
|---|---|
| `src/state/types.ts` | `version: 2`, `Slot` += `bodyMod`, `RankId` += `topProducer`, new state fields, new actions, `Channel`/`ChoiceEventId` types. |
| `src/state/reducer.ts` | New actions; End Week gains marketing + rep steps; `initialState()` gains defaults. |
| `src/state/save.ts` | `loadSave`/`parseImport` route through `migrate()`. |
| `src/logic/economy.ts` | `deriveStats` adds `permBonuses.ego`; `nextRank` checks `req.rep`. |
| `src/logic/leads.ts` | `legalArchetypes(state)` gates on rep; `makeLead` accepts a channel tag. |
| `src/logic/events.ts` | 7 new event branches, `cringeEvent` rep scaling, choice-event resolution. |
| `src/data/ranks.ts` | Top Producer rank; `LOCKED_RANKS` drops it. |
| `src/data/swag.ts` | `bodyMod` slot + 12 Tier 4 items. |
| `src/data/archetypes.ts` | 4 new archetypes with `unlockRep`. |
| `src/data/events.ts` | 7 new `EventDef` rows + copy pools. |
| `src/data/brags.ts` | `topProducer` templates + Phase 2 brag pools. |
| `src/App.tsx` | Marketing tab, ChoiceModal, Toast wiring. |
| `src/components/Header.tsx` | Renders `RepMeter`. |
| `src/components/ClosetTab.tsx` | Preset save/load/rename UI. |
| `src/components/WeekSummaryModal.tsx` | Marketing section. |
| `src/components/BragTicker.tsx` | Verified-checkmark styling at Rep ≥ 75. |
| `src/styles.css` | New tokens-free classes reusing Phase 1 variables. |

**Deviations from the spec, deliberate and minimal** (called out so review can reject them):
1. `gagCounters` gains `nextVrboWeek: number` alongside `vrboOffers` — the "every 6–9 weeks guaranteed" rule needs a stored next-fire week.
2. New state field `channelMuteUntil: Record<string, number>` — `algorithmChange` must silence TikTok for 2 weeks while still billing, and `activeModifiers` only carries close-chance deltas.
3. New state field `pendingChoice: PendingChoice | null` — the four choice modals must survive the End Week that spawns them.
4. `RankDef.req` gains an optional `rep` field so the Rank 5 requirement stays data-driven.

---

## Task 1: Test infrastructure

**Files:**
- Modify: `package.json`
- Create: `vitest.config.ts`
- Create: `src/logic/__tests__/rand.test.ts`

- [ ] **Step 1: Install Vitest**

```bash
npm install -D vitest@^3
```

- [ ] **Step 2: Add the test script**

In `package.json`, inside `"scripts"`, add after the `"lint"` line:

```json
    "test": "vitest run",
```

- [ ] **Step 3: Create `vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
```

- [ ] **Step 4: Write a smoke test proving the seeded RNG is deterministic**

Create `src/logic/__tests__/rand.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { chance, rand, setSeed } from '../rand'

describe('rand', () => {
  it('is deterministic under a fixed seed', () => {
    setSeed(42)
    const a = [rand(), rand(), rand()]
    setSeed(42)
    const b = [rand(), rand(), rand()]
    setSeed(null)
    expect(a).toEqual(b)
  })

  it('chance(1) is always true and chance(0) always false', () => {
    setSeed(7)
    expect(chance(1)).toBe(true)
    expect(chance(0)).toBe(false)
    setSeed(null)
  })
})
```

Note for every later task: tests that touch randomness must call `setSeed(<n>)` at the start and `setSeed(null)` at the end, or they will flake.

- [ ] **Step 5: Run the tests**

```bash
npm test
```

Expected: `2 passed`.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json vitest.config.ts src/logic/__tests__/rand.test.ts
git commit -m "chore: add vitest and a seeded-rng smoke test"
```

---

## Task 2: GameState v2 types

No behavior yet — this task only widens the type surface so later tasks compile. `version: 2` here will break `initialState()` and `save.ts`; Steps 5–6 patch them minimally so the build stays green.

**Files:**
- Modify: `src/state/types.ts`
- Modify: `src/state/reducer.ts:28-54`
- Modify: `src/state/save.ts:21,39`

- [ ] **Step 1: Widen the primitive unions**

In `src/state/types.ts`, replace lines 7-9:

```ts
export type Stage = 'new' | 'shown' | 'ready'
export type Slot = 'outfit' | 'accessory' | 'vehicle' | 'office' | 'bodyMod'
export type RankId =
  | 'receptionist'
  | 'junior'
  | 'buyerAgent'
  | 'sellerAgent'
  | 'topProducer'
export type LogKind = 'money' | 'event' | 'deal' | 'flavor' | 'promotion'
```

- [ ] **Step 2: Extend `RankDef`, `Archetype`, `SwagItem` and add `Channel`**

In `src/state/types.ts`, replace the `RankDef` interface (lines 13-20) with:

```ts
export interface RankDef {
  id: RankId
  n: number
  name: string
  split: number
  /** `rep` is Phase 2's Top Producer gate; absent means "no rep requirement". */
  req: { earnings: number; showings: number; deals: number; rep?: number }
  blurb: string
}
```

In the `Archetype` interface, add after the `ghostChance` line:

```ts
  /** Reputation required before this archetype enters the lead pool. */
  unlockRep?: number
```

In the `SwagItem` interface, change `tier: 1 | 2 | 3` to:

```ts
  tier: 1 | 2 | 3 | 4
```

Then add a new interface immediately after `SlotDef` (after line 59):

```ts
export interface Channel {
  id: string
  name: string
  weeklyCost: number
  /** Probability of producing an inbound lead each End Week. */
  inboundChance: number
  /** Archetype ids this channel skews toward. Empty means "no skew". */
  leadPool: string[]
  repPerWeek: number
  unlockRank: RankId
  unlockRep: number
  flavor: string
}

export interface RepThreshold {
  rep: number
  /** Shown in the toast when the player crosses it. */
  toast: string
}

export interface OutfitPreset {
  name: string
  equipped: Partial<Record<Slot, string>>
}
```

- [ ] **Step 3: Extend `EventId`, `Lead`, `WeekSummary`, and add `PendingChoice`**

In `src/state/types.ts`, replace the `EventId` union (lines 61-72) with:

```ts
export type EventId =
  | 'ghosted'
  | 'lockbox'
  | 'poached'
  | 'referral'
  | 'hotMarket'
  | 'rateSpike'
  | 'lostPaperwork'
  | 'openHouseDisaster'
  | 'fiveStarReview'
  | 'cringeEvent'
  | 'viralSuccess'
  | 'badReview'
  | 'vrboSpam'
  | 'tvInterview'
  | 'algorithmChange'
  | 'copycatAgent'
  | 'charityGala'

/** The events that pause End Week for a player decision. */
export type ChoiceEventId =
  | 'vrboSpam'
  | 'tvInterview'
  | 'copycatAgent'
  | 'charityGala'

export interface PendingChoice {
  id: ChoiceEventId
  title: string
  body: string
  /** Rendered left-to-right. `key` is echoed back in RESOLVE_CHOICE_EVENT. */
  options: { key: string; label: string; hint: string }[]
}
```

In the `Lead` interface, add after the `referralBonus` line:

```ts
  /** Set when the lead arrived via a marketing channel — drives the badge. */
  channelId?: string
```

In the `WeekSummary` interface, add after the `events` line:

```ts
  marketing: {
    spend: number
    leads: number
    repChange: number
  }
```

- [ ] **Step 4: Extend `GameState` and `Action`**

In `src/state/types.ts`, replace the `permBonuses` line inside `GameState` with:

```ts
  permBonuses: { hustle: number; swagger: number; ego: number }
```

Change `version: 1` to `version: 2`, and add these fields immediately after `promo: string | null`:

```ts
  /** 0–100, clamped. */
  reputation: number
  activeChannelIds: string[]
  outfitPresets: OutfitPreset[]
  gagCounters: { vrboOffers: number; nextVrboWeek: number }
  /** channelId → the week number at which it starts producing again. */
  channelMuteUntil: Record<string, number>
  /** Transient-ish: survives a save so a mid-decision refresh isn't lost. */
  pendingChoice: PendingChoice | null
```

Replace the `Action` union (lines 162-172) with:

```ts
export type Action =
  | { type: 'WORK_PHONES' }
  | { type: 'ASSIST_SHOWING' }
  | { type: 'RUN_SHOWING'; leadId: string }
  | { type: 'ATTEMPT_CLOSE'; leadId: string }
  | { type: 'SIDE_HUSTLE' }
  | { type: 'BUY_SWAG'; itemId: string }
  | { type: 'EQUIP_SWAG'; itemId: string }
  | { type: 'TOGGLE_CHANNEL'; channelId: string }
  | { type: 'SAVE_PRESET'; index: number; name: string }
  | { type: 'LOAD_PRESET'; index: number }
  | { type: 'RENAME_PRESET'; index: number; name: string }
  | { type: 'RESOLVE_CHOICE_EVENT'; key: string }
  | { type: 'END_WEEK' }
  | { type: 'IMPORT_SAVE'; state: GameState }
  | { type: 'RESTART' }
```

- [ ] **Step 5: Patch `initialState()` so it type-checks**

In `src/state/reducer.ts`, replace `version: 1,` (line 30) with `version: 2,`, replace `permBonuses: { hustle: 0, swagger: 0 },` (line 37) with:

```ts
    permBonuses: { hustle: 0, swagger: 0, ego: 0 },
```

and replace `promo: null,` (line 52) with:

```ts
    promo: null,
    reputation: 0,
    activeChannelIds: [],
    outfitPresets: [],
    gagCounters: { vrboOffers: 0, nextVrboWeek: 0 },
    channelMuteUntil: {},
    pendingChoice: null,
```

Also, in `endWeek`, the `summary` object literal (line 406) now needs the new field. Replace `events,` inside the `const summary: WeekSummary = {` literal with:

```ts
    events,
    marketing: { spend: 0, leads: 0, repChange: 0 },
```

(Task 8 replaces those zeros with real numbers.)

- [ ] **Step 6: Patch `save.ts` version checks**

In `src/state/save.ts`, change line 21 from `if (!s || s.version !== 1) return null` to:

```ts
    if (!s || (s.version !== 1 && s.version !== 2)) return null
```

and line 39 from `if (parsed && parsed.version === 1) return parsed as GameState` to:

```ts
  if (parsed && (parsed.version === 1 || parsed.version === 2))
    return parsed as GameState
```

Task 3 replaces both with a real `migrate()` call.

- [ ] **Step 7: Type-check**

```bash
npx tsc -b --noEmit
```

Expected: no errors. If `RANKS` complains about a missing `topProducer` member of `RankId`, that is expected only if `RankDef[]` were exhaustive — it is not (it's an array), so there should be no error. `BRAG_TEMPLATES` in `src/data/brags.ts` **is** a `Record<RankId, string[]>` and **will** error with "Property 'topProducer' is missing". Fix it now by adding a placeholder key at the end of the record (Task 12 fills it with real copy):

```ts
  topProducer: [
    '🏆 Top Producer. I did not become this. I revealed this. 🙏 #blessed',
  ],
```

- [ ] **Step 8: Run the build and tests**

```bash
npm run build && npm test
```

Expected: build succeeds, 2 tests pass.

- [ ] **Step 9: Commit**

```bash
git add src/state/types.ts src/state/reducer.ts src/state/save.ts src/data/brags.ts
git commit -m "feat: widen game state to v2 type surface"
```

---

## Task 3: v1 → v2 save migration

**Files:**
- Create: `src/state/migrate.ts`
- Create: `src/state/__tests__/migrate.test.ts`
- Modify: `src/state/save.ts`

- [ ] **Step 1: Write the failing test**

Create `src/state/__tests__/migrate.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { migrate } from '../migrate'

/** A realistic mid-game Phase 1 save: no v2 fields anywhere. */
const V1_SAVE = {
  version: 1,
  week: 22,
  cash: 41250,
  careerEarnings: 88300,
  ap: 3,
  rank: 'sellerAgent',
  stats: { hustle: 5, swagger: 7, ego: 6 },
  permBonuses: { hustle: 1, swagger: 2 },
  leads: [
    {
      id: 'Labc',
      archetypeId: 'luxLorenzo',
      clientName: 'Dana Vandermolen',
      stage: 'ready',
      salePrice: 615000,
      patience: 3,
      maxPatience: 5,
      retriedClose: false,
      createdWeek: 20,
      intro: 'x',
      referralBonus: false,
    },
  ],
  ownedSwagIds: ['discountSuit', 'gasSunnies'],
  equipped: { outfit: 'discountSuit' },
  counters: { showingsRun: 40, dealsClosed: 11, leadsLost: 9 },
  activeModifiers: [],
  log: [{ week: 21, text: 'something happened', kind: 'event' }],
  gameOver: false,
}

describe('migrate', () => {
  it('preserves every v1 field', () => {
    const s = migrate(V1_SAVE)
    expect(s.week).toBe(22)
    expect(s.cash).toBe(41250)
    expect(s.careerEarnings).toBe(88300)
    expect(s.rank).toBe('sellerAgent')
    expect(s.leads).toHaveLength(1)
    expect(s.leads[0].clientName).toBe('Dana Vandermolen')
    expect(s.ownedSwagIds).toEqual(['discountSuit', 'gasSunnies'])
    expect(s.equipped.outfit).toBe('discountSuit')
    expect(s.counters.dealsClosed).toBe(11)
    expect(s.log).toHaveLength(1)
  })

  it('fills every new v2 field with a default', () => {
    const s = migrate(V1_SAVE)
    expect(s.version).toBe(2)
    expect(s.reputation).toBe(0)
    expect(s.activeChannelIds).toEqual([])
    expect(s.outfitPresets).toEqual([])
    expect(s.gagCounters.vrboOffers).toBe(0)
    expect(s.channelMuteUntil).toEqual({})
    expect(s.pendingChoice).toBeNull()
    expect(s.permBonuses.ego).toBe(0)
  })

  it('keeps v1 permBonuses values while adding ego', () => {
    const s = migrate(V1_SAVE)
    expect(s.permBonuses.hustle).toBe(1)
    expect(s.permBonuses.swagger).toBe(2)
  })

  it('leaves an already-v2 save alone', () => {
    const v2 = migrate(V1_SAVE)
    v2.reputation = 64
    v2.activeChannelIds = ['billboard']
    const again = migrate(v2)
    expect(again.reputation).toBe(64)
    expect(again.activeChannelIds).toEqual(['billboard'])
  })

  it('rejects a non-save', () => {
    expect(migrate({ hello: 'world' })).toBeNull()
    expect(migrate(null)).toBeNull()
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

```bash
npm test -- migrate
```

Expected: FAIL — `Failed to resolve import "../migrate"`.

- [ ] **Step 3: Write `src/state/migrate.ts`**

```ts
/* v1 → v2 save migration. The localStorage key never changes (`res_save_v1`);
   only `GameState.version` moves. Every field added in Phase 2 gets a default
   here, so a Phase 1 player who refreshes mid-game lands in v2 with their
   progress intact and nothing to re-earn. */

import { initialState } from './reducer'
import type { GameState } from './types'

interface AnySave {
  version?: number
  permBonuses?: { hustle?: number; swagger?: number; ego?: number }
  [k: string]: unknown
}

/** Returns a fully-populated v2 state, or null if `raw` isn't one of ours. */
export function migrate(raw: unknown): GameState | null {
  if (!raw || typeof raw !== 'object') return null
  const s = raw as AnySave
  if (s.version !== 1 && s.version !== 2) return null

  const base = initialState()
  const merged = { ...base, ...s } as GameState

  return {
    ...merged,
    version: 2,
    permBonuses: {
      hustle: s.permBonuses?.hustle ?? 0,
      swagger: s.permBonuses?.swagger ?? 0,
      ego: s.permBonuses?.ego ?? 0,
    },
    reputation: typeof s.reputation === 'number' ? s.reputation : 0,
    activeChannelIds: Array.isArray(s.activeChannelIds)
      ? (s.activeChannelIds as string[])
      : [],
    outfitPresets: Array.isArray(s.outfitPresets)
      ? (s.outfitPresets as GameState['outfitPresets'])
      : [],
    gagCounters: {
      vrboOffers:
        (s.gagCounters as { vrboOffers?: number } | undefined)?.vrboOffers ?? 0,
      nextVrboWeek:
        (s.gagCounters as { nextVrboWeek?: number } | undefined)
          ?.nextVrboWeek ?? 0,
    },
    channelMuteUntil:
      s.channelMuteUntil && typeof s.channelMuteUntil === 'object'
        ? (s.channelMuteUntil as Record<string, number>)
        : {},
    pendingChoice:
      (s.pendingChoice as GameState['pendingChoice'] | undefined) ?? null,
    /* transient UI fields never come back from disk */
    summary: null,
    promo: null,
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
npm test -- migrate
```

Expected: 5 passed.

- [ ] **Step 5: Route `save.ts` through `migrate`**

Replace the whole body of `loadSave` and `parseImport` in `src/state/save.ts`:

```ts
export function loadSave(): GameState | null {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY)
    if (!raw) return null
    return migrate(JSON.parse(raw))
  } catch {
    return null
  }
}
```

```ts
/** Returns the parsed save, or null if the paste isn't one. */
export function parseImport(text: string): GameState | null {
  return migrate(JSON.parse(text))
}
```

Add the import at the top of the file, after the `initialState` import:

```ts
import { migrate } from './migrate'
```

The `initialState` import is now unused in `save.ts` — delete that line.

- [ ] **Step 6: Verify build and full suite**

```bash
npm run build && npm test
```

Expected: build succeeds; 7 tests pass.

- [ ] **Step 7: Commit**

```bash
git add src/state/migrate.ts src/state/__tests__/migrate.test.ts src/state/save.ts
git commit -m "feat: migrate v1 saves to game state v2"
```

---

## Task 4: Reputation core (clamp, thresholds, ego perm bonus)

**Files:**
- Create: `src/data/reputation.ts`
- Create: `src/logic/__tests__/reputation.test.ts`
- Modify: `src/logic/economy.ts`

- [ ] **Step 1: Write the failing test**

Create `src/logic/__tests__/reputation.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { REP_THRESHOLDS } from '../../data/reputation'
import { initialState } from '../../state/reducer'
import { clampRep, crossedThresholds, deriveStats, repUnlocked } from '../economy'

describe('reputation', () => {
  it('clamps to 0..100', () => {
    expect(clampRep(-5)).toBe(0)
    expect(clampRep(140)).toBe(100)
    expect(clampRep(42)).toBe(42)
  })

  it('reports which thresholds are unlocked', () => {
    expect(repUnlocked(14, 15)).toBe(false)
    expect(repUnlocked(15, 15)).toBe(true)
    expect(repUnlocked(99, 90)).toBe(true)
  })

  it('lists thresholds crossed between two rep values', () => {
    const crossed = crossedThresholds(28, 52)
    expect(crossed.map((t) => t.rep)).toEqual([30, 50])
    expect(crossedThresholds(52, 28)).toEqual([])
    expect(crossedThresholds(50, 50)).toEqual([])
  })

  it('exposes all five thresholds in ascending order', () => {
    expect(REP_THRESHOLDS.map((t) => t.rep)).toEqual([15, 30, 50, 75, 90])
  })

  it('folds permBonuses.ego into derived stats', () => {
    const s = initialState()
    expect(deriveStats(s).ego).toBe(0)
    const withEgo = { ...s, permBonuses: { hustle: 0, swagger: 0, ego: 3 } }
    expect(deriveStats(withEgo).ego).toBe(3)
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

```bash
npm test -- reputation
```

Expected: FAIL — cannot resolve `../../data/reputation`.

- [ ] **Step 3: Create `src/data/reputation.ts`**

```ts
import type { RepThreshold } from '../state/types'

export const REP_MIN = 0
export const REP_MAX = 100

/** Rep lost each week the player has no marketing running at all. */
export const REP_DECAY_PER_WEEK = 1
/** Rep earned per closed deal. */
export const REP_PER_DEAL = 1
/** Rep lost by a cringe event once the player is famous enough to be noticed. */
export const REP_CRINGE_PENALTY = 5
/** Rep at or above which cringe events start costing reputation. */
export const REP_CRINGE_SCALES_AT = 50

/* The single source of truth for every rep gate. Logic reads these constants
   by name; nothing hardcodes a number at a call site. */
export const REP_INBOUND_AT = 15
export const REP_MIDTIER_CLIENTS_AT = 30
export const REP_TV_AND_OTIS_AT = 50
export const REP_CELEBRITY_AT = 75
export const REP_FREE_LEAD_AT = 90

export const REP_THRESHOLDS: RepThreshold[] = [
  {
    rep: REP_INBOUND_AT,
    toast:
      "You've been recognized at a gas station. The phone starts ringing on its own now.",
  },
  {
    rep: REP_MIDTIER_CLIENTS_AT,
    toast:
      'A stranger said “I know you from somewhere” and meant it kindly. Better clients are circling.',
  },
  {
    rep: REP_TV_AND_OTIS_AT,
    toast:
      'A local producer has your number. So does a man who whispers about money.',
  },
  {
    rep: REP_CELEBRITY_AT,
    toast:
      'Someone asked for a selfie and did not ask what you do first. Verified.',
  },
  {
    rep: REP_FREE_LEAD_AT,
    toast: 'Your face IS the marketing now. People just show up.',
  },
]
```

- [ ] **Step 4: Add the helpers to `src/logic/economy.ts`**

Add to the imports at the top:

```ts
import {
  REP_MAX,
  REP_MIN,
  REP_THRESHOLDS,
} from '../data/reputation'
import type { RepThreshold } from '../state/types'
```

(merge `RepThreshold` into the existing `import type { GameState, RankDef, ... }` line rather than adding a second type import).

Then add these exports after `isEgoDangerous` (line 53):

```ts
export const clampRep = (n: number): number =>
  Math.max(REP_MIN, Math.min(REP_MAX, Math.round(n)))

/** True once reputation has reached `at`. Every rep gate goes through this. */
export const repUnlocked = (reputation: number, at: number): boolean =>
  reputation >= at

/** Thresholds strictly above `from` and at-or-below `to`. Empty when rep fell. */
export function crossedThresholds(from: number, to: number): RepThreshold[] {
  if (to <= from) return []
  return REP_THRESHOLDS.filter((t) => t.rep > from && t.rep <= to)
}
```

- [ ] **Step 5: Fold `permBonuses.ego` into `deriveStats`**

In `src/logic/economy.ts`, in `deriveStats`, replace:

```ts
  hustle += state.permBonuses.hustle
  swagger += state.permBonuses.swagger
```

with:

```ts
  hustle += state.permBonuses.hustle
  swagger += state.permBonuses.swagger
  ego += state.permBonuses.ego
```

- [ ] **Step 6: Run the tests**

```bash
npm test -- reputation
```

Expected: 5 passed.

- [ ] **Step 7: Commit**

```bash
git add src/data/reputation.ts src/logic/economy.ts src/logic/__tests__/reputation.test.ts
git commit -m "feat: reputation clamp, thresholds, and permanent ego bonus"
```

---

## Task 5: Rank 5 — Top Producer

**Files:**
- Modify: `src/data/ranks.ts`
- Modify: `src/logic/economy.ts` (`nextRank`)
- Create: `src/logic/__tests__/ranks.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/logic/__tests__/ranks.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { LOCKED_RANKS, RANKS } from '../../data/ranks'
import { initialState } from '../../state/reducer'
import { commissionFor, nextRank } from '../economy'
import type { GameState } from '../../state/types'

function sellerAgentAt(over: Partial<GameState>): GameState {
  return {
    ...initialState(),
    rank: 'sellerAgent',
    careerEarnings: 250000,
    counters: { showingsRun: 60, dealsClosed: 25, leadsLost: 0 },
    reputation: 40,
    ...over,
  }
}

describe('Top Producer', () => {
  it('is the fifth rank and pays a 60% split', () => {
    expect(RANKS).toHaveLength(5)
    expect(RANKS[4].id).toBe('topProducer')
    expect(RANKS[4].split).toBe(0.6)
  })

  it('is no longer in the locked list', () => {
    expect(LOCKED_RANKS).toEqual([
      'Team Lead',
      'Managing Broker',
      'Brokerage Owner',
      'Empire Owner',
    ])
  })

  it('promotes when earnings, deals, and rep are all met', () => {
    expect(nextRank(sellerAgentAt({}))?.id).toBe('topProducer')
  })

  it('withholds promotion when reputation is short', () => {
    expect(nextRank(sellerAgentAt({ reputation: 39 }))).toBeNull()
  })

  it('withholds promotion when deals are short', () => {
    const s = sellerAgentAt({})
    s.counters = { ...s.counters, dealsClosed: 24 }
    expect(nextRank(s)).toBeNull()
  })

  it('withholds promotion when earnings are short', () => {
    expect(nextRank(sellerAgentAt({ careerEarnings: 249999 }))).toBeNull()
  })

  it('pays 60% of gross commission at Top Producer', () => {
    // 2.5% of 900,000 = 22,500 gross; 60% = 13,500
    expect(commissionFor(900000, 'topProducer')).toEqual({
      gross: 22500,
      earnings: 13500,
    })
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

```bash
npm test -- ranks
```

Expected: FAIL — `RANKS` has length 4.

- [ ] **Step 3: Add the rank**

In `src/data/ranks.ts`, add a fifth entry to `RANKS` after the `sellerAgent` object:

```ts
  {
    id: 'topProducer',
    n: 5,
    name: 'Top Producer',
    split: 0.6,
    req: { earnings: 250000, showings: 0, deals: 25, rep: 40 },
    blurb: 'Luxury listings, a TV spot, and a body you paid cash for.',
  },
```

Replace `LOCKED_RANKS` with:

```ts
/** Ranks 6–9. Rendered greyed out on the track; nothing is built behind them. */
export const LOCKED_RANKS: string[] = [
  'Team Lead',
  'Managing Broker',
  'Brokerage Owner',
  'Empire Owner',
]
```

- [ ] **Step 4: Teach `nextRank` about the rep requirement**

In `src/logic/economy.ts`, replace the `ok` expression inside `nextRank`:

```ts
  const ok =
    state.careerEarnings >= r.earnings &&
    state.counters.showingsRun >= r.showings &&
    state.counters.dealsClosed >= r.deals &&
    state.reputation >= (r.rep ?? 0)
```

- [ ] **Step 5: Run the tests**

```bash
npm test -- ranks
```

Expected: 7 passed.

- [ ] **Step 6: Commit**

```bash
git add src/data/ranks.ts src/logic/economy.ts src/logic/__tests__/ranks.test.ts
git commit -m "feat: add Top Producer rank with reputation requirement"
```

---

## Task 6: New client archetypes and rep-gated lead pool

`legalArchetypes` currently takes a `RankId`. Rep gating needs the whole state, so its signature changes to `legalArchetypes(state: GameState)`. `makeLead` is the only caller.

**Files:**
- Modify: `src/data/archetypes.ts`
- Modify: `src/logic/leads.ts`
- Create: `src/logic/__tests__/leads.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/logic/__tests__/leads.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { ARCHETYPES } from '../../data/archetypes'
import { initialState } from '../../state/reducer'
import { arch, closeChance, legalArchetypes, makeLead } from '../leads'
import { setSeed } from '../rand'
import type { GameState, Lead } from '../../state/types'

function stateAt(rank: GameState['rank'], reputation: number): GameState {
  return { ...initialState(), rank, reputation }
}
const ids = (s: GameState) => legalArchetypes(s).map((a) => a.id)

describe('new archetypes', () => {
  it('defines all four with their rep gates', () => {
    expect(arch('techTyler').unlockRep).toBe(30)
    expect(arch('hgtvCouple').unlockRep).toBe(30)
    expect(arch('oldMoneyOtis').unlockRep).toBe(50)
    expect(arch('celebrityCleo').unlockRep).toBe(75)
  })

  it('gives Otis a negative ego affinity and Cleo a strong positive one', () => {
    expect(arch('oldMoneyOtis').egoAffinity).toBe(-3)
    expect(arch('celebrityCleo').egoAffinity).toBe(4)
  })

  it('brings the roster to fourteen', () => {
    expect(ARCHETYPES).toHaveLength(14)
  })
})

describe('legalArchetypes', () => {
  it('hides rep-gated archetypes below their threshold', () => {
    expect(ids(stateAt('sellerAgent', 0))).not.toContain('techTyler')
    expect(ids(stateAt('sellerAgent', 29))).not.toContain('hgtvCouple')
    expect(ids(stateAt('sellerAgent', 49))).not.toContain('oldMoneyOtis')
    expect(ids(stateAt('sellerAgent', 74))).not.toContain('celebrityCleo')
  })

  it('reveals each archetype exactly at its threshold', () => {
    expect(ids(stateAt('sellerAgent', 30))).toContain('techTyler')
    expect(ids(stateAt('sellerAgent', 30))).toContain('hgtvCouple')
    expect(ids(stateAt('sellerAgent', 50))).toContain('oldMoneyOtis')
    expect(ids(stateAt('sellerAgent', 75))).toContain('celebrityCleo')
  })

  it('still gates seller-band clients behind the seller ranks', () => {
    expect(ids(stateAt('buyerAgent', 100))).not.toContain('oldMoneyOtis')
    expect(ids(stateAt('buyerAgent', 100))).toContain('techTyler')
    expect(ids(stateAt('topProducer', 100))).toContain('celebrityCleo')
  })
})

describe('makeLead', () => {
  it('tags a lead with the channel that produced it', () => {
    setSeed(11)
    const l = makeLead(stateAt('sellerAgent', 0), arch('firstTimer'), 'billboard')
    expect(l.channelId).toBe('billboard')
    expect(l.archetypeId).toBe('firstTimer')
    setSeed(null)
  })

  it('leaves channelId undefined for cold-call leads', () => {
    setSeed(12)
    expect(makeLead(stateAt('buyerAgent', 0)).channelId).toBeUndefined()
    setSeed(null)
  })
})

describe('closeChance and ego affinity', () => {
  const otisLead = (): Lead => ({
    id: 'L1',
    archetypeId: 'oldMoneyOtis',
    clientName: 'Otis Whitcombe',
    stage: 'ready',
    salePrice: 800000,
    patience: 5,
    maxPatience: 5,
    retriedClose: false,
    createdWeek: 1,
    intro: 'x',
    referralBonus: false,
  })

  it('punishes a high-ego loadout and rewards a quiet one', () => {
    const quiet: GameState = {
      ...stateAt('sellerAgent', 60),
      permBonuses: { hustle: 0, swagger: 6, ego: 0 },
    }
    const loud: GameState = {
      ...stateAt('sellerAgent', 60),
      permBonuses: { hustle: 0, swagger: 6, ego: 12 },
    }
    expect(closeChance(quiet, otisLead())).toBeGreaterThan(
      closeChance(loud, otisLead()),
    )
    expect(closeChance(loud, otisLead())).toBeLessThan(0.35)
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

```bash
npm test -- leads
```

Expected: FAIL — `arch('techTyler')` is undefined.

- [ ] **Step 3: Add the four archetypes**

Append these to the `ARCHETYPES` array in `src/data/archetypes.ts`, before the closing `]`:

```ts
  {
    id: 'techTyler',
    label: 'Tech Bro Tyler',
    surnames: ['Brennick', 'Aoyagi', 'Cordero', 'Whitfield'],
    rankBand: 'buyer',
    price: [500000, 700000],
    patience: 3,
    closeMod: 0.1,
    egoAffinity: 2,
    ghostChance: 0.1,
    unlockRep: 30,
    intros: [
      '“I want a smart home.” He means one lightbulb. He has brought the lightbulb.',
      'He offers to pay partly in equity in a company that makes an app for cold plunges.',
      'He asks whether the house has “good latency.” You say yes. He nods for a long time.',
    ],
    ghosts: [
      'went heads-down on a launch and has not surfaced since.',
      'moved to a city with better founders and worse weather.',
      'decided renting is “capital efficient” and posted a thread about it.',
    ],
    successes: [
      'signed on a tablet, in a hoodie, in eleven seconds.',
      'closed and immediately asked if you take referral fees in tokens.',
      'wired the funds from an airport lounge between two flights.',
    ],
  },
  {
    id: 'hgtvCouple',
    label: 'The HGTV Couple',
    surnames: ['Delacroix', 'Bonham', 'Pryce', 'Sandoval'],
    rankBand: 'buyer',
    price: [350000, 550000],
    patience: 6,
    closeMod: 0.05,
    egoAffinity: 0,
    ghostChance: 0.05,
    unlockRep: 30,
    intros: [
      'They say “open concept” eleven times before reaching the kitchen. You counted.',
      'One of them loves it. The other needs to “see other options.” Always the same one.',
      'They ask if the wall is load-bearing. It is. They ask again, more hopefully.',
    ],
    ghosts: [
      'found a place with better light and a worse commute, and chose the light.',
      'is “taking a beat” after seeing a backsplash they cannot stop thinking about.',
      'went back to watching other people buy houses instead.',
    ],
    successes: [
      'high-fived over an island they intend to demolish immediately.',
      'signed the moment they were told the wall could, in fact, come down.',
      'cried at the counter-offer and then again at the countertop.',
    ],
  },
  {
    id: 'oldMoneyOtis',
    label: 'Old Money Otis',
    surnames: ['Whitcombe', 'Ashgrove', 'Pennhaligan', 'Vail'],
    rankBand: 'seller',
    price: [700000, 1100000],
    patience: 5,
    closeMod: 0.05,
    egoAffinity: -3,
    ghostChance: 0,
    unlockRep: 50,
    intros: [
      'He whispers. Everything he says is important and none of it is loud.',
      'He glances once at your watch and does not glance again.',
      'He asks that the sign be small, wooden, and removed by Sunday.',
    ],
    ghosts: [
      'has decided to keep the house in the family another generation.',
      'stopped returning calls the week the billboard went up.',
      'sold privately, to a neighbour, over a very quiet lunch.',
    ],
    successes: [
      'signed with a fountain pen and thanked you for your discretion.',
      'shook your hand once, firmly, and considered the matter concluded.',
      'closed without a single photograph being taken of anything.',
    ],
  },
  {
    id: 'celebrityCleo',
    label: 'Celebrity Cleo',
    surnames: ['Marchetti', 'Vance', 'Okonkwo', 'Sinclair'],
    rankBand: 'seller',
    price: [900000, 1400000],
    patience: 3,
    closeMod: -0.1,
    egoAffinity: 4,
    ghostChance: 0.2,
    unlockRep: 75,
    intros: [
      'Her assistant sends an NDA for the open house. Then an NDA for the NDA.',
      'She arrives with an entourage of nine and introduces four of them by job title.',
      'She wants the listing photos shot “like a perfume ad, but for a driveway.”',
    ],
    ghosts: [
      'is unreachable. Her publicist confirms she is unreachable and always was.',
      'left for a shoot and the entourage left with her.',
      'posted about a different house, in a different city, with a different agent.',
    ],
    successes: [
      'signed at midnight, on a hood, under a ring light somebody brought.',
      'closed and thanked you in a story that reached four hundred thousand people.',
      'sold above asking to a buyer who mostly wanted the address.',
    ],
  },
```

- [ ] **Step 4: Rewrite `legalArchetypes` and `makeLead`**

In `src/logic/leads.ts`, replace `legalArchetypes` (lines 9-13) with:

```ts
/** Seller-band clients need a listing licence; some clients need fame. */
export function legalArchetypes(state: GameState): Archetype[] {
  const canList = atLeastRank(state.rank, 'sellerAgent')
  return ARCHETYPES.filter(
    (a) =>
      (a.rankBand === 'seller' ? canList : true) &&
      state.reputation >= (a.unlockRep ?? 0),
  )
}
```

Replace the `makeLead` signature and body (lines 19-35) with:

```ts
export function makeLead(
  state: GameState,
  forcedArch?: Archetype,
  channelId?: string,
): Lead {
  const a = forcedArch || pick(legalArchetypes(state))
  const raw = randInt(a.price[0], a.price[1])
  return {
    id: 'L' + Date.now().toString(36) + Math.floor(rand() * 1e6).toString(36),
    archetypeId: a.id,
    clientName: makeName(a),
    stage: 'new',
    salePrice: Math.round(raw / 5000) * 5000,
    patience: a.patience,
    maxPatience: a.patience,
    retriedClose: false,
    createdWeek: state.week,
    intro: pick(a.intros),
    referralBonus: false,
    ...(channelId ? { channelId } : {}),
  }
}
```

Update the imports at the top of `src/logic/leads.ts`: change

```ts
import type { Archetype, GameState, Lead, RankId, Stage } from '../state/types'
import { activeModifierDelta, deriveStats } from './economy'
```

to

```ts
import type { Archetype, GameState, Lead, Stage } from '../state/types'
import { activeModifierDelta, atLeastRank, deriveStats } from './economy'
```

- [ ] **Step 5: Type-check and run the tests**

```bash
npx tsc -b --noEmit && npm test -- leads
```

Expected: no type errors; 8 tests pass. If `tsc` flags an unused `RankId` import, remove it.

- [ ] **Step 6: Commit**

```bash
git add src/data/archetypes.ts src/logic/leads.ts src/logic/__tests__/leads.test.ts
git commit -m "feat: add four reputation-gated client archetypes"
```

---

## Task 7: Marketing data and pure logic

**Files:**
- Create: `src/data/marketing.ts`
- Create: `src/logic/marketing.ts`
- Create: `src/logic/__tests__/marketing.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/logic/__tests__/marketing.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { CHANNELS, TIKTOK_GHOST_RATE } from '../../data/marketing'
import { initialState } from '../../state/reducer'
import {
  activeChannels,
  channelOf,
  isChannelLocked,
  isChannelMuted,
  rollInbound,
  weeklyChannelRep,
  weeklyChannelSpend,
} from '../marketing'
import { setSeed } from '../rand'
import type { GameState } from '../../state/types'

const at = (over: Partial<GameState> = {}): GameState => ({
  ...initialState(),
  rank: 'topProducer',
  reputation: 80,
  ...over,
})

describe('channel data', () => {
  it('defines all nine channels', () => {
    expect(CHANNELS.map((c) => c.id)).toEqual([
      'flyerBlitz',
      'facebookAds',
      'instagram',
      'tiktok',
      'newspaperColumn',
      'communitySponsorship',
      'benchDomination',
      'billboard',
      'tvCommercial',
    ])
  })

  it('totals roughly $5,400/wk and +17 rep/wk with everything on', () => {
    expect(CHANNELS.reduce((t, c) => t + c.weeklyCost, 0)).toBe(5400)
    expect(CHANNELS.reduce((t, c) => t + c.repPerWeek, 0)).toBe(17)
  })
})

describe('locking', () => {
  it('locks the billboard below rep 30', () => {
    expect(
      isChannelLocked(channelOf('billboard')!, at({ reputation: 29, rank: 'sellerAgent' })),
    ).toBe(true)
    expect(
      isChannelLocked(channelOf('billboard')!, at({ reputation: 30, rank: 'sellerAgent' })),
    ).toBe(false)
  })

  it('locks the TV commercial below Top Producer', () => {
    expect(
      isChannelLocked(channelOf('tvCommercial')!, at({ rank: 'sellerAgent' })),
    ).toBe(true)
    expect(isChannelLocked(channelOf('tvCommercial')!, at())).toBe(false)
  })

  it('locks seller-rank channels for a buyer agent', () => {
    expect(
      isChannelLocked(channelOf('benchDomination')!, at({ rank: 'buyerAgent' })),
    ).toBe(true)
    expect(isChannelLocked(channelOf('flyerBlitz')!, at({ rank: 'buyerAgent' }))).toBe(
      false,
    )
  })
})

describe('weekly totals', () => {
  const s = at({ activeChannelIds: ['flyerBlitz', 'billboard', 'tvCommercial'] })

  it('sums the spend of active channels only', () => {
    expect(weeklyChannelSpend(s)).toBe(100 + 1000 + 2500)
  })

  it('sums rep per week of active channels only', () => {
    expect(weeklyChannelRep(s)).toBe(0 + 3 + 5)
  })

  it('returns the active channel definitions in table order', () => {
    expect(activeChannels(s).map((c) => c.id)).toEqual([
      'flyerBlitz',
      'billboard',
      'tvCommercial',
    ])
  })
})

describe('muting', () => {
  it('treats a channel as muted until its mute week', () => {
    const s = at({ week: 10, channelMuteUntil: { tiktok: 12 } })
    expect(isChannelMuted(s, 'tiktok')).toBe(true)
    expect(isChannelMuted({ ...s, week: 12 }, 'tiktok')).toBe(false)
    expect(isChannelMuted(s, 'billboard')).toBe(false)
  })
})

describe('rollInbound', () => {
  it('produces nothing for a muted channel even at 100% chance', () => {
    const s = at({ week: 5, channelMuteUntil: { tiktok: 9 } })
    const forced = { ...channelOf('tiktok')!, inboundChance: 1 }
    setSeed(3)
    expect(rollInbound(s, forced)).toBeNull()
    setSeed(null)
  })

  it('always produces a lead at 100% chance, tagged with the channel', () => {
    setSeed(5)
    const forced = { ...channelOf('billboard')!, inboundChance: 1 }
    const lead = rollInbound(at(), forced)
    expect(lead).not.toBeNull()
    expect(lead!.channelId).toBe('billboard')
    setSeed(null)
  })

  it('never produces a lead at 0% chance', () => {
    setSeed(6)
    const forced = { ...channelOf('billboard')!, inboundChance: 0 }
    expect(rollInbound(at(), forced)).toBeNull()
    setSeed(null)
  })

  it('skews toward its lead pool most of the time', () => {
    setSeed(99)
    const forced = { ...channelOf('billboard')!, inboundChance: 1 }
    const s = at()
    let inPool = 0
    for (let i = 0; i < 200; i++) {
      const l = rollInbound(s, forced)!
      if (forced.leadPool.includes(l.archetypeId)) inPool++
    }
    setSeed(null)
    expect(inPool).toBeGreaterThan(100)
  })

  it('sends a share of TikTok leads to ghostGary', () => {
    setSeed(123)
    const forced = { ...channelOf('tiktok')!, inboundChance: 1 }
    const s = at()
    let gary = 0
    for (let i = 0; i < 400; i++) {
      if (rollInbound(s, forced)!.archetypeId === 'ghostGary') gary++
    }
    setSeed(null)
    expect(TIKTOK_GHOST_RATE).toBe(0.3)
    expect(gary).toBeGreaterThan(60)
    expect(gary).toBeLessThan(220)
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

```bash
npm test -- marketing
```

Expected: FAIL — cannot resolve `../../data/marketing`.

- [ ] **Step 3: Create `src/data/marketing.ts`**

```ts
import type { Channel } from '../state/types'

/** Share of TikTok's inbound leads that are, inevitably, Ghost Gary. */
export const TIKTOK_GHOST_RATE = 0.3
/** How often an inbound lead honours its channel's skew instead of rolling free. */
export const LEAD_POOL_SKEW = 0.7
/** Weeks TikTok goes quiet after an algorithm change. It still bills. */
export const ALGORITHM_MUTE_WEEKS = 2

export const CHANNELS: Channel[] = [
  {
    id: 'flyerBlitz',
    name: 'Flyer Blitz',
    weeklyCost: 100,
    inboundChance: 0.2,
    leadPool: ['firstTimer', 'lowballLarry', 'retireeRuth'],
    repPerWeek: 0,
    unlockRank: 'buyerAgent',
    unlockRep: 0,
    flavor: 'Windshields of the innocent.',
  },
  {
    id: 'facebookAds',
    name: 'Facebook Ads',
    weeklyCost: 250,
    inboundChance: 0.4,
    leadPool: ['firstTimer', 'retireeRuth'],
    repPerWeek: 1,
    unlockRank: 'buyerAgent',
    unlockRep: 0,
    flavor: 'Targeting: “people who exist near houses.”',
  },
  {
    id: 'instagram',
    name: 'Instagram',
    weeklyCost: 200,
    inboundChance: 0.3,
    leadPool: ['flipBro', 'influencerIzzy'],
    repPerWeek: 1,
    unlockRank: 'buyerAgent',
    unlockRep: 0,
    flavor: 'Golden-hour photos of doorknobs.',
  },
  {
    id: 'tiktok',
    name: 'TikTok',
    weeklyCost: 150,
    inboundChance: 0.5,
    leadPool: ['firstTimer', 'influencerIzzy', 'techTyler'],
    repPerWeek: 2,
    unlockRank: 'buyerAgent',
    unlockRep: 0,
    flavor: 'Dancing next to a FOR SALE sign.',
  },
  {
    id: 'newspaperColumn',
    name: 'Newspaper Column',
    weeklyCost: 300,
    inboundChance: 0.25,
    leadPool: ['retireeRuth', 'oldMoneyOtis'],
    repPerWeek: 1,
    unlockRank: 'sellerAgent',
    unlockRep: 0,
    flavor: '“Ask The House Guy.” You are The House Guy.',
  },
  {
    id: 'communitySponsorship',
    name: 'Community Sponsorship',
    weeklyCost: 400,
    inboundChance: 0.15,
    leadPool: [],
    repPerWeek: 2,
    unlockRank: 'sellerAgent',
    unlockRep: 0,
    flavor: 'Your logo on tiny jerseys. Nobody writes a bad review about a kid.',
  },
  {
    id: 'benchDomination',
    name: 'Bench Domination',
    weeklyCost: 500,
    inboundChance: 0.3,
    leadPool: [],
    repPerWeek: 2,
    unlockRank: 'sellerAgent',
    unlockRep: 0,
    flavor: 'Your face on EVERY bench. The city council has questions.',
  },
  {
    id: 'billboard',
    name: 'Billboard',
    weeklyCost: 1000,
    inboundChance: 0.35,
    leadPool: ['luxLorenzo', 'cashChad', 'oldMoneyOtis'],
    repPerWeek: 3,
    unlockRank: 'sellerAgent',
    unlockRep: 30,
    flavor: 'Forty feet of jawline over the highway.',
  },
  {
    id: 'tvCommercial',
    name: 'TV Commercial',
    weeklyCost: 2500,
    inboundChance: 0.45,
    leadPool: ['luxLorenzo', 'celebrityCleo', 'cashChad'],
    repPerWeek: 5,
    unlockRank: 'topProducer',
    unlockRep: 0,
    flavor: 'You point at the camera. A gold logo spins. A phone number sings.',
  },
]

/** Log lines keyed by channel id, used when an inbound lead arrives. */
export const INBOUND_LINES: Record<string, string> = {
  flyerBlitz:
    'A flyer survived a windshield wiper and a rainstorm and produced an actual human.',
  facebookAds:
    'Somebody clicked the ad on purpose. The algorithm has delivered a person.',
  instagram:
    'A doorknob photo did numbers. One of those numbers has a phone.',
  tiktok:
    'The dance worked. Against every instinct you have left, the dance worked.',
  newspaperColumn:
    'A reader wrote in to Ask The House Guy, then asked The House Guy to sell their house.',
  communitySponsorship:
    'A parent recognized your logo from a jersey and called before the game ended.',
  benchDomination:
    'Somebody sat on your face for forty minutes waiting for a bus and then called you.',
  billboard:
    'The billboard worked. Forty feet of jawline just delivered a lead.',
  tvCommercial:
    'The commercial aired at 2am between two mattress ads. The phone number sang. Someone sang back.',
}
```

- [ ] **Step 4: Create `src/logic/marketing.ts`**

```ts
/* Pure marketing math. Nothing here mutates state or logs — the reducer owns
   both. Every roll goes through logic/rand so a seeded run is reproducible. */

import { CHANNELS, LEAD_POOL_SKEW, TIKTOK_GHOST_RATE } from '../data/marketing'
import type { Channel, GameState, Lead } from '../state/types'
import { atLeastRank } from './economy'
import { arch, legalArchetypes, makeLead } from './leads'
import { chance, pick } from './rand'

export const channelOf = (id: string): Channel | undefined =>
  CHANNELS.find((c) => c.id === id)

export function isChannelLocked(channel: Channel, state: GameState): boolean {
  return (
    !atLeastRank(state.rank, channel.unlockRank) ||
    state.reputation < channel.unlockRep
  )
}

/** Active channels, in table order, regardless of how they got toggled on. */
export function activeChannels(state: GameState): Channel[] {
  return CHANNELS.filter((c) => state.activeChannelIds.includes(c.id))
}

export function weeklyChannelSpend(state: GameState): number {
  return activeChannels(state).reduce((t, c) => t + c.weeklyCost, 0)
}

export function weeklyChannelRep(state: GameState): number {
  return activeChannels(state).reduce((t, c) => t + c.repPerWeek, 0)
}

/** A muted channel still bills; it just stops producing. */
export function isChannelMuted(state: GameState, channelId: string): boolean {
  const until = state.channelMuteUntil[channelId]
  return typeof until === 'number' && state.week < until
}

/**
 * One inbound roll for one channel. Returns the lead, or null when the roll
 * misses, the channel is muted, or nothing legal is in the pool yet.
 */
export function rollInbound(state: GameState, channel: Channel): Lead | null {
  if (isChannelMuted(state, channel.id)) return null
  if (!chance(channel.inboundChance)) return null

  if (channel.id === 'tiktok' && chance(TIKTOK_GHOST_RATE))
    return makeLead(state, arch('ghostGary'), channel.id)

  const legal = legalArchetypes(state)
  if (!legal.length) return null
  const skewed = legal.filter((a) => channel.leadPool.includes(a.id))
  const from = skewed.length && chance(LEAD_POOL_SKEW) ? skewed : legal
  return makeLead(state, pick(from), channel.id)
}
```

- [ ] **Step 5: Run the tests**

```bash
npm test -- marketing
```

Expected: 13 passed.

- [ ] **Step 6: Commit**

```bash
git add src/data/marketing.ts src/logic/marketing.ts src/logic/__tests__/marketing.test.ts
git commit -m "feat: marketing channel data and inbound-lead logic"
```

---

## Task 8: Wire marketing and reputation into End Week

The new order of operations, replacing the Phase 1 list: archive sold → patience/ghosts → **marketing (billing, inbound, rep)** → **rep decay** → expenses → events → cringe → promotion → week rolls → lose check → summary.

**Files:**
- Modify: `src/state/reducer.ts`
- Create: `src/state/__tests__/endWeek.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/state/__tests__/endWeek.test.ts`:

```ts
import { afterEach, describe, expect, it } from 'vitest'
import { setSeed } from '../../logic/rand'
import { endWeek, initialState } from '../reducer'
import type { GameState } from '../types'

afterEach(() => setSeed(null))

const base = (over: Partial<GameState> = {}): GameState => ({
  ...initialState(),
  week: 10,
  rank: 'sellerAgent',
  cash: 50000,
  reputation: 40,
  ...over,
})

describe('End Week — marketing', () => {
  it('bills every active channel', () => {
    setSeed(1)
    const s = endWeek(base({ activeChannelIds: ['billboard', 'flyerBlitz'] }))
    expect(s.summary!.marketing.spend).toBe(1100)
    expect(s.summary!.moneyOut).toContainEqual(['Marketing', 1100])
  })

  it('bills nothing when no channel is active', () => {
    setSeed(2)
    const s = endWeek(base())
    expect(s.summary!.marketing.spend).toBe(0)
  })

  it('adds each active channel’s rep per week', () => {
    setSeed(3)
    // billboard +3, flyerBlitz +0, no decay because a channel is active
    const s = endWeek(base({ activeChannelIds: ['billboard', 'flyerBlitz'] }))
    expect(s.reputation).toBe(43)
    expect(s.summary!.marketing.repChange).toBe(3)
  })

  it('decays reputation by one when nothing is running', () => {
    setSeed(4)
    expect(endWeek(base({ reputation: 40 })).reputation).toBe(39)
  })

  it('never decays reputation below zero', () => {
    setSeed(5)
    expect(endWeek(base({ reputation: 0 })).reputation).toBe(0)
  })

  it('never pushes reputation above one hundred', () => {
    setSeed(6)
    const s = endWeek(
      base({ reputation: 99, rank: 'topProducer', activeChannelIds: ['tvCommercial'] }),
    )
    expect(s.reputation).toBe(100)
  })

  it('inbound leads cost no AP and carry a channel badge', () => {
    setSeed(21)
    let s = base({ activeChannelIds: ['facebookAds'], reputation: 40, leads: [] })
    let found = null
    for (let i = 0; i < 30 && !found; i++) {
      s = endWeek(s)
      found = s.leads.find((l) => l.channelId === 'facebookAds') ?? null
    }
    expect(found).not.toBeNull()
    expect(s.ap).toBe(5)
  })

  it('grants a guaranteed free lead at reputation 90', () => {
    setSeed(31)
    const before = base({ reputation: 90, leads: [] })
    const after = endWeek(before)
    expect(after.leads.length).toBeGreaterThanOrEqual(1)
  })

  it('records marketing lead count in the summary', () => {
    setSeed(41)
    const s = endWeek(base({ reputation: 90, leads: [] }))
    expect(s.summary!.marketing.leads).toBeGreaterThanOrEqual(1)
  })
})

describe('End Week — reputation from deals', () => {
  it('is unaffected by end week alone', () => {
    setSeed(51)
    expect(endWeek(base({ activeChannelIds: ['instagram'] })).reputation).toBe(41)
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

```bash
npm test -- endWeek
```

Expected: FAIL — `summary.marketing.spend` is 0, reputation unchanged.

- [ ] **Step 3: Add the marketing + rep block to `endWeek`**

In `src/state/reducer.ts`, add these imports at the top:

```ts
import {
  REP_DECAY_PER_WEEK,
  REP_FREE_LEAD_AT,
} from '../data/reputation'
import { INBOUND_LINES } from '../data/marketing'
import {
  activeChannels,
  rollInbound,
  weeklyChannelRep,
  weeklyChannelSpend,
} from '../logic/marketing'
```

and add `clampRep`, `crossedThresholds`, `repUnlocked` to the existing `from '../logic/economy'` import list.

Then, in `endWeek`, insert this block immediately after the `/* 1. patience + ghost rolls */` block ends (right after `s = { ...s, leads: survivors }`, before `/* 2. expenses */`):

```ts
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
    s = { ...s, reputation: clampRep(s.reputation - REP_DECAY_PER_WEEK) }
    if (s.reputation < repBefore)
      s = withLog(
        s,
        'flavor',
        'Nobody saw your face anywhere this week. Out of sight, out of mind, out of the group chat.',
      )
  }

  crossedThresholds(repBefore, s.reputation).forEach((t) => {
    s = withLog(s, 'event', t.toast)
  })
```

Also add `REP_INBOUND_AT` to the `'../data/reputation'` import list.

- [ ] **Step 4: Report marketing in the summary**

In `endWeek`, replace the placeholder line added in Task 2:

```ts
    marketing: { spend: 0, leads: 0, repChange: 0 },
```

with:

```ts
    marketing: {
      spend,
      leads: inboundCount,
      repChange: s.reputation - repBefore,
    },
```

- [ ] **Step 5: Award +1 reputation on every closed deal**

In `src/state/reducer.ts`, in the `ATTEMPT_CLOSE` success branch, replace:

```ts
        counters: { ...s.counters, dealsClosed: s.counters.dealsClosed + 1 },
      }
```

with:

```ts
        counters: { ...s.counters, dealsClosed: s.counters.dealsClosed + 1 },
        reputation: clampRep(s.reputation + REP_PER_DEAL),
      }
```

and add `REP_PER_DEAL` to the `'../data/reputation'` import list.

- [ ] **Step 6: Run the full suite**

```bash
npm test
```

Expected: all suites pass, including the 10 new End Week tests.

- [ ] **Step 7: Commit**

```bash
git add src/state/reducer.ts src/state/__tests__/endWeek.test.ts
git commit -m "feat: resolve marketing and reputation during End Week"
```

---

## Task 9: Channel toggling and outfit presets

**Files:**
- Modify: `src/state/reducer.ts`
- Create: `src/state/__tests__/reducerActions.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/state/__tests__/reducerActions.test.ts`:

```ts
import { afterEach, describe, expect, it } from 'vitest'
import { setSeed } from '../../logic/rand'
import { initialState, reducer } from '../reducer'
import type { GameState } from '../types'

afterEach(() => setSeed(null))

const at = (over: Partial<GameState> = {}): GameState => ({
  ...initialState(),
  rank: 'topProducer',
  reputation: 60,
  cash: 900000,
  ...over,
})

describe('TOGGLE_CHANNEL', () => {
  it('turns an unlocked channel on and off', () => {
    const on = reducer(at(), { type: 'TOGGLE_CHANNEL', channelId: 'instagram' })
    expect(on.activeChannelIds).toEqual(['instagram'])
    const off = reducer(on, { type: 'TOGGLE_CHANNEL', channelId: 'instagram' })
    expect(off.activeChannelIds).toEqual([])
  })

  it('refuses a rank-locked channel', () => {
    const s = reducer(at({ rank: 'buyerAgent' }), {
      type: 'TOGGLE_CHANNEL',
      channelId: 'tvCommercial',
    })
    expect(s.activeChannelIds).toEqual([])
  })

  it('refuses a rep-locked channel', () => {
    const s = reducer(at({ reputation: 10, rank: 'sellerAgent' }), {
      type: 'TOGGLE_CHANNEL',
      channelId: 'billboard',
    })
    expect(s.activeChannelIds).toEqual([])
  })

  it('ignores an unknown channel id', () => {
    const s = reducer(at(), { type: 'TOGGLE_CHANNEL', channelId: 'skywriting' })
    expect(s.activeChannelIds).toEqual([])
  })
})

describe('presets', () => {
  const equipped = { outfit: 'discountSuit', accessory: 'gasSunnies' }

  it('saves the current loadout into a slot', () => {
    const s = reducer(at({ equipped }), {
      type: 'SAVE_PRESET',
      index: 0,
      name: 'Full Gremlin',
    })
    expect(s.outfitPresets[0]).toEqual({ name: 'Full Gremlin', equipped })
  })

  it('supports three independent slots', () => {
    let s = reducer(at({ equipped }), { type: 'SAVE_PRESET', index: 0, name: 'A' })
    s = reducer({ ...s, equipped: {} }, { type: 'SAVE_PRESET', index: 2, name: 'C' })
    expect(s.outfitPresets[0].name).toBe('A')
    expect(s.outfitPresets[2]).toEqual({ name: 'C', equipped: {} })
  })

  it('rejects an out-of-range slot', () => {
    const s = reducer(at(), { type: 'SAVE_PRESET', index: 3, name: 'nope' })
    expect(s.outfitPresets).toEqual([])
  })

  it('loads a preset back in one action, keeping only owned items', () => {
    const owned = at({ equipped, ownedSwagIds: ['discountSuit', 'gasSunnies'] })
    const saved = reducer(owned, {
      type: 'SAVE_PRESET',
      index: 1,
      name: 'Otis Mode',
    })
    const stripped = { ...saved, equipped: {} }
    const loaded = reducer(stripped, { type: 'LOAD_PRESET', index: 1 })
    expect(loaded.equipped).toEqual(equipped)
  })

  it('drops preset entries for items no longer owned', () => {
    const saved = reducer(at({ equipped, ownedSwagIds: ['discountSuit'] }), {
      type: 'SAVE_PRESET',
      index: 0,
      name: 'Stale',
    })
    const loaded = reducer({ ...saved, equipped: {} }, { type: 'LOAD_PRESET', index: 0 })
    expect(loaded.equipped).toEqual({ outfit: 'discountSuit' })
  })

  it('does nothing when loading an empty slot', () => {
    const s = reducer(at({ equipped }), { type: 'LOAD_PRESET', index: 0 })
    expect(s.equipped).toEqual(equipped)
  })

  it('renames a saved preset without touching its loadout', () => {
    const saved = reducer(at({ equipped }), {
      type: 'SAVE_PRESET',
      index: 0,
      name: 'Old',
    })
    const renamed = reducer(saved, { type: 'RENAME_PRESET', index: 0, name: 'New' })
    expect(renamed.outfitPresets[0].name).toBe('New')
    expect(renamed.outfitPresets[0].equipped).toEqual(equipped)
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

```bash
npm test -- reducerActions
```

Expected: FAIL — the reducer's default branch returns state unchanged.

- [ ] **Step 3: Implement the four actions**

In `src/state/reducer.ts`, add before `case 'END_WEEK':`:

```ts
    case 'TOGGLE_CHANNEL': {
      const c = channelOf(action.channelId)
      if (!c || isChannelLocked(c, state)) return state
      const on = state.activeChannelIds.includes(c.id)
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
      const outfitPresets = [...state.outfitPresets]
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
      const outfitPresets = [...state.outfitPresets]
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
          'You changed into “' + preset.name + '” in a parking garage in under a minute.',
        ),
      )
    }
```

Add to the imports: `SLOTS` to the existing `'../logic/economy'` import list, and a new import:

```ts
import { channelOf, isChannelLocked } from '../logic/marketing'
```

Add this constant just above `initialState()`:

```ts
/** Three savable loadouts — "Otis Mode" and "Full Gremlin" and one more. */
export const PRESET_SLOTS = 3
```

- [ ] **Step 4: Run the tests**

```bash
npm test -- reducerActions
```

Expected: 11 passed.

- [ ] **Step 5: Commit**

```bash
git add src/state/reducer.ts src/state/__tests__/reducerActions.test.ts
git commit -m "feat: channel toggling and three-slot outfit presets"
```

---

## Task 10: Tier 4 swag and the bodyMod slot

**Files:**
- Modify: `src/data/swag.ts`
- Create: `src/logic/__tests__/swag.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/logic/__tests__/swag.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { SLOTS, SWAG } from '../../data/swag'
import { initialState } from '../../state/reducer'
import { reducer } from '../../state/reducer'
import { deriveStats, swagOf, weeklyUpkeep } from '../economy'
import type { GameState } from '../../state/types'

const tier4 = () => SWAG.filter((s) => s.tier === 4)

describe('Tier 4 swag', () => {
  it('adds exactly twelve items', () => {
    expect(tier4()).toHaveLength(12)
  })

  it('locks every Tier 4 item behind Top Producer', () => {
    tier4().forEach((it) => expect(it.unlockRank).toBe('topProducer'))
  })

  it('adds the bodyMod slot after office', () => {
    expect(SLOTS.map((s) => s.id)).toEqual([
      'outfit',
      'accessory',
      'vehicle',
      'office',
      'bodyMod',
    ])
  })

  it('gives every body mod zero upkeep and heavy ego', () => {
    const mods = SWAG.filter((s) => s.slot === 'bodyMod')
    expect(mods).toHaveLength(5)
    mods.forEach((m) => {
      expect(m.upkeep).toBe(0)
      expect(m.ego).toBeGreaterThanOrEqual(2)
    })
  })

  it('prices the Lambo at a quarter of a million with $1,500 upkeep', () => {
    const l = swagOf('lamboGold')!
    expect(l.price).toBe(250000)
    expect(l.upkeep).toBe(1500)
    expect(l.slot).toBe('vehicle')
  })

  it('costs about half a million to buy the whole tier', () => {
    const total = tier4().reduce((t, i) => t + i.price, 0)
    expect(total).toBeGreaterThan(450000)
    expect(total).toBeLessThan(550000)
  })
})

describe('bodyMod equipping', () => {
  const rich = (): GameState => ({
    ...initialState(),
    rank: 'topProducer',
    cash: 100000,
  })

  it('equips a body mod on purchase and counts its stats', () => {
    const s = reducer(rich(), { type: 'BUY_SWAG', itemId: 'buttImplants' })
    expect(s.equipped.bodyMod).toBe('buttImplants')
    expect(deriveStats(s).ego).toBe(4)
    expect(deriveStats(s).swagger).toBe(3)
    expect(weeklyUpkeep(s)).toBe(0)
  })

  it('allows only one body mod at a time', () => {
    let s = reducer(rich(), { type: 'BUY_SWAG', itemId: 'buttImplants' })
    s = reducer(s, { type: 'BUY_SWAG', itemId: 'calfImplants' })
    expect(s.equipped.bodyMod).toBe('calfImplants')
    expect(s.ownedSwagIds).toContain('buttImplants')
  })

  it('refuses a Tier 4 purchase below Top Producer', () => {
    const s = reducer({ ...rich(), rank: 'sellerAgent' }, {
      type: 'BUY_SWAG',
      itemId: 'buttImplants',
    })
    expect(s.ownedSwagIds).not.toContain('buttImplants')
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

```bash
npm test -- swag
```

Expected: FAIL — no Tier 4 items exist.

- [ ] **Step 3: Add the `bodyMod` slot**

In `src/data/swag.ts`, add to the `SLOTS` array after the `office` entry:

```ts
  { id: 'bodyMod', label: 'Body Modification' },
```

- [ ] **Step 4: Append the twelve Tier 4 items**

Add these to the end of the `SWAG` array in `src/data/swag.ts`, before the closing `]`:

```ts
  {
    id: 'buttImplants',
    name: 'Butt Implants',
    price: 25000,
    tier: 4,
    slot: 'bodyMod',
    hustle: 0,
    swagger: 2,
    ego: 4,
    upkeep: 0,
    unlockRank: 'topProducer',
    flavor: 'Clients trust an agent who clearly invests in assets.',
  },
  {
    id: 'calfImplants',
    name: 'Calf Implants',
    price: 12000,
    tier: 4,
    slot: 'bodyMod',
    hustle: 0,
    swagger: 1,
    ego: 3,
    upkeep: 0,
    unlockRank: 'topProducer',
    flavor: 'For the stair portion of every showing.',
  },
  {
    id: 'jawlineSculpt',
    name: 'Jawline Sculpt',
    price: 18000,
    tier: 4,
    slot: 'bodyMod',
    hustle: 0,
    swagger: 2,
    ego: 3,
    upkeep: 0,
    unlockRank: 'topProducer',
    flavor: 'Now visible in profile from the billboard.',
  },
  {
    id: 'bicepImplants',
    name: 'Bicep Implants',
    price: 15000,
    tier: 4,
    slot: 'bodyMod',
    hustle: 1,
    swagger: 1,
    ego: 3,
    upkeep: 0,
    unlockRank: 'topProducer',
    flavor: 'Purely for pointing at crown moulding.',
  },
  {
    id: 'theHelmet',
    name: 'The Helmet (Hair System)',
    price: 9000,
    tier: 4,
    slot: 'bodyMod',
    hustle: 0,
    swagger: 2,
    ego: 2,
    upkeep: 0,
    unlockRank: 'topProducer',
    flavor: 'Does not move. Has its own insurance policy.',
  },
  {
    id: 'designerSuit',
    name: 'Designer Suit (Italian, Allegedly)',
    price: 14000,
    tier: 4,
    slot: 'outfit',
    hustle: 0,
    swagger: 3,
    ego: 2,
    upkeep: 75,
    unlockRank: 'topProducer',
    flavor: "The label is in a language the tailor couldn't identify either.",
  },
  {
    id: 'sequinJacket',
    name: 'Sequin Pimp Jacket',
    price: 11000,
    tier: 4,
    slot: 'outfit',
    hustle: 0,
    swagger: 2,
    ego: 4,
    upkeep: 50,
    unlockRank: 'topProducer',
    flavor: 'Visible from the billboard. Audible in silence.',
  },
  {
    id: 'chronograph',
    name: 'Flashy Watch (The Chronograph)',
    price: 30000,
    tier: 4,
    slot: 'accessory',
    hustle: 0,
    swagger: 3,
    ego: 2,
    upkeep: 0,
    unlockRank: 'topProducer',
    flavor: "Tells the time in four cities you've never been to.",
  },
  {
    id: 'diamondCane',
    name: 'Diamond Cane Upgrade',
    price: 8000,
    tier: 4,
    slot: 'accessory',
    hustle: 0,
    swagger: 2,
    ego: 3,
    upkeep: 0,
    unlockRank: 'topProducer',
    flavor: 'The brokerage logo topper is now iced.',
  },
  {
    id: 'lamboGold',
    name: 'Lambo (Matte Gold)',
    price: 250000,
    tier: 4,
    slot: 'vehicle',
    hustle: 0,
    swagger: 4,
    ego: 4,
    upkeep: 1500,
    unlockRank: 'topProducer',
    flavor: "The doors go up. That's it. That's the feature.",
  },
  {
    id: 'entireFloor',
    name: 'Entire Floor (Glass Everything)',
    price: 120000,
    tier: 4,
    slot: 'office',
    hustle: 4,
    swagger: 3,
    ego: 2,
    upkeep: 2000,
    unlockRank: 'topProducer',
    flavor: "An intern's only job is watering the wall of ferns.",
  },
  {
    id: 'goldNameplate',
    name: 'Solid Gold Nameplate',
    price: 6500,
    tier: 4,
    slot: 'office',
    hustle: 1,
    swagger: 1,
    ego: 3,
    upkeep: 0,
    unlockRank: 'topProducer',
    flavor: 'Heavier than the door it hangs on.',
  },
```

- [ ] **Step 5: Run the tests**

```bash
npm test -- swag
```

Expected: 9 passed. `deriveStats` and `weeklyUpkeep` already iterate `SLOTS`, so `bodyMod` is picked up with no logic change.

- [ ] **Step 6: Commit**

```bash
git add src/data/swag.ts src/logic/__tests__/swag.test.ts
git commit -m "feat: Tier 4 body-mod swag and the bodyMod slot"
```

---

## Task 11: New events, cringe scaling, and the VRBO gag

**Files:**
- Modify: `src/data/events.ts`
- Modify: `src/logic/events.ts`
- Modify: `src/state/reducer.ts`
- Create: `src/logic/__tests__/events.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/logic/__tests__/events.test.ts`:

```ts
import { afterEach, describe, expect, it } from 'vitest'
import { EVENTS, VRBO_PITCHES } from '../../data/events'
import { endWeek, initialState, reducer } from '../../state/reducer'
import { applyEvent, badReviewWeight, vrboDue } from '../events'
import { setSeed } from '../rand'
import type { EventDef, GameState } from '../../state/types'

afterEach(() => setSeed(null))

const def = (id: string): EventDef => EVENTS.find((e) => e.id === id)!
const at = (over: Partial<GameState> = {}): GameState => ({
  ...initialState(),
  week: 12,
  rank: 'sellerAgent',
  cash: 40000,
  reputation: 55,
  ...over,
})

describe('event table', () => {
  it('registers all seven new events', () => {
    ;['viralSuccess', 'badReview', 'vrboSpam', 'tvInterview', 'algorithmChange',
      'copycatAgent', 'charityGala'].forEach((id) =>
      expect(EVENTS.some((e) => e.id === id)).toBe(true),
    )
  })

  it('gates viralSuccess on having a channel active', () => {
    expect(def('viralSuccess').condition(at())).toBe(false)
    expect(def('viralSuccess').condition(at({ activeChannelIds: ['tiktok'] }))).toBe(true)
  })

  it('gates badReview on three closed deals', () => {
    const s = at()
    expect(def('badReview').condition(s)).toBe(false)
    s.counters = { ...s.counters, dealsClosed: 3 }
    expect(def('badReview').condition(s)).toBe(true)
  })

  it('gates tvInterview on rep 50 and charityGala on rep 30', () => {
    expect(def('tvInterview').condition(at({ reputation: 49 }))).toBe(false)
    expect(def('tvInterview').condition(at({ reputation: 50 }))).toBe(true)
    expect(def('charityGala').condition(at({ reputation: 29 }))).toBe(false)
    expect(def('charityGala').condition(at({ reputation: 30 }))).toBe(true)
  })

  it('gates algorithmChange on TikTok being active', () => {
    expect(def('algorithmChange').condition(at())).toBe(false)
    expect(def('algorithmChange').condition(at({ activeChannelIds: ['tiktok'] }))).toBe(true)
  })

  it('gates copycatAgent on billboard or bench', () => {
    expect(def('copycatAgent').condition(at())).toBe(false)
    expect(def('copycatAgent').condition(at({ activeChannelIds: ['billboard'] }))).toBe(true)
    expect(
      def('copycatAgent').condition(at({ activeChannelIds: ['benchDomination'] })),
    ).toBe(true)
  })
})

describe('community sponsorship suppresses bad reviews', () => {
  it('halves the badReview weight while active', () => {
    expect(badReviewWeight(at())).toBe(8)
    expect(badReviewWeight(at({ activeChannelIds: ['communitySponsorship'] }))).toBe(4)
  })
})

describe('applyEvent — new outcomes', () => {
  it('viralSuccess grants ten reputation and three inbound leads', () => {
    setSeed(61)
    const r = applyEvent(at({ activeChannelIds: ['tiktok'], reputation: 40 }), 'viralSuccess')
    expect(r.state.reputation).toBe(50)
    expect(r.state.leads).toHaveLength(3)
  })

  it('badReview costs eight reputation and two hundred dollars', () => {
    setSeed(62)
    const r = applyEvent(at({ reputation: 40 }), 'badReview')
    expect(r.state.reputation).toBe(32)
    expect(r.cashDelta).toBe(-200)
  })

  it('algorithmChange mutes TikTok for two weeks without refunding it', () => {
    setSeed(63)
    const r = applyEvent(at({ week: 12, activeChannelIds: ['tiktok'] }), 'algorithmChange')
    expect(r.state.channelMuteUntil.tiktok).toBe(14)
    expect(r.state.activeChannelIds).toContain('tiktok')
    expect(r.cashDelta).toBe(0)
  })

  it('cringeEvent leaves reputation alone below fifty', () => {
    setSeed(64)
    const r = applyEvent(at({ reputation: 49 }), 'cringeEvent')
    expect(r.state.reputation).toBe(49)
  })

  it('cringeEvent costs five reputation at fifty and above', () => {
    setSeed(65)
    const r = applyEvent(at({ reputation: 60 }), 'cringeEvent')
    expect(r.state.reputation).toBe(55)
  })
})

describe('choice events', () => {
  it('vrboSpam raises a decline-only modal and bumps the counter', () => {
    setSeed(71)
    const r = applyEvent(at(), 'vrboSpam')
    expect(r.state.pendingChoice!.id).toBe('vrboSpam')
    expect(r.state.pendingChoice!.options).toHaveLength(1)
    expect(r.state.pendingChoice!.options[0].label).toBe('Decline (for now)')
    expect(r.state.gagCounters.vrboOffers).toBe(1)
  })

  it('escalates the VRBO pitch on each offer', () => {
    expect(VRBO_PITCHES).toHaveLength(5)
    setSeed(72)
    const first = applyEvent(at(), 'vrboSpam')
    const second = applyEvent(first.state, 'vrboSpam')
    expect(first.state.pendingChoice!.body).toBe(VRBO_PITCHES[0])
    expect(second.state.pendingChoice!.body).toBe(VRBO_PITCHES[1])
  })

  it('clamps the pitch at the last one', () => {
    setSeed(73)
    const r = applyEvent(at({ gagCounters: { vrboOffers: 40, nextVrboWeek: 0 } }), 'vrboSpam')
    expect(r.state.pendingChoice!.body).toBe(VRBO_PITCHES[4])
  })

  it('tvInterview humble path adds eight reputation', () => {
    setSeed(74)
    const raised = applyEvent(at({ reputation: 55 }), 'tvInterview').state
    const done = reducer(raised, { type: 'RESOLVE_CHOICE_EVENT', key: 'humble' })
    expect(done.reputation).toBe(63)
    expect(done.pendingChoice).toBeNull()
  })

  it('tvInterview ego path adds four reputation and a permanent ego point', () => {
    setSeed(75)
    const raised = applyEvent(at({ reputation: 55 }), 'tvInterview').state
    const done = reducer(raised, { type: 'RESOLVE_CHOICE_EVENT', key: 'ego' })
    expect(done.reputation).toBe(59)
    expect(done.permBonuses.ego).toBe(1)
  })

  it('copycat: paying five hundred buys two reputation, doing nothing costs three', () => {
    setSeed(76)
    const raised = applyEvent(at({ reputation: 50, cash: 40000 }), 'copycatAgent').state
    const paid = reducer(raised, { type: 'RESOLVE_CHOICE_EVENT', key: 'cease' })
    expect(paid.reputation).toBe(52)
    expect(paid.cash).toBe(39500)
    const ate = reducer(raised, { type: 'RESOLVE_CHOICE_EVENT', key: 'eat' })
    expect(ate.reputation).toBe(47)
    expect(ate.cash).toBe(40000)
  })

  it('gala: attending costs five hundred, adds five rep and a lead', () => {
    setSeed(77)
    const raised = applyEvent(at({ reputation: 40, leads: [] }), 'charityGala').state
    const went = reducer(raised, { type: 'RESOLVE_CHOICE_EVENT', key: 'attend' })
    expect(went.reputation).toBe(45)
    expect(went.cash).toBe(39500)
    expect(went.leads).toHaveLength(1)
    const skipped = reducer(raised, { type: 'RESOLVE_CHOICE_EVENT', key: 'skip' })
    expect(skipped.reputation).toBe(40)
    expect(skipped.leads).toHaveLength(0)
  })

  it('rejects an unknown choice key without clearing the modal', () => {
    setSeed(78)
    const raised = applyEvent(at(), 'charityGala').state
    const s = reducer(raised, { type: 'RESOLVE_CHOICE_EVENT', key: 'bogus' })
    expect(s.pendingChoice).not.toBeNull()
  })
})

describe('vrbo cadence', () => {
  it('is due once the stored week arrives', () => {
    expect(vrboDue(at({ week: 12, gagCounters: { vrboOffers: 1, nextVrboWeek: 15 } }))).toBe(false)
    expect(vrboDue(at({ week: 15, gagCounters: { vrboOffers: 1, nextVrboWeek: 15 } }))).toBe(true)
  })

  it('is not due for a buyer agent', () => {
    expect(
      vrboDue(at({ rank: 'buyerAgent', week: 20, gagCounters: { vrboOffers: 0, nextVrboWeek: 1 } })),
    ).toBe(false)
  })

  it('fires during End Week and schedules the next offer 6-9 weeks out', () => {
    setSeed(81)
    const s = endWeek(at({ week: 20, gagCounters: { vrboOffers: 0, nextVrboWeek: 20 } }))
    expect(s.pendingChoice!.id).toBe('vrboSpam')
    expect(s.gagCounters.nextVrboWeek).toBeGreaterThanOrEqual(s.week + 6)
    expect(s.gagCounters.nextVrboWeek).toBeLessThanOrEqual(s.week + 9)
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

```bash
npm test -- events
```

Expected: FAIL — `VRBO_PITCHES` does not exist.

- [ ] **Step 3: Extend `src/data/events.ts`**

Add the seven rows to `EVENTS`, before the closing `]`. Note `badReview`'s weight is a base value; `badReviewWeight()` in logic applies the sponsorship halving at selection time.

```ts
  {
    id: 'viralSuccess',
    weight: 6,
    condition: (s) => s.activeChannelIds.length > 0,
  },
  { id: 'badReview', weight: 8, condition: (s) => s.counters.dealsClosed >= 3 },
  {
    id: 'tvInterview',
    weight: 5,
    condition: (s) => s.reputation >= 50,
  },
  {
    id: 'algorithmChange',
    weight: 6,
    condition: (s) => s.activeChannelIds.includes('tiktok'),
  },
  {
    id: 'copycatAgent',
    weight: 6,
    condition: (s) =>
      s.activeChannelIds.includes('billboard') ||
      s.activeChannelIds.includes('benchDomination'),
  },
  { id: 'charityGala', weight: 6, condition: (s) => s.reputation >= 30 },
  {
    id: 'vrboSpam',
    weight: 10,
    condition: (s) =>
      s.rank === 'sellerAgent' || s.rank === 'topProducer',
  },
```

Then append these copy pools to the bottom of the file:

```ts
/** The badReview weight before Community Sponsorship halves it. */
export const BAD_REVIEW_BASE_WEIGHT = 8
/** Guaranteed VRBO cadence, in weeks. */
export const VRBO_MIN_GAP = 6
export const VRBO_MAX_GAP = 9

export const VIRAL_SCENARIOS: string[] = [
  'A fifteen-second clip of you opening a stubborn front door with your hip got two million views.',
  'You said “this is a hallway” in a tone the internet found deeply comforting. It is now a sound.',
  'Someone stitched your listing tour with a nature documentary narration and it improved both.',
  'A dog wandered into frame during your walkthrough. The dog is now the face of your brand.',
  'You mispronounced “quartz” with total confidence and the internet adopted it as canon.',
  'Your drone shot of a cul-de-sac was set to sad piano music by a stranger and people cried.',
]

export const BAD_REVIEW_LINES: string[] = [
  'A one-star review appeared from a name you have never seen, describing a showing you never ran.',
  'Someone gave you one star for “energy” and wrote nine paragraphs about a parking space.',
  'A review accuses you of being “too available.” It is the most-liked review on the page.',
  'One star. The review is a single word. The word is “no.” It has forty upvotes.',
]

export const CRINGE_HIGH_FAME: string[] = [
  'Your motivational speech at the regional expo included the phrase “sell or be sold” eleven times and a slide of your own face.',
  'Your drone got a little close to the open house. Then a little closer. Then into the pergola, on camera, in front of the buyers.',
  'Your gala speech ran nineteen minutes, thanked your own reflection, and was livestreamed by four separate people.',
]

export const NEWS_COVERAGE: string[] = [
  'The local station ran it under the chyron LOCAL AGENT, LOCAL INCIDENT.',
  'A morning show played the clip twice and the hosts did not speak afterward.',
  'The newspaper covered it in the section normally reserved for raccoons.',
]

/** Five escalating pitches for the 424/7 VRBO. Index = offer count - 1. */
export const VRBO_PITCHES: string[] = [
  'A wholesaler in a lanyard has an opportunity for you: the 424/7 VRBO. Six bedrooms, nine bathrooms, one hot tub of unknown provenance. Cash-flow positive, he says, at full occupancy. Full occupancy is 424 hours a week. There are 168 hours in a week. He does not appear to know this.',
  'The wholesaler is back. He has laminated the numbers now. “Look, if you just book it 424 hours a week, it prints.” He has added a second hot tub to the pro forma. The math has not moved.',
  'He found you at a closing. He has a hat with the property on it. He explains that “424 is aspirational, but so was the moon landing.” He is sweating through the hat.',
  'He is now offering seller financing, a bonus jet ski, and “equity in the concept.” The spreadsheet has a tab called DREAM CASE. The DREAM CASE assumes 501 hours.',
  'He has brought his mother. She calls it “the family opportunity.” The listing photos now include a man in a bathrobe who does not live there. The hot tubs number four. He says this is the last time he will ask. It is not.',
]

export const COPYCAT_LINES: string[] = [
  'Chadwick Sterling III has recreated your ad shot for shot: same pose, same golden hour, same finger pointing at nothing. His font is worse and somehow bigger.',
  'Chadwick Sterling III put up a billboard directly across the highway from yours, mirrored, so drivers see two of you pointing at each other.',
]

export const GALA_LINES: string[] = [
  'The Chamber of Commerce charity gala. Five hundred a plate, a silent auction, and a room full of people with houses.',
  'A black-tie charity gala for a cause everyone in the room will describe slightly differently. Five hundred to get in.',
]
```

- [ ] **Step 4: Add the new branches to `src/logic/events.ts`**

Add to the imports:

```ts
import {
  BAD_REVIEW_BASE_WEIGHT,
  BAD_REVIEW_LINES,
  COPYCAT_LINES,
  CRINGE_HIGH_FAME,
  GALA_LINES,
  NEWS_COVERAGE,
  VIRAL_SCENARIOS,
  VRBO_MAX_GAP,
  VRBO_MIN_GAP,
  VRBO_PITCHES,
} from '../data/events'
import { ALGORITHM_MUTE_WEEKS } from '../data/marketing'
import {
  REP_CRINGE_PENALTY,
  REP_CRINGE_SCALES_AT,
} from '../data/reputation'
import { atLeastRank, clampRep } from './economy'
import { randInt } from './rand'
```

(merge `randInt` into the existing `from './rand'` import, and `clampRep`/`atLeastRank` into the existing `from './economy'` import).

Add these exported helpers above `selectEvent`:

```ts
/** Community Sponsorship halves how often bad reviews come up. */
export function badReviewWeight(state: GameState): number {
  return state.activeChannelIds.includes('communitySponsorship')
    ? BAD_REVIEW_BASE_WEIGHT / 2
    : BAD_REVIEW_BASE_WEIGHT
}

/** The guaranteed 6–9 week VRBO cadence, independent of the 30% roll. */
export function vrboDue(state: GameState): boolean {
  return (
    atLeastRank(state.rank, 'sellerAgent') &&
    state.week >= state.gagCounters.nextVrboWeek
  )
}

export function scheduleNextVrbo(state: GameState): GameState {
  return {
    ...state,
    gagCounters: {
      ...state.gagCounters,
      nextVrboWeek: state.week + randInt(VRBO_MIN_GAP, VRBO_MAX_GAP),
    },
  }
}
```

Apply the sponsorship halving inside `selectEvent` — replace the two lines that compute the pool total:

```ts
  const pool = EVENTS.filter((e) => e.condition(state))
  const weightOf = (e: EventDef): number =>
    e.id === 'badReview' ? badReviewWeight(state) : e.weight
  const total = pool.reduce((t, e) => t + weightOf(e), 0)
```

and inside the selection loop replace `roll -= e.weight` with `roll -= weightOf(e)`.

Now add the seven branches to `applyEvent`, before the `default:` case:

```ts
    case 'viralSuccess': {
      s = { ...s, reputation: clampRep(s.reputation + 10) }
      const fresh = [makeLead(s), makeLead(s), makeLead(s)]
      s = { ...s, leads: [...s.leads, ...fresh] }
      s = withLog(
        s,
        'event',
        pick(VIRAL_SCENARIOS) +
          ' Three strangers called before you finished reading the comments: ' +
          fresh.map((l) => l.clientName).join(', ') +
          '.',
      )
      label = 'Went viral (well)'
      break
    }
    case 'badReview': {
      s = { ...s, cash: s.cash - 200, reputation: clampRep(s.reputation - 8) }
      cashDelta = -200
      s = withLog(
        s,
        'event',
        pick(BAD_REVIEW_LINES) +
          ' You paid a reputation-management service to reply politely on your behalf.',
      )
      label = 'One-star essay'
      break
    }
    case 'algorithmChange': {
      s = {
        ...s,
        channelMuteUntil: {
          ...s.channelMuteUntil,
          tiktok: s.week + ALGORITHM_MUTE_WEEKS,
        },
      }
      s = withLog(
        s,
        'event',
        'The algorithm changed overnight. Your videos now reach four people, three of whom are you on other devices. The invoice, however, arrives exactly on time.',
      )
      label = 'Algorithm change'
      break
    }
    case 'vrboSpam': {
      const n = s.gagCounters.vrboOffers
      s = {
        ...s,
        gagCounters: { ...s.gagCounters, vrboOffers: n + 1 },
        pendingChoice: {
          id: 'vrboSpam',
          title: 'THE 424/7 VRBO',
          body: VRBO_PITCHES[Math.min(n, VRBO_PITCHES.length - 1)],
          options: [
            {
              key: 'decline',
              label: 'Decline (for now)',
              hint: 'There is no other button. There will be, one day.',
            },
          ],
        },
      }
      label = 'The 424/7 VRBO'
      break
    }
    case 'tvInterview': {
      s = {
        ...s,
        pendingChoice: {
          id: 'tvInterview',
          title: 'LOCAL TV WANTS FOUR MINUTES',
          body: 'The morning show wants you between a weather hit and a segment about a duck. The producer asks how you want to come across.',
          options: [
            {
              key: 'humble',
              label: 'Stay humble',
              hint: 'Credit the team. Look trustworthy. Sleep fine.',
            },
            {
              key: 'ego',
              label: 'Full ego',
              hint: 'Point at the camera. Say your own name twice.',
            },
          ],
        },
      }
      label = 'TV interview'
      break
    }
    case 'copycatAgent': {
      s = {
        ...s,
        pendingChoice: {
          id: 'copycatAgent',
          title: 'CHADWICK STERLING III HAS NOTES',
          body: pick(COPYCAT_LINES),
          options: [
            {
              key: 'cease',
              label: 'Pay $500 for a cease-and-desist',
              hint: 'A lawyer writes one paragraph. It works.',
            },
            {
              key: 'eat',
              label: 'Let it go',
              hint: 'Free. Costs you something else.',
            },
          ],
        },
      }
      label = 'Copycat agent'
      break
    }
    case 'charityGala': {
      s = {
        ...s,
        pendingChoice: {
          id: 'charityGala',
          title: 'THE CHARITY GALA',
          body: pick(GALA_LINES),
          options: [
            {
              key: 'attend',
              label: 'Pay $500 and attend',
              hint: 'Handshakes, a photo wall, and one very good lead.',
            },
            {
              key: 'skip',
              label: 'Skip it',
              hint: 'The parking lot has a view of the window.',
            },
          ],
        },
      }
      label = 'Charity gala'
      break
    }
```

- [ ] **Step 5: Scale `cringeEvent` with reputation**

In `src/logic/events.ts`, replace the whole `case 'cringeEvent':` block with:

```ts
    case 'cringeEvent': {
      const famous = s.reputation >= REP_CRINGE_SCALES_AT
      s = { ...s, cash: s.cash - 100 }
      cashDelta = -100
      if (famous)
        s = { ...s, reputation: clampRep(s.reputation - REP_CRINGE_PENALTY) }
      const scene = famous
        ? pick(CRINGE_HIGH_FAME) + ' ' + pick(NEWS_COVERAGE)
        : 'Your motivational video went viral for the wrong reasons. ' +
          pick(CRINGE_QUOTES)
      if (s.leads.length) {
        const l = pick(s.leads)
        s = {
          ...s,
          leads: s.leads.filter((x) => x.id !== l.id),
          counters: { ...s.counters, leadsLost: s.counters.leadsLost + 1 },
        }
        s = withLog(
          s,
          'event',
          scene +
            ' ' +
            l.clientName +
            ' saw it, watched it twice, and stopped replying. Also, the videographer invoiced you.',
        )
      } else {
        s = withLog(
          s,
          'event',
          scene +
            ' The comments are a crime scene. Also, the videographer invoiced you.',
        )
      }
      label = 'Went viral (badly)'
      break
    }
```

- [ ] **Step 6: Add `RESOLVE_CHOICE_EVENT` to the reducer**

In `src/state/reducer.ts`, add before `case 'END_WEEK':`:

```ts
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
```

- [ ] **Step 7: Fire the guaranteed VRBO during End Week**

In `src/state/reducer.ts`, in `endWeek`, insert immediately after the `/* 4. cringe event */` block:

```ts
  /* 4b. the 424/7 VRBO, on its own guaranteed 6–9 week clock */
  if (vrboDue(s) && !s.pendingChoice) {
    const r = applyEvent(s, 'vrboSpam')
    s = scheduleNextVrbo(r.state)
    events.push(r.label)
  }
```

Add `vrboDue` and `scheduleNextVrbo` to the existing `'../logic/events'` import.

Also seed the clock for new games: in `initialState()`, change

```ts
    gagCounters: { vrboOffers: 0, nextVrboWeek: 0 },
```

to

```ts
    gagCounters: { vrboOffers: 0, nextVrboWeek: 6 },
```

and in `src/state/migrate.ts`, change the `nextVrboWeek` default so an existing v1 player gets an offer soon rather than immediately — replace:

```ts
      nextVrboWeek:
        (s.gagCounters as { nextVrboWeek?: number } | undefined)
          ?.nextVrboWeek ?? 0,
```

with:

```ts
      nextVrboWeek:
        (s.gagCounters as { nextVrboWeek?: number } | undefined)
          ?.nextVrboWeek ?? (typeof s.week === 'number' ? s.week + 2 : 6),
```

- [ ] **Step 8: Run the full suite**

```bash
npm test
```

Expected: everything passes, including the ~22 new event assertions.

- [ ] **Step 9: Commit**

```bash
git add src/data/events.ts src/logic/events.ts src/state/reducer.ts src/state/migrate.ts src/logic/__tests__/events.test.ts
git commit -m "feat: Phase 2 events, cringe rep scaling, and the 424/7 VRBO gag"
```

---

## Task 12: Brag templates for the new systems

**Files:**
- Modify: `src/data/brags.ts`
- Modify: `src/logic/economy.ts` (`bragFor`)
- Create: `src/logic/__tests__/brags.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/logic/__tests__/brags.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { BRAG_TEMPLATES, PHASE2_BRAGS } from '../../data/brags'
import { initialState } from '../../state/reducer'
import { bragFor } from '../economy'
import { setSeed } from '../rand'
import type { GameState } from '../../state/types'

describe('brags', () => {
  it('gives Top Producer ten templates', () => {
    expect(BRAG_TEMPLATES.topProducer).toHaveLength(10)
  })

  it('ships ten brags for each unlocked Phase 2 system', () => {
    expect(PHASE2_BRAGS.marketing).toHaveLength(10)
    expect(PHASE2_BRAGS.bodyMod).toHaveLength(10)
    expect(PHASE2_BRAGS.reputation).toHaveLength(10)
  })

  it('leaves no unfilled placeholders in any rendered brag', () => {
    const s: GameState = {
      ...initialState(),
      rank: 'topProducer',
      reputation: 82,
      week: 60,
      activeChannelIds: ['billboard'],
      equipped: { bodyMod: 'buttImplants' },
      ownedSwagIds: ['buttImplants'],
    }
    setSeed(1)
    for (let i = 0; i < 200; i++) expect(bragFor(s)).not.toMatch(/\{[a-z]+\}/)
    setSeed(null)
  })

  it('can produce a marketing brag once a channel is active', () => {
    const s: GameState = {
      ...initialState(),
      rank: 'topProducer',
      activeChannelIds: ['billboard'],
    }
    setSeed(2)
    const seen = new Set<string>()
    for (let i = 0; i < 400; i++) seen.add(bragFor(s))
    setSeed(null)
    expect(PHASE2_BRAGS.marketing.some((t) => seen.has(t))).toBe(true)
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

```bash
npm test -- brags
```

Expected: FAIL — `PHASE2_BRAGS` is not exported and `topProducer` has one template.

- [ ] **Step 3: Replace the Top Producer placeholder with ten templates**

In `src/data/brags.ts`, replace the placeholder `topProducer` array added in Task 2 with:

```ts
  topProducer: [
    '🏆 Top Producer. I did not become this. I revealed this. 🙏 #blessed',
    '{deals} deals. {earnings} career. Same phone number. Different jawline. 📞',
    'People say the commercial is a lot. The commercial is why they know it is a lot. 📺',
    'Week {week}: {cash} liquid and a car whose doors open the wrong way on purpose. 🚗',
    'Someone asked if I still do buyer deals. I asked if they still do buyer prices. 💼',
    '{leads} in the pipeline. Two of them found me on a bench. 🪑',
    'Luxury is a mindset. Also a price band. Mostly a price band. 📈',
    "I don't chase listings. I stand very still forty feet above the highway and wait. 🛣️",
    'Started with a fern on a folding table. The fern has an intern now. 🌿',
    'Humbled to announce I am, per the plaque, extremely not humble. 🏅',
  ],
```

- [ ] **Step 4: Add the Phase 2 brag pools**

Append to `src/data/brags.ts`:

```ts
/** Extra brag pools, mixed in once the system that earns them is unlocked. */
export const PHASE2_BRAGS = {
  marketing: [
    'The billboard has been up for a week and three people have described my face as “unavoidable.” Marketing works. 📢',
    'Ran the numbers: my ad spend this week was {cash}-adjacent and worth every unit of shame. 📊',
    'A man on a bus bench and I made eye contact through my own face. Surreal. Effective. 🪑',
    'Got recognized at a drive-thru. The order was still wrong. Fame is not a shield. 🍟',
    'My TikTok did numbers. My TikTok also did Gary. Ratio unclear. 📱',
    'They said print is dead. My newspaper column disagrees, weekly, in 400 words. 📰',
    'Someone framed my flyer. Ironically. It is still framed. Still my flyer. 🖼️',
    'Sponsored a kids team. Went 2-9. Undefeated in brand awareness. ⚽',
    'The commercial airs at 2am. My clients are people who are awake at 2am. Perfect targeting. 📺',
    'Week {week} and the phone rings before I dial. That is the whole business model. ☎️',
  ],
  bodyMod: [
    'Down for two days post-procedure. Still answered {leads} calls from the recovery chair. #grind 💪',
    'Not everyone will understand the calves. Everyone will notice the calves. 🦵',
    'They said “you should invest in yourself.” I took notes. Then I took an appointment. 📝',
    'The jawline was a business decision. My accountant agrees, reluctantly, in writing. 🧾',
    'The hair does not move. Neither do my prices. 💇',
    'Surgeon asked what look I was going for. I said “trustworthy, but expensive.” He nodded. 🙏',
    'Recovery week. Still cleared {cash}. Cannot sit down. Would not change a thing. 🪑',
    "People ask if it's real. It's paid for. That's realer than real. 💵",
    'The implants are for pointing at crown moulding. That is a job requirement. 👆',
    'You cannot buy confidence. You can, however, finance it over 36 months. 📈',
  ],
  reputation: [
    'Somebody recognized me at a gas station today and I have not been the same since. ⛽',
    'Got tagged in a stranger’s story with the caption “that’s the house guy.” I AM the house guy. 🏠',
    'Week {week}. {deals} deals. And now, apparently, a reputation. 🙏',
    'A client picked me because they “kept seeing me everywhere.” That was the plan. 👀',
    'Someone made a parody account of me. Growth is growth. 📈',
    'Overheard my own catchphrase said by a child. Legacy. ✨',
    'The checkmark came through. My mother asked what it costs. It costs everything. ✅',
    'I no longer introduce myself. I confirm myself. 🤝',
    'Two people argued about me in a comment section and both of them were wrong. 💬',
    'Fame is just being slightly harder to ignore, every week, on purpose. 📣',
  ],
}
```

- [ ] **Step 5: Mix the pools into `bragFor`**

In `src/logic/economy.ts`, replace `bragFor` with:

```ts
export function bragFor(state: GameState): string {
  const pool = [...BRAG_TEMPLATES[state.rank]]
  if (state.activeChannelIds.length) pool.push(...PHASE2_BRAGS.marketing)
  if (state.equipped.bodyMod) pool.push(...PHASE2_BRAGS.bodyMod)
  if (state.reputation >= REP_INBOUND_AT) pool.push(...PHASE2_BRAGS.reputation)
  const t = pick(pool)
  return t
    .replace('{week}', String(state.week))
    .replace('{cash}', money(state.cash))
    .replace('{earnings}', money(state.careerEarnings))
    .replace('{deals}', String(state.counters.dealsClosed))
    .replace('{showings}', String(state.counters.showingsRun))
    .replace('{leads}', String(state.leads.length))
    .replace('{rep}', String(state.reputation))
}
```

Add `PHASE2_BRAGS` to the existing `'../data/brags'` import and `REP_INBOUND_AT` to the `'../data/reputation'` import.

- [ ] **Step 6: Run the tests**

```bash
npm test -- brags
```

Expected: 4 passed.

- [ ] **Step 7: Commit**

```bash
git add src/data/brags.ts src/logic/economy.ts src/logic/__tests__/brags.test.ts
git commit -m "feat: Top Producer and Phase 2 brag templates"
```

---

## Task 13: Reputation meter and toast

Visual tokens are unchanged from Phase 1 — these classes reuse the existing CSS variables (`--brass`, `--mint`, `--sold`) and the existing `res-` prefix.

**Files:**
- Create: `src/components/RepMeter.tsx`
- Create: `src/components/Toast.tsx`
- Modify: `src/components/Header.tsx`
- Modify: `src/App.tsx`
- Modify: `src/styles.css`

- [ ] **Step 1: Create `src/components/RepMeter.tsx`**

```tsx
import { REP_THRESHOLDS } from '../data/reputation'

export default function RepMeter({ reputation }: { reputation: number }) {
  return (
    <div className="res-rep" aria-label={'Reputation ' + reputation + ' of 100'}>
      <div className="res-rep-top">
        <span>Reputation</span>
        <b>{reputation}</b>
      </div>
      <div className="res-rep-bar">
        <div className="res-rep-fill" style={{ width: reputation + '%' }} />
        {REP_THRESHOLDS.map((t) => (
          <i
            key={t.rep}
            className={'res-rep-tick' + (reputation >= t.rep ? ' on' : '')}
            style={{ left: t.rep + '%' }}
          />
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Create `src/components/Toast.tsx`**

```tsx
export default function Toast({ text }: { text: string }) {
  return (
    <div className="res-toast" role="status">
      {text}
    </div>
  )
}
```

- [ ] **Step 3: Render the meter in the header**

In `src/components/Header.tsx`, add the import:

```tsx
import RepMeter from './RepMeter'
```

and add `<RepMeter reputation={state.reputation} />` immediately after the closing `</div>` of `res-hrow`, still inside `<header>`.

- [ ] **Step 4: Fire a toast when a threshold is crossed**

In `src/App.tsx`, add the imports:

```tsx
import Toast from './components/Toast'
import { crossedThresholds } from './logic/economy'
```

Add state and an effect next to the existing `bump` effect:

```tsx
  const [toast, setToast] = useState<string | null>(null)
  const prevRep = useRef(state.reputation)

  useEffect(() => {
    const crossed = crossedThresholds(prevRep.current, state.reputation)
    prevRep.current = state.reputation
    if (!crossed.length) return
    setToast(crossed[crossed.length - 1].toast)
    const t = setTimeout(() => setToast(null), 4200)
    return () => clearTimeout(t)
  }, [state.reputation])
```

Render it just before the closing `</div>` of `res-app`, next to the confetti block:

```tsx
      {toast && <Toast text={toast} />}
```

- [ ] **Step 5: Add the styles**

Append to `src/styles.css`:

```css
/* --- reputation meter ------------------------------------------------- */
.res-rep {
  margin-top: 10px;
}
.res-rep-top {
  display: flex;
  justify-content: space-between;
  font-size: 11px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  opacity: 0.75;
  margin-bottom: 4px;
}
.res-rep-bar {
  position: relative;
  height: 7px;
  border-radius: 4px;
  background: rgba(255, 255, 255, 0.12);
  overflow: hidden;
}
.res-rep-fill {
  height: 100%;
  background: linear-gradient(90deg, #8a6f18, var(--brass));
  transition: width 420ms ease;
}
.res-rep-tick {
  position: absolute;
  top: 0;
  width: 1px;
  height: 100%;
  background: rgba(255, 255, 255, 0.35);
}
.res-rep-tick.on {
  background: #f5f2ea;
}

/* --- threshold toast -------------------------------------------------- */
.res-toast {
  position: fixed;
  left: 50%;
  bottom: 84px;
  transform: translateX(-50%);
  max-width: min(92vw, 420px);
  padding: 10px 14px;
  border: 1px solid var(--brass);
  border-radius: 8px;
  background: #14161f;
  color: #f5f2ea;
  font-size: 13px;
  line-height: 1.45;
  z-index: 60;
  animation: res-toast-in 260ms ease;
}
@keyframes res-toast-in {
  from {
    opacity: 0;
    transform: translate(-50%, 8px);
  }
}
@media (prefers-reduced-motion: reduce) {
  .res-rep-fill {
    transition: none;
  }
  .res-toast {
    animation: none;
  }
}
```

- [ ] **Step 6: Verify in the browser**

Start the dev server (via the preview tooling, not a raw shell command), open the app, and confirm: the meter renders under the header stat chips, the bar is empty at Rep 0, and the layout does not overflow at a 375px viewport width. Then run:

```bash
npm run build
```

Expected: build succeeds.

- [ ] **Step 7: Commit**

```bash
git add src/components/RepMeter.tsx src/components/Toast.tsx src/components/Header.tsx src/App.tsx src/styles.css
git commit -m "feat: reputation meter and threshold toast"
```

---

## Task 14: Marketing tab

**Files:**
- Create: `src/components/MarketingTab.tsx`
- Modify: `src/App.tsx`
- Modify: `src/styles.css`

- [ ] **Step 1: Create `src/components/MarketingTab.tsx`**

```tsx
import type { Dispatch } from 'react'
import { CHANNELS } from '../data/marketing'
import { rankOf } from '../logic/economy'
import {
  isChannelLocked,
  isChannelMuted,
  weeklyChannelRep,
  weeklyChannelSpend,
} from '../logic/marketing'
import { money } from '../logic/rand'
import type { Action, Channel, GameState } from '../state/types'

function lockReason(c: Channel, state: GameState): string {
  const rankName = rankOf(c.unlockRank).name
  if (c.unlockRep > 0 && state.reputation < c.unlockRep)
    return 'Unlocks at ' + rankName + ', Reputation ' + c.unlockRep
  return 'Unlocks at ' + rankName
}

export default function MarketingTab({
  state,
  dispatch,
}: {
  state: GameState
  dispatch: Dispatch<Action>
}) {
  const spend = weeklyChannelSpend(state)
  const rep = weeklyChannelRep(state)
  return (
    <div className="res-panel dark">
      <h3 className="res-h2 res-display">Marketing</h3>
      <div className="res-line">
        <span>Active spend</span>
        <b>{money(spend)}/wk</b>
      </div>
      <div className="res-line">
        <span>Reputation earned</span>
        <b style={{ color: 'var(--brass)' }}>+{rep}/wk</b>
      </div>
      <p className="res-meta" style={{ margin: '8px 0 14px' }}>
        Channels bill at the end of every week whether they work or not. Leads
        they bring in cost no action points.
      </p>
      <div className="res-grid">
        {CHANNELS.map((c) => {
          const locked = isChannelLocked(c, state)
          const on = state.activeChannelIds.includes(c.id)
          const muted = on && isChannelMuted(state, c.id)
          return (
            <div
              key={c.id}
              className={
                'res-channel' +
                (on ? ' on' : '') +
                (locked ? ' lock' : '') +
                (muted ? ' muted' : '')
              }
            >
              <div className="nm">{c.name}</div>
              <div className="res-price">{money(c.weeklyCost)}/wk</div>
              <div>
                <span className="res-stat">
                  {Math.round(c.inboundChance * 100)}% inbound
                </span>
                {c.repPerWeek ? (
                  <span className="res-stat e">REP +{c.repPerWeek}/wk</span>
                ) : null}
              </div>
              <div className="fl">{c.flavor}</div>
              {muted && (
                <div className="res-meta">
                  Quiet for now. Still billing. The algorithm moved on.
                </div>
              )}
              {locked ? (
                <div className="res-meta">{lockReason(c, state)}</div>
              ) : (
                <div className="res-mini">
                  <button
                    aria-pressed={on}
                    onClick={() =>
                      dispatch({ type: 'TOGGLE_CHANNEL', channelId: c.id })
                    }
                  >
                    {on ? 'Running — Turn Off' : 'Turn On'}
                  </button>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Add the tab to `src/App.tsx`**

Change the `TabId` type and `TABS` array:

```tsx
type TabId = 'office' | 'leads' | 'marketing' | 'closet' | 'log'

const TABS: [TabId, string][] = [
  ['office', 'Office'],
  ['leads', 'Leads'],
  ['marketing', 'Marketing'],
  ['closet', 'Closet'],
  ['log', 'Log'],
]
```

Add the import `import MarketingTab from './components/MarketingTab'` and render it beside the other tabs:

```tsx
      {tab === 'marketing' && <MarketingTab state={state} dispatch={dispatch} />}
```

- [ ] **Step 3: Add the styles**

Append to `src/styles.css`:

```css
/* --- marketing channels ----------------------------------------------- */
.res-channel {
  padding: 10px;
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.03);
}
.res-channel .nm {
  font-weight: 700;
  font-size: 13.5px;
}
.res-channel .fl {
  font-size: 12px;
  opacity: 0.72;
  margin: 6px 0;
  line-height: 1.45;
}
.res-channel.on {
  border-color: var(--brass);
  animation: res-pulse 2.6s ease-in-out infinite;
}
.res-channel.lock {
  opacity: 0.45;
}
.res-channel.muted {
  border-color: var(--sold);
  animation: none;
}
@keyframes res-pulse {
  0%,
  100% {
    box-shadow: 0 0 0 0 rgba(201, 162, 39, 0);
  }
  50% {
    box-shadow: 0 0 0 3px rgba(201, 162, 39, 0.18);
  }
}
@media (prefers-reduced-motion: reduce) {
  .res-channel.on {
    animation: none;
    box-shadow: 0 0 0 2px rgba(201, 162, 39, 0.25);
  }
}
```

- [ ] **Step 4: Verify in the browser**

Load the app, open the Marketing tab, and confirm: channels below Buyer's Agent show a lock line, toggling one updates the "Active spend" total immediately, and the grid does not overflow at 375px.

```bash
npm run build && npm test
```

Expected: build succeeds, all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/components/MarketingTab.tsx src/App.tsx src/styles.css
git commit -m "feat: marketing tab with channel toggles and live spend"
```

---

## Task 15: Choice modal, closet presets, lead badges, summary, ticker

**Files:**
- Create: `src/components/ChoiceModal.tsx`
- Modify: `src/App.tsx`
- Modify: `src/components/ClosetTab.tsx`
- Modify: `src/components/LeadsTab.tsx`
- Modify: `src/components/WeekSummaryModal.tsx`
- Modify: `src/components/BragTicker.tsx`
- Modify: `src/styles.css`

- [ ] **Step 1: Create `src/components/ChoiceModal.tsx`**

```tsx
import type { Dispatch } from 'react'
import type { Action, PendingChoice } from '../state/types'

export default function ChoiceModal({
  choice,
  dispatch,
}: {
  choice: PendingChoice
  dispatch: Dispatch<Action>
}) {
  return (
    <div className="res-modal">
      <div className="res-card">
        <h2 className="res-display">{choice.title}</h2>
        <p style={{ fontSize: 13.5, lineHeight: 1.6 }}>{choice.body}</p>
        <div className="res-choices">
          {choice.options.map((o) => (
            <button
              key={o.key}
              className="res-go"
              onClick={() =>
                dispatch({ type: 'RESOLVE_CHOICE_EVENT', key: o.key })
              }
            >
              <span>{o.label}</span>
              <small>{o.hint}</small>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
```

Note the absence of a click-outside close handler: these modals require a decision, and the VRBO one deliberately offers exactly one way out.

- [ ] **Step 2: Render it in `src/App.tsx`**

Add the import `import ChoiceModal from './components/ChoiceModal'` and render it after the `WeekSummaryModal` block:

```tsx
      {state.pendingChoice && (
        <ChoiceModal choice={state.pendingChoice} dispatch={dispatch} />
      )}
```

- [ ] **Step 3: Add preset controls to `src/components/ClosetTab.tsx`**

Add the imports:

```tsx
import { useState } from 'react'
import { PRESET_SLOTS } from '../state/reducer'
```

Add this component above `ClosetTab`:

```tsx
function Presets({
  state,
  dispatch,
}: {
  state: GameState
  dispatch: Dispatch<Action>
}) {
  const [editing, setEditing] = useState<number | null>(null)
  const [draft, setDraft] = useState('')
  return (
    <div style={{ marginBottom: 18 }}>
      <div className="res-meta" style={{ marginBottom: 6 }}>
        Loadouts — swap the whole look in one tap
      </div>
      <div className="res-grid">
        {Array.from({ length: PRESET_SLOTS }).map((_, i) => {
          const p = state.outfitPresets[i]
          const name = p?.name ?? 'Empty slot ' + (i + 1)
          return (
            <div key={i} className="res-item">
              {editing === i ? (
                <input
                  className="res-input"
                  autoFocus
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onBlur={() => {
                    const trimmed = draft.trim()
                    if (trimmed) {
                      if (p)
                        dispatch({ type: 'RENAME_PRESET', index: i, name: trimmed })
                      else dispatch({ type: 'SAVE_PRESET', index: i, name: trimmed })
                    }
                    setEditing(null)
                  }}
                />
              ) : (
                <div className="nm">{name}</div>
              )}
              <div className="res-mini">
                <button
                  onClick={() =>
                    dispatch({
                      type: 'SAVE_PRESET',
                      index: i,
                      name: p?.name ?? 'Loadout ' + (i + 1),
                    })
                  }
                >
                  Save current
                </button>
                <button
                  disabled={!p}
                  onClick={() => dispatch({ type: 'LOAD_PRESET', index: i })}
                >
                  Wear
                </button>
                <button
                  onClick={() => {
                    setDraft(p?.name ?? '')
                    setEditing(i)
                  }}
                >
                  Rename
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
```

Render `<Presets state={state} dispatch={dispatch} />` as the first child inside the `res-panel dark` div, above the `SLOTS.map(...)` block.

- [ ] **Step 4: Show the channel badge on inbound leads**

In `src/components/LeadsTab.tsx`, locate the JSX that renders a lead card's client name. Immediately after the client-name element, insert:

```tsx
              {lead.channelId && (
                <span className="res-badge">
                  {channelOf(lead.channelId)?.name ?? 'Inbound'}
                </span>
              )}
```

Add the import `import { channelOf } from '../logic/marketing'`. If the local variable holding the lead in that map is not named `lead`, use whatever name is already there.

- [ ] **Step 5: Add the marketing section to the week summary**

In `src/components/WeekSummaryModal.tsx`, insert immediately before the `{!!summary.events.length && (` block:

```tsx
        {(summary.marketing.spend > 0 ||
          summary.marketing.leads > 0 ||
          summary.marketing.repChange !== 0) && (
          <div style={{ marginTop: 10 }}>
            <div className="res-meta">Marketing</div>
            <div className="res-line">
              <span>Ad spend</span>
              <b>{money(summary.marketing.spend)}</b>
            </div>
            <div className="res-line">
              <span>Leads it brought in</span>
              <b>{summary.marketing.leads}</b>
            </div>
            <div className="res-line">
              <span>Reputation</span>
              <b
                style={{
                  color:
                    summary.marketing.repChange >= 0
                      ? 'var(--mint)'
                      : 'var(--sold)',
                }}
              >
                {summary.marketing.repChange >= 0 ? '+' : ''}
                {summary.marketing.repChange}
              </b>
            </div>
          </div>
        )}
```

- [ ] **Step 6: Add verified styling to the ticker at Rep ≥ 75**

In `src/components/BragTicker.tsx`, add the import:

```tsx
import { REP_CELEBRITY_AT } from '../data/reputation'
```

Add `const verified = state.reputation >= REP_CELEBRITY_AT` inside the component, append `+ (verified ? ' verified' : '')` to the root element's `className`, and render `{verified && <span className="res-check">✔</span>}` immediately before the brag text.

- [ ] **Step 7: Add the styles**

Append to `src/styles.css`:

```css
/* --- inbound lead badge ----------------------------------------------- */
.res-badge {
  display: inline-block;
  margin-left: 6px;
  padding: 1px 6px;
  border: 1px solid var(--brass);
  border-radius: 999px;
  font-size: 10px;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: var(--brass);
  vertical-align: middle;
}

/* --- choice modal ----------------------------------------------------- */
.res-choices {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 14px;
}
.res-choices .res-go {
  display: flex;
  flex-direction: column;
  gap: 2px;
  text-align: left;
}
.res-choices .res-go small {
  font-weight: 400;
  opacity: 0.7;
  font-size: 11.5px;
  letter-spacing: 0;
  text-transform: none;
}

/* --- verified ticker + preset rename ---------------------------------- */
.res-check {
  color: #4ea1f0;
  margin-right: 5px;
}
.verified {
  border-color: #4ea1f0;
}
.res-input {
  width: 100%;
  padding: 4px 6px;
  border: 1px solid var(--brass);
  border-radius: 4px;
  background: #14161f;
  color: #f5f2ea;
  font: inherit;
  font-size: 13px;
}
```

- [ ] **Step 8: Verify in the browser**

Confirm each of these, using the browser preview:
1. Presets: equip something, click **Save current**, take it off, click **Wear** — the loadout returns in one click.
2. Rename a preset and confirm the name persists after a page refresh.
3. The Closet shows a **Body Modification** section.
4. At 375px width nothing overflows horizontally.

```bash
npm run build && npm test
```

Expected: build succeeds, all tests pass.

- [ ] **Step 9: Commit**

```bash
git add src/components src/App.tsx src/styles.css
git commit -m "feat: choice modal, closet presets, lead badges, summary marketing"
```

---

## Task 16: Acceptance pass and README

**Files:**
- Create: `src/state/__tests__/acceptance.test.ts`
- Modify: `README.md`

- [ ] **Step 1: Write the acceptance test**

Create `src/state/__tests__/acceptance.test.ts`:

```ts
import { afterEach, describe, expect, it } from 'vitest'
import { setSeed } from '../../logic/rand'
import { endWeek, initialState, reducer } from '../reducer'
import { migrate } from '../migrate'
import type { GameState } from '../types'

afterEach(() => setSeed(null))

describe('acceptance', () => {
  it('AC1 — a v1 save loads into v2 and can play a week without crashing', () => {
    setSeed(101)
    const v1 = {
      version: 1,
      week: 30,
      cash: 60000,
      careerEarnings: 120000,
      ap: 5,
      rank: 'sellerAgent',
      stats: { hustle: 4, swagger: 6, ego: 5 },
      permBonuses: { hustle: 1, swagger: 1 },
      leads: [],
      ownedSwagIds: ['discountSuit'],
      equipped: { outfit: 'discountSuit' },
      counters: { showingsRun: 50, dealsClosed: 14, leadsLost: 12 },
      activeModifiers: [],
      log: [],
      gameOver: false,
    }
    const s = migrate(v1)!
    expect(() => endWeek(s)).not.toThrow()
    expect(endWeek(s).careerEarnings).toBe(120000)
  })

  it('AC2 — channel billing and free inbound leads', () => {
    setSeed(102)
    const s = endWeek({
      ...initialState(),
      week: 8,
      rank: 'sellerAgent',
      cash: 20000,
      reputation: 20,
      activeChannelIds: ['billboard'],
    })
    expect(s.summary!.marketing.spend).toBe(1000)
    expect(s.ap).toBe(5)
  })

  it('AC5 — Top Producer promotion pays 60% thereafter', () => {
    setSeed(103)
    const ready: GameState = {
      ...initialState(),
      week: 55,
      rank: 'sellerAgent',
      cash: 300000,
      careerEarnings: 250000,
      reputation: 45,
      activeChannelIds: ['billboard'],
      counters: { showingsRun: 90, dealsClosed: 25, leadsLost: 20 },
    }
    const s = endWeek(ready)
    expect(s.rank).toBe('topProducer')
    expect(s.summary!.promo).toBe('Top Producer')
  })

  it('AC6 — every Tier 4 item is purchasable at Top Producer', () => {
    const rich: GameState = {
      ...initialState(),
      rank: 'topProducer',
      cash: 1000000,
    }
    const ids = [
      'buttImplants', 'calfImplants', 'jawlineSculpt', 'bicepImplants',
      'theHelmet', 'designerSuit', 'sequinJacket', 'chronograph',
      'diamondCane', 'lamboGold', 'entireFloor', 'goldNameplate',
    ]
    const owned = ids.reduce(
      (s, id) => reducer(s, { type: 'BUY_SWAG', itemId: id }),
      rich,
    )
    ids.forEach((id) => expect(owned.ownedSwagIds).toContain(id))
  })

  it('AC7 — the VRBO offer only ever offers a decline', () => {
    setSeed(104)
    let s: GameState = {
      ...initialState(),
      week: 10,
      rank: 'sellerAgent',
      gagCounters: { vrboOffers: 0, nextVrboWeek: 10 },
    }
    for (let i = 0; i < 3; i++) {
      s = endWeek(s)
      if (s.pendingChoice?.id === 'vrboSpam') {
        expect(s.pendingChoice.options).toHaveLength(1)
        s = reducer(s, { type: 'RESOLVE_CHOICE_EVENT', key: 'decline' })
      }
      s = { ...s, week: s.week + 6 }
    }
    expect(s.gagCounters.vrboOffers).toBeGreaterThanOrEqual(1)
  })

  it('AC9 — Phase 1 loop still works end to end', () => {
    setSeed(105)
    let s = initialState()
    s = reducer(s, { type: 'ASSIST_SHOWING' })
    expect(s.cash).toBe(900)
    expect(s.ap).toBe(4)
    s = reducer(s, { type: 'SIDE_HUSTLE' })
    expect(s.ap).toBe(3)
    s = endWeek(s)
    expect(s.week).toBe(2)
    expect(s.ap).toBe(5)
  })
})
```

- [ ] **Step 2: Run the full suite**

```bash
npm test
```

Expected: every suite passes.

- [ ] **Step 3: Lint and build**

```bash
npm run lint && npm run build
```

Expected: no lint errors, build succeeds. Fix anything reported before continuing.

- [ ] **Step 4: Manual acceptance in the browser**

Work through the spec's §11 list that automated tests cannot cover. Open the app and confirm:
- **AC3** — cross Rep 15 and see the toast plus inbound leads beginning; cross 75 and see the ticker's checkmark styling.
- **AC4** — save an "Otis Mode" preset with no ego items and a "Full Gremlin" preset with Tier 4 body mods, and confirm the close chance on an Old Money Otis lead visibly differs between them.
- **AC8** — turn on Community Sponsorship and confirm the marketing tab shows it as active and pulsing.

Record any failures and fix them before committing.

- [ ] **Step 5: Update the README**

In `README.md`, extend the layout section with the new files (`src/data/marketing.ts`, `src/data/reputation.ts`, `src/logic/marketing.ts`, `src/state/migrate.ts`, and the new components), and add a short Phase 2 section covering: the save format is now `version: 2` under the unchanged `res_save_v1` key, v1 saves migrate automatically, and `npm test` runs the Vitest suite.

- [ ] **Step 6: Commit**

```bash
git add src/state/__tests__/acceptance.test.ts README.md
git commit -m "test: Phase 2 acceptance suite and README update"
```

---

## Self-Review Notes

**Spec coverage** — §2 project structure (Tasks 2, 3, 7, 13–15), §3 reputation (Tasks 4, 8), §4 all 9 channels (Task 7), §5 Rank 5 (Task 5), §6 12 Tier 4 items (Task 10), §7 4 archetypes + presets (Tasks 6, 9, 15), §8 8 events (Task 11), §9 UI additions (Tasks 13–15), §10 data model + actions + End Week order (Tasks 2, 8, 9, 11), §11 acceptance (Task 16), §12 tuning values used verbatim.

**Open items for the implementer to raise, not silently resolve:**
- Task 15 Step 4 depends on the exact JSX in `LeadsTab.tsx`. Read the file before editing; if the lead card has no obvious name element, place the badge wherever the client name is rendered and note the choice in the commit.
- The four deliberate spec deviations are listed under **File Structure** above. If a reviewer rejects any of them, the affected tasks are 2 (types), 8 (End Week), and 11 (VRBO cadence, algorithm mute).
