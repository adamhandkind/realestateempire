import { ARCHETYPES, FIRST_NAMES } from '../data/archetypes'
import type { Archetype, GameState, Lead, RankId, Stage } from '../state/types'
import { activeModifierDelta, deriveStats } from './economy'
import { pick, rand, randInt } from './rand'

export const arch = (id: string): Archetype =>
  ARCHETYPES.find((a) => a.id === id)!

/** Seller-band clients only appear once you can list. */
export function legalArchetypes(rankId: RankId): Archetype[] {
  const seller = rankId === 'sellerAgent'
  return ARCHETYPES.filter((a) => (a.rankBand === 'seller' ? seller : true))
}

export function makeName(a: Archetype): string {
  return pick(FIRST_NAMES) + ' ' + pick(a.surnames)
}

export function makeLead(state: GameState, forcedArch?: Archetype): Lead {
  const a = forcedArch || pick(legalArchetypes(state.rank))
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
  let c = 0.35 + st.swagger * 0.05 + a.closeMod + st.ego * a.egoAffinity * 0.01
  c += activeModifierDelta(state)
  if (lead.referralBonus) c += 0.1
  return Math.max(0.1, Math.min(0.9, c))
}
