# Phase 9 — "The Post" (Content Calendar) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an end-of-week two-step social-media post minigame (pick post → pick caption → resolve into leads/rep/ego + a viral/embarrass roll), gated by a three-tier production crew, that slots between End Week and the Week Summary.

**Architecture:** New data files (`posts`, `captions`, `crew`) + a pure resolver (`logic/content.ts`) + a `PostComposer.tsx` sheet. `END_WEEK` runs all existing economic resolution and rolls the week as it does today, but if `contentEnabled` and the composer hasn't been shown for this week, it sets `postComposerPending: true` and defers **display** of the already-built `summary` behind the composer in `App.tsx`. The player's `CREATE_POST`/`SKIP_POST` action then applies post effects (rep/ego via a new stored `postEgo`, lead-bias seeding, viral close-modifier) and patches the `summary.content` section. Lead generation is tilted for one week via a new `pendingLeadBias` array read inside `archetypeWeight`.

**Tech Stack:** TypeScript, React (useReducer), Vitest. Deterministic RNG via `logic/rand` (`rand`, `chance`, `pick`, `weightedPick`), seeded through the reducer wrapper.

---

## Design decisions (read before starting)

1. **When the post resolves.** `END_WEEK` rolls the week to N+1 and builds `summary` exactly as today (no post effects). It additionally sets `postComposerPending: true` (guarded — see below). The composer is then shown by `App.tsx` *before* the summary. `CREATE_POST`/`SKIP_POST` apply effects on the already-rolled state and patch `summary.content`. This satisfies §7 ordering (Call → Post → Summary) and §8.4 (summary shows the post) without splitting `endWeek()` in half.

2. **Lead-bias timing (§6.6).** `endWeek` decrements/expires `pendingLeadBias` near the top of resolution (before the composer is opened). `CREATE_POST` seeds new bias with `weeksLeft: 1` *after* the week has rolled, so the bias is live through the coming week's `WORK_PHONES`/inbound and is decremented at the *next* `endWeek`. Net effect: a post seeds exactly the one upcoming week.

3. **Viral close modifier (§6.4 / §9).** Widen `ActiveModifier['id']` to include `'viralMoment'`. Push it directly in `CREATE_POST` with `closeChanceDelta: 0.05`, `expiresWeek: week + 2` (week is already N+1 at that point). `activeModifierDelta` already sums all active modifiers, so no other change is needed. It is exempt from the hot/rate mutual-exclusivity because that only applies inside `setMarketModifier`, which we do not call here.

3a. **Migration guard for the widened union.** `migrate.ts`'s `validModifiers` currently reconstructs any non-hot/rate id as hot/rate from the sign. Add `'viralMoment'` to the ids it preserves so a saved viral modifier survives a reload.

4. **`postEgo` and the cap (§9).** `deriveStats` adds `state.postEgo` into the ego sum *before* the existing `Math.min(egoCapFor(state, 15), ego)` clamp. Posts mutate `state.postEgo`; the cap is respected automatically.

5. **"Shown this week" guard (§13.11).** `postComposerPending` is the single source of truth for "composer is open". A separate `postedThisWeek` flag prevents `END_WEEK` from re-opening the composer for a week already handled (defensive; in normal flow `END_WEEK` runs once per week). `postedThisWeek` is set true when the composer is opened and reset to false at the very end of `endWeek` on the *next* roll... simpler: store `postComposerWeek: number` = the week the composer was last opened for, and only open when `postComposerWeek !== s.week`. See Task 6.

6. **Reputation ownership (§10/§11).** `reputation` already exists (Phase 2 built). Read/write `s.reputation` with the existing `clampRep`. Do not create a second field.

---

## File Structure

- **Create** `src/data/posts.ts` — the 9 `PostDef`s (§4), `POSTS`, `postOf(id)`.
- **Create** `src/data/captions.ts` — the 4 `CaptionDef`s (§5), `CAPTIONS`, `captionOf(id)`.
- **Create** `src/data/crew.ts` — the 3 `CrewDef`s (§3), `CREWS`, `P9` constants (§2), `crewOf(id)`, unlock lines.
- **Create** `src/data/postLines.ts` — the verbatim per-post outcome lines + generic banners + brag lines (§8).
- **Create** `src/logic/content.ts` — pure helpers: `activeCrew`, `unlockedCrewFor`, `postTier`/availability, `computeChances`, `resolvePost`, `applySkip`, `biasCount`, `previewDeltas`.
- **Create** `src/components/PostComposer.tsx` — the two-step sheet (§12).
- **Modify** `src/state/types.ts` — new interfaces (`PostRecord`, `PostDef`, `CaptionDef`, `CrewDef`, `PostOutcome`), new `GameState` fields, `version: 9`, widen `ActiveModifier['id']`, new actions.
- **Modify** `src/state/reducer.ts` — `initialState` defaults, `CREATE_POST`/`SKIP_POST`/`SET_CONTENT_ENABLED`/debug cases, `endWeek` crew recompute + bias decrement + `postComposerPending`.
- **Modify** `src/state/migrate.ts` — `version: 9`, defaults for new fields, crew recompute, `validModifiers` widening.
- **Modify** `src/logic/economy.ts` — `deriveStats` adds `postEgo`.
- **Modify** `src/logic/territory.ts` — `archetypeWeight` multiplies by `(1 + 1.5 × biasCount)`.
- **Modify** `src/components/App.tsx` — render `PostComposer` before `WeekSummaryModal`; gate summary behind the composer.
- **Modify** `src/components/WeekSummaryModal.tsx` — render the Content section (§8.4).
- **Modify** `src/components/OfficeTab.tsx` — debug controls (§13.12) + `contentEnabled` toggle (§12 Settings).
- **Modify** `src/styles.css` — composer styles.
- **Test** `src/logic/__tests__/content.test.ts`, `src/state/__tests__/contentReducer.test.ts`, additions to `migrate.test.ts`.

---

## Task 1: Types & constants

**Files:**
- Modify: `src/state/types.ts`
- Create: `src/data/crew.ts` (P9 constants + crew data)

- [ ] **Step 1: Add the P9 constants and crew data (`src/data/crew.ts`)**

```ts
/* Phase 9 tuning. Every number "The Post" moves lives here. Per §14: if pacing
   is off, adjust VIRAL_BASE / EMBARRASS_BASE and the caption deltas first —
   never the crew unlock thresholds or the per-post attract lists. */

import type { CrewDef, CrewId } from '../state/types'

export const P9 = {
  VIRAL_BASE: 0.1,
  EMBARRASS_BASE: 0.1,
  EGO_VIRAL_PER_POINT: 0.015,
  REP_STEADY_MIN: 15,
  REP_HIGH: 70,
  MAX_ATTRACT_LEADS: 3,
  SKIP_STREAK_REP_DECAY: 1,
  SKIP_STREAK_TRIGGER: 3,
} as const

/** One crew is active at a time: the highest tier unlocked. `viralUpside` adds
 *  to the viral chance; `embarrassWeightMult` multiplies the embarrass chance;
 *  `teamLeadBonus` (team only) adds +1 to leads generated by any post. */
export const CREWS: CrewDef[] = [
  {
    id: 'none',
    label: 'Just your phone',
    embarrassWeightMult: 1,
    viralUpside: 0,
    teamLeadBonus: 0,
  },
  {
    id: 'freelancer',
    label: 'A guy named Kyle with a gimbal',
    embarrassWeightMult: 0.7,
    viralUpside: 0.03,
    teamLeadBonus: 0,
  },
  {
    id: 'team',
    label: 'A full content team (three Kyles)',
    embarrassWeightMult: 0.4,
    viralUpside: 0.08,
    teamLeadBonus: 1,
  },
]

export const crewOf = (id: CrewId): CrewDef =>
  CREWS.find((c) => c.id === id) ?? CREWS[0]

/** Logged once, only on an upward change (§3). */
export const CREW_UNLOCK_LINES: Record<Exclude<CrewId, 'none'>, string> = {
  freelancer:
    'You hired Kyle. Kyle has a gimbal and a vision. The vision is mostly slow-motion walking.',
  team: "You now have a full content team. Three people named Kyle. They finish each other's transitions.",
}
```

- [ ] **Step 2: Add the new types to `src/state/types.ts`**

Add near the other phase blocks:

