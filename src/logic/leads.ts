import { ARCHETYPES, FIRST_NAMES } from '../data/archetypes'
import type { Archetype, GameState, Lead, Stage } from '../state/types'
import {
  activeModifierDelta,
  atLeastRank,
  deriveStats,
  repUnlocked,
} from './economy'
import { getChar, hasFlag } from './characters'
import { P5 } from '../data/p5'
import { pick, rand, randInt, roundTo, weightedPick } from './rand'
import { PRICE_ROUND } from '../data/p3'
import {
  archetypeWeight,
  hasPresence,
  perkActive,
  pickLeadDistrict,
  priceMultOf,
} from './territory'

export const arch = (id: string): Archetype =>
  ARCHETYPES.find((a) => a.id === id)!

/** Seller-band clients need a listing licence; some clients need fame. */
export function legalArchetypes(state: GameState): Archetype[] {
  const canList = atLeastRank(state.rank, 'sellerAgent')
  return ARCHETYPES.filter(
    (a) =>
      (a.rankBand === 'seller' ? canList : true) &&
      repUnlocked(state.reputation, a.unlockRep ?? 0),
  )
}

export function makeName(a: Archetype): string {
  return pick(FIRST_NAMES) + ' ' + pick(a.surnames)
}

/** Uniform until the `luxPipeline` perk wakes up, at which point the estate
 *  crowd is twice as likely to call. */
function drawArchetype(state: GameState): Archetype {
  const legal = legalArchetypes(state)
  return (
    weightedPick(legal, (a) => archetypeWeight(state, a.id)) ??
    legal[0] ??
    pick(ARCHETYPES)
  )
}

/**
 * A new lead. `forcedDistrict` is only passed by a marketing channel that has
 * been aimed somewhere — every other lead rolls for its district, weighted by
 * the share you already hold there.
 */
export function makeLead(
  state: GameState,
  forcedArch?: Archetype,
  channelId?: string,
  forcedDistrict?: string,
): Lead {
  const a = forcedArch || drawArchetype(state)
  const districtId = forcedDistrict ?? pickLeadDistrict(state, a.id)
  const raw = randInt(a.price[0], a.price[1]) * priceMultOf(districtId)
  /* Everyone at the rink vouched for you, so they arrive with more rope. */
  const extra =
    districtId === 'northEnd' && perkActive(state, 'firstNamesBasis') ? 1 : 0
  return {
    id: 'L' + Date.now().toString(36) + Math.floor(rand() * 1e6).toString(36),
    archetypeId: a.id,
    clientName: makeName(a),
    stage: 'new',
    salePrice: roundTo(raw, PRICE_ROUND),
    patience: a.patience + extra,
    maxPatience: a.patience + extra,
    retriedClose: false,
    createdWeek: state.week,
    intro: pick(a.intros),
    referralBonus: false,
    districtId,
    ...(channelId ? { channelId } : {}),
  }
}

/** How much of the patience fuse is left, as a percentage. */
export const fusePct = (lead: Lead): number =>
  Math.max(0, (lead.patience / lead.maxPatience) * 100)

/** Buckets the pipeline into its three columns. */
export function byStage(leads: Lead[]): Record<Stage, Lead[]> {
  const out: Record<Stage, Lead[]> = { new: [], shown: [], ready: [] }
  leads.forEach((l) => out[l.stage].push(l))
  return out
}

/**
 * 0.35 base + swagger + the archetype's own modifier + ego × affinity,
 * plus any active market modifier and the referral bonus, clamped [0.10, 0.90].
 */
export function closeChance(state: GameState, lead: Lead): number {
  const a = arch(lead.archetypeId)
  const st = deriveStats(state)
  const char = getChar(state)
  let c = 0.35 + st.swagger * 0.05 + a.closeMod + st.ego * a.egoAffinity * 0.01
  c += activeModifierDelta(state)
  c += char.closeGlobalDelta + (char.closePerArchetype[lead.archetypeId] ?? 0)
  /* Presence is the only share-to-close link. Dominance pays out in perks. */
  if (hasPresence(state, lead.districtId)) c += 0.05
  if (lead.referralBonus) c += 0.1
  return Math.max(0.1, Math.min(0.9, c))
}

/** The archetype's ghost chance, unless this character repels this client. */
export function ghostChanceFor(state: GameState, lead: Lead): number {
  if (lead.archetypeId === 'influencerIzzy' && hasFlag(state, 'izzyAllergy'))
    return P5.IZZY_ALLERGY_GHOST
  return arch(lead.archetypeId).ghostChance
}
