/* Who and what is on each lot, read straight from the GameState.

   In single player the rules still think in districts, listings and
   properties, not lots, so this maps them onto lots deterministically:
   - every Listing in the market pool and every Property you own gets a lot in
     its own district, chosen by hashing its id (stable across renders and
     reloads; only a direct collision ever moves anything). A property you
     bought keeps the lot its listing stood on;
   - rival territory share becomes rival-flagged lots, in proportion;
   - the rest of the district is built up by independents, with a few empty
     lots left over.
   Phase 3 makes lots first-class in the server's state; until then this is the
   one place that decides it. */

import { districtOrFirst } from '../data/districts'
import { RIVALS } from '../data/rivals'
import type {
  GameState,
  Lead,
  Listing,
  Property,
  PropertyTypeId,
} from '../state/types'
import { hash, unit } from './hash'
import type { CityLayout, Lot } from './layout'

export type LotUse =
  | { kind: 'listing'; listing: Listing }
  | { kind: 'owned'; property: Property }
  | { kind: 'rival'; rivalId: string; typeId: PropertyTypeId }
  | { kind: 'independent'; typeId: PropertyTypeId }
  | { kind: 'empty' }
  | { kind: 'camp'; campers?: Camper[] }
  /** Another player's building in a shared city. */
  | {
      kind: 'player'
      userId: string
      name: string
      color: string
      typeId: PropertyTypeId
      nickname: string
      condition: number
    }

/** Who pitched a tent here (shared city). */
export interface Camper {
  userId: string
  name: string
  color: string
}

/** The shared city's other players, as the map needs them. Everyone's
 *  buildings are placed in one fixed order (by player, then building), so
 *  every browser in the city draws the same street. */
export interface SharedMap {
  me: string
  players: {
    userId: string
    name: string
    color: string
    buildings: {
      id: string
      typeId: PropertyTypeId
      districtId: string
      fromListingId?: string
      nickname: string
      condition: number
    }[]
  }[]
}

/** Of the lots left after listings and yours, how many rival share can claim.
 *  Under 1 so a 100% rival district still has some independents and gaps. */
const RIVAL_FILL = 0.55
const EMPTY_CHANCE = 0.12

/** The district's own property mix decides what the background looks like. */
function backdropType(lot: Lot): PropertyTypeId {
  const types = districtOrFirst(lot.districtId).propertyTypes
  return types[hash('type:' + lot.id) % types.length]
}

/** Lot preference order for an entity: its own hash-shuffle of the district. */
function claim(pool: Lot[], taken: Set<string>, key: string): Lot | undefined {
  const free = pool.filter((l) => !l.camp && !taken.has(l.id))
  let best: Lot | undefined
  let bestH = Infinity
  for (const l of free) {
    const h = hash(key + '@' + l.id)
    if (h < bestH) {
      bestH = h
      best = l
    }
  }
  return best
}

/** Just the parts of the state that show on the map. */
export type MapState = Pick<
  GameState,
  'properties' | 'marketPool' | 'territory'
>

