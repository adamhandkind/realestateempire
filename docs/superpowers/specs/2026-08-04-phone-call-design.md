# Phase 8 — The Call

**Status:** approved design · **Date:** 2026-08-04
**Requires:** Phase 1 (GameState v1+). Phases 2/3/5/6 are all present in this repo, so every optional-dependency guard in §10 is satisfiable — but the guards still ship, because the code must not assume it.
**Save version:** 5 → 6.

This document is the implementation design. It carries the source spec's content verbatim
where that content *is* the game (tactics, beats, tells, flavour lines) so that no later
session needs to go back to the original message.

---

## 1. What this adds

`ATTEMPT_CLOSE` resolves as a single hidden dice roll today. For high-value leads only,
this replaces that roll with a three-turn dialogue: the client says something, the player
picks one of four tactics, the client reacts. After three exchanges the call resolves into
the same success/failure branches the game already has.

**The design contract.** The minigame does not replace the close formula, it *modulates*
it. `closeChance()` still produces the base number; the call swings it by roughly ±25
points. A player who reads the archetype correctly closes deals they'd otherwise lose; a
player who mashes one tactic does slightly worse than the old dice roll. It only fires on
leads worth caring about, so the other ~80% of closes stay one click.

**Trigger rule (exact).** The call fires when `lead.salePrice >= P8.CALL_THRESHOLD`
(400,000) **or** the lead's archetype is in `P8.ALWAYS_CALL` (`luxLorenzo`,
`celebrityCleo`, `oldMoneyOtis`). Otherwise `ATTEMPT_CLOSE` behaves exactly as it does
today. A settings toggle `callsEnabled` (default true) reverts everything to dice.

**Out of scope — build nothing for:** showing calls, tenant calls, rival calls, voice/audio,
free-text input, any Phase 4 system.

---

## 2. Architecture

### 2.1 The refactor (the thing that makes AC #7 true)

`src/state/reducer.ts:450-526` currently does validation, AP spend, the dice roll, and both
outcome branches inline. Split it at the roll.

New `src/logic/close.ts` exports:

```ts
export function resolveClose(state: GameState, lead: Lead, finalChance: number): GameState
```

It contains everything from `chance(finalChance)` downward, moved **verbatim** out of the
reducer: `applyAccentSlip`, the `retriedClose` branch (remove lead, `leadsLost += 1`,
walked-for-good line), the first-failure branch (patience −1, `retriedClose: true`,
sleep-on-it line), and the whole success branch (`commissionFor`, the P6 undercut check via
`pluralityOwner`, cash/`careerEarnings`, `sold: true`, `dealsClosed += 1`, `clampRep`,
`weekDealDistricts`, `gain(..., P6.GAIN_DEAL)`, the archetype success line). It returns the
already-`sync`ed, already-`withLog`ged state, exactly as the reducer does now.

`ATTEMPT_CLOSE` becomes: existing validation (`ap >= 1`, rank not `receptionist`, lead
exists, `stage === 'ready'`, not `sold`) → `spendAp(state, 1)` → fork:

- `callsEnabled && shouldCall(lead)` → open the call, `callStats.calls += 1`, **stop**.
- otherwise → `resolveClose(s, lead, closeChance(state, lead))`.

The call's resolution step calls the identical `resolveClose` with the modulated chance.
Both paths are the same code and cannot drift.

**No other part of `reducer.ts` is touched.** Splitting the 1682-line reducer into per-domain
modules is explicitly not in scope.

### 2.2 New files

| File | Contents |
|---|---|
| `src/data/p8.ts` | The `P8` constants block (§3). Matches the existing `p3.ts`/`p5.ts`/`p6.ts` convention. |
| `src/data/callCards.ts` | `CALL_CARDS` — the five tactics and their player lines (§5). |
| `src/data/callBeats.ts` | `CALL_BEATS`, `CLIENT_REPLIES`, `ARCHETYPE_TELLS` (§6, §7). |
| `src/logic/close.ts` | `resolveClose` (§2.1). |
| `src/logic/call.ts` | The pure turn engine (§8). |
| `src/components/CallModal.tsx` | The blocking modal (§10). |
| `src/logic/__tests__/call.test.ts` | Acceptance coverage (§12). |

### 2.3 The blocking guard