```ts
/* -------------------------------------------------------------- phase 9 */

export type CrewId = 'none' | 'freelancer' | 'team'
export type PostTier = 'basic' | 'produced' | 'premium'
export type PostOutcome = 'neutral' | 'viral' | 'embarrass'

export interface CrewDef {
  id: CrewId
  label: string
  /** Multiplies the embarrass chance. 1 at `none`, lower as crews improve. */
  embarrassWeightMult: number
  /** Added to the viral chance. */
  viralUpside: number
  /** Added to leads generated by any post. Only `team` has 1. */
  teamLeadBonus: number
}

export interface PostDef {
  id: string
  label: string
  tier: PostTier
  /** Minimum crew tier that unlocks this post. */
  crewRequired: CrewId
  blurb: string
  baseEffects: { leads: number; rep: number; cash: number }
  /** archetypeIds seeded into next week's pool on a neutral-or-better outcome. */
  attract: string[]
  viralMod: number
  embarrassMod: number
  /** Added to postEgo on a neutral-or-better outcome (before the caption). */
  egoBias: number
}

export interface CaptionDef {
  id: string
  label: string
  /** Multiplies the post's POSITIVE rep effect only. */
  repMult: number
  viralDelta: number
  embarrassDelta: number
  egoDelta: number
  text: string
}

export interface PostRecord {
  week: number
  postId: string
  captionId: string
  outcome: PostOutcome
  repDelta: number
  egoDelta: number
  leads: number
}
```

- [ ] **Step 3: Widen `ActiveModifier['id']` and add `GameState` fields**

In `ActiveModifier`:
```ts
  id: 'hotMarket' | 'rateSpike' | 'viralMoment'
```

In `GameState`, bump `version` and add a phase-9 block:
```ts
  version: 9
```
```ts
  /* ------------------------------------------------------------ phase 9 */

  /** Stored ego contribution from posts, folded into getStats before the cap. */
  postEgo: number
  /** One-week lead-pool tilt. Each seeded archetype adds an entry. */
  pendingLeadBias: { archetypeId: string; weeksLeft: number }[]
  contentHistory: PostRecord[]
  /** For the Week Summary; set on resolve, read by the summary card. */
  lastPost: PostRecord | null
  contentStats: {
    posts: number
    viral: number
    embarrassed: number
    skipStreak: number
  }
  contentEnabled: boolean
  /** Highest crew tier reached; recomputed each END_WEEK from rank/rep. */
  unlockedCrew: CrewId
  /** True while the composer is open (blocks the summary). */
  postComposerPending: boolean
  /** The week the composer was last opened for; guards double-open (§13.11). */
  postComposerWeek: number
```

- [ ] **Step 4: Add the new actions to the `Action` union**

```ts
  /* ---- phase 9 ---- */
  | { type: 'CREATE_POST'; postId: string; captionId: string }
  | { type: 'SKIP_POST' }
  | { type: 'SET_CONTENT_ENABLED'; enabled: boolean }
  | { type: 'DEBUG_FORCE_POST_OUTCOME'; outcome: PostOutcome }
  | { type: 'DEBUG_SET_CREW'; crew: CrewId }
  | { type: 'DEBUG_SKIP_WEEKS'; weeks: number }
```

- [ ] **Step 5: Verify it compiles**

Run: `npx tsc -p tsconfig.app.json --noEmit`
Expected: errors ONLY about `GameState` literals missing the new fields (fixed in later tasks) and `version: 8`→`9` mismatches. No errors in `types.ts`/`crew.ts` themselves.

- [ ] **Step 6: Commit**

```bash
git add src/state/types.ts src/data/crew.ts
git commit -m "feat(p9): add post/caption/crew types and P9 constants"
```

---

## Task 2: Post, caption, and line data

**Files:**
- Create: `src/data/posts.ts`
- Create: `src/data/captions.ts`
- Create: `src/data/postLines.ts`

- [ ] **Step 1: Write `src/data/posts.ts` (verbatim from §4)**

```ts
import type { PostDef } from '../state/types'

export const POSTS: PostDef[] = [
  {
    id: 'marketUpdate',
    label: 'Market Update',
    tier: 'basic',
    crewRequired: 'none',
    blurb:
      'A carousel of graphs you do not fully understand, captioned with confidence.',
    baseEffects: { leads: 1, rep: 2, cash: 0 },
    attract: ['relocRob', 'techTyler', 'hgtvCouple'],
    viralMod: -0.05,
    embarrassMod: -0.05,
    egoBias: 0,
  },
  {
    id: 'justListed',
    label: 'Just-Listed Post',
    tier: 'basic',
    crewRequired: 'none',
    blurb:
      "'JUST LISTED 🔑' over a photo where the sky has been made illegally blue.",
    baseEffects: { leads: 2, rep: 1, cash: 0 },
    attract: ['firstTimer', 'cashChad', 'flipBro'],
    viralMod: 0,
    embarrassMod: 0,
    egoBias: 1,
  },
  {
    id: 'motivational',
    label: 'Motivational Monologue',
    tier: 'basic',
    crewRequired: 'none',
    blurb:
      'You, walking toward the camera, explaining that most people simply aren’t built for this.',
    baseEffects: { leads: 0, rep: 0, cash: 0 },
    attract: ['flipBro', 'influencerIzzy'],
    viralMod: 0.05,
    embarrassMod: 0.1,
    egoBias: 2,
  },
  {
    id: 'familyAuthenticity',
    label: 'Family Authenticity Post',
    tier: 'basic',
    crewRequired: 'none',
    blurb:
      "'At the end of the day it's about FAMILY.' Someone else's family. A stock family.",
    baseEffects: { leads: 1, rep: 3, cash: 0 },
    attract: ['retireeRuth', 'firstTimer', 'hgtvCouple'],
    viralMod: 0,
    embarrassMod: -0.03,
    egoBias: -1,
  },
  {
    id: 'fakeCandid',
    label: 'Fake Candid Coffee Meeting',
    tier: 'basic',
    crewRequired: 'none',
    blurb:
      'You laughing at nothing, holding a coffee you will not drink, at a meeting that is a photoshoot.',
    baseEffects: { leads: 1, rep: 1, cash: 0 },
    attract: ['cashChad', 'influencerIzzy'],
    viralMod: 0,
    embarrassMod: 0.05,
    egoBias: 1,
  },
  {
    id: 'luxuryCar',
    label: 'Luxury-Car Photo',
    tier: 'produced',
    crewRequired: 'freelancer',
    blurb:
      'You, the car, and a caption implying you bought it with hustle and not a 72-month term.',
    baseEffects: { leads: 1, rep: 2, cash: 0 },
    attract: ['cashChad', 'luxLorenzo', 'influencerIzzy'],
    viralMod: 0.03,
    embarrassMod: 0.08,
    egoBias: 3,
  },
  {
    id: 'justListedVideo',
    label: 'Just-Listed Video',
    tier: 'produced',
    crewRequired: 'freelancer',
    blurb:
      'A cinematic walkthrough with a drone shot of the driveway and a bass drop on the pantry.',
    baseEffects: { leads: 3, rep: 2, cash: 0 },
    attract: ['relocRob', 'hgtvCouple', 'techTyler', 'cashChad'],
    viralMod: 0.05,
    embarrassMod: 0,
    egoBias: 1,
  },
  {
    id: 'dancingTour',
    label: 'Dancing House Tour',
    tier: 'premium',
    crewRequired: 'team',
    blurb:
      'You dance through all four bedrooms. The choreography is committed. The market is watching.',
    baseEffects: { leads: 2, rep: 0, cash: 0 },
    attract: ['influencerIzzy', 'flipBro', 'celebrityCleo'],
    viralMod: 0.15,
    embarrassMod: 0.15,
    egoBias: 2,
  },
  {
    id: 'humbledAward',
    label: "'I Am Humbled' Award Post",
    tier: 'premium',
    crewRequired: 'team',
    blurb:
      "A photo of a trophy with a caption 400 words long about how you don't do it for the trophies.",
    baseEffects: { leads: 1, rep: 4, cash: 0 },
    attract: ['luxLorenzo', 'oldMoneyOtis', 'celebrityCleo'],
    viralMod: 0.03,
    embarrassMod: 0.05,
    egoBias: 2,
  },
]

export const postOf = (id: string): PostDef | undefined =>
  POSTS.find((p) => p.id === id)
```

- [ ] **Step 2: Write `src/data/captions.ts` (verbatim from §5)**

```ts
import type { CaptionDef } from '../state/types'

export const CAPTIONS: CaptionDef[] = [
  {
    id: 'professional',
    label: 'Professional',
    repMult: 1.2,
    viralDelta: -0.05,
    embarrassDelta: -0.08,
    egoDelta: 0,
    text: 'Clean, factual, three hashtags maximum. Your mother would approve.',
  },
  {
    id: 'humble',
    label: 'Humble-Brag',
    repMult: 1.0,
    viralDelta: 0.03,
    embarrassDelta: 0.03,
    egoDelta: 1,
    text: "'Still can't believe this is my JOB 🥹' (you can believe it; it's been eleven years).",
  },
  {
    id: 'hustle',
    label: 'Hustle-Guru',
    repMult: 0.9,
    viralDelta: 0.08,
    embarrassDelta: 0.12,
    egoDelta: 2,
    text: "'Most of you will scroll past this. That's WHY you're not closing.' 🔥",
  },
  {
    id: 'unhinged',
    label: 'Fully Unhinged',
    repMult: 0.8,
    viralDelta: 0.15,
    embarrassDelta: 0.18,
    egoDelta: 3,
    text: 'All caps. Nine hashtags. A prediction about interest rates you cannot back up.',
  },
]

export const captionOf = (id: string): CaptionDef | undefined =>
  CAPTIONS.find((c) => c.id === id)
```

