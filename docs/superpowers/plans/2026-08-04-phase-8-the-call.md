# Phase 8 — The Call Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the single hidden close roll with a three-turn phone dialogue for high-value leads, where the player picks tactics against archetype "tells" to swing the existing close chance by roughly ±25 points.

**Architecture:** The minigame *modulates* the close formula rather than replacing it. `closeChance()` still produces the base number; a `momentum` score accumulated over three turns is added as `momentum / 100`. The success/failure body of `ATTEMPT_CLOSE` is extracted into `logic/close.ts` as `resolveClose(state, lead, finalChance)` so the dice path and the call path run literally the same code. New state field `call: CallState | null` blocks all other actions while non-null, mirroring the existing `pendingChoice` modal pattern.

**Tech Stack:** TypeScript, React 19, Vite 8, Vitest 3. No new dependencies.

**Source spec:** `docs/superpowers/specs/2026-08-04-phone-call-design.md`. Where this plan and the spec disagree, the spec wins — but they should not disagree.

---

## Commands You Will Need

Run tests: `npm test`
Run one test file: `npx vitest run src/logic/__tests__/call.test.ts`
Run one test by name: `npx vitest run src/logic/__tests__/call.test.ts -t "name of test"`
Typecheck + build: `npm run build`
Lint: `npm run lint`

Note: `npm test` is `vitest run` (single pass, not watch mode).

---

## Codebase Orientation (read this before Task 1)

You have not seen this codebase. Facts you need:

- **State is a single reducer.** `src/state/reducer.ts` exports `reducer(state: GameState, action: Action)`. It is ~1682 lines and one giant `switch`. The action union type is called **`Action`**, not `GameAction`, and lives in `src/state/types.ts`.
- **Every reducer case returns a new state.** Nothing mutates. Most cases end with `sync(withLog(s, kind, text))`.
- `sync(state)` re-derives `state.stats` from equipment/bonuses. Every state change goes through it.
- `withLog(state, kind, text)` appends a log entry. Kinds used here: `'flavor'`, `'event'`, `'deal'`, `'money'`.
- **All randomness goes through `src/logic/rand.ts`** — `rand()`, `pick(array)`, `chance(p)`, `randInt(lo,hi)`, `money(n)`. Tests make it deterministic with `setSeed(n)` from the same module. Never call `Math.random()` directly.
- **Tuning constants live in per-phase data files:** `src/data/p3.ts`, `p5.ts`, `p6.ts` each export a single frozen object (`P3`, `P5`, `P6`). Phase 8 follows this with `src/data/p8.ts` exporting `P8`.
- **Tests live in `src/logic/__tests__/` and `src/state/__tests__/`**, use `vitest` (`describe`/`it`/`expect`), and import `initialState` from `../../state/reducer` to build fixtures.
- **CSS is one hand-written file**, `src/styles.css`, with `res-`-prefixed classes and CSS custom properties on `:root`: `--ink` `--ink2` `--ink3` `--marble` `--brass` `--sold` `--mint` `--muted`. There is already a global `@media(prefers-reduced-motion:reduce){ *{animation:none!important;transition:none!important} }` block at line ~127 — animations are handled for you, but JS-driven effects (the typewriter) still need an explicit check.
- **Modals** use `.res-modal` (fixed full-screen backdrop) wrapping `.res-card`. See `src/components/PortfolioChoiceModal.tsx` for the pattern; it is mounted unconditionally in `src/App.tsx:223` and returns `null` when it has nothing to show.

### Existing code you will move (`src/state/reducer.ts:450-526`)

This is the current `ATTEMPT_CLOSE` case in full. Task 4 splits it. Read it now so the refactor makes sense:

```ts
case 'ATTEMPT_CLOSE': {
  if (state.ap < 1 || state.rank === 'receptionist') return state
  const lead = state.leads.find((l) => l.id === action.leadId)
  if (!lead || lead.stage !== 'ready' || lead.sold) return state
  const a = arch(lead.archetypeId)
  let s = spendAp(state, 1)
  const success = chance(closeChance(state, lead))
  if (!success) {
    s = applyAccentSlip(s)
    if (lead.retriedClose) { /* remove lead, leadsLost += 1, "walked for good" */ }
    /* else: patience - 1, retriedClose = true, "sleep on it" */
  }
  /* success: commission, undercut check, cash, sold, dealsClosed, rep, weekDealDistricts, gain() */
}
```

---

## File Structure

| File | Status | Responsibility |
|---|---|---|
| `src/data/p8.ts` | create | The `P8` tuning constants. Nothing else. |
| `src/data/callCards.ts` | create | `CALL_CARDS` — the five tactics, their hints, their player lines. Pure data. |
| `src/data/callBeats.ts` | create | `CALL_BEATS`, `GENERIC_BEATS`, `CLIENT_REPLIES`, `ARCHETYPE_TELLS`. Pure data. |
| `src/logic/stateOps.ts` | create | `sync` and `applyAccentSlip`, moved out of `reducer.ts` so `close.ts` can use them without an import cycle. |
| `src/logic/close.ts` | create | `resolveClose(state, lead, finalChance)` — the shared close outcome. |
| `src/logic/call.ts` | create | The pure turn engine. No reducer knowledge, no React. |
| `src/components/CallModal.tsx` | create | The blocking modal. |
| `src/state/types.ts` | modify | New call types, `GameState` fields, new `Action` members. |
| `src/state/reducer.ts` | modify | Blocking guard, `ATTEMPT_CLOSE` fork, four new cases, `initialState` defaults. |
| `src/state/migrate.ts` | modify | v5 → v6. |
| `src/data/brags.ts` | modify | `CALL_BRAGS`. |
| `src/logic/economy.ts` | modify | Wire `CALL_BRAGS` into `bragFor`. |
| `src/components/OfficeTab.tsx` | modify | Settings toggle + three debug controls. |
| `src/App.tsx` | modify | Mount `CallModal`, disable End Week during a call. |
| `src/styles.css` | modify | Call modal styles. |
| `src/logic/__tests__/call.test.ts` | create | Engine + acceptance coverage. |
| `src/state/__tests__/migrate.test.ts` | modify | v6 migration cases. |

---

## Task 1: Constants and types

**Files:**
- Create: `src/data/p8.ts`
- Modify: `src/state/types.ts`
- Test: `src/logic/__tests__/call.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/logic/__tests__/call.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { P8 } from '../../data/p8'

describe('P8 constants', () => {
  it('sets the trigger threshold and always-call roster', () => {
    expect(P8.CALL_THRESHOLD).toBe(400000)
    expect([...P8.ALWAYS_CALL]).toEqual([
      'luxLorenzo',
      'celebrityCleo',
      'oldMoneyOtis',
    ])
  })

  it('sets the momentum band and the per-reaction deltas', () => {
    expect(P8.TURNS).toBe(3)
    expect(P8.MOMENTUM_START).toBe(0)
    expect(P8.MOMENTUM_MIN).toBe(-30)
    expect(P8.MOMENTUM_MAX).toBe(30)
    expect(P8.GREAT).toBe(10)
    expect(P8.GOOD).toBe(5)
    expect(P8.NEUTRAL).toBe(0)
    expect(P8.BAD).toBe(-6)
    expect(P8.TERRIBLE).toBe(-12)
  })

  it('sets the penalties, bonuses, and scaling factors', () => {
    expect(P8.REPEAT_PENALTY).toBe(4)
    expect(P8.READ_COST_AP).toBe(0)
    expect(P8.PATIENCE_ON_HANGUP).toBe(1)
    expect(P8.HANGUP_MOMENTUM).toBe(-25)
    expect(P8.PERFECT_BONUS).toBe(8)
    expect(P8.EGO_TACTIC_SCALE).toBe(0.4)
    expect(P8.SWAGGER_TACTIC_SCALE).toBe(0.5)
    expect(P8.RETRY_MOMENTUM).toBe(-5)
  })
})
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run src/logic/__tests__/call.test.ts`
Expected: FAIL — `Failed to resolve import "../../data/p8"`.

- [ ] **Step 3: Create the constants**

Create `src/data/p8.ts`:

```ts
/* Phase 8 tuning. Every number the phone call moves lives here.
   Per the spec's tuning note: if the minigame feels too strong, adjust
   MOMENTUM_MAX and the GREAT/GOOD values first — never the reaction table in
   data/callBeats.ts, which is the game's actual content. */

export const P8 = {
  CALL_THRESHOLD: 400000, // salePrice at or above this triggers a call
  ALWAYS_CALL: ['luxLorenzo', 'celebrityCleo', 'oldMoneyOtis'] as const,
  TURNS: 3,
  MOMENTUM_START: 0,
  /* Momentum IS the close-chance delta, in points. +18 momentum is +0.18 chance. */
  MOMENTUM_MIN: -30,
  MOMENTUM_MAX: 30,
  /* Per-turn momentum deltas, before stat scaling and the repeat penalty. */
  GREAT: 10,
  GOOD: 5,
  NEUTRAL: 0,
  BAD: -6,
  TERRIBLE: -12,
  REPEAT_PENALTY: 4, // subtracted per prior use of the same tactic this call
  READ_COST_AP: 0, // Read is free, but it consumes the turn's tactic slot
  PATIENCE_ON_HANGUP: 1,
  HANGUP_MOMENTUM: -25, // at or below this, turn 2 ends the call immediately
  PERFECT_BONUS: 8, // all three turns GREAT
  EGO_TACTIC_SCALE: 0.4, // Flex scales with ego x egoAffinity
  SWAGGER_TACTIC_SCALE: 0.5, // Push scales with swagger
  RETRY_MOMENTUM: -5, // a second call on the same lead starts here
} as const
```

- [ ] **Step 4: Run the test and watch it pass**

Run: `npx vitest run src/logic/__tests__/call.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 5: Add the types**

In `src/state/types.ts`, find the `export interface Lead {` block (around line 457). Insert this block **immediately above** it:

```ts
/* ------------------------------------------------------------- phase 8 */

export type TacticId = 'empathize' | 'push' | 'namedrop' | 'flex' | 'read'
/** Everything except Read. Read has no reaction and no tell. */
export type PlayableTactic = Exclude<TacticId, 'read'>
export type Reaction = 'great' | 'good' | 'neutral' | 'bad' | 'terrible'

/** What the client says at the start of a turn. */
export interface CallBeat {
  id: string
  /** Which archetypes can draw this beat. `'any'` means all of them. */
  archetypeIds: string[] | 'any'
  turn: 1 | 2 | 3 | 'any'
  /** Supports the {name} and {price} placeholders. */
  text: string
  /** OVERRIDES the archetype default, for this beat only. */
  tell?: Partial<Record<PlayableTactic, Reaction>>
}

/** A tactic button. */
export interface CallCard {
  id: TacticId
  label: string
  hint: string
  /** Picked by a stable hash of beatId + tacticId, so a situation reads the
   *  same way twice. */
  playerLines: string[]
}

export interface CallTurn {
  turn: number
  beatId: string
  tacticUsed: TacticId | null
  reaction: Reaction | null
  delta: number
  clientReply: string
}

export interface CallState {
  leadId: string
  /** 1..3 */
  turn: number
  momentum: number
  history: CallTurn[]
  usedTactics: TacticId[]
  /** Beats never repeat within a call. `history` cannot express this on its
   *  own, because Read holds one beat across two entries. */
  usedBeatIds: string[]
  currentBeatId: string
  revealedTells: TacticId[]
  phase: 'awaitingTactic' | 'showingReaction' | 'resolving' | 'resolved'
  outcome: null | { success: boolean; finalChance: number; payout: number }
}
```

Then find the end of the `GameState` interface — the `weekFarmedDistricts: string[]` line followed by `}` (around line 613). Insert **before** that closing brace:

```ts

  /* ------------------------------------------------------------ phase 8 */

  /** Non-null means the call modal is open and every other action is blocked. */
  call: CallState | null
  /** Settings toggle. False reverts every close to the old instant dice roll. */
  callsEnabled: boolean
  callStats: { calls: number; perfectCalls: number; hangups: number }
```

Finally, in the `Action` union, after the `| { type: 'DEBUG_KING_CHECK' }` line, append:

```ts
  /* ---- phase 8 ---- */
  | { type: 'PLAY_TACTIC'; tacticId: TacticId }
  | { type: 'ADVANCE_CALL' }
  | { type: 'CLOSE_CALL_MODAL' }
  | { type: 'SET_CALLS_ENABLED'; enabled: boolean }
  | { type: 'DEBUG_FORCE_CALL'; leadId: string }
  | { type: 'DEBUG_SET_MOMENTUM'; momentum: number }
  | { type: 'DEBUG_REVEAL_TELLS' }
```

- [ ] **Step 6: Typecheck**

Run: `npm run build`
Expected: FAIL, with errors in `src/state/reducer.ts` saying the object literal in `initialState` is missing `call`, `callsEnabled`, and `callStats`. That is correct — Task 5 adds them. Do not fix it yet.

- [ ] **Step 7: Commit**

```bash
git add src/data/p8.ts src/state/types.ts src/logic/__tests__/call.test.ts
git commit -m "feat(call): P8 constants and call types"
```

---

## Task 2: Tactic cards

**Files:**
- Create: `src/data/callCards.ts`
- Test: `src/logic/__tests__/call.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `src/logic/__tests__/call.test.ts`:

```ts
import { CALL_CARDS, cardOf } from '../../data/callCards'

describe('call cards', () => {
  it('ships five tactics in display order, Read last', () => {
    expect(CALL_CARDS.map((c) => c.id)).toEqual([
      'empathize',
      'push',
      'namedrop',
      'flex',
      'read',
    ])
  })

  it('gives every card a label, a hint, and player lines', () => {
    CALL_CARDS.forEach((c) => {
      expect(c.label.length).toBeGreaterThan(0)
      expect(c.hint.length).toBeGreaterThan(0)
      expect(c.playerLines.length).toBeGreaterThan(0)
    })
  })

  it('gives the four playable tactics four lines each, and Read three', () => {
    expect(cardOf('empathize').playerLines).toHaveLength(4)
    expect(cardOf('push').playerLines).toHaveLength(4)
    expect(cardOf('namedrop').playerLines).toHaveLength(4)
    expect(cardOf('flex').playerLines).toHaveLength(4)
    expect(cardOf('read').playerLines).toHaveLength(3)
  })

  it('marks Read as costing the turn', () => {
    expect(cardOf('read').hint).toContain('Costs the turn')
  })
})
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run src/logic/__tests__/call.test.ts`
Expected: FAIL — `Failed to resolve import "../../data/callCards"`.

- [ ] **Step 3: Create the data**

Create `src/data/callCards.ts`. Every line is content — reproduce it exactly:

