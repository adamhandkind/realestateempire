/* Market share, and everything that moves it.

   ONE function moves share between owners: `transferShare`. Everything else in
   the game — farming, deals, purchases, passive property presence, channel
   targeting, rival weeks, showdowns, decay — routes through it, so a district's
   shares can never drift off 100.0.

   Two notes on the contract, both deliberate:

   1. `transferShare` returns { state, moved } rather than a bare number. The
      spec's signature mutates; this codebase does not, and every caller needs
      the new state anyway.

   2. Decay uses `drainShare`, not a bare transfer to 'indies'. A transfer TO
      indies would take proportionally from the player AND the rivals, which is
      not what a decay step means — the player's inactivity should cost the
      player. `drainShare` moves an exact amount from one named owner into
      indies, and normalizes identically. */

import { DISTRICTS, DISTRICT_IDS, districtOf } from '../data/districts'
import { INDIES, P6, PLAYER } from '../data/p6'
import { RIVALS, RIVAL_IDS } from '../data/rivals'
import type { DistrictShareState, GameState, RivalDef } from '../state/types'
import { weightedPick } from './rand'

/* -------------------------------------------------------------- rounding */

const DEC = Math.pow(10, P6.SHARE_DECIMALS)

/** Every share value in state is a multiple of 0.1. */
export const roundShare = (n: number): number => Math.round(n * DEC) / DEC

/* ------------------------------------------------------------- accessors */

const EMPTY: DistrictShareState = { shares: {} }

export const sharesOf = (s: GameState, districtId: string): Record<string, number> =>
  (s.territory?.[districtId] ?? EMPTY).shares

export const shareOf = (
  s: GameState,
  districtId: string,
  owner: string,
): number => sharesOf(s, districtId)[owner] ?? 0

export const playerShare = (s: GameState, districtId: string): number =>
  shareOf(s, districtId, PLAYER)

/** Combined rival share in a district. Indies and the player are excluded. */
export const rivalTotal = (s: GameState, districtId: string): number =>
  RIVAL_IDS.reduce((t, id) => t + shareOf(s, districtId, id), 0)

/** Whoever holds the most. Ties break toward the player, then rival table
 *  order, then indies — a stable order matters because the map fill reads it. */
export function pluralityOwner(s: GameState, districtId: string): string {
  const shares = sharesOf(s, districtId)
  const order = [PLAYER, ...RIVAL_IDS, INDIES]
  let best = INDIES
  let bestVal = -1
  for (const owner of order) {
    const v = shares[owner] ?? 0
    if (v > bestVal) {
      best = owner
      bestVal = v
    }
  }
  return best
}

/** The rival holding the plurality here, or null when nobody does. */
export function pluralityRival(s: GameState, districtId: string): RivalDef | null {
  const owner = pluralityOwner(s, districtId)
  return RIVALS.find((r) => r.id === owner) ?? null
}

export const hasPresence = (s: GameState, districtId: string): boolean =>
  playerShare(s, districtId) >= P6.THRESH_PRESENCE

export const isDominant = (s: GameState, districtId: string): boolean =>
  playerShare(s, districtId) >= P6.THRESH_DOMINANT

export const isLocked = (s: GameState, districtId: string): boolean =>
  playerShare(s, districtId) >= P6.THRESH_LOCKED

export const dominantDistricts = (s: GameState): string[] =>
  DISTRICT_IDS.filter((id) => isDominant(s, id))

/** True when this district's dominance perk is live. The perk id is unique per
 *  district, so every §9.5 call site is a one-liner. */
export function perkActive(s: GameState, perkId: string): boolean {
  const d = DISTRICTS.find((x) => x.dominantPerk.id === perkId)
  return d ? isDominant(s, d.id) : false
}

/* --------------------------------------------------------- normalization */

/** Rounds every share and forces the district to sum to exactly SHARE_TOTAL by
 *  putting the rounding remainder on indies (or, if indies can't absorb it,
 *  on the largest holder). */