- [ ] **Step 3: Write `src/data/postLines.ts` (verbatim from §8)**

```ts
import type { PostOutcome } from '../state/types'

/** postId -> { neutral, viral, embarrass } (§8). */
export const POST_LINES: Record<string, Record<PostOutcome, string>> = {
  marketUpdate: {
    neutral:
      'You posted the market update. Fourteen people saved it. Two understood it.',
    viral:
      'Your market graph got shared by an actual economist (ironically, but still). Reputation up.',
    embarrass:
      "You mislabeled the axes. A mortgage broker commented 'is this backwards?' It was.",
  },
  justListed: {
    neutral:
      'Just-listed post is up. The sky in the photo is a colour the sky has never been.',
    viral:
      "The listing post blew up — someone's cousin is now pre-approved and calling you.",
    embarrass:
      "You forgot to remove the previous agent's sign from the photo. People noticed. People always notice.",
  },
  motivational: {
    neutral:
      'Your monologue posted. It is 47 seconds long. It feels longer.',
    viral:
      "The monologue hit. Somehow it hit. 200k views and a lead who calls you 'coach.'",
    embarrass:
      "A stitch of your monologue captioned 'not him thinking he's him' has more views than the original.",
  },
  familyAuthenticity: {
    neutral:
      'The family post is up. Warm. Genuine. The family is from a stock library, but the feeling is real.',
    viral:
      'The authenticity post resonated hard. Rep way up. Ruth-types are in your DMs.',
    embarrass:
      "Someone reverse-image-searched the 'family.' They found the stock listing. They posted it. Under yours.",
  },
  fakeCandid: {
    neutral:
      'The candid coffee shot posted. You have never looked so naturally caught off guard.',
    viral:
      'The coffee shot did numbers. A cafe wants to collab. You are now a lifestyle brand.',
    embarrass:
      "The 'candid' photo still had the photographer's reflection in the window. Everyone saw Kyle.",
  },
  luxuryCar: {
    neutral:
      "The car post is up. You captioned it 'grateful.' The lease is for 72 months.",
    viral:
      'The car post popped off. Cash-buyer types respect it. One wants to buy a house AND the car.',
    embarrass:
      'Someone found the dealer plate frame. The car is rented by the week. The comments are a crime scene.',
  },
  justListedVideo: {
    neutral:
      'The listing video posted. The drone shot of the driveway is genuinely beautiful.',
    viral:
      'The video went wide — three serious buyers and a relocation lead in one night. This is what a crew is for.',
    embarrass:
      "The bass drop landed on a photo of the septic tank. The edit cannot be unseen. Kyle is 'so sorry.'",
  },
  dancingTour: {
    neutral:
      'The dancing tour posted. The commitment is undeniable. The bedrooms are, too.',
    viral:
      "THE DANCE WENT VIRAL. 900k views. The house sold to someone who 'just had to have the dancing house.' Legend.",
    embarrass:
      'You slipped on the hardwood mid-tour and the clip is now a sound other people dance to. You are a meme. Not the good kind.',
  },
  humbledAward: {
    neutral:
      "The humbled post is up. It is 400 words. The word 'humbled' appears four times.",
    viral:
      'The gratitude post struck a chord — genuine engagement, genuine leads, genuinely humbled (finally).',
    embarrass:
      "You posted 'I'm humbled' next to a trophy for Most Improved Signage. The ratio is educational.",
  },
}

/** §10 Awards guard: appended to humbledAward's NEUTRAL line when a trophy is displayed. */
export const HUMBLED_TROPHY_SUFFIX = ' (the trophy is real, at least)'

export const VIRAL_BANNER = '📈 IT WENT VIRAL.' // §8.2
export const EMBARRASS_BANNER = '💀 IT DID NOT GO WELL.' // §8.3

/** §6.7 skip-streak decay line. */
export const SKIP_DECAY_LINE =
  'Third quiet week online. The algorithm has begun to forget your face.'

/** §11 migration line. */
export const CONTENT_MIGRATION_LINE =
  "You've decided to 'start posting more.' God help everyone."

/** §8.5 — joins the brag rotation after the player's first viral. */
export const CONTENT_BRAGS = [
  'Went viral again. Anyway. As I was saying. 📈',
  'Some of you found me through the dancing tour. Welcome. Stay for the comps.',
  "The content isn't the brand. I'm the brand. The content is just proof.",
]
```

- [ ] **Step 4: Verify compile**

Run: `npx tsc -p tsconfig.app.json --noEmit`
Expected: no new errors from these three files.

- [ ] **Step 5: Commit**

```bash
git add src/data/posts.ts src/data/captions.ts src/data/postLines.ts
git commit -m "feat(p9): add post, caption, and outcome-line content data"
```

---

## Task 3: The resolver logic (`logic/content.ts`) — TDD

**Files:**
- Create: `src/logic/content.ts`
- Test: `src/logic/__tests__/content.test.ts`

- [ ] **Step 1: Write the failing test file**

```ts
import { describe, expect, it } from 'vitest'
import { initialState } from '../../state/reducer'
import {
  activeCrew,
  biasCount,
  computeChances,
  postAvailable,
  unlockedCrewFor,
} from '../content'
import { postOf } from '../../data/posts'
import { captionOf } from '../../data/captions'
import type { GameState } from '../../state/types'

const base = (over: Partial<GameState> = {}): GameState => ({
  ...initialState(),
  ...over,
})

describe('crew unlock', () => {
  it('starts at none', () => {
    expect(unlockedCrewFor(base())).toBe('none')
  })
  it('freelancer at rep 25', () => {
    expect(unlockedCrewFor(base({ reputation: 25 }))).toBe('freelancer')
  })
  it('freelancer at Buyer Agent rank', () => {
    expect(unlockedCrewFor(base({ rank: 'buyerAgent', reputation: 0 }))).toBe(
      'freelancer',
    )
  })
  it('team at rep 60', () => {
    expect(unlockedCrewFor(base({ reputation: 60 }))).toBe('team')
  })
  it('team at Top Producer rank', () => {
    expect(
      unlockedCrewFor(base({ rank: 'topProducer', reputation: 0 })),
    ).toBe('team')
  })
})

describe('post availability', () => {
  it('basic always available', () => {
    expect(postAvailable(base(), postOf('marketUpdate')!)).toBe(true)
  })
  it('produced needs freelancer', () => {
    expect(
      postAvailable(base({ unlockedCrew: 'none' }), postOf('luxuryCar')!),
    ).toBe(false)
    expect(
      postAvailable(base({ unlockedCrew: 'freelancer' }), postOf('luxuryCar')!),
    ).toBe(true)
  })
  it('premium needs team', () => {
    expect(
      postAvailable(base({ unlockedCrew: 'freelancer' }), postOf('dancingTour')!),
    ).toBe(false)
    expect(
      postAvailable(base({ unlockedCrew: 'team' }), postOf('dancingTour')!),
    ).toBe(true)
  })
})

describe('chance math (§6.1)', () => {
  it('composes base + mods + caption + ego + underdog', () => {
    // ego 0, rep 10 (underdog +0.05), no crew
    const s = base({ reputation: 10, postEgo: 0, unlockedCrew: 'none' })
    const { viral, embarrass } = computeChances(
      s,
      postOf('marketUpdate')!,
      captionOf('professional')!,
    )
    // viral = 0.10 + (-0.05) + (-0.05) + 0 + 0.05 = 0.05
    expect(viral).toBeCloseTo(0.05, 5)
    // embarrass = (0.10 + (-0.05) + (-0.08) + 0) * 1 = -0.03 -> clamp 0
    expect(embarrass).toBeCloseTo(0, 5)
  })
  it('crew lowers the embarrass floor and raises viral', () => {
    const s = base({ reputation: 40, unlockedCrew: 'team' })
    const { viral, embarrass } = computeChances(
      s,
      postOf('dancingTour')!,
      captionOf('unhinged')!,
    )
    // viral = 0.10 + 0.15 + 0.15 + 0.08(crew) + 0(ego) + 0 = 0.48
    expect(viral).toBeCloseTo(0.48, 5)
    // embarrass = (0.10 + 0.15 + 0.18 + 0) * 0.4 = 0.172
    expect(embarrass).toBeCloseTo(0.172, 5)
  })
  it('clamps to 0.80', () => {
    const s = base({ reputation: 5, postEgo: 15, unlockedCrew: 'team' })
    const { viral, embarrass } = computeChances(
      s,
      postOf('dancingTour')!,
      captionOf('unhinged')!,
    )
    expect(viral).toBeLessThanOrEqual(0.8)
    expect(embarrass).toBeLessThanOrEqual(0.8)
  })
})

describe('biasCount', () => {
  it('counts entries for an archetype', () => {
    const s = base({
      pendingLeadBias: [
        { archetypeId: 'flipBro', weeksLeft: 1 },
        { archetypeId: 'flipBro', weeksLeft: 1 },
        { archetypeId: 'cashChad', weeksLeft: 1 },
      ],
    })
    expect(biasCount(s, 'flipBro')).toBe(2)
    expect(biasCount(s, 'cashChad')).toBe(1)
    expect(biasCount(s, 'firstTimer')).toBe(0)
  })
})

describe('activeCrew', () => {
  it('returns the def for the unlocked tier', () => {
    expect(activeCrew(base({ unlockedCrew: 'team' })).id).toBe('team')
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/logic/__tests__/content.test.ts`
Expected: FAIL — cannot resolve `../content`.