`call: CallState | null` mirrors the existing `pendingChoice: PendingChoice | null` pattern,
and `CallModal` mounts in `App.tsx` beside `PortfolioChoiceModal`, driven off `state.call`.

Blocking is enforced in **one** place — a guard at the top of the reducer. When
`state.call !== null`, only `PLAY_TACTIC`, `ADVANCE_CALL`, `CLOSE_CALL_MODAL`, and the
`DEBUG_*` actions pass; every other action returns `state` unchanged. `END_WEEK` is disabled
in the UI with the reason **"You're on the phone."**

---

## 3. Constants (`src/data/p8.ts`)

```ts
export const P8 = {
  CALL_THRESHOLD: 400000,
  ALWAYS_CALL: ['luxLorenzo', 'celebrityCleo', 'oldMoneyOtis'] as const,
  TURNS: 3,
  MOMENTUM_START: 0,
  MOMENTUM_MIN: -30, MOMENTUM_MAX: 30,   // momentum IS the close-chance delta, in points
  GREAT: 10, GOOD: 5, NEUTRAL: 0, BAD: -6, TERRIBLE: -12,
  REPEAT_PENALTY: 4,        // per prior use of the same tactic this call
  READ_COST_AP: 0,          // free, but consumes the turn's tactic slot
  PATIENCE_ON_HANGUP: 1,
  HANGUP_MOMENTUM: -25,     // momentum <= this ends the call early at turn 2+
  PERFECT_BONUS: 8,         // all three turns GREAT
  EGO_TACTIC_SCALE: 0.4,
  SWAGGER_TACTIC_SCALE: 0.5,
  RETRY_MOMENTUM: -5,       // a second call on the same lead starts here
} as const
```

`RETRY_MOMENTUM` is named here rather than left as a literal in §8.6; the value is the
spec's −5, unchanged.

---

## 4. Types (`src/state/types.ts`)

```ts
export type TacticId = 'empathize' | 'push' | 'namedrop' | 'flex' | 'read'
export type Reaction = 'great' | 'good' | 'neutral' | 'bad' | 'terrible'

export interface CallBeat {
  id: string
  archetypeIds: string[] | 'any'
  turn: 1 | 2 | 3 | 'any'
  text: string                                 // supports {name}, {price}
  tell?: Partial<Record<TacticId, Reaction>>   // OVERRIDES the archetype default, this beat only
}

export interface CallCard {
  id: TacticId
  label: string
  hint: string
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
  turn: number                 // 1..3
  momentum: number
  history: CallTurn[]
  usedTactics: TacticId[]
  usedBeatIds: string[]        // beats never repeat within a call
  currentBeatId: string
  revealedTells: TacticId[]
  phase: 'awaitingTactic' | 'showingReaction' | 'resolving' | 'resolved'
  outcome: null | { success: boolean; finalChance: number; payout: number }
}
```

`GameState` gains:

```ts
call: CallState | null          // non-null => the call modal is open and blocking
callsEnabled: boolean           // settings toggle, default true
callStats: { calls: number; perfectCalls: number; hangups: number }
```

`GameAction` gains:

```ts
| { type: 'PLAY_TACTIC'; tacticId: TacticId }
| { type: 'ADVANCE_CALL' }
| { type: 'CLOSE_CALL_MODAL' }
| { type: 'SET_CALLS_ENABLED'; enabled: boolean }
| { type: 'DEBUG_FORCE_CALL'; leadId: string }
| { type: 'DEBUG_SET_MOMENTUM'; momentum: number }
| { type: 'DEBUG_REVEAL_TELLS' }
```

`usedBeatIds` is added to the source spec's `CallState` because §8.2 requires beats not to
repeat within a call and `history` alone cannot express that once Read holds a beat across
two entries.

---

## 5. Tactics (`src/data/callCards.ts` — verbatim)

Four playable tactics plus Read. Each turn the player picks exactly one.

**`empathize` — Empathize** · hint: "Slow down. Listen. Mean it."
- "'That's a real concern, and I'd rather you raise it now than after closing.'"
- "'You don't have to decide today. I want you to decide right.'"
- "'Tell me what's actually worrying you. The rest is paperwork.'"
- "'Nobody should feel rushed into the biggest purchase of their life.'"