function normalize(shares: Record<string, number>): Record<string, number> {
  const out: Record<string, number> = {}
  for (const k of Object.keys(shares)) out[k] = Math.max(0, roundShare(shares[k]))

  const sum = Object.values(out).reduce((t, v) => t + v, 0)
  let drift = roundShare(P6.SHARE_TOTAL - sum)
  if (drift === 0) return out

  const indies = out[INDIES] ?? 0
  if (indies + drift >= 0) {
    out[INDIES] = roundShare(indies + drift)
    return out
  }

  /* Indies can't absorb a negative remainder; the biggest holder does. */
  out[INDIES] = 0
  drift = roundShare(drift + indies)
  const keys = Object.keys(out).filter((k) => k !== INDIES)
  const largest = keys.reduce((a, b) => (out[a] >= out[b] ? a : b), keys[0])
  if (largest) out[largest] = Math.max(0, roundShare(out[largest] + drift))
  return out
}

function withShares(
  s: GameState,
  districtId: string,
  shares: Record<string, number>,
): GameState {
  return {
    ...s,
    territory: {
      ...s.territory,
      [districtId]: { shares: normalize(shares) },
    },
  }
}

/* ------------------------------------------------------- the one function */

export interface TransferResult {
  state: GameState
  /** May be less than requested when every other owner is floored. */
  moved: number
}

/**
 * Takes `amount` of share for `toOwner` in `district`: drains indies first,
 * then the remainder proportionally from every other owner (never from
 * `toOwner`), flooring each at 0. In a LOCKED district the rivals additionally
 * floor at RIVAL_LOCKED_FLOOR combined, so a locked district stays locked.
 */
export function transferShare(
  s: GameState,
  districtId: string,
  toOwner: string,
  amount: number,
): TransferResult {
  if (!s.territory?.[districtId] || !(amount > 0)) return { state: s, moved: 0 }

  const shares = { ...sharesOf(s, districtId) }
  const want = roundShare(amount)

  /* Rivals cannot be drained past their combined floor once the player has
     locked the district. The floor is on the TOTAL, so it is shared out
     proportionally below. */
  const locked = (shares[PLAYER] ?? 0) >= P6.THRESH_LOCKED
  const rivals = rivalTotalOf(shares)
  const rivalBudget = locked
    ? Math.max(0, roundShare(rivals - P6.RIVAL_LOCKED_FLOOR))
    : rivals

  /* How much each owner is allowed to give up. */
  const capOf = (owner: string): number => {
    if (owner === toOwner) return 0
    const held = shares[owner] ?? 0
    if (owner === INDIES || owner === PLAYER) return held
    /* a rival: its slice of the shared rival budget */
    if (rivals <= 0) return 0
    return Math.min(held, (held / rivals) * rivalBudget)
  }

  let remaining = want
  let moved = 0

  /* 1. indies go first, always. */
  if (toOwner !== INDIES) {
    const take = Math.min(remaining, capOf(INDIES))
    if (take > 0) {
      shares[INDIES] = (shares[INDIES] ?? 0) - take
      remaining -= take
      moved += take
    }
  }

  /* 2. the rest, proportionally from everyone else who can still give. */
  if (remaining > 0) {
    const donors = Object.keys(shares).filter(
      (o) => o !== toOwner && o !== INDIES && capOf(o) > 0,
    )
    const pool = donors.reduce((t, o) => t + capOf(o), 0)
    if (pool > 0) {
      const take = Math.min(remaining, pool)
      for (const o of donors) {
        const give = (capOf(o) / pool) * take
        shares[o] = Math.max(0, (shares[o] ?? 0) - give)
      }
      remaining -= take
      moved += take
    }
  }

  shares[toOwner] = (shares[toOwner] ?? 0) + moved
  return { state: withShares(s, districtId, shares), moved: roundShare(moved) }
}

const rivalTotalOf = (shares: Record<string, number>): number =>
  RIVAL_IDS.reduce((t, id) => t + (shares[id] ?? 0), 0)

/**
 * Moves share the other way: an exact amount out of one named owner and into
 * indies. This is what decay is — the owner who stopped showing up is the one
 * who pays for it.
 */