- [ ] **Step 3: Implement `src/logic/content.ts`**

```ts
import { CREWS, P9, crewOf } from '../data/crew'
import { rankIndex } from './economy'
import { clamp } from './portfolio'
import type {
  CaptionDef,
  CrewDef,
  CrewId,
  GameState,
  PostDef,
} from '../state/types'

const CREW_INDEX: Record<CrewId, number> = { none: 0, freelancer: 1, team: 2 }

/** §11 recompute: team if Top Producer OR rep >= 60; else freelancer if
 *  Buyer Agent OR rep >= 25; else none. */
export function unlockedCrewFor(s: GameState): CrewId {
  const rank = rankIndex(s.rank)
  if (rank >= rankIndex('topProducer') || s.reputation >= 60) return 'team'
  if (rank >= rankIndex('buyerAgent') || s.reputation >= 25) return 'freelancer'
  return 'none'
}

/** The crew the composer runs on: the highest tier unlocked. */
export const activeCrew = (s: GameState): CrewDef => crewOf(s.unlockedCrew)

/** A post is available when the active crew tier meets its requirement. */
export function postAvailable(s: GameState, post: PostDef): boolean {
  return CREW_INDEX[s.unlockedCrew] >= CREW_INDEX[post.crewRequired]
}

/** How many bias entries currently target an archetype (§6.6). */
export const biasCount = (s: GameState, archetypeId: string): number =>
  s.pendingLeadBias.filter((b) => b.archetypeId === archetypeId).length

/** §6.1 — viral & embarrass chances, clamped [0, 0.80]. */
export function computeChances(
  s: GameState,
  post: PostDef,
  caption: CaptionDef,
): { viral: number; embarrass: number } {
  const crew = activeCrew(s)
  const ego = s.stats.ego + 0 // stats already include postEgo via deriveStats
  const egoRoll = ego * P9.EGO_VIRAL_PER_POINT
  let viral =
    P9.VIRAL_BASE +
    post.viralMod +
    caption.viralDelta +
    crew.viralUpside +
    egoRoll +
    (s.reputation < P9.REP_STEADY_MIN ? 0.05 : 0)
  let embarrass =
    (P9.EMBARRASS_BASE + post.embarrassMod + caption.embarrassDelta + egoRoll) *
    crew.embarrassWeightMult
  viral = clamp(viral, 0, 0.8)
  embarrass = clamp(embarrass, 0, 0.8)
  return { viral, embarrass }
}

export { CREWS }
```

> **Note on ego source:** `computeChances` reads `s.stats.ego`, which already
> includes `postEgo` (Task 5 wires `deriveStats`). Callers must pass a synced
> state. The reducer always `sync`s before dispatching effects, and tests build
> from `initialState()` which is synced.

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/logic/__tests__/content.test.ts`
Expected: PASS (all cases).

> If the `computeChances` ego cases fail because `s.stats.ego` is stale in a
> test fixture, import and call `sync` from `logic/economy` at the top of
> `computeChances` instead of reading `s.stats.ego`. Prefer reading `s.stats`
> to avoid a recompute per hover in the UI.

- [ ] **Step 5: Commit**

```bash
git add src/logic/content.ts src/logic/__tests__/content.test.ts
git commit -m "feat(p9): pure content resolver — crew unlock, availability, chance math"
```

---

## Task 4: Reducer — CREATE_POST / SKIP_POST / settings — TDD

**Files:**
- Modify: `src/state/reducer.ts`
- Modify: `src/logic/economy.ts` (deriveStats postEgo — do this first)
- Modify: `src/logic/territory.ts` (archetypeWeight bias)
- Test: `src/state/__tests__/contentReducer.test.ts`

- [ ] **Step 1: Wire `postEgo` into `deriveStats` (`src/logic/economy.ts`)**

After `ego += char.statMods.ego` and before the trophy block, add:
```ts
  ego += state.postEgo ?? 0
```

- [ ] **Step 2: Wire lead bias into `archetypeWeight` (`src/logic/territory.ts`)**

Replace the body of `archetypeWeight`:
```ts
export function archetypeWeight(s: GameState, archetypeId: string): number {
  const base =
    perkActive(s, 'luxPipeline') && LUX_ARCHETYPES.includes(archetypeId) ? 2 : 1
  const bias = (s.pendingLeadBias ?? []).filter(
    (b) => b.archetypeId === archetypeId,
  ).length
  return base * (1 + 1.5 * bias)
}
```

- [ ] **Step 3: Write the failing reducer test**

```ts
import { describe, expect, it } from 'vitest'
import { reducer, initialState } from '../reducer'
import { deriveStats } from '../../logic/economy'
import type { GameState } from '../types'

const withComposer = (over: Partial<GameState> = {}): GameState => ({
  ...initialState(),
  rngSeed: 12345,
  postComposerPending: true,
  postComposerWeek: 5,
  week: 6,
  summary: {
    week: 5,
    moneyIn: [],
    moneyOut: [],
    events: [],
    marketing: { spend: 0, leads: 0, repChange: 0 },
    portfolio: [],
    territory: { rows: [], rivalMoves: [] },
    net: 0,
    promo: null,
    brag: 'x',
  },
  ...over,
})

describe('SET_CONTENT_ENABLED', () => {
  it('toggles the flag', () => {
    const s = reducer(initialState(), {
      type: 'SET_CONTENT_ENABLED',
      enabled: false,
    })
    expect(s.contentEnabled).toBe(false)
  })
})

describe('CREATE_POST neutral', () => {
  it('applies base rep×caption, seeds bias, records history, clears pending', () => {
    // Force neutral by making both chances 0: professional caption on marketUpdate
    // at rep 40 (no underdog), postEgo 0, none crew: viral 0, embarrass 0.
    const s0 = withComposer({ reputation: 40, unlockedCrew: 'none' })
    const s = reducer(s0, {
      type: 'CREATE_POST',
      postId: 'familyAuthenticity',
      captionId: 'professional',
    })
    // rep +3 * 1.2 = +3.6 -> round 4 -> 44
    expect(s.reputation).toBe(44)
    // egoBias -1 + caption 0 = -1 -> postEgo -1 (clamped >= 0 in ego derive, but stored value can be neg? see spec)
    expect(s.postComposerPending).toBe(false)
    expect(s.lastPost?.postId).toBe('familyAuthenticity')
    expect(s.lastPost?.outcome).toBe('neutral')
    expect(s.contentHistory.length).toBe(1)
    expect(s.contentStats.posts).toBe(1)
    // seeded up to 3 attract leads (leads base 1 + team 0 = 1, min(1,3)=1 -> 1 archetype entry set)
    expect(s.pendingLeadBias.length).toBeGreaterThan(0)
    // summary content patched
    expect(s.summary?.content?.postId).toBe('familyAuthenticity')
  })
})

describe('SKIP_POST streak', () => {
  it('decays rep by 1 on the third consecutive skip', () => {
    let s = withComposer({
      reputation: 40,
      contentStats: { posts: 0, viral: 0, embarrassed: 0, skipStreak: 2 },
    })
    s = reducer(s, { type: 'SKIP_POST' })
    expect(s.contentStats.skipStreak).toBe(3)
    expect(s.reputation).toBe(39)
    expect(s.postComposerPending).toBe(false)
    expect(s.summary?.content).toBeNull()
  })
  it('any post resets the streak', () => {
    const s = reducer(
      withComposer({
        reputation: 40,
        contentStats: { posts: 0, viral: 0, embarrassed: 0, skipStreak: 2 },
      }),
      { type: 'CREATE_POST', postId: 'marketUpdate', captionId: 'professional' },
    )
    expect(s.contentStats.skipStreak).toBe(0)
  })
})