**`push` — Push** · hint: "Create urgency. Ask for the signature."
- "'There are two other showings booked tomorrow. I'm telling you that because it's true.'"
- "'If you want it, we write it up tonight. That's the whole strategy.'"
- "'I can hold it until nine. After that I genuinely can't.'"
- "'Let's stop circling. Yes or no — I'll respect either one.'"

**`namedrop` — Namedrop** · hint: "Comps, credentials, and who you know."
- "'The same floorplan two streets over went $30k above ask in eleven days.'"
- "'I sold the house behind yours. And the one behind that.'"
- "'My inspector can be in there Thursday. He owes me one.'"
- "'I've done four of these this quarter. The pattern is very consistent.'"

**`flex` — Flex** · hint: "Full presence. Let them see the blazer."
- "'People don't hire me to be quiet. They hire me because I win these.'"
- "'You've seen the benches. That's not vanity, that's market share.'"
- "'I don't lose bidding wars. I'd rather you hear that from me than from someone else.'"
- "'Look — the jacket is doing a lot of work here, but so is my record.'"

**`read` — Read the Room** · hint: "Say nothing. Learn one thing. (Costs the turn.)"
- "You let the silence sit. It does what silence does."
- "You say 'mm' and wait. They fill the gap."
- "You listen to what they're not saying."

Player lines are picked by a stable hash of `beatId + tacticId` so the same situation reads
the same way twice.

---

## 6. Archetype tells (`ARCHETYPE_TELLS` — verbatim)

Default reaction per archetype per tactic. Beats override individual cells. Every lookup is
existence-checked; unknown archetypes fall back to the `default` row.

| archetype | empathize | push | namedrop | flex |
|---|---|---|---|---|
| `default` | good | neutral | good | neutral |
| `firstTimer` | **great** | terrible | good | bad |
| `retireeRuth` | **great** | bad | good | terrible |
| `nightmareNancy` | **great** | bad | neutral | bad |
| `hgtvCouple` | good | neutral | **great** | neutral |
| `relocRob` | neutral | **great** | good | neutral |
| `cashChad` | bad | good | neutral | **great** |
| `flipBro` | neutral | good | **great** | good |
| `techTyler` | neutral | good | **great** | good |
| `lowballLarry` | neutral | bad | **great** | bad |
| `ghostGary` | good | **great** | neutral | neutral |
| `influencerIzzy` | bad | neutral | neutral | **great** |
| `celebrityCleo` | bad | bad | good | **great** |
| `luxLorenzo` | neutral | bad | good | **great** |
| `oldMoneyOtis` | good | terrible | **great** | terrible |

**Do not alter this table.** Every archetype has exactly one `great` and at least one
`bad`/`terrible`. The luxury-tier split — Lorenzo/Cleo reward Flex, Otis punishes it — is
the single most important balance line in the design, because it forces loadout-aware play
on exactly the leads that pay the most. All 14 archetypes exist in `src/data/archetypes.ts`,
so no row is unreachable in this repo.

---

## 7. Beats (`src/data/callBeats.ts` — verbatim)

`{name}` = client name, `{price}` = formatted `salePrice`.

### Turn 1 — the opening

| id | archetypes | text | tell overrides |
|---|---|---|---|
| `t1_generic_a` | any | "'So. We've seen it, we've talked about it. Where are we at?'" | — |
| `t1_generic_b` | any | "'My spouse asked me last night if we're actually doing this. I didn't have an answer.'" | `push: bad` |
| `t1_generic_c` | any | "'Talk me through the number one more time. {price} is a lot of number.'" | `namedrop: great` |
| `t1_first` | firstTimer, retireeRuth | "'I keep waking up at three in the morning about this. Is that normal?'" | `empathize: great, flex: terrible` |
| `t1_lux` | luxLorenzo, celebrityCleo | "'I've had three agents call me this week. Why are we still talking?'" | `flex: great, empathize: bad` |
| `t1_otis` | oldMoneyOtis | "'I don't need this sold quickly. I need it sold *properly*.'" | `push: terrible, namedrop: great` |
| `t1_investor` | flipBro, techTyler, cashChad | "'Run me the numbers again. Not the story. The numbers.'" | `namedrop: great, empathize: bad` |

### Turn 2 — the objection