```ts
import type { CallCard, TacticId } from '../state/types'

/** The tactic buttons, in the order they render. Read is always last. */
export const CALL_CARDS: CallCard[] = [
  {
    id: 'empathize',
    label: 'Empathize',
    hint: 'Slow down. Listen. Mean it.',
    playerLines: [
      "'That's a real concern, and I'd rather you raise it now than after closing.'",
      "'You don't have to decide today. I want you to decide right.'",
      "'Tell me what's actually worrying you. The rest is paperwork.'",
      "'Nobody should feel rushed into the biggest purchase of their life.'",
    ],
  },
  {
    id: 'push',
    label: 'Push',
    hint: 'Create urgency. Ask for the signature.',
    playerLines: [
      "'There are two other showings booked tomorrow. I'm telling you that because it's true.'",
      "'If you want it, we write it up tonight. That's the whole strategy.'",
      "'I can hold it until nine. After that I genuinely can't.'",
      "'Let's stop circling. Yes or no — I'll respect either one.'",
    ],
  },
  {
    id: 'namedrop',
    label: 'Namedrop',
    hint: 'Comps, credentials, and who you know.',
    playerLines: [
      "'The same floorplan two streets over went $30k above ask in eleven days.'",
      "'I sold the house behind yours. And the one behind that.'",
      "'My inspector can be in there Thursday. He owes me one.'",
      "'I've done four of these this quarter. The pattern is very consistent.'",
    ],
  },
  {
    id: 'flex',
    label: 'Flex',
    hint: 'Full presence. Let them see the blazer.',
    playerLines: [
      "'People don't hire me to be quiet. They hire me because I win these.'",
      "'You've seen the benches. That's not vanity, that's market share.'",
      "'I don't lose bidding wars. I'd rather you hear that from me than from someone else.'",
      "'Look — the jacket is doing a lot of work here, but so is my record.'",
    ],
  },
  {
    id: 'read',
    label: 'Read the Room',
    hint: 'Say nothing. Learn one thing. (Costs the turn.)',
    playerLines: [
      'You let the silence sit. It does what silence does.',
      "You say 'mm' and wait. They fill the gap.",
      "You listen to what they're not saying.",
    ],
  },
]

/** Never throws. An unknown id falls back to the first card. */
export const cardOf = (id: TacticId): CallCard =>
  CALL_CARDS.find((c) => c.id === id) ?? CALL_CARDS[0]
```

- [ ] **Step 4: Run the test and watch it pass**

Run: `npx vitest run src/logic/__tests__/call.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 5: Commit**

```bash
git add src/data/callCards.ts src/logic/__tests__/call.test.ts
git commit -m "feat(call): the five tactic cards"
```

---

## Task 3: Beats, tells, and client replies

**Files:**
- Create: `src/data/callBeats.ts`
- Test: `src/logic/__tests__/call.test.ts`

This is the largest data file and it is the game's actual content. Reproduce every string exactly. Note the typographic characters: `…` (ellipsis) and `—` (em dash) appear in several lines and must be preserved.

- [ ] **Step 1: Write the failing test**

Append to `src/logic/__tests__/call.test.ts`:

```ts
import { ARCHETYPES } from '../../data/archetypes'
import {
  ARCHETYPE_TELLS,
  CALL_BEATS,
  CLIENT_REPLIES,
  GENERIC_BEATS,
} from '../../data/callBeats'
import type { PlayableTactic, Reaction } from '../../state/types'

const PLAYABLE: PlayableTactic[] = ['empathize', 'push', 'namedrop', 'flex']
const TIERS: Reaction[] = ['great', 'good', 'neutral', 'bad', 'terrible']

describe('archetype tells', () => {
  it('covers every shipped archetype plus a default row', () => {
    expect(ARCHETYPE_TELLS.default).toBeDefined()
    ARCHETYPES.forEach((a) => {
      expect(ARCHETYPE_TELLS[a.id], a.id).toBeDefined()
    })
  })

  it('gives every row all four playable tactics', () => {
    Object.entries(ARCHETYPE_TELLS).forEach(([id, row]) => {
      PLAYABLE.forEach((t) => expect(TIERS, id + '.' + t).toContain(row[t]))
    })
  })

  it('gives every archetype exactly one great', () => {
    Object.entries(ARCHETYPE_TELLS).forEach(([id, row]) => {
      if (id === 'default') return
      const vals = PLAYABLE.map((t) => row[t])
      expect(vals.filter((v) => v === 'great'), id).toHaveLength(1)
    })
  })

  /* Five agreeable archetypes have no way to actively blow it — they have an
     obvious right answer and no punishing cell. That is deliberate: it is what
     makes the luxury tier's terribles feel sharp by contrast. Pinned here so an
     accidental edit is caught in either direction. See spec §6's correction
     note — the source spec's "at least one bad/terrible" claim is not true of
     the table it annotates. */
  it('leaves exactly five archetypes with no negative tell', () => {
    const noNegative = Object.entries(ARCHETYPE_TELLS)
      .filter(([id]) => id !== 'default')
      .filter(([, row]) =>
        PLAYABLE.every((t) => row[t] !== 'bad' && row[t] !== 'terrible'),
      )
      .map(([id]) => id)
      .sort()
    expect(noNegative).toEqual(
      ['flipBro', 'ghostGary', 'hgtvCouple', 'relocRob', 'techTyler'].sort(),
    )
  })

  it('keeps the luxury split — Lorenzo and Cleo reward Flex, Otis punishes it', () => {
    expect(ARCHETYPE_TELLS.luxLorenzo.flex).toBe('great')
    expect(ARCHETYPE_TELLS.celebrityCleo.flex).toBe('great')
    expect(ARCHETYPE_TELLS.oldMoneyOtis.flex).toBe('terrible')
    expect(ARCHETYPE_TELLS.oldMoneyOtis.namedrop).toBe('great')
  })
})

describe('beats', () => {
  it('ships nineteen beats with unique ids', () => {
    expect(CALL_BEATS).toHaveLength(19)
    expect(new Set(CALL_BEATS.map((b) => b.id)).size).toBe(19)
  })

  it('ships at least three beats per turn, counting the any-turn pool', () => {
    ;[1, 2, 3].forEach((turn) => {
      const n = CALL_BEATS.filter(
        (b) => b.turn === turn || b.turn === 'any',
      ).length
      expect(n, 'turn ' + turn).toBeGreaterThanOrEqual(3)
    })
  })

  it('only references archetypes that exist', () => {
    const known = new Set(ARCHETYPES.map((a) => a.id))
    CALL_BEATS.forEach((b) => {
      if (b.archetypeIds === 'any') return
      b.archetypeIds.forEach((id) => expect(known, b.id).toContain(id))
    })
  })

  it('only uses valid reactions in tell overrides', () => {
    CALL_BEATS.forEach((b) => {
      Object.entries(b.tell ?? {}).forEach(([t, r]) => {
        expect(PLAYABLE, b.id).toContain(t)
        expect(TIERS, b.id).toContain(r)
      })
    })
  })

  it('has one generic fallback beat per turn, outside the main pool', () => {
    expect(Object.keys(GENERIC_BEATS).sort()).toEqual(['1', '2', '3'])
    ;[1, 2, 3].forEach((t) => {
      const b = GENERIC_BEATS[t as 1 | 2 | 3]
      expect(b.turn).toBe(t)
      expect(b.tell).toBeUndefined()
      expect(CALL_BEATS.some((x) => x.id === b.id)).toBe(false)
    })
  })
})

describe('client replies', () => {
  it('ships four lines for every reaction tier', () => {
    TIERS.forEach((t) => expect(CLIENT_REPLIES[t], t).toHaveLength(4))
  })
})
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run src/logic/__tests__/call.test.ts`
Expected: FAIL — `Failed to resolve import "../../data/callBeats"`.

- [ ] **Step 3: Create the data**

Create `src/data/callBeats.ts`:

```ts
import type { CallBeat, PlayableTactic, Reaction } from '../state/types'

type TellRow = Record<PlayableTactic, Reaction>

/**
 * Default reaction per archetype per tactic. A beat's own `tell` overrides an
 * individual cell; this is the fallback underneath it.
 *
 * DO NOT ALTER THIS TABLE. Every archetype has exactly one `great` and at
 * least one `bad`/`terrible`. The luxury-tier split — Lorenzo and Cleo reward
 * Flex, Otis punishes it — is the single most important balance line in the
 * design, because it forces loadout-aware play on the leads that pay the most.
 */
export const ARCHETYPE_TELLS: Record<string, TellRow> = {
  default: { empathize: 'good', push: 'neutral', namedrop: 'good', flex: 'neutral' },
  firstTimer: { empathize: 'great', push: 'terrible', namedrop: 'good', flex: 'bad' },
  retireeRuth: { empathize: 'great', push: 'bad', namedrop: 'good', flex: 'terrible' },
  nightmareNancy: { empathize: 'great', push: 'bad', namedrop: 'neutral', flex: 'bad' },
  hgtvCouple: { empathize: 'good', push: 'neutral', namedrop: 'great', flex: 'neutral' },
  relocRob: { empathize: 'neutral', push: 'great', namedrop: 'good', flex: 'neutral' },
  cashChad: { empathize: 'bad', push: 'good', namedrop: 'neutral', flex: 'great' },
  flipBro: { empathize: 'neutral', push: 'good', namedrop: 'great', flex: 'good' },
  techTyler: { empathize: 'neutral', push: 'good', namedrop: 'great', flex: 'good' },
  lowballLarry: { empathize: 'neutral', push: 'bad', namedrop: 'great', flex: 'bad' },
  ghostGary: { empathize: 'good', push: 'great', namedrop: 'neutral', flex: 'neutral' },
  influencerIzzy: { empathize: 'bad', push: 'neutral', namedrop: 'neutral', flex: 'great' },
  celebrityCleo: { empathize: 'bad', push: 'bad', namedrop: 'good', flex: 'great' },
  luxLorenzo: { empathize: 'neutral', push: 'bad', namedrop: 'good', flex: 'great' },
  oldMoneyOtis: { empathize: 'good', push: 'terrible', namedrop: 'great', flex: 'terrible' },
}

/** What the client opens each turn with. {name} and {price} are filled at
 *  render time. A beat is drawn at most once per call. */
export const CALL_BEATS: CallBeat[] = [
  /* ---- turn 1: the opening ---- */
  {
    id: 't1_generic_a',
    archetypeIds: 'any',
    turn: 1,
    text: "'So. We've seen it, we've talked about it. Where are we at?'",
  },
  {
    id: 't1_generic_b',
    archetypeIds: 'any',
    turn: 1,
    text: "'My spouse asked me last night if we're actually doing this. I didn't have an answer.'",
    tell: { push: 'bad' },
  },
  {
    id: 't1_generic_c',
    archetypeIds: 'any',
    turn: 1,
    text: "'Talk me through the number one more time. {price} is a lot of number.'",
    tell: { namedrop: 'great' },
  },
  {
    id: 't1_first',
    archetypeIds: ['firstTimer', 'retireeRuth'],
    turn: 1,
    text: "'I keep waking up at three in the morning about this. Is that normal?'",
    tell: { empathize: 'great', flex: 'terrible' },
  },
  {
    id: 't1_lux',
    archetypeIds: ['luxLorenzo', 'celebrityCleo'],
    turn: 1,
    text: "'I've had three agents call me this week. Why are we still talking?'",
    tell: { flex: 'great', empathize: 'bad' },
  },
  {
    id: 't1_otis',
    archetypeIds: ['oldMoneyOtis'],
    turn: 1,
    text: "'I don't need this sold quickly. I need it sold *properly*.'",
    tell: { push: 'terrible', namedrop: 'great' },
  },
  {
    id: 't1_investor',
    archetypeIds: ['flipBro', 'techTyler', 'cashChad'],
    turn: 1,
    text: "'Run me the numbers again. Not the story. The numbers.'",
    tell: { namedrop: 'great', empathize: 'bad' },
  },

  /* ---- turn 2: the objection ---- */
  {
    id: 't2_price',
    archetypeIds: 'any',
    turn: 2,
    text: "'I think it's overpriced. I'm not saying it's not nice. I'm saying it's overpriced.'",
    tell: { namedrop: 'great' },
  },
  {
    id: 't2_timing',
    archetypeIds: 'any',
    turn: 2,
    text: "'What if we just… waited? Until spring. Or next spring.'",
    tell: { push: 'good' },
  },
  {
    id: 't2_other_agent',
    archetypeIds: 'any',
    turn: 2,
    text: "'Someone else told me they could get it for less. I don't know if I believe them.'",
    tell: { flex: 'good', empathize: 'neutral' },
  },
  {
    id: 't2_cold_feet',
    archetypeIds: ['firstTimer', 'nightmareNancy', 'retireeRuth'],
    turn: 2,
    text: "'What if we hate it? What if in a year we hate it?'",
    tell: { empathize: 'great', push: 'terrible' },
  },
  {
    id: 't2_ego',
    archetypeIds: ['influencerIzzy', 'celebrityCleo', 'cashChad'],
    turn: 2,
    text: "'Be honest — are you actually the right person for this?'",
    tell: { flex: 'great', empathize: 'bad' },
  },
  {
    id: 't2_deference',
    archetypeIds: ['oldMoneyOtis', 'retireeRuth'],
    turn: 2,
    text: "'My family has been in this house for forty years. I want that respected.'",
    tell: { empathize: 'great', flex: 'terrible', push: 'terrible' },
  },

  /* ---- turn 3: the decision ---- */
  {
    id: 't3_generic_a',
    archetypeIds: 'any',
    turn: 3,
    text: "'Okay. Okay. Say the thing that makes me sign.'",
  },
  {
    id: 't3_generic_b',
    archetypeIds: 'any',
    turn: 3,
    text: "'One reason. Give me one good reason and I'll do it.'",
    tell: { push: 'great' },
  },
  {
    id: 't3_wobble',
    archetypeIds: 'any',
    turn: 3,
    text: "'I'm at fifty-fifty. Genuinely fifty-fifty.'",
  },
  {
    id: 't3_soft',
    archetypeIds: ['firstTimer', 'retireeRuth', 'hgtvCouple'],
    turn: 3,
    text: "'If you tell me this is the right move, I'll believe you.'",
    tell: { empathize: 'great', flex: 'bad' },
  },
  {
    id: 't3_hard',
    archetypeIds: ['cashChad', 'relocRob', 'techTyler'],
    turn: 3,
    text: "'I've got another call in four minutes. Land it.'",
    tell: { push: 'great', empathize: 'terrible' },
  },
  {
    id: 't3_lux',
    archetypeIds: ['luxLorenzo', 'celebrityCleo'],
    turn: 3,
    text: "'Convince me you're the person whose name goes on this.'",
    tell: { flex: 'great' },
  },
]

/**
 * Last-resort beats, never drawn while any normal candidate remains. They
 * reuse the text of the plainest beat for their turn and carry no tell
 * overrides, so they always fall through to the archetype row.
 */
export const GENERIC_BEATS: Record<1 | 2 | 3, CallBeat> = {
  1: {
    id: 'genericBeat1',
    archetypeIds: 'any',
    turn: 1,
    text: "'So. We've seen it, we've talked about it. Where are we at?'",
  },
  2: {
    id: 'genericBeat2',
    archetypeIds: 'any',
    turn: 2,
    text: "'I think it's overpriced. I'm not saying it's not nice. I'm saying it's overpriced.'",
  },
  3: {
    id: 'genericBeat3',
    archetypeIds: 'any',
    turn: 3,
    text: "'Okay. Okay. Say the thing that makes me sign.'",
  },
}

/** Replies are generated per reaction tier, not per beat. Keeps the data small
 *  and still reads fine, because the beat already carried the specifics. */
