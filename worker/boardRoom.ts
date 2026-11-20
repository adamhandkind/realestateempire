/* A city's Land Grab table, as the server runs it. One table per city at a
   time; the Durable Object (boardObject.ts) is a thin shell around this, and
   a Durable Object never runs two calls at once, so moves can't race.

   Storage:
     table   { state: BoardState, rev }   rev bumps on every change

   Every move is played here. Bots (and anyone on autopilot) move straight
   after whatever woke them, so the table is always waiting on a human. */

import { runBots } from '../src/board/bot'
import { addBot, applyMove, leave, newTable, parseMove, setAutopilot, sit, start, viewFor, type Result } from '../src/board/rules'
import type { BoardState, BoardView } from '../src/board/types'
import { RoomError } from './room'

export interface BoardStorage {
  get<T>(key: string): Promise<T | undefined>
  put(key: string, value: unknown): Promise<void>
}

interface Stored {
  state: BoardState
  rev: number
}

/** Who's asking, as the Worker found them in D1. */
export interface Player {
  userId: string
  name: string
  color: string
  isOwner: boolean
}

export type BoardOp =
  | { op: 'open' }
  | { op: 'sit' }
  | { op: 'leave' }
  | { op: 'addBot' }
  | { op: 'removeBot'; seatId: string }
  | { op: 'start' }
  | { op: 'autopilot'; on: boolean; seatId?: string }
  | { op: 'move'; move: unknown; rev: number }

export function parseOp(raw: Record<string, unknown>): BoardOp | null {
  switch (raw.op) {
    case 'open':
    case 'sit':
    case 'leave':
    case 'addBot':
    case 'start':
      return { op: raw.op }
    case 'removeBot':
      return typeof raw.seatId === 'string' ? { op: 'removeBot', seatId: raw.seatId } : null
    case 'autopilot':
      if (typeof raw.on !== 'boolean') return null
      return typeof raw.seatId === 'string' ? { op: 'autopilot', on: raw.on, seatId: raw.seatId } : { op: 'autopilot', on: raw.on }
    case 'move':
      return typeof raw.rev === 'number' ? { op: 'move', move: raw.move, rev: raw.rev } : null
    default:
      return null
  }
}

export class BoardRoom {
  private storage: BoardStorage

  constructor(storage: BoardStorage) {
    this.storage = storage
  }

  private async load(): Promise<Stored | undefined> {
    return this.storage.get<Stored>('table')
  }

  private async save(state: BoardState, rev: number): Promise<Stored> {
    const s = { state: runBots(state), rev }
    await this.storage.put('table', s)
    return s
  }

  /** The table as this person sees it, or null when nobody has opened one. */
  async view(userId: string): Promise<BoardView | null> {
    const t = await this.load()
    return t ? viewFor(t.state, userId, t.rev) : null
  }

  async op(p: Player, o: BoardOp): Promise<BoardView> {
    const t = await this.load()
    if (o.op === 'open') {
      if (t && t.state.status !== 'over') throw new RoomError(409, 'table_open', 'There’s already a game at this table.')
      const seed = crypto.getRandomValues(new Uint32Array(1))[0]
      const fresh = sit(newTable(seed, p.userId), p.userId, p.name, p.color)
      const saved = await this.save(must(fresh), (t?.rev ?? 0) + 1)
      return viewFor(saved.state, p.userId, saved.rev)
    }
    if (!t) throw new RoomError(404, 'no_table', 'Nobody has opened a Land Grab table yet.')
    const s = t.state
    const seated = s.seats.findIndex((x) => x.id === p.userId)
    /* Running the lobby: anyone sitting at the table, or the city owner. */
    const canRun = seated >= 0 || p.isOwner
    let r: Result
    switch (o.op) {
      case 'sit':
        r = sit(s, p.userId, p.name, p.color)
        break
      case 'leave':
        r = leave(s, p.userId)
        break
      case 'addBot':
        if (!canRun) throw new RoomError(403, 'not_seated', 'Sit down first.')
        r = addBot(s)
        break
      case 'removeBot': {
        if (!canRun) throw new RoomError(403, 'not_seated', 'Sit down first.')
        const seat = s.seats.find((x) => x.id === o.seatId)
        if (!seat?.bot) throw new RoomError(400, 'not_a_bot', 'That seat isn’t a bot.')
        r = leave(s, o.seatId)
        break
      }
      case 'start':
        if (!canRun) throw new RoomError(403, 'not_seated', 'Sit down first.')
        r = start(s)
        break
      case 'autopilot': {
        const target = o.seatId ?? p.userId
        /* Your own seat any time; someone else's only as the city owner
           (for a friend who went to bed mid-game). */
        if (target !== p.userId && !p.isOwner) throw new RoomError(403, 'owner_only', 'Only the city owner can hand someone else’s seat to the bot.')
        r = setAutopilot(s, target, o.on)
        break
      }
      case 'move': {
        if (seated < 0) throw new RoomError(403, 'not_seated', 'You’re watching this one.')
        if (o.rev !== t.rev) throw new RoomError(409, 'stale', 'The board moved on. Here’s where it is now.')
        const move = parseMove(o.move)
        if (!move) throw new RoomError(400, 'bad_move', 'That move doesn’t make sense.')
        r = applyMove(s, seated, move)
        break
      }
    }
    if (!r.ok) throw new RoomError(400, 'not_allowed', r.error)
    if (r.state === s) return viewFor(s, p.userId, t.rev)
    const saved = await this.save(r.state, t.rev + 1)
    return viewFor(saved.state, p.userId, saved.rev)
  }
}

function must(r: Result): BoardState {
  if (!r.ok) throw new RoomError(400, 'not_allowed', r.error)
  return r.state
}