export function lotUses(
  state: MapState,
  city: CityLayout,
  shared?: SharedMap,
): Map<string, LotUse> {
  const uses = new Map<string, LotUse>()
  const taken = new Set<string>()
  const poolOf = (districtId: string) =>
    city.lotsByDistrict.get(districtId)?.length
      ? city.lotsByDistrict.get(districtId)!
      : city.lots

  for (const l of city.lots) if (l.camp) uses.set(l.id, { kind: 'camp' })

  if (shared) {
    /* Everyone starts under a bridge: one camp each, by the same hash. */
    const camps = city.lots.filter((l) => l.camp)
    const players = [...shared.players].sort((a, b) => a.userId.localeCompare(b.userId))
    for (const pl of players) {
      const lot = [...camps].sort((a, b) => hash('camp:' + pl.userId + a.id) - hash('camp:' + pl.userId + b.id))[0]
      if (!lot) break
      const u = uses.get(lot.id)
      const campers = u?.kind === 'camp' ? (u.campers ?? []) : []
      uses.set(lot.id, { kind: 'camp', campers: [...campers, { userId: pl.userId, name: pl.name, color: pl.color }] })
    }
    /* Everyone's buildings, in one order. Yours are drawn from your own
       game (full detail); everyone else's from the city. */
    for (const pl of players) {
      const mine = pl.userId === shared.me
      const list = mine
        ? [...state.properties].filter((p) => !p.isVrbo).sort((a, b) => a.id.localeCompare(b.id))
        : [...pl.buildings].sort((a, b) => a.id.localeCompare(b.id))
      for (const b of list) {
        const key = b.fromListingId ? 'listing:' + b.fromListingId : 'prop:' + pl.userId + ':' + b.id
        const lot = claim(poolOf(b.districtId), taken, key)
        if (!lot) continue
        taken.add(lot.id)
        if (mine) uses.set(lot.id, { kind: 'owned', property: b as Property })
        else
          uses.set(lot.id, {
            kind: 'player',
            userId: pl.userId,
            name: pl.name,
            color: pl.color,
            typeId: b.typeId,
            nickname: b.nickname,
            condition: b.condition,
          })
      }
    }
  }

  /* Yours first, so a new listing can never bump a house you already own. */
  const owned = shared ? [] : [...state.properties].sort((a, b) => a.id.localeCompare(b.id))
  for (const p of owned) {
    /* Same key as the listing it was bought as → the same lot it stood on. */
    const key = p.fromListingId ? 'listing:' + p.fromListingId : 'prop:' + p.id
    const lot = claim(poolOf(p.districtId), taken, key)
    if (!lot) continue
    taken.add(lot.id)
    uses.set(lot.id, { kind: 'owned', property: p })
  }
  const listings = [...state.marketPool].sort((a, b) =>
    a.id.localeCompare(b.id),
  )
  for (const l of listings) {
    const lot = claim(poolOf(l.districtId), taken, 'listing:' + l.id)
    if (!lot) continue
    taken.add(lot.id)
    uses.set(lot.id, { kind: 'listing', listing: l })
  }

  for (const [districtId, lots] of city.lotsByDistrict) {
    const free = lots.filter((l) => !l.camp && !taken.has(l.id))
    const shares = state.territory?.[districtId]?.shares ?? {}
    const remaining = new Set(free.map((l) => l.id))
    for (const r of RIVALS) {
      const want = Math.floor(
        ((shares[r.id] ?? 0) / 100) * free.length * RIVAL_FILL,
      )
      const ranked = free
        .filter((l) => remaining.has(l.id))
        .sort((a, b) => hash(r.id + a.id) - hash(r.id + b.id))
        .slice(0, want)
      for (const l of ranked) {
        remaining.delete(l.id)
        uses.set(l.id, {
          kind: 'rival',
          rivalId: r.id,
          typeId: backdropType(l),
        })
      }
    }
    for (const l of free) {
      if (!remaining.has(l.id)) continue
      uses.set(
        l.id,
        unit('empty:' + l.id) < EMPTY_CHANCE
          ? { kind: 'empty' }
          : { kind: 'independent', typeId: backdropType(l) },
      )
    }
  }
  return uses
}

/** Each client in your pipeline is pictured at the house they're touring: an
 *  independent home in their district. Same hashing, so they don't wander. */
export function leadLots(
  leads: Lead[],
  uses: Map<string, LotUse>,
  city: CityLayout,
): Map<string, Lead> {
  const out = new Map<string, Lead>()
  const taken = new Set<string>()
  for (const lead of [...leads].sort((a, b) => a.id.localeCompare(b.id))) {
    const homes = (
      city.lotsByDistrict.get(lead.districtId) ?? city.lots
    ).filter((l) => uses.get(l.id)?.kind === 'independent')
    const lot = claim(homes, taken, 'lead:' + lead.id)
    if (!lot) continue
    taken.add(lot.id)
    out.set(lot.id, lead)
  }
  return out
}

/** Where a given property or listing ended up — for "show me on the map". */
export function lotOfEntity(
  uses: Map<string, LotUse>,
  entityId: string,
): string | null {
  for (const [lotId, u] of uses) {
    if (u.kind === 'owned' && u.property.id === entityId) return lotId
    if (u.kind === 'listing' && u.listing.id === entityId) return lotId
  }
  return null
}