export function drainShare(
  s: GameState,
  districtId: string,
  fromOwner: string,
  amount: number,
): TransferResult {
  if (!s.territory?.[districtId] || !(amount > 0)) return { state: s, moved: 0 }
  const shares = { ...sharesOf(s, districtId) }
  const moved = roundShare(Math.min(roundShare(amount), shares[fromOwner] ?? 0))
  if (moved <= 0) return { state: s, moved: 0 }
  shares[fromOwner] = (shares[fromOwner] ?? 0) - moved
  shares[INDIES] = (shares[INDIES] ?? 0) + moved
  return { state: withShares(s, districtId, shares), moved }
}

/** Debug tool only: writes a district's shares wholesale, then normalizes so
 *  even a nonsense set of inputs still sums to exactly 100.0. */
export function setShares(
  s: GameState,
  districtId: string,
  shares: Record<string, number>,
): GameState {
  return withShares(s, districtId, { ...sharesOf(s, districtId), ...shares })
}

/** Convenience: transfer and keep only the state. Most call sites want this. */
export const gain = (
  s: GameState,
  districtId: string,
  toOwner: string,
  amount: number,
): GameState => transferShare(s, districtId, toOwner, amount).state

/* ------------------------------------------------------------ starting up */

/** Home district = 18 to its rival; each other focus district = 12. */
export function initialTerritory(): Record<string, DistrictShareState> {
  const out: Record<string, DistrictShareState> = {}
  for (const d of DISTRICTS) {
    const shares: Record<string, number> = { [PLAYER]: 0 }
    let claimed = 0
    for (const r of RIVALS) {
      let v = 0
      if (r.homeDistrict === d.id) v = 18
      else if (r.focusDistricts.includes(d.id)) v = 12
      shares[r.id] = v
      claimed += v
    }
    shares[INDIES] = P6.SHARE_TOTAL - claimed
    out[d.id] = { shares: normalize(shares) }
  }
  return out
}

/** Districts whose propertyTypes include this listing type. Never empty for a
 *  real type — every Phase 3 type is placed somewhere on the map. */
export const districtsForType = (typeId: string): string[] =>
  DISTRICTS.filter((d) => (d.propertyTypes as string[]).includes(typeId)).map(
    (d) => d.id,
  )

/** The price multiplier for a district, defaulting to 1 for an unknown id. */
export const priceMultOf = (districtId: string): number =>
  districtOf(districtId)?.priceMult ?? 1

/* ---------------------------------------------------------- the showdown */

export interface ShowdownTarget {
  districtId: string
  rival: RivalDef
}

/** Where a showdown can happen: a district a rival leads, in which you already
 *  have a real foothold. Of those, the one you are closest to taking. */
export function showdownDistrict(s: GameState): ShowdownTarget | null {
  let best: ShowdownTarget | null = null
  let bestShare = -1
  for (const id of DISTRICT_IDS) {
    const rival = pluralityRival(s, id)
    if (!rival) continue
    const held = playerShare(s, id)
    if (held < 15) continue
    if (held > bestShare) {
      bestShare = held
      best = { districtId: id, rival }
    }
  }
  return best
}

/* ------------------------------------------------- lead district assignment */

/**
 * Where a new lead comes from. Share pulls leads toward the districts you
 * already work; affinity decides who is plausible there at all. An affinity of
 * 0 is absolute — a first-timer never surfaces in Tutela Heights.
 */
export function pickLeadDistrict(s: GameState, archetypeId: string): string {
  const weightOf = (d: (typeof DISTRICTS)[number]): number => {
    const affinity = d.leadAffinity[archetypeId] ?? 1
    if (affinity <= 0) return 0
    return (P6.LEAD_DISTRICT_BASE_WEIGHT + playerShare(s, d.id)) * affinity
  }
  const hit = weightedPick(DISTRICTS, weightOf)
  if (hit) return hit.id
  /* Every archetype has at least one district that will have them. If content
     ever says otherwise, a lead still needs somewhere to live. */
  return DISTRICTS[0].id
}

/** The `luxPipeline` perk doubles the estate crowd's odds everywhere. With the
 *  perk asleep every archetype weighs the same, which is exactly the uniform
 *  pick this replaced. */
export const LUX_ARCHETYPES = ['luxLorenzo', 'celebrityCleo']

export function archetypeWeight(s: GameState, archetypeId: string): number {
  return perkActive(s, 'luxPipeline') && LUX_ARCHETYPES.includes(archetypeId)
    ? 2
    : 1
}
