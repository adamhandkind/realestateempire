import { P9, crewOf } from '../data/crew'
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

/** §6.1 — viral & embarrass chances, clamped [0, 0.80]. Reads the already-synced
 *  ego from state.stats (which includes postEgo). */
export function computeChances(
  s: GameState,
  post: PostDef,
  caption: CaptionDef,
): { viral: number; embarrass: number } {
  const crew = activeCrew(s)
  const ego = s.stats.ego
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
