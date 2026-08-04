/**
 * The phone-call turn engine. Pure logic — no reducer knowledge, no React.
 *
 * The one thing to keep in mind while reading: momentum IS the close-chance
 * delta, in points. Everything here exists to move one integer between -30 and
 * +30, which the resolution step divides by 100 and adds to closeChance().
 */

import { ARCHETYPES } from '../data/archetypes'
import { CALL_BEATS, CLIENT_REPLIES, GENERIC_BEATS } from '../data/callBeats'
import { cardOf } from '../data/callCards'
import { P8 } from '../data/p8'
import { pick } from './rand'
import type { CallBeat, Lead, Reaction, TacticId } from '../state/types'

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