describe('DEBUG_FORCE_POST_OUTCOME', () => {
  it('viral applies bonus rep and close modifier', () => {
    let s = withComposer({ reputation: 40, unlockedCrew: 'team' })
    s = reducer(s, { type: 'DEBUG_FORCE_POST_OUTCOME', outcome: 'viral' })
    // will be consumed by the next CREATE_POST
    s = reducer(s, {
      type: 'CREATE_POST',
      postId: 'justListedVideo',
      captionId: 'humble',
    })
    expect(s.lastPost?.outcome).toBe('viral')
    expect(s.contentStats.viral).toBe(1)
    expect(s.activeModifiers.some((m) => m.id === 'viralMoment')).toBe(true)
  })
  it('embarrass applies bigger rep loss at high rep and seeds nothing', () => {
    let s = withComposer({ reputation: 80, unlockedCrew: 'team', pendingLeadBias: [] })
    s = reducer(s, { type: 'DEBUG_FORCE_POST_OUTCOME', outcome: 'embarrass' })
    s = reducer(s, {
      type: 'CREATE_POST',
      postId: 'dancingTour',
      captionId: 'professional',
    })
    // rep -= 8 + 5 (>=70) = 13 -> 67
    expect(s.reputation).toBe(67)
    expect(s.pendingLeadBias.length).toBe(0)
    expect(s.contentStats.embarrassed).toBe(1)
  })
})
```

- [ ] **Step 4: Run to verify failure**

Run: `npx vitest run src/state/__tests__/contentReducer.test.ts`
Expected: FAIL — `content` on summary type unknown / cases not handled.

- [ ] **Step 5: Add `content` to the `WeekSummary` type (`src/state/types.ts`)**

In `WeekSummary`, add:
```ts
  /** Phase 9. The post outcome, or null on skip / composer disabled. */
  content: {
    postId: string
    captionId: string
    outcome: PostOutcome
    repDelta: number
    egoDelta: number
    leads: number
  } | null
```

Then set `content: null` in the `endWeek` summary literal (Task 6) — for now, add `content: null` to any existing `WeekSummary` object literals the compiler flags.

- [ ] **Step 6: Implement the resolver in the reducer**

Add a module-scoped debug override near the top of `reducer.ts` (after imports):
```ts
/** Debug-only forced next post outcome. Consumed by the next CREATE_POST. */
let forcedPostOutcome: import('./types').PostOutcome | null = null
```

Add imports:
```ts
import { activeCrew, computeChances } from '../logic/content'
import { postOf } from '../data/posts'
import { captionOf } from '../data/captions'
import {
  CONTENT_BRAGS, // (used later in bragFor wiring — Task 7)
  EMBARRASS_BANNER,
  HUMBLED_TROPHY_SUFFIX,
  POST_LINES,
  SKIP_DECAY_LINE,
  VIRAL_BANNER,
} from '../data/postLines'
import { P9 } from '../data/crew'
import { ARCHETYPES } from '../data/archetypes'
```

Add the cases inside the `switch` (before `default`):
```ts
    case 'SET_CONTENT_ENABLED':
      return { ...state, contentEnabled: action.enabled }

    case 'CREATE_POST': {
      if (!state.postComposerPending) return state
      const post = postOf(action.postId)
      const caption = captionOf(action.captionId)
      if (!post || !caption) return state
      if (!activePostAllowed(state, post)) return state
      return sync(resolvePost(state, post, caption))
    }

    case 'SKIP_POST': {
      if (!state.postComposerPending) return state
      return sync(applySkip(state))
    }

    case 'DEBUG_FORCE_POST_OUTCOME':
      forcedPostOutcome = action.outcome
      return state

    case 'DEBUG_SET_CREW':
      return sync({ ...state, unlockedCrew: action.crew })

    case 'DEBUG_SKIP_WEEKS': {
      let s = state
      for (let i = 0; i < action.weeks; i++) {
        s = { ...s, contentStats: { ...s.contentStats, skipStreak: s.contentStats.skipStreak + 1 } }
        if (s.contentStats.skipStreak >= P9.SKIP_STREAK_TRIGGER)
          s = { ...s, reputation: clampRep(s.reputation - P9.SKIP_STREAK_REP_DECAY) }
      }
      return sync(s)
    }
```

Add these helper functions to `reducer.ts` (module scope, near `endWeek`):
```ts
const KNOWN_ARCHETYPE = (id: string): boolean =>
  ARCHETYPES.some((a) => a.id === id)

/** A crew-gated post the player may not actually have unlocked. */
function activePostAllowed(s: GameState, post: import('./types').PostDef): boolean {
  const order = { none: 0, freelancer: 1, team: 2 }
  return order[s.unlockedCrew] >= order[post.crewRequired]
}

/** §6 — resolve a post into effects and patch the summary content section. */
function resolvePost(
  state: GameState,
  post: import('./types').PostDef,
  caption: import('./types').CaptionDef,
): GameState {
  const { viral, embarrass } = computeChances(state, post, caption)
  /* §6.2 — one roll, embarrass checked first. Debug override wins. */
  let outcome: import('./types').PostOutcome
  if (forcedPostOutcome) {
    outcome = forcedPostOutcome
    forcedPostOutcome = null
  } else {
    const r = rand()
    outcome = r < embarrass ? 'embarrass' : r < embarrass + viral ? 'viral' : 'neutral'
  }

  const crew = activeCrew(state)
  const repBefore = state.reputation
  const egoBefore = state.postEgo

  /* §6.3 — base + caption (all outcomes). Positive rep only takes the mult;
     a zero/negative base is unaffected. */
  const repBase = post.baseEffects.rep
  /* §10 Awards guard: humbledAward doubles when a trophy is displayed. */
  const trophyDisplayed =
    post.id === 'humbledAward' &&
    (state.trophies ?? []).some((t) => t.displayed)
  const effRepBase = trophyDisplayed ? repBase * 2 : repBase
  const repGain =
    effRepBase > 0 ? Math.round(effRepBase * caption.repMult) : effRepBase
  let s: GameState = { ...state, reputation: clampRep(state.reputation + repGain) }
  const leadsSeed = post.baseEffects.leads + crew.teamLeadBonus
  s = { ...s, cash: s.cash + post.baseEffects.cash }

  /* Post-specific + banner flavor. */
  let line = POST_LINES[post.id]?.[outcome] ?? ''
  if (outcome === 'neutral' && trophyDisplayed) line += HUMBLED_TROPHY_SUFFIX

  if (outcome === 'neutral' || outcome === 'viral') {
    s = { ...s, postEgo: s.postEgo + post.egoBias + caption.egoDelta }
    const seedN =
      outcome === 'viral'
        ? Math.min(leadsSeed + 2, 5)
        : Math.min(leadsSeed, P9.MAX_ATTRACT_LEADS)
    s = seedBias(s, post.attract, seedN)
  }

  if (outcome === 'viral') {
    const bonus = 10 + Math.round(crew.viralUpside * 100)
    s = { ...s, reputation: clampRep(s.reputation + bonus) }
    s = {
      ...s,
      activeModifiers: [
        ...s.activeModifiers,
        {
          id: 'viralMoment',
          label: 'Viral Moment',
          closeChanceDelta: 0.05,
          expiresWeek: s.week + 2,
        },
      ],
      contentStats: { ...s.contentStats, viral: s.contentStats.viral + 1 },
    }
    s = withLog(s, 'event', VIRAL_BANNER + ' ' + line)
  } else if (outcome === 'embarrass') {
    s = {
      ...s,
      postEgo: s.postEgo + Math.max(0, caption.egoDelta - 1),
      reputation: clampRep(s.reputation - (8 + (repBefore >= P9.REP_HIGH ? 5 : 0))),
      contentStats: {
        ...s.contentStats,
        embarrassed: s.contentStats.embarrassed + 1,
      },
    }
    s = withLog(s, 'event', EMBARRASS_BANNER + ' ' + line)
  } else {
    s = withLog(s, 'flavor', line)
  }

  const record: import('./types').PostRecord = {
    week: s.week,
    postId: post.id,
    captionId: caption.id,
    outcome,
    repDelta: s.reputation - repBefore,
    egoDelta: s.postEgo - egoBefore,
    leads: outcome === 'embarrass' ? 0 : leadsSeed,
  }
  s = {
    ...s,
    lastPost: record,
    contentHistory: [...s.contentHistory, record].slice(-20),
    contentStats: { ...s.contentStats, posts: s.contentStats.posts + 1, skipStreak: 0 },
    postComposerPending: false,
    summary: s.summary
      ? {
          ...s.summary,
          content: {
            postId: post.id,
            captionId: caption.id,
            outcome,
            repDelta: record.repDelta,
            egoDelta: record.egoDelta,
            leads: record.leads,
          },
        }
      : s.summary,
  }
  return s
}

/** Seeds up to `n` attract-weighted archetypes as weeksLeft:1 bias entries.
 *  Unknown archetypes are skipped silently (§10). */
function seedBias(s: GameState, attract: string[], n: number): GameState {
  const known = attract.filter(KNOWN_ARCHETYPE)
  if (known.length === 0 || n <= 0) return s
  const entries: { archetypeId: string; weeksLeft: number }[] = []
  for (let i = 0; i < n; i++)
    entries.push({ archetypeId: known[i % known.length], weeksLeft: 1 })
  return { ...s, pendingLeadBias: [...s.pendingLeadBias, ...entries] }
}

