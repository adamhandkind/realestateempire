/* Land Grab party mode: one TV, everyone's phone. What the TV, the phones and
   the room's server say to each other. Shared by the browser and the Worker,
   so it holds types, constants and pure checks only.

   A room is named by a 4-letter code. The TV creates it (the host must be
   signed in) and gets a TV token; each phone joins with a name and colour
   and gets a seat token. Tokens go up the WebSocket as the first message,
   never in a URL. After that, every change to the room sends each socket
   its own view: the TV sees the public board, a phone sees its own hand. */

import type { BoardView, Move } from '../board/types'

/** No I or O, so nothing reads as a 1 or a 0 from across the room. */
export const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ'
export const CODE_LENGTH = 4

export function normalizeCode(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const c = raw.trim().toUpperCase()
  if (c.length !== CODE_LENGTH) return null
  for (const ch of c) if (!CODE_ALPHABET.includes(ch)) return null
  return c
}

export const NAME_MAX = 16

/** Tidies a name from a phone: trimmed, single-spaced, at most 16 characters. */
export function cleanName(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const printable = [...raw].filter((ch) => ch.charCodeAt(0) >= 32 && ch.charCodeAt(0) !== 127).join('')
  const n = printable.trim().replace(/\s+/g, ' ').slice(0, NAME_MAX)
  return n.length >= 1 ? n : null
}

/** The colours a player can pick. Bots wear the rivals' colours, which
 *  aren't on this list, so a person and a bot never match. */
export const PARTY_COLORS: { hex: string; name: string }[] = [
  { hex: '#e8573f', name: 'Coral' },
  { hex: '#e0b100', name: 'Gold' },
  { hex: '#7bc142', name: 'Lime' },
  { hex: '#1fa6a0', name: 'Teal' },
  { hex: '#3d8fe0', name: 'Blue' },
  { hex: '#8a5cf0', name: 'Violet' },
  { hex: '#e04aa8', name: 'Magenta' },
  { hex: '#f08a24', name: 'Orange' },
]

/** A room nobody has touched for this long is cleared away. */
export const ROOM_TTL_MS = 12 * 60 * 60_000

export type Role = 'tv' | 'seat' | 'watch'

/** Where the player whose turn it is has their finger: the TV draws a ghost
 *  of the piece there so the room can heckle before they confirm. */
export interface Aim {
  kind: 'vertex' | 'edge' | 'tile'
  i: number
  /** What would go there. */
  piece: 'house' | 'duplex' | 'tower' | 'street' | 'crash'
}

const AIM_PIECES: Aim['piece'][] = ['house', 'duplex', 'tower', 'street', 'crash']
const AIM_LIMIT: Record<Aim['kind'], number> = { vertex: 54, edge: 72, tile: 19 }

export function parseAim(raw: unknown): Aim | null {
  if (typeof raw !== 'object' || raw === null) return null
  const a = raw as Record<string, unknown>
  if (a.kind !== 'vertex' && a.kind !== 'edge' && a.kind !== 'tile') return null
  if (typeof a.i !== 'number' || !Number.isInteger(a.i) || a.i < 0 || a.i >= AIM_LIMIT[a.kind]) return null
  if (!AIM_PIECES.includes(a.piece as Aim['piece'])) return null
  return { kind: a.kind, i: a.i, piece: a.piece as Aim['piece'] }
}

export interface PartyView {
  code: string
  role: Role
  /** Your seat id, on a phone that has one. */
  seatId: string | null
  /** The seat that can run the lobby from their phone (the first person to
   *  join who's still here). The TV can always run it too. */
  hostSeat: string | null
  /** Seat id → a phone is connected right now. */
  online: Record<string, boolean>
  /** The ghost piece of whoever's turn it is, if they're choosing a spot. */
  aim: (Aim & { seat: number }) | null
  board: BoardView
}

export type PartyOp =
  | { op: 'addBot' }
  | { op: 'removeBot'; seatId: string }
  | { op: 'kick'; seatId: string }
  | { op: 'leave' }
  | { op: 'start' }
  | { op: 'move'; move: Move; rev: number }
  /** The player whose turn it is is looking at a spot (null: stopped). */
  | { op: 'aim'; aim: Aim | null }

export type ClientMsg = { t: 'auth'; token: string } | { t: 'ping' } | { t: 'op'; op: PartyOp }

export type ServerMsg =
  | { t: 'state'; view: PartyView }
  | { t: 'error'; code: string; message: string }
  | { t: 'pong' }
  /** You're done here: kicked, left, or the room closed. */
  | { t: 'bye'; reason: 'kicked' | 'left' | 'closed' | 'bad_token' }

/** What the join screen can see before you're in. */
export type Peek =
  | { ok: true; code: string; status: BoardView['status']; seats: { name: string; color: string }[]; full: boolean }
  | { ok: false; error: string; message: string }

export function parseClientMsg(raw: unknown): ClientMsg | null {
  let m: unknown = raw
  if (typeof raw === 'string') {
    if (raw.length > 8192) return null
    try {
      m = JSON.parse(raw)
    } catch {
      return null
    }
  }
  if (typeof m !== 'object' || m === null) return null
  const o = m as Record<string, unknown>
  if (o.t === 'ping') return { t: 'ping' }
  if (o.t === 'auth') return typeof o.token === 'string' && o.token.length <= 200 ? { t: 'auth', token: o.token } : null
  if (o.t !== 'op' || typeof o.op !== 'object' || o.op === null) return null
  const op = o.op as Record<string, unknown>
  switch (op.op) {
    case 'addBot':
    case 'leave':
    case 'start':
      return { t: 'op', op: { op: op.op } }
    case 'removeBot':
    case 'kick':
      return typeof op.seatId === 'string' ? { t: 'op', op: { op: op.op, seatId: op.seatId } } : null
    case 'aim':
      if (op.aim === null) return { t: 'op', op: { op: 'aim', aim: null } }
      {
        const aim = parseAim(op.aim)
        return aim ? { t: 'op', op: { op: 'aim', aim } } : null
      }
    case 'move':
      /* The move itself is checked by the rules' parseMove on the server. */
      return typeof op.rev === 'number' ? { t: 'op', op: { op: 'move', move: op.move as Move, rev: op.rev } } : null
    default:
      return null
  }
}
