/**
 * The phone-call turn engine. Pure logic — no reducer knowledge, no React.
 *
 * The one thing to keep in mind while reading: momentum IS the close-chance
 * delta, in points. Everything here exists to move one integer between -30 and
 * +30, which the resolution step divides by 100 and adds to closeChance().
 */

import { ARCHETYPES } from '../data/archetypes'
import { ARCHETYPE_TELLS, CALL_BEATS, CLIENT_REPLIES, GENERIC_BEATS } from '../data/callBeats'
import { cardOf } from '../data/callCards'
import { P8 } from '../data/p8'
import { deriveStats } from './economy'
import { closeChance } from './leads'
import { pick } from './rand'
import type {
  CallBeat,
  CallState,
  GameState,
  Lead,
  PlayableTactic,
  Reaction,
  TacticId,
} from '../state/types'

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

/** Resolves a stored beat id. Falls back to turn 1's generic so a corrupted
 *  id can never crash a call in progress. */
export function beatOf(id: string): CallBeat {
  return (
    CALL_BEATS.find((b) => b.id === id) ??
    Object.values(GENERIC_BEATS).find((b) => b.id === id) ??
    GENERIC_BEATS[1]
  )
}

/** Clamps any turn number onto the three generic beats. The reducer calls
 *  pickBeat with `turn + 1`, so this has to tolerate an out-of-range value
 *  rather than trusting the caller. */
const genericTurn = (turn: number): 1 | 2 | 3 =>
  turn === 2 ? 2 : turn === 3 ? 3 : 1

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
  return GENERIC_BEATS[genericTurn(turn)]
}

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