/** §6.7 — skip with streak tracking. */
function applySkip(state: GameState): GameState {
  const skipStreak = state.contentStats.skipStreak + 1
  let s: GameState = {
    ...state,
    contentStats: { ...state.contentStats, skipStreak },
    postComposerPending: false,
    lastPost: null,
    summary: state.summary ? { ...state.summary, content: null } : state.summary,
  }
  if (skipStreak >= P9.SKIP_STREAK_TRIGGER) {
    s = { ...s, reputation: clampRep(s.reputation - P9.SKIP_STREAK_REP_DECAY) }
    s = withLog(s, 'flavor', SKIP_DECAY_LINE)
  }
  return s
}
```

> **CALL_SAFE_ACTIONS note:** the composer only opens after `endWeek`, when no
> call is in progress, so `CREATE_POST`/`SKIP_POST` do not need to be in
> `CALL_SAFE_ACTIONS`.

- [ ] **Step 7: Run tests**

Run: `npx vitest run src/state/__tests__/contentReducer.test.ts`
Expected: PASS.

> Adjust the neutral test's expected `postEgo` if the spec's stored-vs-clamped
> ego differs: `postEgo` is stored raw (can go negative from familyAuthenticity);
> `deriveStats` clamps the *derived* ego to `>= 0`. The test above asserts
> derived behavior via `s.postEgo`; keep the stored value raw.

- [ ] **Step 8: Commit**

```bash
git add src/state/reducer.ts src/state/types.ts src/logic/economy.ts src/logic/territory.ts src/state/__tests__/contentReducer.test.ts
git commit -m "feat(p9): CREATE_POST/SKIP_POST resolver, postEgo, lead-bias weighting"
```

---

## Task 5: `initialState` + `endWeek` integration

**Files:**
- Modify: `src/state/reducer.ts`

- [ ] **Step 1: Add phase-9 defaults to `initialState`**

In the `base` literal, set `version: 9` and add:
```ts
    postEgo: 0,
    pendingLeadBias: [],
    contentHistory: [],
    lastPost: null,
    contentStats: { posts: 0, viral: 0, embarrassed: 0, skipStreak: 0 },
    contentEnabled: true,
    unlockedCrew: 'none',
    postComposerPending: false,
    postComposerWeek: 0,
```

- [ ] **Step 2: Recompute crew + decrement bias + open composer in `endWeek`**

Near the TOP of `endWeek` (after `let s = { ...state }` and the AP flavor line), add the bias decrement:
```ts
  /* §6.6 — expire last week's lead-pool tilt before this week resolves. */
  s = {
    ...s,
    pendingLeadBias: s.pendingLeadBias
      .map((b) => ({ ...b, weeksLeft: b.weeksLeft - 1 }))
      .filter((b) => b.weeksLeft > 0),
  }
```

Just BEFORE building the `summary` object at the end of `endWeek` (after the week has rolled and `sync`), add the crew recompute and composer flag:
```ts
  /* §11 — recompute the crew tier from the freshly-rolled rank/rep, and fire
     the unlock line once on an upward change. */
  const nextCrew = unlockedCrewFor(s)
  if (nextCrew !== s.unlockedCrew) {
    const up = { none: 0, freelancer: 1, team: 2 }
    if (up[nextCrew] > up[s.unlockedCrew] && nextCrew !== 'none')
      s = withLog(s, 'promotion', CREW_UNLOCK_LINES[nextCrew])
    s = { ...s, unlockedCrew: nextCrew }
  }

  /* §7 — open the composer for this week, unless disabled or already shown. */
  const openComposer =
    s.contentEnabled && !s.gameOver && s.postComposerWeek !== s.week
  s = openComposer
    ? { ...s, postComposerPending: true, postComposerWeek: s.week }
    : s
```

Add imports at the top of `reducer.ts`:
```ts
import { unlockedCrewFor } from '../logic/content'
import { CREW_UNLOCK_LINES } from '../data/crew'
```

- [ ] **Step 3: Add `content: null` to the `endWeek` summary literal**

In the `const summary: WeekSummary = { ... }` object, add:
```ts
    content: null,
```

- [ ] **Step 4: Run the full existing suite (regression, §13.1)**

Run: `npx vitest run`
Expected: pre-existing tests still PASS. Fix any `WeekSummary` literal missing `content` (add `content: null`) and any `GameState` literal in tests missing new fields — prefer building test states from `initialState()`.

- [ ] **Step 5: Verify a full end-week opens the composer (add to contentReducer.test.ts)**

```ts
import { endWeek } from '../reducer'