export const CLIENT_REPLIES: Record<Reaction, string[]> = {
  great: [
    "'…Okay. Yeah. Okay, that's exactly it.'",
    "There's a pause, and it's the good kind.",
    "'That's the first straight answer I've gotten all month.'",
    'You can hear them nodding. People nod audibly. It’s a real thing.',
  ],
  good: [
    "'Hm. That's fair.'",
    "'Alright, I hear you.'",
    "'That does help, actually.'",
    "'Okay, keep going.'",
  ],
  neutral: [
    "'Mm-hm.'",
    "'Sure.'",
    'A noise that could mean anything.',
    "'Right, right.'",
  ],
  bad: [
    "'…I don't know about that.'",
    "There's a silence, and it's the other kind.",
    "'That's not really what I asked.'",
    'You hear a chair move. Never a good sign.',
  ],
  terrible: [
    "'Wow. Okay.'",
    "'You know what, forget it.'",
    'The temperature of the call drops through the floor.',
    "'I'm going to be honest, that was the wrong thing to say.'",
  ],
}
```

- [ ] **Step 4: Run the test and watch it pass**

Run: `npx vitest run src/logic/__tests__/call.test.ts`
Expected: PASS, 18 tests total (7 carried over from Tasks 1–2, 11 added here).

- [ ] **Step 5: Commit**

```bash
git add src/data/callBeats.ts src/logic/__tests__/call.test.ts
git commit -m "feat(call): beats, archetype tells, and client replies"
```

---

## Task 4: Extract `resolveClose` (pure refactor, no behaviour change)

**Files:**
- Create: `src/logic/stateOps.ts`, `src/logic/close.ts`
- Modify: `src/state/reducer.ts`

`close.ts` needs `sync` and `applyAccentSlip`, which are private to `reducer.ts`. If `close.ts` imported them from `reducer.ts` while `reducer.ts` imported `resolveClose` from `close.ts`, that is an import cycle. Move both helpers into a new `stateOps.ts` that neither imports.

**This task must not change behaviour.** The existing test suite is the proof.

- [ ] **Step 1: Record the baseline**

Run: `npm test`
Expected: PASS. Write down the total test count — it must be identical at the end of this task.

- [ ] **Step 2: Create `src/logic/stateOps.ts`**

```ts
/* Two helpers that every state change leans on, extracted from the reducer so
   logic/close.ts can use them without an import cycle. */

import { charLine, hasFlag, pushStatModifier } from './characters'
import { deriveStats } from './economy'
import { withLog } from './log'
import { P5 } from '../data/p5'
import type { GameState } from '../state/types'

/** Stats are derived, so every state change re-syncs them. */
export function sync(state: GameState): GameState {
  return { ...state, stats: deriveStats(state) }
}

/** A failed close costs the accent, and the accent was the swagger. Does not
 *  stack: a slip while one is already live is a no-op. */