| id | archetypes | text | tell overrides |
|---|---|---|---|
| `t2_price` | any | "'I think it's overpriced. I'm not saying it's not nice. I'm saying it's overpriced.'" | `namedrop: great` |
| `t2_timing` | any | "'What if we just… waited? Until spring. Or next spring.'" | `push: good` |
| `t2_other_agent` | any | "'Someone else told me they could get it for less. I don't know if I believe them.'" | `flex: good, empathize: neutral` |
| `t2_cold_feet` | firstTimer, nightmareNancy, retireeRuth | "'What if we hate it? What if in a year we hate it?'" | `empathize: great, push: terrible` |
| `t2_ego` | influencerIzzy, celebrityCleo, cashChad | "'Be honest — are you actually the right person for this?'" | `flex: great, empathize: bad` |
| `t2_deference` | oldMoneyOtis, retireeRuth | "'My family has been in this house for forty years. I want that respected.'" | `empathize: great, flex: terrible, push: terrible` |

### Turn 3 — the decision

| id | archetypes | text | tell overrides |
|---|---|---|---|
| `t3_generic_a` | any | "'Okay. Okay. Say the thing that makes me sign.'" | — |
| `t3_generic_b` | any | "'One reason. Give me one good reason and I'll do it.'" | `push: great` |
| `t3_wobble` | any | "'I'm at fifty-fifty. Genuinely fifty-fifty.'" | — |
| `t3_soft` | firstTimer, retireeRuth, hgtvCouple | "'If you tell me this is the right move, I'll believe you.'" | `empathize: great, flex: bad` |
| `t3_hard` | cashChad, relocRob, techTyler | "'I've got another call in four minutes. Land it.'" | `push: great, empathize: terrible` |
| `t3_lux` | luxLorenzo, celebrityCleo | "'Convince me you're the person whose name goes on this.'" | `flex: great` |

### Fallback beats

`genericBeat1` / `genericBeat2` / `genericBeat3` are the last-resort beats named in §8.2.
They reuse the text of `t1_generic_a`, `t2_price`, and `t3_generic_a` respectively, with no
tell overrides, and are never drawn while any normal candidate remains.

### Client replies

`CLIENT_REPLIES: Record<Reaction, string[]>` — generated per reaction tier, not per beat.

- **great:** "'…Okay. Yeah. Okay, that's exactly it.'" / "There's a pause, and it's the good kind." / "'That's the first straight answer I've gotten all month.'" / "You can hear them nodding. People nod audibly. It's a real thing."
- **good:** "'Hm. That's fair.'" / "'Alright, I hear you.'" / "'That does help, actually.'" / "'Okay, keep going.'"
- **neutral:** "'Mm-hm.'" / "'Sure.'" / "A noise that could mean anything." / "'Right, right.'"
- **bad:** "'…I don't know about that.'" / "There's a silence, and it's the other kind." / "'That's not really what I asked.'" / "You hear a chair move. Never a good sign."
- **terrible:** "'Wow. Okay.'" / "'You know what, forget it.'" / "The temperature of the call drops through the floor." / "'I'm going to be honest, that was the wrong thing to say.'"

---

## 8. The turn engine (`src/logic/call.ts`)

Pure functions with no reducer knowledge. Randomness goes through the existing
`src/logic/rand.ts` (`pick`, `chance`) so tests seed it the way every other logic test does.

Exports: `shouldCall`, `pickBeat`, `resolveTactic`, `revealTell`, `finalChanceFor`,
`momentumWord`, `callSummaryLine`.

### 8.1 Starting a call

Inside `ATTEMPT_CLOSE`, after validation and `spendAp(state, 1)`:

```ts
call = {
  leadId, turn: 1,
  momentum: lead.retriedClose ? P8.RETRY_MOMENTUM : P8.MOMENTUM_START,
  history: [], usedTactics: [], usedBeatIds: [beat.id],
  currentBeatId: beat.id, revealedTells: [],
  phase: 'awaitingTactic', outcome: null,
}
callStats.calls += 1
```

Then **stop** — no roll yet. Log §9.1, or §9.2 on a retry.

### 8.2 Beat selection

`pickBeat(lead, turn, usedBeatIds)`: candidates are beats where
`(archetypeIds === 'any' || archetypeIds.includes(lead.archetypeId))` **and**
`(beat.turn === turn || beat.turn === 'any')` **and** `!usedBeatIds.includes(beat.id)`.
`pick()` among them. If empty, fall back to the `'any'` pool for that turn (still excluding
used); if still empty, use `genericBeat{turn}`.

### 8.3 Resolving a tactic