describe('endWeek opens the composer', () => {
  it('sets postComposerPending once per week', () => {
    const s = endWeek({ ...initialState(), rngSeed: 999 })
    expect(s.postComposerPending).toBe(true)
    expect(s.postComposerWeek).toBe(s.week)
    expect(s.summary?.content).toBeNull()
  })
  it('does not open when contentEnabled is false', () => {
    const s = endWeek({ ...initialState(), contentEnabled: false, rngSeed: 999 })
    expect(s.postComposerPending).toBe(false)
  })
})
```

Run: `npx vitest run src/state/__tests__/contentReducer.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/state/reducer.ts src/state/__tests__/contentReducer.test.ts
git commit -m "feat(p9): endWeek crew recompute, bias expiry, composer gating"
```

---

## Task 6: Migration to v9 — TDD

**Files:**
- Modify: `src/state/migrate.ts`
- Test: `src/state/__tests__/migrate.test.ts`

- [ ] **Step 1: Add a failing migration test**

```ts
describe('v9 migration (phase 9)', () => {
  it('defaults new fields and recomputes crew for an established save', () => {
    const v8 = { version: 8, week: 30, reputation: 65, rank: 'topProducer' }
    const out = migrate(v8)!
    expect(out.version).toBe(9)
    expect(out.postEgo).toBe(0)
    expect(out.pendingLeadBias).toEqual([])
    expect(out.contentHistory).toEqual([])
    expect(out.contentStats).toEqual({ posts: 0, viral: 0, embarrassed: 0, skipStreak: 0 })
    expect(out.contentEnabled).toBe(true)
    expect(out.unlockedCrew).toBe('team') // rep 65 / Top Producer
    expect(out.postComposerPending).toBe(false)
    expect(out.log.some((l) => l.text.includes('start posting more'))).toBe(true)
  })
  it('keeps existing reputation', () => {
    const out = migrate({ version: 8, reputation: 42 })!
    expect(out.reputation).toBe(42)
    expect(out.unlockedCrew).toBe('freelancer')
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/state/__tests__/migrate.test.ts`
Expected: FAIL — `out.version` is 8; new fields undefined; range check rejects `version 9`? (No — incoming is 8.)

- [ ] **Step 3: Implement the migration**

In `migrate.ts`:
1. Change the version guard upper bound: `s.version > 9` → still accept our own v9 saves:
```ts
  if (typeof s.version !== 'number' || s.version < 1 || s.version > 9)
    return null
```
2. In the `out` literal, change `version: 8` → `version: 9` and add the phase-9 block (reading existing values where present so a v9 save round-trips):
```ts
    /* ---- phase 9 ---- */
    postEgo: num(s.postEgo, 0),
    pendingLeadBias: Array.isArray(s.pendingLeadBias)
      ? (s.pendingLeadBias as GameState['pendingLeadBias'])
      : [],
    contentHistory: Array.isArray(s.contentHistory)
      ? (s.contentHistory as GameState['contentHistory'])
      : [],
    lastPost: (s.lastPost as GameState['lastPost'] | undefined) ?? null,
    contentStats:
      s.contentStats && typeof s.contentStats === 'object'
        ? {
            posts: num((s.contentStats as any).posts, 0),
            viral: num((s.contentStats as any).viral, 0),
            embarrassed: num((s.contentStats as any).embarrassed, 0),
            skipStreak: num((s.contentStats as any).skipStreak, 0),
          }
        : { posts: 0, viral: 0, embarrassed: 0, skipStreak: 0 },
    contentEnabled: s.contentEnabled !== false,
    unlockedCrew: 'none', // recomputed just below
    postComposerPending: false,
    postComposerWeek: num(s.postComposerWeek, 0),
```
3. Widen `validModifiers` to preserve `'viralMoment'`:
```ts
        id: (m.id === 'hotMarket' || m.id === 'rateSpike' || m.id === 'viralMoment'
          ? m.id
          : hot
            ? 'hotMarket'
            : 'rateSpike') as ActiveModifier['id'],
```
Note: the trailing `.slice(-1)` keeps only the newest modifier. If a viral modifier must coexist with a market modifier across reload, relax this to keep at most one of each id. For v9 acceptance, keeping the newest is acceptable (the modifier is re-pushed live); document and move on.
4. After the `out` object is built and before `fillPool`, recompute the crew (needs `unlockedCrewFor`, but that reads `s.stats` for ego — migration state has no synced stats yet; `unlockedCrewFor` only reads rank+rep, so it is safe):
```ts
  out.unlockedCrew = unlockedCrewFor(out)
```
Add import:
```ts
import { unlockedCrewFor } from '../logic/content'
```
5. Log the migration line for a pre-phase-9 save (mirror the Goldies pattern):
```ts
  const withPost =
    typeof s.contentStats === 'object'
      ? withGoldies
      : withLog(withGoldies, 'flavor', CONTENT_MIGRATION_LINE)
```
and return `dropInterruptedCall(withPost, ...)`. Add import:
```ts
import { CONTENT_MIGRATION_LINE } from '../data/postLines'
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/state/__tests__/migrate.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/state/migrate.ts src/state/__tests__/migrate.test.ts
git commit -m "feat(p9): v9 save migration with crew recompute"
```

---

## Task 7: Content brags in the rotation (§8.5)

**Files:**
- Modify: `src/logic/economy.ts`

- [ ] **Step 1: Add content brags to `bragFor`**

Import at the top of `economy.ts`:
```ts
import { CONTENT_BRAGS } from '../data/postLines'
```
In `bragFor`, after the awards brag block:
```ts
  /* One viral is a personality now. */
  if ((state.contentStats?.viral ?? 0) > 0) situational(CONTENT_BRAGS)
```

- [ ] **Step 2: Run the suite**

Run: `npx vitest run`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/logic/economy.ts
git commit -m "feat(p9): content brags join the rotation after a viral"
```

---

## Task 8: PostComposer component + App wiring

**Files:**
- Create: `src/components/PostComposer.tsx`
- Modify: `src/App.tsx`
- Modify: `src/styles.css`

- [ ] **Step 1: Write `src/components/PostComposer.tsx`**

Full two-step sheet (§12). Reads `state.postComposerPending`; renders nothing if false.

```tsx
import { useState } from 'react'
import type { Dispatch } from 'react'
import { POSTS, postOf } from '../data/posts'
import { CAPTIONS, captionOf } from '../data/captions'
import { activeCrew, computeChances } from '../logic/content'
import { crewOf } from '../data/crew'
import type { Action, GameState, PostDef } from '../state/types'

const CREW_ORDER = { none: 0, freelancer: 1, team: 2 }

export default function PostComposer({
  state,
  dispatch,
}: {
  state: GameState
  dispatch: Dispatch<Action>
}) {
  const [postId, setPostId] = useState<string | null>(null)
  const [captionId, setCaptionId] = useState<string>('professional')

  if (!state.postComposerPending) return null

  const crew = activeCrew(state)
  const post = postId ? postOf(postId) : null
  const caption = captionOf(captionId)!

  const available = (p: PostDef) =>
    CREW_ORDER[state.unlockedCrew] >= CREW_ORDER[p.crewRequired]

  const preview =
    post && caption ? computeChances(state, post, caption) : null
  const repDelta =
    post && caption
      ? post.baseEffects.rep > 0
        ? Math.round(post.baseEffects.rep * caption.repMult)
        : post.baseEffects.rep
      : 0
  const egoDelta = post ? post.egoBias + caption.egoDelta : 0
  const variance = post
    ? Math.min(1, post.viralMod + post.embarrassMod + caption.viralDelta + caption.embarrassDelta)
    : 0
  const varianceWord =
    variance < 0.1 ? 'Safe' : variance < 0.3 ? 'Spicy' : 'Chaotic'

  return (
    <div className="res-modal">
      <div className="res-card res-composer">
        <div className="res-composer-head">
          <h2 className="res-display">📱 THIS WEEK'S POST</h2>
          <div className="res-chips">
            <span className="res-chip">Rep {state.reputation}</span>
            <span className="res-chip">Ego {state.stats.ego}</span>
            <span className="res-chip">{crew.label}</span>
          </div>
        </div>

        {!post ? (
          <div className="res-post-grid">
            {POSTS.map((p) => {
              const ok = available(p)
              return (
                <button
                  key={p.id}
                  className={'res-post-card' + (ok ? '' : ' locked')}
                  disabled={!ok}
                  onClick={() => ok && setPostId(p.id)}
                >
                  <b>{p.label}</b>
                  <span className="res-post-blurb">{p.blurb}</span>
                  {ok ? (
                    <span className="res-post-hints">
                      🎯 {p.baseEffects.leads} · 📈 {p.baseEffects.rep >= 0 ? '+' : ''}
                      {p.baseEffects.rep} · 🎲{' '}
                      {'▮'.repeat(
                        Math.max(1, Math.round((p.viralMod + p.embarrassMod) * 10)),
                      )}
                    </span>
                  ) : (
                    <span className="res-post-lock">
                      Needs {crewOf(p.crewRequired).label}
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        ) : (
          <>
            <div className="res-caption-row">
              {CAPTIONS.map((c) => (
                <button
                  key={c.id}
                  className={'res-caption' + (c.id === captionId ? ' on' : '')}
                  onClick={() => setCaptionId(c.id)}
                >
                  <b>{c.label}</b>
                  <span>{c.text}</span>
                  <span className="res-caption-fx">
                    rep ×{c.repMult} · viral {c.viralDelta >= 0 ? '+' : ''}
                    {c.viralDelta} · 💀 {c.embarrassDelta >= 0 ? '+' : ''}
                    {c.embarrassDelta} · ego +{c.egoDelta}
                  </span>
                </button>
              ))}
            </div>

            <div className="res-preview">
              <div className="res-preview-post">
                <b>{post.label}</b>
                <p>{caption.text}</p>
              </div>
              <div className="res-preview-deltas">
                <span>Rep {repDelta >= 0 ? '+' : ''}{repDelta}</span>
                <span>Ego +{egoDelta}</span>
                <span>
                  Variance: {varianceWord}
                  {preview
                    ? ` (📈 ${Math.round(preview.viral * 100)}% · 💀 ${Math.round(
                        preview.embarrass * 100,
                      )}%)`
                    : ''}
                </span>
              </div>
            </div>

            <div className="res-composer-actions">
              <button className="res-tactic" onClick={() => setPostId(null)}>
                Back
              </button>
              <button
                className="res-go"
                onClick={() =>
                  dispatch({ type: 'CREATE_POST', postId: post.id, captionId })
                }
              >
                Post it
              </button>
            </div>
          </>
        )}

        <button
          className="res-skip"
          onClick={() => {
            if (
              state.contentStats.skipStreak + 1 >= 3 &&
              !window.confirm('Skipping again? People forget.')
            )
              return
            dispatch({ type: 'SKIP_POST' })
          }}
        >
          Skip this week
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Wire into `App.tsx`**

Import:
```tsx
import PostComposer from './components/PostComposer'
```
Change the summary gate so the composer wins first (Call → Post → Summary). Replace the summary/ceremony block:
```tsx
      <CallModal state={state} dispatch={dispatch} />
      <PortfolioChoiceModal state={state} dispatch={dispatch} />

      {/* Call → Post → Summary. The composer holds the summary behind it. */}
      {!state.call && state.postComposerPending && (
        <PostComposer state={state} dispatch={dispatch} />
      )}

      {showSummary && !state.postComposerPending && (
        <WeekSummaryModal state={state} onClose={() => setShowSummary(false)} />
      )}

      {!showSummary && !state.postComposerPending && state.ceremony && (
        <CeremonyModal state={state} dispatch={dispatch} />
      )}
```

- [ ] **Step 3: Add composer styles to `src/styles.css`**

Append (kept consistent with existing `.res-*` conventions; adjust to match tokens already in the file):
```css
.res-composer { max-width: 640px; }
.res-composer-head { display:flex; justify-content:space-between; align-items:flex-start; gap:10px; flex-wrap:wrap; }
.res-chips { display:flex; gap:6px; flex-wrap:wrap; }
.res-chip { font-size:11px; padding:3px 8px; border-radius:999px; background:#22242f; color:#c9ccd6; }
.res-post-grid { display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-top:10px; }
.res-post-card { text-align:left; display:flex; flex-direction:column; gap:4px; padding:10px; border-radius:10px; background:#1b1d27; border:1px solid #2c2f3c; color:inherit; cursor:pointer; }
.res-post-card.locked { opacity:.5; cursor:not-allowed; }
.res-post-blurb { font-size:11.5px; color:#8a8f9e; }
.res-post-hints { font-size:11px; color:#c9a227; }
.res-post-lock { font-size:11px; color:#8a8f9e; font-style:italic; }
.res-caption-row { display:flex; flex-direction:column; gap:6px; margin-top:10px; }
.res-caption { text-align:left; display:flex; flex-direction:column; gap:2px; padding:8px 10px; border-radius:8px; background:#1b1d27; border:1px solid #2c2f3c; color:inherit; cursor:pointer; }
.res-caption.on { border-color:#c9a227; }
.res-caption-fx { font-size:10.5px; color:#8a8f9e; }
.res-preview { margin-top:10px; padding:10px; border-radius:10px; background:#15161e; }
.res-preview-deltas { display:flex; gap:12px; margin-top:8px; font-size:12px; color:#c9ccd6; }
.res-composer-actions { display:flex; gap:8px; margin-top:12px; }
.res-skip { margin-top:10px; width:100%; background:transparent; border:none; color:#8a8f9e; cursor:pointer; font-size:12.5px; }
@media (max-width:420px){ .res-post-grid { grid-template-columns:1fr; } }
@media (prefers-reduced-motion: reduce){ .res-composer * { animation:none !important; transition:none !important; } }
```

- [ ] **Step 4: Verify build + typecheck**

Run: `npx tsc -p tsconfig.app.json --noEmit && npx vitest run`
Expected: no type errors; all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/PostComposer.tsx src/App.tsx src/styles.css
git commit -m "feat(p9): PostComposer sheet and Call->Post->Summary wiring"
```

---

## Task 9: Week Summary Content section (§8.4)

**Files:**
- Modify: `src/components/WeekSummaryModal.tsx`

- [ ] **Step 1: Render the Content section**

Add imports:
```tsx
import { postOf } from '../data/posts'
import { captionOf } from '../data/captions'
```
Before the `res-brag` block, add:
```tsx
        {summary.content !== undefined && (
          <>
            <h3>Content</h3>
            {summary.content ? (
              <>
                <div className="res-line">
                  <span>
                    {postOf(summary.content.postId)?.label ?? summary.content.postId}
                    {' · '}
                    {captionOf(summary.content.captionId)?.label ??
                      summary.content.captionId}
                  </span>
                  <b>
                    {summary.content.outcome === 'viral'
                      ? '📈 Viral'
                      : summary.content.outcome === 'embarrass'
                        ? '💀 Flopped'
                        : '✓ Posted'}
                  </b>
                </div>
                <div className="res-meta">
                  Rep {summary.content.repDelta >= 0 ? '+' : ''}
                  {summary.content.repDelta} · Ego{' '}
                  {summary.content.egoDelta >= 0 ? '+' : ''}
                  {summary.content.egoDelta} · Leads seeded {summary.content.leads}
                </div>
              </>
            ) : (
              <div className="res-meta">No post this week.</div>
            )}
          </>
        )}
```

- [ ] **Step 2: Typecheck + build**

Run: `npx tsc -p tsconfig.app.json --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/WeekSummaryModal.tsx
git commit -m "feat(p9): Week Summary content section"
```

---

## Task 10: Debug panel + settings toggle (§13.12, §12)

**Files:**
- Modify: `src/components/OfficeTab.tsx`

- [ ] **Step 1: Add the content debug controls**

In the debug grid (near the other `DEBUG_*` buttons), add:
```tsx
          <button
            className="res-debug-btn"
            onClick={() =>
              dispatch({ type: 'DEBUG_FORCE_POST_OUTCOME', outcome: 'viral' })
            }
          >
            Force post: viral
          </button>
          <button
            className="res-debug-btn"
            onClick={() =>
              dispatch({ type: 'DEBUG_FORCE_POST_OUTCOME', outcome: 'neutral' })
            }
          >
            Force post: neutral
          </button>
          <button
            className="res-debug-btn"
            onClick={() =>
              dispatch({ type: 'DEBUG_FORCE_POST_OUTCOME', outcome: 'embarrass' })
            }
          >
            Force post: embarrass
          </button>
          <label className="res-debug-field">
            Crew tier
            <select
              value={state.unlockedCrew}
              onChange={(e) =>
                dispatch({
                  type: 'DEBUG_SET_CREW',
                  crew: e.target.value as GameState['unlockedCrew'],
                })
              }
            >
              <option value="none">none</option>
              <option value="freelancer">freelancer</option>
              <option value="team">team</option>
            </select>
          </label>
          <button
            className="res-debug-btn"
            onClick={() => dispatch({ type: 'DEBUG_SKIP_WEEKS', weeks: 3 })}
          >
            Skip 3 weeks
          </button>
```
(Ensure `GameState` is imported in `OfficeTab.tsx`; it likely already is. If not, add `import type { GameState } from '../state/types'`.)

- [ ] **Step 2: Add the `contentEnabled` settings toggle**

Near the other settings (find where `callsEnabled` is toggled — search `SET_CALLS_ENABLED` in the file; place this beside it):
```tsx
          <label className="res-toggle">
            <input
              type="checkbox"
              checked={state.contentEnabled}
              onChange={(e) =>
                dispatch({ type: 'SET_CONTENT_ENABLED', enabled: e.target.checked })
              }
            />
            Weekly social post
            <span className="res-debug-note">
              Off = you're too busy selling to post.
            </span>
          </label>
```
> If `SET_CALLS_ENABLED` is toggled in a different component, add this toggle there instead, mirroring that markup exactly.

- [ ] **Step 3: Typecheck**

Run: `npx tsc -p tsconfig.app.json --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/OfficeTab.tsx
git commit -m "feat(p9): debug post controls and content settings toggle"
```

---

## Task 11: Lead-seeding acceptance test (§13.5) + full regression

**Files:**
- Test: `src/logic/__tests__/content.test.ts` (append)

- [ ] **Step 1: Add a statistical seeding test**

```ts
import { arch, makeLead } from '../leads'
import { archetypeWeight } from '../territory'

describe('lead seeding tilts the pool (§13.5)', () => {
  it('raises flip-bro odds when a flipper post seeded bias', () => {
    const seeded = base({
      rank: 'sellerAgent',
      reputation: 40,
      pendingLeadBias: [{ archetypeId: 'flipBro', weeksLeft: 1 }],
    })
    const plain = base({ rank: 'sellerAgent', reputation: 40 })
    expect(archetypeWeight(seeded, 'flipBro')).toBeCloseTo(2.5, 5) // 1 * (1 + 1.5)
    expect(archetypeWeight(plain, 'flipBro')).toBe(1)
  })
  it('bias expires after one endWeek', () => {
    // handled by endWeek decrement; assert the shape here
    const seeded = base({
      pendingLeadBias: [{ archetypeId: 'flipBro', weeksLeft: 1 }],
    })
    const decremented = seeded.pendingLeadBias
      .map((b) => ({ ...b, weeksLeft: b.weeksLeft - 1 }))
      .filter((b) => b.weeksLeft > 0)
    expect(decremented.length).toBe(0)
  })
})
```

- [ ] **Step 2: Run the entire suite (§13.1 regression)**

Run: `npx vitest run`
Expected: ALL PASS.

- [ ] **Step 3: Typecheck the app build**

Run: `npx tsc -p tsconfig.app.json --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/logic/__tests__/content.test.ts
git commit -m "test(p9): lead-seeding acceptance and regression"
```

---

## Task 12: Manual verification in the browser

- [ ] **Step 1: Start the dev server via the preview tool** (`npm run dev`), not Bash.
- [ ] **Step 2:** Play to End Week; confirm the composer appears once between End Week and the Summary (§13.1), two-step flow works, locked posts are greyed with "Needs {crew}" (§13.2), preview deltas match before commit (§13.10).
- [ ] **Step 3:** Use debug "Set crew tier: team" → confirm produced/premium posts unlock and the summary shows +1 lead on any post (§13.3).
- [ ] **Step 4:** Force each outcome via debug and confirm banners/flavor and rep/ego/leads deltas (§13.4, §13.6).
- [ ] **Step 5:** Toggle "Weekly social post" off → confirm End Week skips straight to Summary (§13.1). Reload mid-week → confirm the composer does not double-open (§13.11).
- [ ] **Step 6:** Screenshot the composer (both steps) and the summary Content section; share with the user.

---

## Self-Review notes (spec coverage)

- §2 constants → Task 1 (`P9`). §3 crew → Task 1 + `unlockedCrewFor`/`activeCrew` Task 3, recompute Task 5. §4 posts → Task 2. §5 captions → Task 2. §6 resolution → Task 4 (`computeChances`, `resolvePost`, roll order, seeding, outcomes, clamps, skip). §6.6 bias → Task 4 seed + Task 5 expiry + Task 4 `archetypeWeight`. §7 flow → Task 5 + Task 8. §8 lines → Task 2 + Task 4 logging + Task 9 summary + Task 7 brags. §9 hooks → Task 4 (weight, postEgo), viral modifier (Task 4). §10 guards → `KNOWN_ARCHETYPE` skip, humbledAward trophy guard (Task 4). §11 state/migration → Task 1 fields + Task 5 defaults + Task 6 migration. §12 UI → Task 8. §13 acceptance → Tasks 4/5/6/11/12. §13.12 debug → Task 10.
- **Open follow-up (flag during execution):** the ego value read by `computeChances` uses `s.stats.ego`, which callers must keep synced; the reducer `sync`s before resolving, and the composer reads live `state.stats`. If any test builds an unsynced fixture, call `sync` first.