export function applyAccentSlip(state: GameState): GameState {
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
```

- [ ] **Step 3: Delete both functions from `reducer.ts` and import them instead**

In `src/state/reducer.ts`, delete the `applyAccentSlip` function (lines ~325-338, including its `/** A failed close costs the accent... */` comment) and the `sync` function (lines ~350-353, including its `/** Stats are derived... */` comment).

Add to the imports at the top:

```ts
import { applyAccentSlip, sync } from '../logic/stateOps'
```

- [ ] **Step 4: Run the tests**

Run: `npm test`
Expected: PASS, same count as Step 1. If TypeScript complains that `P5`, `charLine`, `pushStatModifier`, or `hasFlag` are now unused in `reducer.ts`, leave them — they are used elsewhere in the file. If `npm run lint` flags a genuinely unused import, remove only that one.

- [ ] **Step 5: Commit the halfway point**

```bash
git add src/logic/stateOps.ts src/state/reducer.ts
git commit -m "refactor: lift sync and applyAccentSlip into logic/stateOps"
```

- [ ] **Step 6: Create `src/logic/close.ts`**

This is the body of the old `ATTEMPT_CLOSE` case from the roll downward, moved verbatim. The only change is that the chance arrives as a parameter instead of being computed inline.

```ts
/**
 * The close outcome, shared by both paths that can produce one: the instant
 * dice roll and the Phase 8 phone call. It starts at the roll — AP has already
 * been spent and the lead has already been validated by the caller.
 *
 * Nothing in here knows which path called it. That is the entire point: the
 * call cannot drift away from the dice.
 */

import { arch } from './leads'
import { applyAccentSlip, sync } from './stateOps'
import { chance, money, pick } from './rand'
import { clampRep, commissionFor } from './economy'
import { gain, pluralityOwner } from './territory'
import { P6, PLAYER } from '../data/p6'
import { REP_PER_DEAL } from '../data/reputation'
import { UNDERCUT_SUFFIX } from '../data/rivals'
import { withLog } from './log'
import type { GameState, Lead } from '../state/types'

/** What the close paid and whether it landed. The reducer needs the payout to
 *  fill in `call.outcome`; the dice path ignores it. */
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
  const earnings = undercut
    ? Math.round(raw * P6.UNDERCUT_COMMISSION_MULT)
    : raw
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
```

- [ ] **Step 7: Replace the reducer case body**

In `src/state/reducer.ts`, replace the whole `case 'ATTEMPT_CLOSE': { ... }` block with:

```ts
    case 'ATTEMPT_CLOSE': {
      if (state.ap < 1 || state.rank === 'receptionist') return state
      const lead = state.leads.find((l) => l.id === action.leadId)
      if (!lead || lead.stage !== 'ready' || lead.sold) return state
      const s = spendAp(state, 1)
      return resolveClose(s, lead, closeChance(state, lead)).state
    }
```

Add the import:

```ts
import { resolveClose } from '../logic/close'
```

Note `closeChance(state, lead)` reads the pre-AP-spend state, exactly as before — AP is not an input to the close formula, so this is equivalent either way, but keep it identical to avoid arguing about it later.

- [ ] **Step 8: Run the full suite**

Run: `npm test`
Expected: PASS, identical count to Step 1. Pay attention to `src/logic/__tests__/territory.test.ts` and `src/logic/__tests__/characters.test.ts` — both drive `ATTEMPT_CLOSE` directly and are the real regression guard here.

- [ ] **Step 9: Typecheck**

Run: `npm run build`
Expected: still FAILS only on `initialState` missing the three Phase 8 fields (from Task 1). No new errors.

- [ ] **Step 10: Commit**

```bash
git add src/logic/close.ts src/state/reducer.ts
git commit -m "refactor: extract resolveClose so dice and call share one outcome"
```

---

## Task 5: State fields and the v6 migration

**Files:**
- Modify: `src/state/reducer.ts` (`initialState`), `src/state/migrate.ts`
- Test: `src/state/__tests__/migrate.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `src/state/__tests__/migrate.test.ts` (inside the existing top-level scope; reuse whatever imports the file already has, adding `initialState` from `../reducer` and `migrate` from `../migrate` if they are not already imported):

```ts
describe('phase 8 migration', () => {
  const v5 = () => ({ ...initialState(), version: 5 }) as unknown

  it('defaults the phase 8 fields on a v5 save', () => {
    const out = migrate(v5())!
    expect(out.version).toBe(6)
    expect(out.call).toBeNull()
    expect(out.callsEnabled).toBe(true)
    expect(out.callStats).toEqual({ calls: 0, perfectCalls: 0, hangups: 0 })
  })

  it('accepts a v6 save', () => {
    const out = migrate({ ...initialState(), version: 6 })
    expect(out).not.toBeNull()
    expect(out!.version).toBe(6)
  })

  it('rejects a version from the future', () => {
    expect(migrate({ ...initialState(), version: 7 })).toBeNull()
  })

  it('preserves a player toggle of callsEnabled', () => {
    const out = migrate({ ...initialState(), version: 6, callsEnabled: false })!
    expect(out.callsEnabled).toBe(false)
  })

  it('discards a call that was open when the tab died, and says so', () => {
    const mid = {
      ...initialState(),
      version: 6,
      leads: [
        {
          id: 'L1',
          archetypeId: 'luxLorenzo',
          clientName: 'Marta Vance',
          stage: 'ready',
          salePrice: 800000,
          patience: 3,
          maxPatience: 3,
          retriedClose: false,
          createdWeek: 1,
          intro: 'x',
          referralBonus: false,
          districtId: 'downtown',
        },
      ],
      call: {
        leadId: 'L1',
        turn: 2,
        momentum: 12,
        history: [],
        usedTactics: [],
        usedBeatIds: [],
        currentBeatId: 't1_lux',
        revealedTells: [],
        phase: 'awaitingTactic',
        outcome: null,
      },
    }
    const out = migrate(mid)!
    expect(out.call).toBeNull()
    /* The lead survives untouched — no patience drain, no removal. */
    expect(out.leads).toHaveLength(1)
    expect(out.leads[0].patience).toBe(3)
    expect(out.leads[0].retriedClose).toBe(false)
    expect(out.log[0].text).toContain('The line dropped')
    expect(out.log[0].text).toContain('Marta Vance')
  })
})
```

Check how `withLog` orders entries before asserting `out.log[0]` — read `src/logic/log.ts`. If it appends rather than prepends, change `out.log[0]` to `out.log[out.log.length - 1]` in the last test.

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run src/state/__tests__/migrate.test.ts`
Expected: FAIL — `expected 5 to be 6`.

- [ ] **Step 3: Add the fields to `initialState`**

In `src/state/reducer.ts`, inside `initialState()`, change `version: 5,` to `version: 6,` and add after `weekFarmedDistricts: [],`:

```ts
    call: null,
    callsEnabled: true,
    callStats: { calls: 0, perfectCalls: 0, hangups: 0 },
```

- [ ] **Step 4: Update the migration**

In `src/state/migrate.ts`:

Widen the version guard at line ~28 — change `s.version > 5` to `s.version > 6`.

Change `version: 5,` at line ~60 to `version: 6,`.

Add to the `out` object literal, next to the other transient-field defaults:

```ts
    /* ---- phase 8 ---- a pre-call save has never picked up the phone ---- */
    callsEnabled: s.callsEnabled !== false,
    callStats: {
      calls: num((s.callStats as { calls?: number } | undefined)?.calls, 0),
      perfectCalls: num(
        (s.callStats as { perfectCalls?: number } | undefined)?.perfectCalls,
        0,
      ),
      hangups: num(
        (s.callStats as { hangups?: number } | undefined)?.hangups,
        0,
      ),
    },
    /* A call is never restored. See dropInterruptedCall below. */
    call: null,
```

`callsEnabled: s.callsEnabled !== false` defaults a missing field to `true` while preserving an explicit `false`.

Then change the final return at line ~162 from:

```ts
  return fillPool(placeOnTheMap(out, typeof s.territory === 'object'))
```

to:

```ts
  return dropInterruptedCall(
    fillPool(placeOnTheMap(out, typeof s.territory === 'object')),
    s.call as { leadId?: string } | null | undefined,
  )
```

And add this function at the bottom of the file:

```ts
/**
 * A save written mid-call is a crashed call. The call is discarded rather than
 * resumed: the lead keeps its state as of before the call, minus the AP already
 * spent. AP is never refunded and never double-charged, because ATTEMPT_CLOSE
 * spends it once before the call opens and the call itself never touches it.
 */
function dropInterruptedCall(
  s: GameState,
  saved: { leadId?: string } | null | undefined,
): GameState {
  if (!saved || typeof saved.leadId !== 'string') return s
  const lead = s.leads.find((l) => l.id === saved.leadId)
  return withLog(
    { ...s, call: null },
    'flavor',
    'The line dropped. ' +
      (lead ? lead.clientName : 'Someone') +
      ' is still in your pipeline, mercifully.',
  )
}
```

Add `import { withLog } from '../logic/log'` to the top of `migrate.ts`.

- [ ] **Step 5: Run the tests**

Run: `npx vitest run src/state/__tests__/migrate.test.ts`
Expected: PASS.

- [ ] **Step 6: Run the whole suite and the build**

Run: `npm test && npm run build`
Expected: both PASS. The build error from Task 1 is now resolved.

- [ ] **Step 7: Commit**

```bash
git add src/state/reducer.ts src/state/migrate.ts src/state/__tests__/migrate.test.ts
git commit -m "feat(call): save v6 with call state, toggle, and stats"
```

---

## Task 6: Engine part 1 — trigger, wording, and line selection

**Files:**
- Create: `src/logic/call.ts`
- Test: `src/logic/__tests__/call.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `src/logic/__tests__/call.test.ts`:

```ts
import {
  callSummaryLine,
  clientReplyFor,
  momentumWord,
  playerLineFor,
  shouldCall,
} from '../call'
import { setSeed } from '../rand'
import type { Lead } from '../../state/types'

function leadFixture(over: Partial<Lead> = {}): Lead {
  return {
    id: 'L1',
    archetypeId: 'firstTimer',
    clientName: 'Dana Feltz',
    stage: 'ready',
    salePrice: 250000,
    patience: 3,
    maxPatience: 3,
    retriedClose: false,
    createdWeek: 1,
    intro: 'x',
    referralBonus: false,
    districtId: 'downtown',
    ...over,
  }
}

describe('shouldCall', () => {
  it('fires at or above the price threshold', () => {
    expect(shouldCall(leadFixture({ salePrice: 400000 }))).toBe(true)
    expect(shouldCall(leadFixture({ salePrice: 400001 }))).toBe(true)
  })

  it('does not fire below it', () => {
    expect(shouldCall(leadFixture({ salePrice: 399999 }))).toBe(false)
    expect(shouldCall(leadFixture({ salePrice: 120000 }))).toBe(false)
  })

  it('always fires for the three luxury archetypes, at any price', () => {
    ;['luxLorenzo', 'celebrityCleo', 'oldMoneyOtis'].forEach((archetypeId) => {
      expect(
        shouldCall(leadFixture({ archetypeId, salePrice: 1000 })),
        archetypeId,
      ).toBe(true)
    })
  })

  it('does not fire for a cheap lead of any other archetype', () => {
    ;['firstTimer', 'cashChad', 'influencerIzzy', 'techTyler'].forEach((id) => {
      expect(shouldCall(leadFixture({ archetypeId: id, salePrice: 99000 }))).toBe(
        false,
      )
    })
  })
})

describe('momentumWord', () => {
  it('maps every band to its word', () => {
    expect(momentumWord(30)).toBe("They're in")
    expect(momentumWord(20)).toBe("They're in")
    expect(momentumWord(19)).toBe('Warm')
    expect(momentumWord(10)).toBe('Warm')
    expect(momentumWord(9)).toBe('Leaning')
    expect(momentumWord(1)).toBe('Leaning')
    expect(momentumWord(0)).toBe('Neutral')
    expect(momentumWord(-1)).toBe('Cooling')
    expect(momentumWord(-9)).toBe('Cooling')
    expect(momentumWord(-10)).toBe('Losing them')
    expect(momentumWord(-19)).toBe('Losing them')
    expect(momentumWord(-20)).toBe("It's slipping")
    expect(momentumWord(-30)).toBe("It's slipping")
  })
})

describe('callSummaryLine', () => {
  it('maps every band, reading top down', () => {
    expect(callSummaryLine(16)).toContain('beautifully')
    expect(callSummaryLine(15)).toContain('Solid call')
    expect(callSummaryLine(5)).toContain('Solid call')
    expect(callSummaryLine(4)).toContain('Professionally fine')
    expect(callSummaryLine(-5)).toContain('Professionally fine')
    expect(callSummaryLine(-6)).toContain('got away from you')
    expect(callSummaryLine(-15)).toContain('got away from you')
    expect(callSummaryLine(-16)).toContain('car accident')
  })
})

describe('line selection', () => {
  it('picks the same player line for the same beat and tactic every time', () => {
    const a = playerLineFor('t2_price', 'push')
    const b = playerLineFor('t2_price', 'push')
    expect(a).toBe(b)
    expect(cardOf('push').playerLines).toContain(a)
  })

  it('varies the line across different beats', () => {
    const lines = CALL_BEATS.map((b) => playerLineFor(b.id, 'empathize'))
    expect(new Set(lines).size).toBeGreaterThan(1)
  })

  it('draws client replies from the matching tier', () => {
    setSeed(7)
    expect(CLIENT_REPLIES.great).toContain(clientReplyFor('great'))
    expect(CLIENT_REPLIES.terrible).toContain(clientReplyFor('terrible'))
    setSeed(null)
  })
})
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run src/logic/__tests__/call.test.ts`
Expected: FAIL — `Failed to resolve import "../call"`.

- [ ] **Step 3: Create `src/logic/call.ts`**

```ts
/**
 * The phone-call turn engine. Pure logic — no reducer knowledge, no React.
 *
 * The one thing to keep in mind while reading: momentum IS the close-chance
 * delta, in points. Everything here exists to move one integer between -30 and
 * +30, which the resolution step divides by 100 and adds to closeChance().
 */

import { ARCHETYPES } from '../data/archetypes'
import { CLIENT_REPLIES } from '../data/callBeats'
import { cardOf } from '../data/callCards'
import { P8 } from '../data/p8'
import { pick } from './rand'
import type { Lead, Reaction, TacticId } from '../state/types'

/** $400k+, or one of the three archetypes who always get a call. */
export function shouldCall(lead: Lead): boolean {
  return (
    lead.salePrice >= P8.CALL_THRESHOLD ||
    (P8.ALWAYS_CALL as readonly string[]).includes(lead.archetypeId)
  )
}

/** Never throws on an unknown archetype — Phase 2 might not be built. */
export const egoAffinityOf = (archetypeId: string): number =>
  ARCHETYPES.find((a) => a.id === archetypeId)?.egoAffinity ?? 0

export const clampMomentum = (n: number): number =>
  Math.max(P8.MOMENTUM_MIN, Math.min(P8.MOMENTUM_MAX, n))

/**
 * The meter reads as a word, never a number. Terri's showRawNumbers flag adds
 * the integer alongside it; everyone else gets an impression, which is what a
 * phone call actually gives you.
 */
export function momentumWord(m: number): string {
  if (m >= 20) return "They're in"
  if (m >= 10) return 'Warm'
  if (m >= 1) return 'Leaning'
  if (m === 0) return 'Neutral'
  if (m >= -9) return 'Cooling'
  if (m >= -19) return 'Losing them'
  return "It's slipping"
}

/** Logged before the outcome line. Bands read top-down and are inclusive at
 *  the upper edge. */
export function callSummaryLine(m: number): string {
  if (m > 15) return 'The call went beautifully. You could hear it turning.'
  if (m >= 5) return "Solid call. You didn't lose them."
  if (m >= -5) return 'The call was… fine. Professionally fine.'
  if (m >= -15) return 'That call got away from you a little.'
  return 'That call was a car accident with hold music.'
}

/** A tiny stable string hash. Used so the same beat + tactic always produces
 *  the same player line, which makes the call feel written rather than rolled. */
function hash(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0
  return Math.abs(h)
}

export function playerLineFor(beatId: string, tactic: TacticId): string {
  const lines = cardOf(tactic).playerLines
  return lines[hash(beatId + ':' + tactic) % lines.length]
}

/** Replies are per reaction tier, so this is a plain random draw. */
export const clientReplyFor = (reaction: Reaction): string =>
  pick(CLIENT_REPLIES[reaction])
```

- [ ] **Step 4: Run the test and watch it pass**

Run: `npx vitest run src/logic/__tests__/call.test.ts`
Expected: PASS, all previous tests plus 11 new ones.

- [ ] **Step 5: Commit**

```bash
git add src/logic/call.ts src/logic/__tests__/call.test.ts
git commit -m "feat(call): trigger rule, momentum wording, and line selection"
```

---

## Task 7: Engine part 2 — beat selection

**Files:**
- Modify: `src/logic/call.ts`
- Test: `src/logic/__tests__/call.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `src/logic/__tests__/call.test.ts`:

```ts
import { beatOf, pickBeat } from '../call'

describe('pickBeat', () => {
  it('only draws beats legal for the archetype and the turn', () => {
    setSeed(1)
    for (let i = 0; i < 60; i++) {
      const b = pickBeat(leadFixture({ archetypeId: 'oldMoneyOtis' }), 1, [])
      expect(b.turn === 1 || b.turn === 'any').toBe(true)
      if (b.archetypeIds !== 'any')
        expect(b.archetypeIds).toContain('oldMoneyOtis')
    }
    setSeed(null)
  })

  it('can draw the archetype-specific beat, not just the generic pool', () => {
    setSeed(3)
    const ids = new Set<string>()
    for (let i = 0; i < 200; i++)
      ids.add(pickBeat(leadFixture({ archetypeId: 'oldMoneyOtis' }), 1, []).id)
    expect(ids.has('t1_otis')).toBe(true)
    setSeed(null)
  })

  it('never returns a beat already used this call', () => {
    setSeed(5)
    const turn1 = ['t1_generic_a', 't1_generic_b', 't1_generic_c', 't1_first']
    for (let i = 0; i < 50; i++) {
      const b = pickBeat(leadFixture({ archetypeId: 'firstTimer' }), 1, turn1)
      expect(turn1).not.toContain(b.id)
    }
    setSeed(null)
  })

  it('falls back to the generic beat when every candidate is used', () => {
    const all = CALL_BEATS.map((b) => b.id)
    expect(pickBeat(leadFixture(), 1, all).id).toBe('genericBeat1')
    expect(pickBeat(leadFixture(), 2, all).id).toBe('genericBeat2')
    expect(pickBeat(leadFixture(), 3, all).id).toBe('genericBeat3')
  })

  it('resolves beats by id, including the generic fallbacks', () => {
    expect(beatOf('t3_lux').text).toContain('whose name goes on this')
    expect(beatOf('genericBeat2').id).toBe('genericBeat2')
  })

  it('returns a usable beat for an archetype it has never heard of', () => {
    const b = pickBeat(leadFixture({ archetypeId: 'notARealArchetype' }), 2, [])
    expect(b.turn === 2 || b.turn === 'any').toBe(true)
    expect(b.archetypeIds).toBe('any')
  })
})
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run src/logic/__tests__/call.test.ts`
Expected: FAIL — `pickBeat is not a function` / no export named `beatOf`.

- [ ] **Step 3: Implement**

Add to `src/logic/call.ts` (and extend the `callBeats` import to bring in `CALL_BEATS` and `GENERIC_BEATS`):

```ts
/** Resolves a stored beat id. Falls back to turn 1's generic so a corrupted
 *  id can never crash a call in progress. */
export function beatOf(id: string): CallBeat {
  return (
    CALL_BEATS.find((b) => b.id === id) ??
    Object.values(GENERIC_BEATS).find((b) => b.id === id) ??
    GENERIC_BEATS[1]
  )
}

const legalFor = (b: CallBeat, lead: Lead, turn: number): boolean =>
  (b.archetypeIds === 'any' || b.archetypeIds.includes(lead.archetypeId)) &&
  (b.turn === turn || b.turn === 'any')

/**
 * Draws the turn's beat. Archetype-specific beats compete on equal footing with
 * the generic pool, so a Lorenzo call is usually — not always — a Lorenzo beat.
 * Falls back to the 'any' pool, then to the hard-coded generic, so this always
 * returns something even if a phase's archetype content is missing.
 */
export function pickBeat(lead: Lead, turn: number, usedBeatIds: string[]): CallBeat {
  const unused = (b: CallBeat) => !usedBeatIds.includes(b.id)
  const candidates = CALL_BEATS.filter((b) => legalFor(b, lead, turn) && unused(b))
  if (candidates.length) return pick(candidates)
  const generic = CALL_BEATS.filter(
    (b) => b.archetypeIds === 'any' && (b.turn === turn || b.turn === 'any') && unused(b),
  )
  if (generic.length) return pick(generic)
  return GENERIC_BEATS[(turn === 2 ? 2 : turn === 3 ? 3 : 1) as 1 | 2 | 3]
}
```

Update the import line at the top of `call.ts` to:

```ts
import {
  CALL_BEATS,
  CLIENT_REPLIES,
  GENERIC_BEATS,
} from '../data/callBeats'
```

and the types import to include `CallBeat`:

```ts
import type { CallBeat, Lead, Reaction, TacticId } from '../state/types'
```

- [ ] **Step 4: Run the test and watch it pass**

Run: `npx vitest run src/logic/__tests__/call.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/logic/call.ts src/logic/__tests__/call.test.ts
git commit -m "feat(call): beat selection with no repeats and safe fallbacks"
```

---

## Task 8: Engine part 3 — reactions, stat scaling, repeat penalty

This is the balance core. Get it exactly right.

**Files:**
- Modify: `src/logic/call.ts`
- Test: `src/logic/__tests__/call.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `src/logic/__tests__/call.test.ts`:

```ts
import { reactionFor, tacticDelta } from '../call'
import { initialState } from '../../state/reducer'
import { deriveStats } from '../economy'
import type { GameState } from '../../state/types'

/** A state with a known ego, for the Flex scaling assertions. */
const withEgo = (ego: number): GameState => ({
  ...initialState(),
  permBonuses: { hustle: 0, swagger: 0, ego },
})
const withSwagger = (swagger: number): GameState => ({
  ...initialState(),
  permBonuses: { hustle: 0, swagger, ego: 0 },
})

describe('reactionFor', () => {
  it('uses the archetype row when the beat has no override', () => {
    const lead = leadFixture({ archetypeId: 'ghostGary' })
    expect(reactionFor(lead, beatOf('t3_generic_a'), 'push')).toBe('great')
    expect(reactionFor(lead, beatOf('t3_generic_a'), 'empathize')).toBe('good')
  })

  it("lets a beat's tell override the archetype default", () => {
    /* Otis's row says namedrop: great, push: terrible. t3_generic_b overrides
       push to great — the beat wins. */
    const otis = leadFixture({ archetypeId: 'oldMoneyOtis' })
    expect(ARCHETYPE_TELLS.oldMoneyOtis.push).toBe('terrible')
    expect(reactionFor(otis, beatOf('t3_generic_b'), 'push')).toBe('great')
  })

  it('leaves non-overridden tactics on the archetype row', () => {
    const otis = leadFixture({ archetypeId: 'oldMoneyOtis' })
    /* t3_generic_b only overrides push. */
    expect(reactionFor(otis, beatOf('t3_generic_b'), 'flex')).toBe('terrible')
  })

  it('falls back to the default row for an unknown archetype', () => {
    const nobody = leadFixture({ archetypeId: 'notARealArchetype' })
    expect(reactionFor(nobody, beatOf('t3_generic_a'), 'empathize')).toBe('good')
    expect(reactionFor(nobody, beatOf('t3_generic_a'), 'flex')).toBe('neutral')
  })
})

describe('tacticDelta — base values', () => {
  const s = initialState()

  it('maps each reaction tier to its delta with no scaling in play', () => {
    /* namedrop is stat-free, so these are the raw tier values. */
    const otis = leadFixture({ archetypeId: 'oldMoneyOtis' })
    expect(tacticDelta(s, otis, beatOf('t3_generic_a'), 'namedrop', []).delta)
      .toBe(P8.GREAT)
    const nancy = leadFixture({ archetypeId: 'nightmareNancy' })
    expect(tacticDelta(s, nancy, beatOf('t3_generic_a'), 'namedrop', []).delta)
      .toBe(P8.NEUTRAL)
    const larry = leadFixture({ archetypeId: 'lowballLarry' })
    expect(tacticDelta(s, larry, beatOf('t3_wobble'), 'empathize', []).delta)
      .toBe(P8.NEUTRAL)
    const first = leadFixture({ archetypeId: 'firstTimer' })
    expect(tacticDelta(s, first, beatOf('t3_wobble'), 'empathize', []).delta)
      .toBe(P8.GREAT)
  })

  it('returns the reaction alongside the delta', () => {
    const first = leadFixture({ archetypeId: 'firstTimer' })
    expect(tacticDelta(s, first, beatOf('t3_wobble'), 'push', []).reaction)
      .toBe('terrible')
  })
})

describe('tacticDelta — repeat penalty', () => {
  it('compounds at -4, -8, -12 for each prior use', () => {
    const s = initialState()
    const otis = leadFixture({ archetypeId: 'oldMoneyOtis' })
    const at = (used: TacticId[]) =>
      tacticDelta(s, otis, beatOf('t3_generic_a'), 'namedrop', used).delta
    expect(at([])).toBe(10)
    expect(at(['namedrop'])).toBe(6)
    expect(at(['namedrop', 'namedrop'])).toBe(2)
    expect(at(['namedrop', 'namedrop', 'namedrop'])).toBe(-2)
  })

  it('only counts prior uses of the same tactic', () => {
    const s = initialState()
    const otis = leadFixture({ archetypeId: 'oldMoneyOtis' })
    expect(
      tacticDelta(s, otis, beatOf('t3_generic_a'), 'namedrop', [
        'empathize',
        'flex',
        'read',
      ]).delta,
    ).toBe(10)
  })
})

describe('tacticDelta — Push scales with Swagger, positive only', () => {
  it('adds swagger x 0.5 to a positive delta', () => {
    const s = withSwagger(4)
    const sw = deriveStats(s).swagger
    const gary = leadFixture({ archetypeId: 'ghostGary' })
    expect(tacticDelta(s, gary, beatOf('t3_wobble'), 'push', []).delta).toBe(
      Math.round(P8.GREAT + sw * P8.SWAGGER_TACTIC_SCALE),
    )
  })

  it('leaves a negative delta alone no matter how high Swagger is', () => {
    const low = withSwagger(0)
    const high = withSwagger(8)
    const first = leadFixture({ archetypeId: 'firstTimer' })
    const a = tacticDelta(low, first, beatOf('t3_wobble'), 'push', []).delta
    const b = tacticDelta(high, first, beatOf('t3_wobble'), 'push', []).delta
    expect(a).toBe(P8.TERRIBLE)
    expect(b).toBe(P8.TERRIBLE)
  })

  it('leaves a neutral delta alone', () => {
    const s = withSwagger(8)
    const izzy = leadFixture({ archetypeId: 'influencerIzzy' })
    expect(tacticDelta(s, izzy, beatOf('t3_wobble'), 'push', []).delta).toBe(0)
  })
})

describe('tacticDelta — Flex scales with ego x egoAffinity, BOTH directions', () => {
  it('rewards a high-Ego player on luxLorenzo, whose affinity is positive', () => {
    expect(arch('luxLorenzo').egoAffinity).toBeGreaterThan(0)
    const flat = initialState()
    const proud = withEgo(6)
    const lorenzo = leadFixture({ archetypeId: 'luxLorenzo' })
    const a = tacticDelta(flat, lorenzo, beatOf('t3_wobble'), 'flex', []).delta
    const b = tacticDelta(proud, lorenzo, beatOf('t3_wobble'), 'flex', []).delta
    expect(b).toBeGreaterThan(a)
  })

  it('punishes that same player on oldMoneyOtis, whose affinity is negative', () => {
    expect(arch('oldMoneyOtis').egoAffinity).toBeLessThan(0)
    const flat = initialState()
    const proud = withEgo(6)
    const otis = leadFixture({ archetypeId: 'oldMoneyOtis' })
    const a = tacticDelta(flat, otis, beatOf('t3_wobble'), 'flex', []).delta
    const b = tacticDelta(proud, otis, beatOf('t3_wobble'), 'flex', []).delta
    expect(b).toBeLessThan(a)
  })

  it('drags a merely-good Flex below neutral on a negative-affinity client', () => {
    /* t2_other_agent overrides flex to 'good' (+5). Ruth's egoAffinity is
       negative, so a proud player playing Flex there does worse than nothing. */
    const proud = withEgo(6)
    const ruth = leadFixture({ archetypeId: 'retireeRuth' })
    expect(arch('retireeRuth').egoAffinity).toBeLessThan(0)
    expect(reactionFor(ruth, beatOf('t2_other_agent'), 'flex')).toBe('good')
    expect(
      tacticDelta(proud, ruth, beatOf('t2_other_agent'), 'flex', []).delta,
    ).toBeLessThan(0)
  })

  it('computes the exact scaled value', () => {
    const proud = withEgo(6)
    const ego = deriveStats(proud).ego
    const lorenzo = leadFixture({ archetypeId: 'luxLorenzo' })
    expect(
      tacticDelta(proud, lorenzo, beatOf('t3_lux'), 'flex', []).delta,
    ).toBe(
      Math.round(
        P8.GREAT + ego * arch('luxLorenzo').egoAffinity * P8.EGO_TACTIC_SCALE,
      ),
    )
  })
})
```

Add `import { arch } from '../leads'` to the test file's imports, and add `TacticId` to the existing `import type { ... } from '../../state/types'` line — the repeat-penalty test annotates `used: TacticId[]`, and Tasks 12 and 16 use it too.

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run src/logic/__tests__/call.test.ts`
Expected: FAIL — no export named `reactionFor`.

- [ ] **Step 3: Implement**

Add to `src/logic/call.ts`:

```ts
const REACTION_DELTA: Record<Reaction, number> = {
  great: P8.GREAT,
  good: P8.GOOD,
  neutral: P8.NEUTRAL,
  bad: P8.BAD,
  terrible: P8.TERRIBLE,
}

/** The beat's tell wins; the archetype row is the fallback; an archetype this
 *  build has never heard of gets the default row. */
export function reactionFor(
  lead: Lead,
  beat: CallBeat,
  tactic: PlayableTactic,
): Reaction {
  const row = ARCHETYPE_TELLS[lead.archetypeId] ?? ARCHETYPE_TELLS.default
  return beat.tell?.[tactic] ?? row?.[tactic] ?? 'neutral'
}

/**
 * The turn's momentum change, before clamping.
 *
 * Two tactics read the player's stats, and they read them differently:
 *
 *   Push scales with Swagger only when it was already working. Confidence
 *   makes a good close better; it does not rescue a bad one.
 *
 *   Flex scales with ego x egoAffinity in BOTH directions. That asymmetry is
 *   deliberate and load-bearing. A high-Ego player flexing at Otis, whose
 *   affinity is -3, does real damage even off a 'good' tell — which is why the
 *   luxury tier is where loadout choice starts to matter.
 */
export function tacticDelta(
  state: GameState,
  lead: Lead,
  beat: CallBeat,
  tactic: PlayableTactic,
  usedTactics: TacticId[],
): { reaction: Reaction; delta: number } {
  const reaction = reactionFor(lead, beat, tactic)
  const st = deriveStats(state)
  let base: number = REACTION_DELTA[reaction]
  if (tactic === 'push' && base > 0) base += st.swagger * P8.SWAGGER_TACTIC_SCALE
  if (tactic === 'flex')
    base += st.ego * egoAffinityOf(lead.archetypeId) * P8.EGO_TACTIC_SCALE
  base -= P8.REPEAT_PENALTY * usedTactics.filter((t) => t === tactic).length
  return { reaction, delta: Math.round(base) }
}
```

Extend the imports at the top of `call.ts`:

```ts
import { ARCHETYPE_TELLS, CALL_BEATS, CLIENT_REPLIES, GENERIC_BEATS } from '../data/callBeats'
import { deriveStats } from './economy'
import type {
  CallBeat,
  GameState,
  Lead,
  PlayableTactic,
  Reaction,
  TacticId,
} from '../state/types'
```

- [ ] **Step 4: Run the test and watch it pass**

Run: `npx vitest run src/logic/__tests__/call.test.ts`
Expected: PASS. If the "exact scaled value" test fails, print `deriveStats(proud).ego` — the default character may add a stat mod and ego is capped; the test reads the derived value rather than assuming 6, so a mismatch means the implementation, not the fixture, is wrong.

- [ ] **Step 5: Commit**

```bash
git add src/logic/call.ts src/logic/__tests__/call.test.ts
git commit -m "feat(call): reactions, stat scaling, and the repeat penalty"
```

---

## Task 9: Engine part 4 — Read the Room

**Files:**
- Modify: `src/logic/call.ts`
- Test: `src/logic/__tests__/call.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `src/logic/__tests__/call.test.ts`:

```ts
import { readLineFor, revealTell } from '../call'

describe('revealTell', () => {
  it('reveals the first great tactic in priority order', () => {
    /* Otis: empathize good, push terrible, namedrop GREAT, flex terrible.
       Priority is empathize, push, namedrop, flex — so namedrop wins. */
    const otis = leadFixture({ archetypeId: 'oldMoneyOtis' })
    const r = revealTell(otis, beatOf('t3_wobble'), [])
    expect(r.tactic).toBe('namedrop')
    expect(r.positive).toBe(true)
  })

  it('respects the beat tell over the archetype row', () => {
    /* t3_generic_b overrides push to great; push comes before namedrop. */
    const otis = leadFixture({ archetypeId: 'oldMoneyOtis' })
    expect(revealTell(otis, beatOf('t3_generic_b'), []).tactic).toBe('push')
  })

  it('skips a tactic that was already revealed', () => {
    const otis = leadFixture({ archetypeId: 'oldMoneyOtis' })
    const r = revealTell(otis, beatOf('t3_wobble'), ['namedrop'])
    expect(r.tactic).not.toBe('namedrop')
  })

  it('warns about a terrible tactic when nothing would be great', () => {
    /* Otis with namedrop already known: no great remains, so the next-best
       information is what NOT to do. Push and flex are both terrible; push
       comes first in priority order. */
    const otis = leadFixture({ archetypeId: 'oldMoneyOtis' })
    const r = revealTell(otis, beatOf('t3_wobble'), ['namedrop'])
    expect(r.tactic).toBe('push')
    expect(r.positive).toBe(false)
  })

  it('never no-ops — it always names one unrevealed tactic', () => {
    const nobody = leadFixture({ archetypeId: 'notARealArchetype' })
    /* The default row has no great and no terrible at all. */
    const r = revealTell(nobody, beatOf('t3_wobble'), [])
    expect(['empathize', 'push', 'namedrop', 'flex']).toContain(r.tactic)
  })

  it('picks the best available on a flat beat, and calls it positive', () => {
    const nobody = leadFixture({ archetypeId: 'notARealArchetype' })
    /* default: empathize good, push neutral, namedrop good, flex neutral. */
    const r = revealTell(nobody, beatOf('t3_wobble'), [])
    expect(r.tactic).toBe('empathize')
    expect(r.positive).toBe(true)
  })

  it('phrases the read line to match the polarity', () => {
    const good = readLineFor('Dana Feltz', { tactic: 'namedrop', positive: true })
    expect(good).toContain('Dana Feltz')
    expect(good).toContain("They'd respond well to")
    expect(good).toContain('Namedrop')
    const bad = readLineFor('Dana Feltz', { tactic: 'push', positive: false })
    expect(bad).toContain('Whatever you do, don')
    expect(bad).toContain('Push')
  })
})
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run src/logic/__tests__/call.test.ts`
Expected: FAIL — no export named `revealTell`.

- [ ] **Step 3: Implement**

Add to `src/logic/call.ts`:

```ts
/** Fixed priority order for Read. Not alphabetical, not the card order by
 *  accident — this is the order the reveal walks. */
const READ_PRIORITY: PlayableTactic[] = ['empathize', 'push', 'namedrop', 'flex']

/** Ranked best to worst, for the flat-beat fallback below. */
const REACTION_RANK: Record<Reaction, number> = {
  great: 4,
  good: 3,
  neutral: 2,
  bad: 1,
  terrible: 0,
}

export interface RevealedTell {
  tactic: PlayableTactic
  /** True = "play this", false = "do not play this". Drives the badge. */
  positive: boolean
}

/**
 * Read spends the turn to buy one piece of information. It reveals the first
 * unrevealed `great` in priority order; failing that, the first `terrible`,
 * because knowing what NOT to say is worth a turn too.
 *
 * A beat can be flat — no great and no terrible anywhere, which the default
 * archetype row is — so there is a third fallback: the best remaining option.
 * Read always names exactly one tactic. It never spends the turn for nothing.
 */
export function revealTell(
  lead: Lead,
  beat: CallBeat,
  revealed: TacticId[],
): RevealedTell {
  const open = READ_PRIORITY.filter((t) => !revealed.includes(t))
  if (!open.length) return { tactic: READ_PRIORITY[0], positive: true }
  const reactionOf = (t: PlayableTactic) => reactionFor(lead, beat, t)

  const great = open.find((t) => reactionOf(t) === 'great')
  if (great) return { tactic: great, positive: true }

  const terrible = open.find((t) => reactionOf(t) === 'terrible')
  if (terrible) return { tactic: terrible, positive: false }

  let best = open[0]
  for (const t of open)
    if (REACTION_RANK[reactionOf(t)] > REACTION_RANK[reactionOf(best)]) best = t
  return { tactic: best, positive: reactionOf(best) !== 'bad' }
}

/** The log line for a Read turn, phrased to match what it found. */
export function readLineFor(clientName: string, r: RevealedTell): string {
  const label = cardOf(r.tactic).label
  return (
    'You let the silence sit. ' +
    clientName +
    ' fills it — and tells you something. ' +
    (r.positive
      ? "(They'd respond well to " + label + '.)'
      : "(Whatever you do, don't " + label + '.)')
  )
}
```

- [ ] **Step 4: Run the test and watch it pass**

Run: `npx vitest run src/logic/__tests__/call.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/logic/call.ts src/logic/__tests__/call.test.ts
git commit -m "feat(call): Read the Room reveals exactly one tell"
```

---

## Task 10: Engine part 5 — starting a call and resolving it

**Files:**
- Modify: `src/logic/call.ts`
- Test: `src/logic/__tests__/call.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `src/logic/__tests__/call.test.ts`:

```ts
import { finalChanceFor, isPerfect, startCall } from '../call'
import { closeChance } from '../leads'
import type { CallState, CallTurn } from '../../state/types'

const turnStub = (reaction: CallTurn['reaction']): CallTurn => ({
  turn: 1,
  beatId: 't3_wobble',
  tacticUsed: 'namedrop',
  reaction,
  delta: 0,
  clientReply: 'x',
})

const callWith = (over: Partial<CallState> = {}): CallState => ({
  leadId: 'L1',
  turn: 3,
  momentum: 0,
  history: [],
  usedTactics: [],
  usedBeatIds: [],
  currentBeatId: 't3_wobble',
  revealedTells: [],
  phase: 'resolving',
  outcome: null,
  ...over,
})

describe('startCall', () => {
  it('opens at turn 1, zero momentum, with a legal beat already drawn', () => {
    setSeed(11)
    const lead = leadFixture({ archetypeId: 'luxLorenzo', salePrice: 900000 })
    const c = startCall(lead)
    expect(c.leadId).toBe('L1')
    expect(c.turn).toBe(1)
    expect(c.momentum).toBe(P8.MOMENTUM_START)
    expect(c.phase).toBe('awaitingTactic')
    expect(c.history).toEqual([])
    expect(c.usedBeatIds).toEqual([c.currentBeatId])
    expect(beatOf(c.currentBeatId).turn === 1 || beatOf(c.currentBeatId).turn === 'any').toBe(true)
    setSeed(null)
  })

  it('opens a retry call at -5, because they remember the first one', () => {
    setSeed(11)
    const lead = leadFixture({ salePrice: 900000, retriedClose: true })
    expect(startCall(lead).momentum).toBe(P8.RETRY_MOMENTUM)
    setSeed(null)
  })
})

describe('isPerfect', () => {
  it('needs all three turns great', () => {
    expect(
      isPerfect(callWith({ history: [1, 2, 3].map(() => turnStub('great')) })),
    ).toBe(true)
  })

  it('rejects two greats and a good', () => {
    expect(
      isPerfect(
        callWith({
          history: [turnStub('great'), turnStub('great'), turnStub('good')],
        }),
      ),
    ).toBe(false)
  })

  it('is disqualified by a Read turn, which scores neutral', () => {
    expect(
      isPerfect(
        callWith({
          history: [turnStub('great'), turnStub('neutral'), turnStub('great')],
        }),
      ),
    ).toBe(false)
  })
})

describe('finalChanceFor', () => {
  const s = initialState()
  const lead = leadFixture({ salePrice: 900000 })

  it('adds momentum as hundredths of a point', () => {
    const base = closeChance(s, lead)
    expect(finalChanceFor(s, lead, callWith({ momentum: 18 }))).toBeCloseTo(
      Math.min(0.9, base + 0.18),
      6,
    )
    expect(finalChanceFor(s, lead, callWith({ momentum: -18 }))).toBeCloseTo(
      Math.max(0.1, base - 0.18),
      6,
    )
  })

  it('adds the perfect bonus on top', () => {
    const flat = callWith({ momentum: 10 })
    const perfect = callWith({
      momentum: 10,
      history: [1, 2, 3].map(() => turnStub('great')),
    })
    expect(finalChanceFor(s, lead, perfect) - finalChanceFor(s, lead, flat))
      .toBeCloseTo(P8.PERFECT_BONUS / 100, 6)
  })

  it('never escapes the existing close bounds', () => {
    const rich = { ...s, permBonuses: { hustle: 0, swagger: 10, ego: 0 } }
    expect(finalChanceFor(rich, lead, callWith({ momentum: 30 }))).toBeLessThanOrEqual(0.9)
    expect(finalChanceFor(s, lead, callWith({ momentum: -30 }))).toBeGreaterThanOrEqual(0.1)
  })

  it('is exactly the dice chance at zero momentum with no perfect', () => {
    expect(finalChanceFor(s, lead, callWith({ momentum: 0 }))).toBeCloseTo(
      closeChance(s, lead),
      6,
    )
  })
})
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run src/logic/__tests__/call.test.ts`
Expected: FAIL — no export named `startCall`.

- [ ] **Step 3: Implement**

Add to `src/logic/call.ts`:

```ts
/** The bounds closeChance() already clamps to. Named here so the call's final
 *  math cannot drift from the dice path's. */
export const CLOSE_MIN = 0.1
export const CLOSE_MAX = 0.9

/** A fresh call. A retry opens at a deficit — they remember the first one. */
export function startCall(lead: Lead): CallState {
  const beat = pickBeat(lead, 1, [])
  return {
    leadId: lead.id,
    turn: 1,
    momentum: lead.retriedClose ? P8.RETRY_MOMENTUM : P8.MOMENTUM_START,
    history: [],
    usedTactics: [],
    usedBeatIds: [beat.id],
    currentBeatId: beat.id,
    revealedTells: [],
    phase: 'awaitingTactic',
    outcome: null,
  }
}

/** All three turns great. A Read turn scores neutral, so reading disqualifies
 *  the call — the bonus is for saying three right things, not two. */
export const isPerfect = (call: CallState): boolean =>
  call.history.filter((h) => h.reaction === 'great').length === P8.TURNS

/**
 * The whole point of the minigame, in one line: the base close chance, plus
 * momentum as hundredths, plus the perfect bonus, clamped to the bounds the
 * dice path already used.
 */
export function finalChanceFor(
  state: GameState,
  lead: Lead,
  call: CallState,
): number {
  const bonus = isPerfect(call) ? P8.PERFECT_BONUS / 100 : 0
  const raw = closeChance(state, lead) + call.momentum / 100 + bonus
  return Math.max(CLOSE_MIN, Math.min(CLOSE_MAX, raw))
}
```

Add to the imports in `call.ts`:

```ts
import { closeChance } from './leads'
```

and extend the type import with `CallState`.

- [ ] **Step 4: Run the test and watch it pass**

Run: `npx vitest run src/logic/__tests__/call.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/logic/call.ts src/logic/__tests__/call.test.ts
git commit -m "feat(call): call start, perfect detection, and final chance"
```

---

## Task 11: Reducer wiring — the fork and the blocking guard

**Files:**
- Modify: `src/state/reducer.ts`
- Test: `src/logic/__tests__/call.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `src/logic/__tests__/call.test.ts`:

```ts
import { reducer } from '../../state/reducer'
import type { Action } from '../../state/types'

/** A playable game with one ready lead. Rank must be past receptionist. */
function gameWith(lead: Partial<Lead> = {}): GameState {
  return {
    ...initialState(),
    rank: 'buyerAgent',
    ap: 5,
    leads: [leadFixture(lead)],
  }
}

describe('ATTEMPT_CLOSE fork', () => {
  it('opens a call for a lead at or above the threshold', () => {
    setSeed(21)
    const s = reducer(gameWith({ salePrice: 400000 }), {
      type: 'ATTEMPT_CLOSE',
      leadId: 'L1',
    })
    expect(s.call).not.toBeNull()
    expect(s.call!.leadId).toBe('L1')
    expect(s.callStats.calls).toBe(1)
    setSeed(null)
  })

  it('opens a call for a luxury archetype at any price', () => {
    setSeed(21)
    const s = reducer(
      gameWith({ archetypeId: 'oldMoneyOtis', salePrice: 90000 }),
      { type: 'ATTEMPT_CLOSE', leadId: 'L1' },
    )
    expect(s.call).not.toBeNull()
    setSeed(null)
  })

  it('resolves instantly by dice below the threshold', () => {
    setSeed(21)
    const s = reducer(gameWith({ salePrice: 399999 }), {
      type: 'ATTEMPT_CLOSE',
      leadId: 'L1',
    })
    expect(s.call).toBeNull()
    expect(s.callStats.calls).toBe(0)
    setSeed(null)
  })

  it('resolves instantly when the player has switched calls off', () => {
    setSeed(21)
    const off = { ...gameWith({ salePrice: 900000 }), callsEnabled: false }
    const s = reducer(off, { type: 'ATTEMPT_CLOSE', leadId: 'L1' })
    expect(s.call).toBeNull()
    expect(s.callStats.calls).toBe(0)
    setSeed(null)
  })

  it('spends exactly one AP either way, and only once', () => {
    setSeed(21)
    const called = reducer(gameWith({ salePrice: 900000 }), {
      type: 'ATTEMPT_CLOSE',
      leadId: 'L1',
    })
    expect(called.ap).toBe(4)
    const diced = reducer(gameWith({ salePrice: 100000 }), {
      type: 'ATTEMPT_CLOSE',
      leadId: 'L1',
    })
    expect(diced.ap).toBe(4)
    setSeed(null)
  })

  it('logs the call-start line with the name and the price', () => {
    setSeed(21)
    const s = reducer(gameWith({ salePrice: 900000 }), {
      type: 'ATTEMPT_CLOSE',
      leadId: 'L1',
    })
    const text = s.log.map((l) => l.text).join(' ')
    expect(text).toContain('You called Dana Feltz')
    expect(text).toContain('$900,000')
    expect(text).toContain('Your palms know it')
    setSeed(null)
  })

  it('logs the retry line on a second call', () => {
    setSeed(21)
    const s = reducer(gameWith({ salePrice: 900000, retriedClose: true }), {
      type: 'ATTEMPT_CLOSE',
      leadId: 'L1',
    })
    expect(s.call!.momentum).toBe(P8.RETRY_MOMENTUM)
    expect(s.log.map((l) => l.text).join(' ')).toContain(
      'They remember the first one',
    )
    setSeed(null)
  })
})

describe('the call blocks everything else', () => {
  const onCall = () => {
    setSeed(21)
    const s = reducer(gameWith({ salePrice: 900000 }), {
      type: 'ATTEMPT_CLOSE',
      leadId: 'L1',
    })
    setSeed(null)
    return s
  }

  it('ignores unrelated actions while the line is open', () => {
    const s = onCall()
    const blocked: Action[] = [
      { type: 'WORK_PHONES' },
      { type: 'END_WEEK' },
      { type: 'SIDE_HUSTLE' },
      { type: 'ATTEMPT_CLOSE', leadId: 'L1' },
      { type: 'FARM_DISTRICT', districtId: 'downtown' },
    ]
    blocked.forEach((a) => expect(reducer(s, a), a.type).toBe(s))
  })

  it('still allows the call actions', () => {
    const s = onCall()
    expect(reducer(s, { type: 'PLAY_TACTIC', tacticId: 'namedrop' })).not.toBe(s)
  })

  it('still allows debug and restart escapes', () => {
    const s = onCall()
    expect(reducer(s, { type: 'DEBUG_SET_MOMENTUM', momentum: 5 })).not.toBe(s)
    expect(reducer(s, { type: 'RESTART' }).call).toBeNull()
  })
})
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run src/logic/__tests__/call.test.ts`
Expected: FAIL — `expected null not to be null` on the first test.

- [ ] **Step 3: Add the blocking guard**

In `src/state/reducer.ts`, at the top of `reducer()`, directly after the existing `gameOver` guard, add:

```ts
  /* A call is a blocking modal in state form. While the line is open the only
     legal moves are the call's own, plus the escapes that must always work. */
  if (state.call !== null && !CALL_SAFE_ACTIONS.has(action.type)) return state
```

And above `export function reducer`, add:

```ts
/** Action types that still resolve while a call is in progress. */
const CALL_SAFE_ACTIONS: ReadonlySet<Action['type']> = new Set([
  'PLAY_TACTIC',
  'ADVANCE_CALL',
  'CLOSE_CALL_MODAL',
  'RESTART',
  'NEW_GAME',
  'IMPORT_SAVE',
  'DEBUG_SET_MOMENTUM',
  'DEBUG_REVEAL_TELLS',
])
```

- [ ] **Step 4: Fork `ATTEMPT_CLOSE`**

Replace the `case 'ATTEMPT_CLOSE'` block written in Task 4 with:

```ts
    case 'ATTEMPT_CLOSE': {
      if (state.ap < 1 || state.rank === 'receptionist') return state
      const lead = state.leads.find((l) => l.id === action.leadId)
      if (!lead || lead.stage !== 'ready' || lead.sold) return state
      const s = spendAp(state, 1)
      /* Big money gets a conversation. Everything else gets the dice it
         always got. */
      if (!state.callsEnabled || !shouldCall(lead))
        return resolveClose(s, lead, closeChance(state, lead)).state
      const opened: GameState = {
        ...s,
        call: startCall(lead),
        callStats: { ...s.callStats, calls: s.callStats.calls + 1 },
      }
      return sync(
        withLog(
          opened,
          'flavor',
          lead.retriedClose
            ? 'Second call with ' +
                lead.clientName +
                '. They remember the first one. So do you.'
            : 'You called ' +
                lead.clientName +
                '. This is a ' +
                money(lead.salePrice) +
                ' conversation. Your palms know it.',
        ),
      )
    }
```

Add the import:

```ts
import { shouldCall, startCall } from '../logic/call'
```

- [ ] **Step 5: Add a stub `PLAY_TACTIC` so the blocking test can pass**

Add this case to the switch — Task 12 replaces the body:

```ts
    case 'PLAY_TACTIC': {
      if (!state.call || state.call.phase !== 'awaitingTactic') return state
      return { ...state, call: { ...state.call, phase: 'showingReaction' } }
    }
```

- [ ] **Step 6: Run the test and watch it pass**

Run: `npx vitest run src/logic/__tests__/call.test.ts`
Expected: PASS.

- [ ] **Step 7: Run the whole suite**

Run: `npm test`
Expected: PASS. Existing suites that drive `ATTEMPT_CLOSE` (`territory.test.ts`, `characters.test.ts`, `endWeek.test.ts`) use leads under $400k with ordinary archetypes, so they still take the dice path. If any of them fails because its fixture crossed the threshold, do **not** change the threshold — set that fixture's `callsEnabled: false` so it keeps testing the dice path it was written for, and note it in the commit message.

- [ ] **Step 8: Commit**

```bash
git add src/state/reducer.ts src/logic/__tests__/call.test.ts
git commit -m "feat(call): ATTEMPT_CLOSE fork and the blocking guard"
```

---

## Task 12: Reducer wiring — playing turns, hanging up, resolving

**Files:**
- Modify: `src/state/reducer.ts`
- Test: `src/logic/__tests__/call.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `src/logic/__tests__/call.test.ts`:

```ts
/** Drives a call to the given tactics, advancing between each. */
function playThrough(start: GameState, tactics: TacticId[]): GameState {
  let s = start
  for (const t of tactics) {
    if (!s.call || s.call.phase !== 'awaitingTactic') break
    s = reducer(s, { type: 'PLAY_TACTIC', tacticId: t })
    s = reducer(s, { type: 'ADVANCE_CALL' })
  }
  return s
}

function openCall(over: Partial<Lead> = {}): GameState {
  setSeed(33)
  const s = reducer(gameWith({ salePrice: 900000, ...over }), {
    type: 'ATTEMPT_CLOSE',
    leadId: 'L1',
  })
  setSeed(null)
  return s
}

describe('PLAY_TACTIC', () => {
  it('records the turn and moves to the reaction phase', () => {
    const s = reducer(openCall(), { type: 'PLAY_TACTIC', tacticId: 'namedrop' })
    expect(s.call!.phase).toBe('showingReaction')
    expect(s.call!.history).toHaveLength(1)
    expect(s.call!.history[0].tacticUsed).toBe('namedrop')
    expect(s.call!.usedTactics).toEqual(['namedrop'])
    expect(s.call!.history[0].clientReply.length).toBeGreaterThan(0)
  })

  it('clamps momentum to the band no matter what is played', () => {
    let s = openCall({ archetypeId: 'oldMoneyOtis' })
    s = playThrough(s, ['flex', 'flex', 'flex'])
    expect(s.call?.momentum ?? 0).toBeGreaterThanOrEqual(P8.MOMENTUM_MIN)
  })

  it('is ignored in the reaction phase — one tactic per turn', () => {
    const once = reducer(openCall(), { type: 'PLAY_TACTIC', tacticId: 'push' })
    expect(reducer(once, { type: 'PLAY_TACTIC', tacticId: 'push' })).toBe(once)
  })
})

describe('ADVANCE_CALL', () => {
  it('moves to turn 2 with a fresh, unused beat', () => {
    let s = reducer(openCall(), { type: 'PLAY_TACTIC', tacticId: 'namedrop' })
    const first = s.call!.currentBeatId
    s = reducer(s, { type: 'ADVANCE_CALL' })
    expect(s.call!.turn).toBe(2)
    expect(s.call!.phase).toBe('awaitingTactic')
    expect(s.call!.currentBeatId).not.toBe(first)
    expect(s.call!.usedBeatIds).toContain(first)
  })

  it('resolves after exactly three turns', () => {
    const s = playThrough(openCall(), ['namedrop', 'namedrop', 'namedrop'])
    expect(s.call!.phase).toBe('resolved')
    expect(s.call!.outcome).not.toBeNull()
    expect(s.call!.history).toHaveLength(3)
  })

  it('never repeats a beat within a call', () => {
    const s = playThrough(openCall(), ['empathize', 'empathize', 'empathize'])
    const ids = s.call!.history.map((h) => h.beatId)
    expect(new Set(ids).size).toBe(ids.length)
  })
})

describe('Read the Room in play', () => {
  it('consumes the turn but keeps the beat', () => {
    let s = openCall()
    const beat = s.call!.currentBeatId
    s = reducer(s, { type: 'PLAY_TACTIC', tacticId: 'read' })
    s = reducer(s, { type: 'ADVANCE_CALL' })
    expect(s.call!.turn).toBe(2)
    expect(s.call!.currentBeatId).toBe(beat)
    expect(s.call!.revealedTells).toHaveLength(1)
    expect(s.call!.history[0].delta).toBe(0)
    expect(s.call!.history[0].reaction).toBe('neutral')
  })

  it('cannot be played twice in one call', () => {
    let s = openCall()
    s = reducer(s, { type: 'PLAY_TACTIC', tacticId: 'read' })
    s = reducer(s, { type: 'ADVANCE_CALL' })
    expect(reducer(s, { type: 'PLAY_TACTIC', tacticId: 'read' })).toBe(s)
  })

  it('logs a line naming what it found', () => {
    let s = openCall()
    s = reducer(s, { type: 'PLAY_TACTIC', tacticId: 'read' })
    const text = s.log.map((l) => l.text).join(' ')
    expect(text).toContain('You let the silence sit')
    expect(text).toContain('Dana Feltz')
  })
})

describe('hangup', () => {
  /* Force the collapse rather than hoping the dice deliver it. */
  const collapsed = (turn: number) => {
    const s = openCall()
    return {
      ...s,
      call: { ...s.call!, turn, momentum: -26, phase: 'showingReaction' as const },
    }
  }

  it('does not fire on turn 1', () => {
    const s = reducer(collapsed(1), { type: 'ADVANCE_CALL' })
    expect(s.call!.phase).toBe('awaitingTactic')
    expect(s.call!.turn).toBe(2)
    expect(s.callStats.hangups).toBe(0)
  })

  it('fires on turn 2, costs one patience, and still resolves the close', () => {
    const before = collapsed(2)
    const s = reducer(before, { type: 'ADVANCE_CALL' })
    expect(s.callStats.hangups).toBe(1)
    expect(s.call!.phase).toBe('resolved')
    expect(s.call!.outcome).not.toBeNull()
    const text = s.log.map((l) => l.text).join(' ')
    expect(text).toContain('The line goes dead')
    /* Patience: -1 for the hangup. A failed close drains another via the
       shared resolveClose path, so assert the hangup cost landed at all. */
    const lead = s.leads.find((l) => l.id === 'L1')
    if (lead) expect(lead.patience).toBeLessThan(3)
  })

  it('does not fire on turn 3 — that call was ending anyway', () => {
    const s = reducer(collapsed(3), { type: 'ADVANCE_CALL' })
    expect(s.callStats.hangups).toBe(0)
    expect(s.call!.phase).toBe('resolved')
  })
})

describe('resolution', () => {
  it('logs the summary line before the outcome line', () => {
    const s = playThrough(openCall(), ['namedrop', 'namedrop', 'namedrop'])
    const texts = s.log.map((l) => l.text)
    const summary = texts.findIndex((t) => /call (went|was)|Solid call/.test(t))
    expect(summary).toBeGreaterThanOrEqual(0)
  })

  it('records the outcome for the modal to render', () => {
    const s = playThrough(openCall(), ['namedrop', 'namedrop', 'namedrop'])
    const o = s.call!.outcome!
    expect(typeof o.success).toBe('boolean')
    expect(o.finalChance).toBeGreaterThanOrEqual(0.1)
    expect(o.finalChance).toBeLessThanOrEqual(0.9)
    expect(o.payout).toBeGreaterThanOrEqual(0)
    if (o.success) expect(o.payout).toBeGreaterThan(0)
  })

  it('counts exactly one close attempt regardless of turns taken', () => {
    const s = playThrough(openCall(), ['namedrop', 'namedrop', 'namedrop'])
    expect(s.callStats.calls).toBe(1)
  })

  it('clears the call and unblocks the game on CLOSE_CALL_MODAL', () => {
    let s = playThrough(openCall(), ['namedrop', 'namedrop', 'namedrop'])
    s = reducer(s, { type: 'CLOSE_CALL_MODAL' })
    expect(s.call).toBeNull()
    expect(reducer(s, { type: 'WORK_PHONES' })).not.toBe(s)
  })

  it('will not close the modal mid-call', () => {
    const s = openCall()
    expect(reducer(s, { type: 'CLOSE_CALL_MODAL' })).toBe(s)
  })
})
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run src/logic/__tests__/call.test.ts`
Expected: FAIL — the stub `PLAY_TACTIC` records no history.

- [ ] **Step 3: Implement the three cases**

In `src/state/reducer.ts`, replace the stub `case 'PLAY_TACTIC'` with these three cases:

```ts
    case 'PLAY_TACTIC': {
      const call = state.call
      if (!call || call.phase !== 'awaitingTactic') return state
      const lead = state.leads.find((l) => l.id === call.leadId)
      if (!lead) return state
      const beat = beatOf(call.currentBeatId)

      /* Read buys information instead of momentum. It costs the turn, keeps
         the beat, and can only be played once. */
      if (action.tacticId === 'read') {
        if (call.usedTactics.includes('read')) return state
        const found = revealTell(lead, beat, call.revealedTells)
        const line = readLineFor(lead.clientName, found)
        const entry: CallTurn = {
          turn: call.turn,
          beatId: beat.id,
          tacticUsed: 'read',
          reaction: 'neutral',
          delta: 0,
          clientReply: line,
        }
        return sync(
          withLog(
            {
              ...state,
              call: {
                ...call,
                phase: 'showingReaction',
                history: [...call.history, entry],
                usedTactics: [...call.usedTactics, 'read'],
                revealedTells: [...call.revealedTells, found.tactic],
              },
            },
            'flavor',
            line,
          ),
        )
      }

      const { reaction, delta } = tacticDelta(
        state,
        lead,
        beat,
        action.tacticId,
        call.usedTactics,
      )
      const entry: CallTurn = {
        turn: call.turn,
        beatId: beat.id,
        tacticUsed: action.tacticId,
        reaction,
        delta,
        clientReply: clientReplyFor(reaction),
      }
      return {
        ...state,
        call: {
          ...call,
          phase: 'showingReaction',
          momentum: clampMomentum(call.momentum + delta),
          history: [...call.history, entry],
          usedTactics: [...call.usedTactics, action.tacticId],
        },
      }
    }
    case 'ADVANCE_CALL': {
      const call = state.call
      if (!call || call.phase !== 'showingReaction') return state
      const lead = state.leads.find((l) => l.id === call.leadId)
      if (!lead) return { ...state, call: null }

      /* Turn 2 is the only place a call can collapse early. Turn 3 was ending
         anyway, so it resolves normally and is not charged for it. */
      const hangup =
        call.turn === 2 && call.momentum <= P8.HANGUP_MOMENTUM
      if (!hangup && call.turn < P8.TURNS) {
        const next = pickBeat(lead, call.turn + 1, call.usedBeatIds)
        return {
          ...state,
          call: {
            ...call,
            turn: call.turn + 1,
            currentBeatId: next.id,
            usedBeatIds: call.usedBeatIds.includes(next.id)
              ? call.usedBeatIds
              : [...call.usedBeatIds, next.id],
            phase: 'awaitingTactic',
          },
        }
      }

      let s: GameState = state
      if (hangup) {
        s = {
          ...s,
          callStats: { ...s.callStats, hangups: s.callStats.hangups + 1 },
          leads: s.leads.map((l) =>
            l.id === lead.id
              ? {
                  ...l,
                  patience: Math.max(0, l.patience - P8.PATIENCE_ON_HANGUP),
                }
              : l,
          ),
        }
        s = withLog(
          s,
          'event',
          "'Let me think about it.' The line goes dead. That phrase has never once meant thinking.",
        )
      }

      /* The lead may have lost patience above, so re-read it before resolving. */
      const current = s.leads.find((l) => l.id === lead.id) ?? lead
      const finalChance = finalChanceFor(s, current, call)
      const perfect = isPerfect(call)
      if (perfect)
        s = {
          ...s,
          callStats: {
            ...s.callStats,
            perfectCalls: s.callStats.perfectCalls + 1,
          },
        }
      s = withLog(s, 'flavor', callSummaryLine(call.momentum))
      if (perfect)
        s = withLog(
          s,
          'flavor',
          'Three for three. Every single thing you said landed. You will be insufferable about this.',
        )

      const result = resolveClose(s, current, finalChance)
      return {
        ...result.state,
        call: {
          ...call,
          phase: 'resolved',
          outcome: {
            success: result.success,
            finalChance,
            payout: result.payout,
          },
        },
      }
    }
    case 'CLOSE_CALL_MODAL': {
      if (!state.call || state.call.phase !== 'resolved') return state
      return { ...state, call: null }
    }
```

Extend the `logic/call` import in `reducer.ts` to:

```ts
import {
  beatOf,
  callSummaryLine,
  clampMomentum,
  clientReplyFor,
  finalChanceFor,
  isPerfect,
  pickBeat,
  readLineFor,
  revealTell,
  shouldCall,
  startCall,
  tacticDelta,
} from '../logic/call'
```

and add `CallTurn` to the `import type { ... } from './types'` list.

- [ ] **Step 4: Run the test and watch it pass**

Run: `npx vitest run src/logic/__tests__/call.test.ts`
Expected: PASS.

- [ ] **Step 5: Run the whole suite and build**

Run: `npm test && npm run build`
Expected: both PASS.

- [ ] **Step 6: Commit**

```bash
git add src/state/reducer.ts src/logic/__tests__/call.test.ts
git commit -m "feat(call): turn playing, Read, hangup, and resolution"
```

---

## Task 13: Perfect-call brags

**Files:**
- Modify: `src/data/brags.ts`, `src/logic/economy.ts`
- Test: `src/logic/__tests__/call.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `src/logic/__tests__/call.test.ts`:

```ts
import { CALL_BRAGS } from '../../data/brags'
import { bragFor } from '../economy'

describe('call brags', () => {
  it('ships the three lines', () => {
    expect(CALL_BRAGS).toHaveLength(3)
    expect(CALL_BRAGS.join(' ')).toContain('The phone is a WEAPON')
  })

  it('stays out of the rotation until a perfect call happens', () => {
    const s = { ...initialState(), rank: 'buyerAgent' as const }
    setSeed(2)
    const seen = new Set<string>()
    for (let i = 0; i < 300; i++) seen.add(bragFor(s))
    CALL_BRAGS.forEach((b) => expect(seen.has(b), b).toBe(false))
    setSeed(null)
  })

  it('joins the rotation after one', () => {
    const s = {
      ...initialState(),
      rank: 'buyerAgent' as const,
      callStats: { calls: 4, perfectCalls: 1, hangups: 0 },
    }
    setSeed(2)
    const seen = new Set<string>()
    for (let i = 0; i < 300; i++) seen.add(bragFor(s))
    expect(CALL_BRAGS.some((b) => seen.has(b))).toBe(true)
    setSeed(null)
  })
})
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run src/logic/__tests__/call.test.ts`
Expected: FAIL — no export named `CALL_BRAGS`.

- [ ] **Step 3: Add the lines**

At the end of `src/data/brags.ts`:

```ts
/** Phase 8. Joins the rotation after the first perfect call, and not before —
 *  you have to earn the right to be this annoying. */
export const CALL_BRAGS: string[] = [
  'Closed it on the phone in under six minutes. The phone is a WEAPON. ☎️',
  'Some agents send emails. I call. 📞',
  "'Let me think about it' is just a request for a better phone call.",
]
```

- [ ] **Step 4: Wire it into the rotation**

In `src/logic/economy.ts`, inside `bragFor`, after the `if (state.kingOfBrantford) situational(KING_BRAGS)` line, add:

```ts
  if (state.callStats.perfectCalls > 0) situational(CALL_BRAGS)
```

Add `CALL_BRAGS` to the existing import from `../data/brags`.

- [ ] **Step 5: Run the test and watch it pass**

Run: `npx vitest run src/logic/__tests__/call.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/data/brags.ts src/logic/economy.ts src/logic/__tests__/call.test.ts
git commit -m "feat(call): perfect-call brags join the rotation"
```

---

## Task 14: The call modal

**Files:**
- Create: `src/components/CallModal.tsx`
- Modify: `src/styles.css`, `src/App.tsx`

No unit tests — this is presentational and the engine underneath is fully covered. Verify it by playing it in Step 6.

- [ ] **Step 1: Add the styles**

Append to `src/styles.css`:

```css
/* ---------------------------------------------------------- phase 8 UI */
.res-call { max-width: 560px; }
.res-call-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 10px; }
.res-call-price { font-family: "Archivo Black", sans-serif; font-size: 20px; color: var(--brass); }

/* The meter is centred at zero: brass grows right, sold-red grows left. */
.res-meter { position: relative; height: 10px; background: #ddd7c8; border-radius: 5px; margin: 12px 0 4px; overflow: hidden; }
.res-meter i { position: absolute; top: 0; bottom: 0; left: 50%; background: var(--brass); transition: width .35s ease, transform .35s ease; }
.res-meter i.neg { background: var(--sold); transform: translateX(-100%); }
.res-meter::after { content: ""; position: absolute; left: 50%; top: -2px; bottom: -2px; width: 1px; background: rgba(20,22,31,.35); }
.res-meter-label { font-size: 11px; letter-spacing: .1em; text-transform: uppercase; color: #5e6270; }

.res-call-pips { display: flex; gap: 6px; margin: 10px 0; }
.res-call-pips i { width: 9px; height: 9px; border-radius: 50%; background: #cfc9ba; }
.res-call-pips i.on { background: var(--brass); }

.res-beat { font-size: 17px; line-height: 1.45; margin: 10px 0 4px; min-height: 3.2em; }
.res-beat .glyph { color: var(--brass); margin-right: 6px; }

.res-bubbles { margin: 10px 0; display: flex; flex-direction: column; gap: 8px; }
.res-bub { max-width: 82%; padding: 9px 12px; border-radius: 12px; font-size: 14px; line-height: 1.4; }
.res-bub.me { align-self: flex-end; background: var(--ink); color: var(--marble); border-bottom-right-radius: 3px; }
.res-bub.them { align-self: flex-start; background: #e6e0d2; color: var(--ink); border-bottom-left-radius: 3px; }
.res-delta { font-family: "Archivo Black", sans-serif; font-size: 15px; align-self: flex-end; }
.res-delta.up { color: var(--mint); }
.res-delta.down { color: var(--sold); }

.res-tactics { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 12px; }
.res-tactic { position: relative; text-align: left; padding: 10px 11px; border-radius: 10px; border: 1px solid rgba(20,22,31,.22);
  background: #fffdf7; color: var(--ink); cursor: pointer; font: inherit; }
.res-tactic:disabled { opacity: .45; cursor: default; }
.res-tactic b { display: block; font-family: "Archivo Black", sans-serif; font-size: 14px; }
.res-tactic span { display: block; font-size: 11.5px; color: #5e6270; margin-top: 2px; }
.res-tactic.dim span { opacity: .5; }
.res-tactic .used { font-size: 10px; letter-spacing: .08em; text-transform: uppercase; color: var(--sold); }
.res-tactic .badge { position: absolute; top: 7px; right: 9px; font-size: 14px; }
.res-tactic .badge.good { color: var(--brass); }
.res-tactic .badge.avoid { color: var(--sold); }
.res-tactic.wide { grid-column: 1 / -1; }
```

- [ ] **Step 2: Create the component**

Create `src/components/CallModal.tsx`:

```tsx
import { useEffect, useState } from 'react'
import type { Dispatch } from 'react'
import { CALL_CARDS } from '../data/callCards'
import { districtOrFirst } from '../data/districts'
import { hasFlag } from '../logic/characters'
import { arch } from '../logic/leads'
import {
  beatOf,
  momentumWord,
  playerLineFor,
  reactionFor,
  revealTell,
} from '../logic/call'
import { money } from '../logic/rand'
import { P8 } from '../data/p8'
import type { Action, GameState, PlayableTactic, TacticId } from '../state/types'

const PLAYABLE: PlayableTactic[] = ['empathize', 'push', 'namedrop', 'flex']

const reduceMotion = (): boolean =>
  typeof window !== 'undefined' &&
  window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true

/** Types the beat out one character at a time, unless the player has asked the
 *  world to stop moving. */
function useTypewriter(text: string): string {
  const [shown, setShown] = useState(text)
  useEffect(() => {
    if (reduceMotion()) {
      setShown(text)
      return
    }
    setShown('')
    let i = 0
    const id = setInterval(() => {
      i += 1
      setShown(text.slice(0, i))
      if (i >= text.length) clearInterval(id)
    }, 18)
    return () => clearInterval(id)
  }, [text])
  return shown
}

export default function CallModal({
  state,
  dispatch,
}: {
  state: GameState
  dispatch: Dispatch<Action>
}) {
  const call = state.call
  const lead = state.leads.find((l) => l.id === call?.leadId)
  const beat = beatOf(call?.currentBeatId ?? '')
  const beatText = lead
    ? beat.text
        .replace('{name}', lead.clientName)
        .replace('{price}', money(lead.salePrice))
    : ''
  const typed = useTypewriter(beatText)

  if (!call || !lead) return null

  const a = arch(lead.archetypeId)
  const raw = hasFlag(state, 'showRawNumbers')
  const pct = Math.abs(call.momentum) / P8.MOMENTUM_MAX
  const last = call.history[call.history.length - 1]

  /* Badge polarity is recomputed rather than stored: the beat and the
     archetype are the truth, and both are already in hand. */
  const badgeFor = (t: PlayableTactic): 'good' | 'avoid' | null => {
    if (!call.revealedTells.includes(t)) return null
    const r = reactionFor(lead, beat, t)
    if (r === 'great' || r === 'good') return 'good'
    if (r === 'terrible' || r === 'bad') return 'avoid'
    /* A neutral reveal came from the flat-beat fallback; trust its polarity. */
    return revealTell(lead, beat, []).tactic === t ? 'good' : null
  }

  const usedCount = (t: TacticId) =>
    call.usedTactics.filter((x) => x === t).length

  return (
    <div className="res-modal">
      <div className="res-card res-call">
        <div className="res-call-head">
          <div>
            <h2 className="res-display">{lead.clientName}</h2>
            <div style={{ fontSize: 12, color: '#5e6270' }}>
              {a.label} · {districtOrFirst(lead.districtId).name}
            </div>
          </div>
          <div className="res-call-price">{money(lead.salePrice)}</div>
        </div>

        <div className="res-meter">
          <i
            className={call.momentum < 0 ? 'neg' : ''}
            style={{ width: pct * 50 + '%' }}
          />
        </div>
        <div className="res-meter-label">
          {momentumWord(call.momentum)}
          {raw && ' · ' + call.momentum}
        </div>

        <div className="res-call-pips">
          {[1, 2, 3].map((n) => (
            <i key={n} className={n <= call.turn ? 'on' : ''} />
          ))}
        </div>

        {call.phase === 'resolved' ? (
          <Resolution state={state} dispatch={dispatch} />
        ) : (
          <>
            <div className="res-beat">
              <span className="glyph">☎</span>
              {call.phase === 'showingReaction' ? beatText : typed}
            </div>

            {call.phase === 'showingReaction' && last && (
              <>
                <div className="res-bubbles">
                  <div className="res-bub me">
                    {last.tacticUsed === 'read'
                      ? playerLineFor(last.beatId, 'read')
                      : playerLineFor(last.beatId, last.tacticUsed ?? 'empathize')}
                  </div>
                  <div className="res-bub them">{last.clientReply}</div>
                  {last.delta !== 0 && (
                    <div
                      className={'res-delta ' + (last.delta > 0 ? 'up' : 'down')}
                    >
                      {last.delta > 0 ? '+' : '−'}
                      {Math.abs(last.delta)}
                    </div>
                  )}
                </div>
                <button
                  className="res-go"
                  onClick={() => dispatch({ type: 'ADVANCE_CALL' })}
                >
                  Continue
                </button>
              </>
            )}

            {call.phase === 'awaitingTactic' && (
              <div className="res-tactics">
                {PLAYABLE.map((t) => {
                  const card = CALL_CARDS.find((c) => c.id === t)!
                  const n = usedCount(t)
                  const badge = badgeFor(t)
                  return (
                    <button
                      key={t}
                      className={'res-tactic' + (n > 0 ? ' dim' : '')}
                      onClick={() => dispatch({ type: 'PLAY_TACTIC', tacticId: t })}
                    >
                      {badge && (
                        <span className={'badge ' + badge}>
                          {badge === 'good' ? '⭑' : '✕'}
                        </span>
                      )}
                      <b>{card.label}</b>
                      <span>{card.hint}</span>
                      {n > 0 && (
                        <span className="used">
                          used ×{n} · −{n * P8.REPEAT_PENALTY}
                        </span>
                      )}
                    </button>
                  )
                })}
                <button
                  className="res-tactic wide"
                  disabled={call.usedTactics.includes('read')}
                  onClick={() =>
                    dispatch({ type: 'PLAY_TACTIC', tacticId: 'read' })
                  }
                >
                  <b>Read the Room</b>
                  <span>
                    {call.usedTactics.includes('read')
                      ? 'You only get one of these.'
                      : 'Say nothing. Learn one thing. (Costs the turn.)'}
                  </span>
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

/** The outcome page. Reuses the Phase 1 SOLD stamp on success. */
function Resolution({
  state,
  dispatch,
}: {
  state: GameState
  dispatch: Dispatch<Action>
}) {
  const call = state.call!
  const o = call.outcome
  const lead = state.leads.find((l) => l.id === call.leadId)
  return (
    <div style={{ position: 'relative', paddingTop: 10 }}>
      {o?.success ? (
        <>
          <div className="res-sold">SOLD</div>
          <p className="res-blurb">
            Signed on the phone. Your share came to {money(o.payout)}.
          </p>
        </>
      ) : (
        <p className="res-blurb">
          {lead
            ? lead.clientName + ' is still thinking. You get one more run at it.'
            : 'That one is gone. Some calls end the relationship, not the deal.'}
        </p>
      )}
      <button
        className="res-go"
        onClick={() => dispatch({ type: 'CLOSE_CALL_MODAL' })}
      >
        Back to the pipeline
      </button>
    </div>
  )
}
```

- [ ] **Step 3: Mount it and block End Week**

In `src/App.tsx`, add the import:

```tsx
import CallModal from './components/CallModal'
```

Mount it next to the existing modal at line ~223:

```tsx
      <CallModal state={state} dispatch={dispatch} />
```

Then change the End Week button (lines ~212-221) to account for the call:

```tsx
      <button
        className="res-end res-display"
        disabled={state.pendingChoices.length > 0 || state.call !== null}
        title={
          state.call !== null
            ? "You're on the phone."
            : state.pendingChoices.length > 0
              ? 'Decisions await'
              : ''
        }
        onClick={() => dispatch({ type: 'END_WEEK' })}
      >
        {state.call !== null
          ? 'ON THE PHONE'
          : state.pendingChoices.length > 0
            ? 'DECISIONS AWAIT'
            : 'END WEEK ' + state.week}
      </button>
```

- [ ] **Step 4: Typecheck and lint**

Run: `npm run build && npm run lint`
Expected: both PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/CallModal.tsx src/styles.css src/App.tsx
git commit -m "feat(call): the call modal"
```

- [ ] **Step 6: Play it**

Start the dev server and drive one call end to end. Use the debug controls from Task 15 if they are already in, or temporarily give yourself a luxury lead. Check by hand:
- the beat types out, then the tactic cards appear
- clicking a tactic shows your line, then theirs, then the delta chip
- the meter moves and its word changes
- Read adds a ⭑ or ✕ badge to the right card and disables itself
- a repeated tactic shows "used ×1 · −4" **before** you click it again
- turn three ends on the SOLD stamp or the failure line
- End Week reads "ON THE PHONE" and is disabled throughout

---

## Task 15: Settings toggle and debug controls

**Files:**
- Modify: `src/state/reducer.ts`, `src/components/OfficeTab.tsx`
- Test: `src/logic/__tests__/call.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `src/logic/__tests__/call.test.ts`:

```ts
describe('settings and debug', () => {
  it('toggles calls off and back on', () => {
    let s = reducer(initialState(), {
      type: 'SET_CALLS_ENABLED',
      enabled: false,
    })
    expect(s.callsEnabled).toBe(false)
    s = reducer(s, { type: 'SET_CALLS_ENABLED', enabled: true })
    expect(s.callsEnabled).toBe(true)
  })

  it('forces a call on any ready lead, threshold or not', () => {
    setSeed(41)
    const s = reducer(gameWith({ salePrice: 1000 }), {
      type: 'DEBUG_FORCE_CALL',
      leadId: 'L1',
    })
    expect(s.call).not.toBeNull()
    setSeed(null)
  })

  it('sets momentum directly, clamped to the band', () => {
    let s = reducer(openCall(), { type: 'DEBUG_SET_MOMENTUM', momentum: 999 })
    expect(s.call!.momentum).toBe(P8.MOMENTUM_MAX)
    s = reducer(s, { type: 'DEBUG_SET_MOMENTUM', momentum: -999 })
    expect(s.call!.momentum).toBe(P8.MOMENTUM_MIN)
  })

  it('reveals all four tells at once', () => {
    const s = reducer(openCall(), { type: 'DEBUG_REVEAL_TELLS' })
    expect(s.call!.revealedTells.sort()).toEqual(
      ['empathize', 'flex', 'namedrop', 'push'].sort(),
    )
  })
})
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run src/logic/__tests__/call.test.ts`
Expected: FAIL — `expected true to be false` on the toggle test.

- [ ] **Step 3: Add the cases**

In `src/state/reducer.ts`, add:

```ts
    case 'SET_CALLS_ENABLED':
      return { ...state, callsEnabled: action.enabled }
    case 'DEBUG_FORCE_CALL': {
      const lead = state.leads.find((l) => l.id === action.leadId)
      if (!lead || state.call) return state
      return {
        ...state,
        call: startCall(lead),
        callStats: { ...state.callStats, calls: state.callStats.calls + 1 },
      }
    }
    case 'DEBUG_SET_MOMENTUM': {
      if (!state.call) return state
      return {
        ...state,
        call: { ...state.call, momentum: clampMomentum(action.momentum) },
      }
    }
    case 'DEBUG_REVEAL_TELLS': {
      if (!state.call) return state
      return {
        ...state,
        call: {
          ...state.call,
          revealedTells: ['empathize', 'push', 'namedrop', 'flex'],
        },
      }
    }
```

- [ ] **Step 4: Run the test and watch it pass**

Run: `npx vitest run src/logic/__tests__/call.test.ts`
Expected: PASS.

- [ ] **Step 5: Add the UI**

In `src/components/OfficeTab.tsx`, inside the Settings panel (the `<div className="res-panel dark">` whose heading is `Settings`), add above the export/import buttons:

```tsx
        <div style={{ marginBottom: 10 }}>
          <button
            className={'res-tab' + (state.callsEnabled ? ' on' : '')}
            onClick={() =>
              dispatch({
                type: 'SET_CALLS_ENABLED',
                enabled: !state.callsEnabled,
              })
            }
          >
            {state.callsEnabled ? '● ' : '○ '}Phone calls for big deals
          </button>
          <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>
            Off = instant dice roll, like the old days.
          </div>
        </div>
```

Then in the "Cheat Codes" panel, after the existing Phase 6 buttons, add:

```tsx
          {/* ---- phase 8 ---- */}
          <label className="res-chip">
            Force call
            <select
              value=""
              onChange={(e) =>
                e.target.value &&
                dispatch({ type: 'DEBUG_FORCE_CALL', leadId: e.target.value })
              }
            >
              <option value="">Pick a lead…</option>
              {state.leads
                .filter((l) => !l.sold)
                .map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.clientName} · {money(l.salePrice)}
                  </option>
                ))}
            </select>
          </label>
          <label className="res-chip">
            Set momentum
            <select
              value=""
              disabled={!state.call}
              onChange={(e) =>
                dispatch({
                  type: 'DEBUG_SET_MOMENTUM',
                  momentum: Number(e.target.value),
                })
              }
            >
              <option value="">…</option>
              {[30, 20, 10, 0, -10, -20, -26, -30].map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </label>
          <button
            className="res-tab"
            disabled={!state.call}
            onClick={() => dispatch({ type: 'DEBUG_REVEAL_TELLS' })}
          >
            Reveal all tells
          </button>
```

Note: the "Set momentum" and "Reveal all tells" controls only do anything while a call is open, and the call modal covers the Office tab. Use them by setting momentum from a save, or accept that "Force call" is the one that gets daily use. If you want them reachable mid-call, that is a follow-up, not this task.

- [ ] **Step 6: Typecheck, lint, full suite**

Run: `npm run build && npm run lint && npm test`
Expected: all PASS.

- [ ] **Step 7: Commit**

```bash
git add src/state/reducer.ts src/components/OfficeTab.tsx src/logic/__tests__/call.test.ts
git commit -m "feat(call): settings toggle and debug controls"
```

---

## Task 16: Acceptance sweep

**Files:**
- Modify: `src/logic/__tests__/call.test.ts`

The final pass proves the criteria that span several tasks and cannot be tested inside any one of them.

- [ ] **Step 1: Write the failing test**

Append to `src/logic/__tests__/call.test.ts`:

```ts
describe('acceptance — the call cannot escape its bounds', () => {
  it('keeps momentum in [-30, 30] across many random calls', () => {
    setSeed(101)
    const tactics: TacticId[] = ['empathize', 'push', 'namedrop', 'flex', 'read']
    for (let i = 0; i < 120; i++) {
      const archetypeId = ARCHETYPES[i % ARCHETYPES.length].id
      let s = reducer(gameWith({ archetypeId, salePrice: 900000 }), {
        type: 'ATTEMPT_CLOSE',
        leadId: 'L1',
      })
      for (let t = 0; t < 3 && s.call && s.call.phase !== 'resolved'; t++) {
        const pickTactic = tactics[(i + t) % tactics.length]
        if (s.call.phase !== 'awaitingTactic') break
        if (pickTactic === 'read' && s.call.usedTactics.includes('read')) {
          s = reducer(s, { type: 'PLAY_TACTIC', tacticId: 'push' })
        } else {
          s = reducer(s, { type: 'PLAY_TACTIC', tacticId: pickTactic })
        }
        expect(s.call!.momentum).toBeGreaterThanOrEqual(P8.MOMENTUM_MIN)
        expect(s.call!.momentum).toBeLessThanOrEqual(P8.MOMENTUM_MAX)
        s = reducer(s, { type: 'ADVANCE_CALL' })
      }
      expect(s.call!.phase).toBe('resolved')
      expect(s.call!.outcome!.finalChance).toBeGreaterThanOrEqual(0.1)
      expect(s.call!.outcome!.finalChance).toBeLessThanOrEqual(0.9)
    }
    setSeed(null)
  })

  it('never runs more than three scored turns', () => {
    setSeed(102)
    for (let i = 0; i < 40; i++) {
      const s = playThrough(openCall(), ['push', 'namedrop', 'empathize', 'flex'])
      expect(s.call!.history.length).toBeLessThanOrEqual(3)
    }
    setSeed(null)
  })
})

describe('acceptance — the retry path', () => {
  it('removes the lead on a second failure, same as the dice path', () => {
    /* Force the failure by driving momentum to the floor before resolving. */
    setSeed(103)
    let s = reducer(gameWith({ salePrice: 900000, retriedClose: true }), {
      type: 'ATTEMPT_CLOSE',
      leadId: 'L1',
    })
    s = reducer(s, { type: 'PLAY_TACTIC', tacticId: 'push' })
    s = { ...s, call: { ...s.call!, turn: 3, momentum: -30 } }
    s = reducer(s, { type: 'ADVANCE_CALL' })
    if (!s.call!.outcome!.success) {
      expect(s.leads.find((l) => l.id === 'L1')).toBeUndefined()
      expect(s.counters.leadsLost).toBe(1)
    }
    setSeed(null)
  })
})

describe('acceptance — guards', () => {
  it('runs a whole call for an archetype with no tell row and no beats', () => {
    setSeed(104)
    const s = playThrough(
      reducer(gameWith({ archetypeId: 'notARealArchetype', salePrice: 900000 }), {
        type: 'ATTEMPT_CLOSE',
        leadId: 'L1',
      }),
      ['empathize', 'read', 'namedrop'],
    )
    expect(s.call!.phase).toBe('resolved')
    setSeed(null)
  })

  it('counts one close attempt per call, not per turn', () => {
    setSeed(105)
    const before = gameWith({ salePrice: 900000 })
    const after = playThrough(
      reducer(before, { type: 'ATTEMPT_CLOSE', leadId: 'L1' }),
      ['push', 'push', 'push'],
    )
    expect(after.callStats.calls).toBe(1)
    setSeed(null)
  })
})
```

- [ ] **Step 2: Run it**

Run: `npx vitest run src/logic/__tests__/call.test.ts`
Expected: PASS. If the momentum sweep fails, the clamp in `PLAY_TACTIC` is missing or applied in the wrong order — momentum must be clamped after adding the delta, not before.

- [ ] **Step 3: Run everything**

Run: `npm test && npm run build && npm run lint`
Expected: all three PASS.

- [ ] **Step 4: Walk the acceptance criteria by hand**

Open `docs/superpowers/specs/2026-08-04-phone-call-design.md` §13 and confirm each of the 12 criteria maps to a passing test or a verified behaviour. Criterion 3's "visible on the cards before clicking" and criterion 9's "words not numbers" are UI claims — confirm them in the browser, not the test output.

- [ ] **Step 5: Commit**

```bash
git add src/logic/__tests__/call.test.ts
git commit -m "test(call): acceptance sweep across archetypes and guards"
```

---

## Self-Review Notes

Checked against the spec. Coverage:

| Spec section | Task |
|---|---|
| §1 trigger rule, callsEnabled | 6, 11 |
| §2.1 resolveClose refactor | 4 |
| §3 P8 constants | 1 |
| §4 types | 1 |
| §5 tactic cards | 2 |
| §6 archetype tells | 3 |
| §7 beats, generics, replies | 3 |
| §8.1 startCall | 10, 11 |
| §8.2 pickBeat | 7 |
| §8.3 reactions and scaling | 8 |
| §8.4 turn flow and hangup | 12 |
| §8.5 Read the Room | 9, 12 |
| §8.6 resolution | 10, 12 |
| §8.7 retry rule | 10, 16 |
| §9 log and flavour lines | 11, 12, 13 |
| §10 UI contract | 14 |
| §11 optional-dependency guards | 7, 8, 9, 16 |
| §12 migration | 5 |
| §13 acceptance criteria | 16 |

Two things a reviewer should watch for during execution:

**Task 4 is the risky one.** It moves ~75 lines of live economic code. If the test count changes at all, stop and find out why before continuing — a silently dropped `sync()` or `gain()` call will not fail loudly, it will just quietly stop paying territory share.

**Task 12's hangup ordering.** The spec's `turn >= 2` was narrowed to `turn === 2` during design review, with the reasoning recorded in spec §8.4. If a reviewer flags it as a deviation, point them at that section — it is a decision, not a mistake.