```ts
// 1. Base reaction — the beat's tell overrides the archetype default.
reaction = beat.tell?.[tactic] ?? ARCHETYPE_TELLS[lead.archetypeId]?.[tactic] ?? 'neutral'

// 2. Reaction -> base delta
base = { great: 10, good: 5, neutral: 0, bad: -6, terrible: -12 }[reaction]

// 3. Stat scaling — only the two stat-linked tactics.
//    push: only when base > 0
base += (tactic === 'push' && base > 0) ? st.swagger * P8.SWAGGER_TACTIC_SCALE : 0
//    flex: ALWAYS, in both directions. A negative egoAffinity therefore makes Flex
//    actively worse even on a 'good' tell.
base += (tactic === 'flex') ? st.ego * a.egoAffinity * P8.EGO_TACTIC_SCALE : 0

// 4. Repetition penalty — compounds: -4, -8, -12
base -= P8.REPEAT_PENALTY * countPrior(tactic, usedTactics)

// 5. Apply
momentum = clamp(momentum + Math.round(base), P8.MOMENTUM_MIN, P8.MOMENTUM_MAX)
```

`st` is `deriveStats(state)` and `a.egoAffinity` is the same field `closeChance()` already
uses, so Doreen's ego cap naturally weakens Flex with no special-casing.

### 8.4 Turn flow

`PLAY_TACTIC { tacticId }` → compute per §8.3 → push a `CallTurn` → `phase =
'showingReaction'`. Then `ADVANCE_CALL`:

- `turn < 3` **and** `momentum > P8.HANGUP_MOMENTUM` → `turn += 1`,
  `currentBeatId = pickBeat(...)`, push it to `usedBeatIds`, `phase = 'awaitingTactic'`.
- `momentum <= P8.HANGUP_MOMENTUM` **and** `turn === 2` → **early hangup**:
  `phase = 'resolving'`, outcome computed with momentum as-is, `lead.patience -= 1`,
  `callStats.hangups += 1`, log §9.4. The close still resolves — hangup does not skip
  resolution.
- `turn === 3` → `phase = 'resolving'`, normally, with no hangup line and no patience cost.

**Disambiguation.** The source spec writes the hangup condition as `turn >= 2`, which at
face value also catches a turn-3 collapse — but turn 3 is the call's natural end, so
nothing about it is "early." This design resolves it as `turn === 2`: the hangup branch is
reachable on turn 2 only, and a turn-3 collapse resolves through the ordinary path with a
grim §9.5 summary and no extra patience penalty. A call is never punished twice for ending
when it was going to end anyway. AC 6 still holds (hangup fires only at `turn >= 2`).

The hangup check is evaluated before the turn-advance check, so a turn-2 collapse ends the
call rather than proceeding to turn 3.

### 8.5 Read the Room

Consumes the turn's tactic slot but does **not** advance the beat: `currentBeatId` stays,
`turn += 1` still happens, `usedBeatIds` is unchanged.

Reveals exactly ONE tell for the current beat — the first unrevealed tactic in the fixed
priority order `empathize, push, namedrop, flex` whose reaction would be `great`. If none
would be `great`, reveal the first whose reaction would be `terrible` instead (knowing what
*not* to do is worth a turn).

If neither exists — a flat beat with no `great` and no `terrible` cell, which the §6 table
plus §7 overrides do permit — reveal the first unrevealed tactic in priority order whose
reaction is the best available (`good` before `neutral` before `bad`), using the positive
§9.3 phrasing when that reaction is `good` or `neutral` and the warning phrasing when it is
`bad`. Read always reveals exactly one tell; it never no-ops.

The UI needs each revealed tell's polarity to choose the ⭑ / ✕ badge (§10). `revealedTells`
stores only the `TacticId`; badge polarity is recomputed from the current beat and archetype
at render time, which is deterministic and keeps the stored state minimal.

Pushes a `CallTurn` with `delta: 0`, `reaction: 'neutral'`, and a §5 read line. Read cannot
be used twice in one call — the button disables after use. **Read stays enabled on turn 3**
(decided during design review): it burns the final turn, and that is a real, learnable
player error rather than a bug.

### 8.6 Resolution

```ts
perfect = history.filter(h => h.reaction === 'great').length === P8.TURNS
finalChance = clamp(
  closeChance(state, lead) + momentum / 100 + (perfect ? P8.PERFECT_BONUS / 100 : 0),
  0.1, 0.9,
)
```

