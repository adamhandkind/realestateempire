/* Trophy perks, as a leaf module.

   Every §7 perk site lives in a file the award DATA already depends on
   (economy, leads, marketing, events, portfolio), so those files cannot import
   data/awards.ts without closing a cycle. The perk -> award mapping is static
   and tiny, so it lives here instead and nothing but types comes with it.

   A test pins this map against data/awards.ts, so the two can never drift. */

import { P7 } from '../data/p7'
import type { GameState } from '../state/types'

/** perk id -> the award whose trophy grants it. Mirrors data/awards.ts. */
export const PERK_AWARD: Record<string, string> = {
  topProducerAura: 'topProducer',
  onePercentPlaque: 'topOnePercent',
  signageRespect: 'mostImprovedSignage',
  benchLove: 'peoplesChoiceBench',
  rookieEnergy: 'rookieOfTheYear',
  hustleTrophy: 'hustleAward',
  luxuryDistinction: 'luxuryPortfolio',
  goodNeighbour: 'communityService',
  agentOfTheYear: 'agentOfTheYear',
}

/** True when a DISPLAYED trophy grants this perk. An undisplayed trophy is
 *  furniture. Safe on a state built before Phase 7 existed. */
export function hasPerk(s: GameState, perkId: string): boolean {
  const awardId = PERK_AWARD[perkId]
  if (!awardId) return false
  return (s.trophies ?? []).some((t) => t.displayed && t.awardId === awardId)
}

/** +1 Ego per displayed trophy. Caps are applied by deriveStats, not here. */
export const trophyEgo = (s: GameState): number =>
  (s.trophies ?? []).filter((t) => t.displayed).length * P7.TROPHY_EGO
