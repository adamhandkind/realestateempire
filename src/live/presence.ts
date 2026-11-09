/* Live agents on the map: the little protocol the city's Durable Object and
   every open browser speak over a WebSocket. Shared by both ends, pure.

   A browser says where its agent is walking (from a tile, to a tile). The
   city stamps it with who sent it and when, and tells everyone else. Nothing
   here is game state: an agent's position is decoration, never a move. */

import { COLS, ROWS } from '../city/layout'

export type Tile = [col: number, row: number]

export interface LiveAgent {
  userId: string
  name: string
  color: string
  characterId: string
  /** Last season's champion walks in the kit. */
  champion: boolean
  from: Tile
  to: Tile
  /** When they set off (server clock, ms). */
  at: number
}

export type ClientMessage = { t: 'go'; from: Tile; to: Tile } | { t: 'ping' }

export type ServerMessage =
  | { t: 'hello'; you: string; agents: LiveAgent[]; now: number }
  | { t: 'agent'; agent: LiveAgent }
  | { t: 'left'; userId: string }
  /** The overnight tick ran: fetch the new week. */
  | { t: 'tick' }
  /** Something on the board changed (an offer went in). */
  | { t: 'city' }
  | { t: 'pong' }

const isTile = (v: unknown): v is Tile =>
  Array.isArray(v) &&
  v.length === 2 &&
  Number.isInteger(v[0]) &&
  Number.isInteger(v[1]) &&
  v[0] >= 0 &&
  v[0] < COLS &&
  v[1] >= 0 &&
  v[1] < ROWS

/** Anything a browser sends goes through here; junk comes back null. */
export function parseClientMessage(raw: unknown): ClientMessage | null {
  if (typeof raw !== 'string' || raw.length > 200) return null
  let m: unknown
  try {
    m = JSON.parse(raw)
  } catch {
    return null
  }
  if (!m || typeof m !== 'object') return null
  const o = m as Record<string, unknown>
  if (o.t === 'ping') return { t: 'ping' }
  if (o.t === 'go' && isTile(o.from) && isTile(o.to)) return { t: 'go', from: [o.from[0], o.from[1]], to: [o.to[0], o.to[1]] }
  return null
}

export function parseServerMessage(raw: unknown): ServerMessage | null {
  if (typeof raw !== 'string') return null
  try {
    const m = JSON.parse(raw) as ServerMessage
    return m && typeof m === 'object' && typeof m.t === 'string' ? m : null
  } catch {
    return null
  }
}

/** One entry per person: someone with two tabs open is one agent, the one
 *  that moved last. */
export function dedupe(agents: LiveAgent[]): LiveAgent[] {
  const by = new Map<string, LiveAgent>()
  for (const a of agents) {
    const was = by.get(a.userId)
    if (!was || a.at >= was.at) by.set(a.userId, a)
  }
  return [...by.values()].sort((a, b) => a.userId.localeCompare(b.userId))
}

/** A browser may say where it's going at most this often. */
export const MIN_GO_MS = 250