`0.1`/`0.9` are the existing bounds hard-coded in `closeChance()` at
`src/logic/leads.ts:108`; the implementation reads them from shared constants rather than
re-typing the literals, extracting them from `leads.ts` if they are not already named.

Then hand off to `resolveClose(state, lead, finalChance)` (§2.1) — every downstream Phase 1
branch behaves identically to the dice path. On top of that, the call adds
`callStats.perfectCalls += 1` when perfect, and logs the §9.5 summary line **before** the
standard outcome line.

Turns spent on Read disqualify a perfect call, since a read turn's reaction is `neutral`.

### 8.7 Retry rule

A retried close on the same lead fires a fresh call starting at `P8.RETRY_MOMENTUM` (−5)
with the §9.2 log line. Beats used in the first call are eligible again — `usedBeatIds`
is per-call, not per-lead. A second failure still removes the lead, via the unchanged
`resolveClose` retry branch.

---

## 9. Log & flavour lines (verbatim)

1. **Call start:** "You called {name}. This is a {price} conversation. Your palms know it."
2. **Retry call:** "Second call with {name}. They remember the first one. So do you."
3. **Read lines:** "You let the silence sit. {name} fills it — and tells you something."
   Append "(They'd respond well to {tactic}.)" or "(Whatever you do, don't {tactic}.)"
4. **Hangup:** "'Let me think about it.' The line goes dead. That phrase has never once meant thinking."
5. **Call summary** (logged before the outcome line):
   - `> 15` → "The call went beautifully. You could hear it turning."
   - `5..15` → "Solid call. You didn't lose them."
   - `-5..5` → "The call was… fine. Professionally fine."
   - `-15..-5` → "That call got away from you a little."
   - `< -15` → "That call was a car accident with hold music."
6. **Perfect call:** "Three for three. Every single thing you said landed. You will be insufferable about this."
7. **Brags** (join the rotation in `src/data/brags.ts` after 1 perfect call):
   - "Closed it on the phone in under six minutes. The phone is a WEAPON. ☎️"
   - "Some agents send emails. I call. 📞"
   - "'Let me think about it' is just a request for a better phone call."

Band boundaries in §9.5 are inclusive at the upper edge, reading top-down: `>15`, then
`>=5`, then `>=-5`, then `>=-15`, else the last.

---

## 10. UI contract (`CallModal.tsx`)

Blocking full-screen modal, ink backdrop, centred card max-width 560px, full width at 375px.
Mounted in `App.tsx` beside `PortfolioChoiceModal`, driven off `state.call`.

- **Header:** client name + archetype label, `{price}` in the display face, and a **momentum
  meter** — a horizontal bar centred at zero, brass fill rightward, sold-red leftward, with a
  label that is a WORD, not a number:

  | momentum | label |
  |---|---|
  | `>= 20` | "They're in" |
  | `10..19` | "Warm" |
  | `1..9` | "Leaning" |
  | `0` | "Neutral" |
  | `-1..-9` | "Cooling" |
  | `-10..-19` | "Losing them" |
  | `<= -20` | "It's slipping" |

  Terri's existing `showRawNumbers` flag additionally shows the integer — the same
  `hasFlag(state, 'showRawNumbers')` call `LeadsTab.tsx:62` already makes.
- **Turn pips:** three dots, current one brass.
- **Beat text:** large, quoted, marble, small phone glyph. Typewriter reveal at 18ms/char.
- **Tactic row:** four cards plus Read, each showing label + hint. Revealed tells render as a
  small brass ⭑ (good) or sold-red ✕ (avoid) badge on the card. A repeated tactic shows a
  faint "used ×n" and dims its hint — **the penalty must be visible before clicking, not
  after.**
- **Reaction phase:** player line in a right-aligned bubble → 400ms beat → client reply in a
  left-aligned bubble → momentum bar animates with a floating `+10` / `−6` chip in
  mint/sold-red. Tap anywhere or "Continue" advances.
- **Resolution:** the modal transitions to the outcome — SOLD stamp + commission on success
  (reuse the Phase 1 stamp), or the archetype's failure treatment. A Close button dispatches
  `CLOSE_CALL_MODAL` and returns to the Leads tab.
- **Reduced motion:** no typewriter, no bubble animation, instant bar updates, no confetti.
  The paging structure stays.
- **Settings:** a "Phone calls for big deals" toggle in the existing Settings block of
  `OfficeTab.tsx:155`, bound to `callsEnabled`, sub-label "Off = instant dice roll, like the
  old days."
- **Debug panel** (`OfficeTab.tsx`, beside the existing `DEBUG_ADD_SHARE` controls): "Force
  call on selected lead", "Set momentum…", "Reveal all tells".

---

## 11. Optional-dependency guards

Every one of these systems is present in this repo, but the code must not assume it.

| System | Behaviour |
|---|---|
| Phase 2 archetypes | Existence-check every `ARCHETYPE_TELLS` and beat lookup; never index blindly. Unknown archetype → the `default` row. |
| Phase 3 | No interaction — calls are lead-only. |
| Characters | Terri's `showRawNumbers` shows integer momentum. Doreen's ego cap naturally weakens Flex (intended, no special-casing). Nigel's `accentSlip` fires on call failure exactly as on dice failure — it lives inside the moved `resolveClose` body, so it is hooked once, not duplicated. |
| Territory | Presence/dominance bonuses are already inside `closeChance()` and therefore already inside the call's final math. No extra wiring. |
| Awards | `hustleAward` counts `closeAttempts`; a call counts as exactly ONE attempt regardless of turns. |

---

## 12. Migration (`src/state/migrate.ts`)

Chain v5 → v6: `call: null`, `callsEnabled: true`,
`callStats: { calls: 0, perfectCalls: 0, hangups: 0 }`. Widen the version guard at
`migrate.ts:28` to accept 6 and bump the default at `migrate.ts:60`.

**Critical:** if a save loads with a non-null `call` (crash mid-call), discard it — set
`call = null` and log "The line dropped. {name} is still in your pipeline, mercifully."
The lead keeps its state as of before the call, minus the AP already spent. AP is never
refunded and never double-charged, because AP is spent once in `ATTEMPT_CLOSE` before the
call opens and the call itself never touches it.

---

## 13. Acceptance criteria

Tests live in `src/logic/__tests__/call.test.ts`; `acceptance.test.ts` is the regression
guard for AC 1.

1. Prior-phase criteria pass. Leads under $400k with non-listed archetypes still resolve
   instantly by dice; `callsEnabled: false` reverts everything to dice.
2. Trigger rule exact: $400k+ OR the three always-call archetypes, verified both directions.
3. Turn engine: exactly 3 turns; beats never repeat within a call; a beat `tell` overrides
   the archetype default; the repetition penalty compounds (−4, −8, −12) and is visible on
   the cards before clicking.
4. Stat scaling: Push scales with Swagger on positive deltas only. Flex scales with
   `ego × egoAffinity` in BOTH directions — assert a high-Ego player playing Flex on
   `oldMoneyOtis` (`egoAffinity: -3`) is measurably worse than neutral, and better than
   neutral on `luxLorenzo` (`egoAffinity: 3`).
5. Read consumes the turn, keeps the beat, reveals exactly one tell by the §8.5 priority
   rule, disables after one use, and the badge renders on the correct card.
6. Hangup fires only at turn ≥2 with momentum ≤ −25, costs 1 patience, and still resolves
   the close.
7. Resolution math: `finalChance = base + momentum/100 (+0.08 perfect)`, clamped to the
   existing bounds; all downstream Phase 1 branches (payout, counters, retry flags,
   patience) behave identically to the dice path.
8. Retry call starts at −5 momentum with its line; a second failure still removes the lead.
9. Momentum never escapes [−30, 30]; the meter shows words, not numbers (except for Terri);
   all §5–§9 content ships verbatim.
10. Mid-call save/reload discards the call per §12 without corrupting the lead or
    double-charging AP.
11. Every §11 guard configuration runs without crashing.
12. Debug panel gains the three controls in §10.

---

## 14. Tuning notes (do not change without asking)

A player who reads the archetype correctly should land roughly +15 to +25 momentum (a 15–25
point close swing); a player mashing one tactic should land around −5 to +5, slightly worse
than the old dice roll. Perfect calls should be uncommon — roughly one in six played well.
If the minigame feels too strong, adjust `MOMENTUM_MAX` and the `GREAT`/`GOOD` values
first — **never** the reaction table in §6, which is the game's actual content.
