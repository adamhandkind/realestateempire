/* One Land Grab party room, as the server runs it: the game, who holds which
   seat, and every open socket (the TV, the phones, anyone watching). The
   Durable Object (partyObject.ts) is a thin shell around this; a Durable
   Object never runs two calls at once, so nothing here can race.

   Storage:
     room   Stored (below). Tokens are kept only as SHA-256 hashes.

   PartyRoom is the game and the seats. PartyHub is the sockets: it reads
   each one's first message (a token), works out who it is, and after any
   change sends every socket its own view. Both are kept apart from the
   Cloudflare runtime so the tests can drive them in Node. */

import { runBots } from '../src/board/bot'
import { addBot, applyMove, leave, newTable, parseMove, sit, start, viewFor, type Result } from '../src/board/rules'
import type { BoardState } from '../src/board/types'
import {
  PARTY_COLORS,
  ROOM_TTL_MS,
  cleanName,
  parseClientMsg,
  type Aim,
  type PartyOp,
  type PartyView,
  type Peek,
  type ServerMsg,
} from '../src/party/protocol'
import { hashToken, randomToken } from './crypto'
import { RoomError } from './room'

export interface PartyStorage {
  get<T>(key: string): Promise<T | undefined>
  put(key: string, value: unknown): Promise<void>
  deleteAll(): Promise<void>
  setAlarm(at: number): Promise<void>
}

interface Stored {
  code: string
  createdAt: number
  lastActive: number
  /** The signed-in account that opened the room. */
  hostUserId: string
  tvHash: string
  /** seat id → token hash, for the people (bots have none). */
  seats: Record<string, string>
  /** Seat ids in the order they joined; the first is the host seat. */
  joinOrder: string[]
  state: BoardState
  rev: number
}

/** Who a socket turned out to be. */
export type Who = { role: 'tv' } | { role: 'seat'; seatId: string } | { role: 'watch' }

/** Who an op came from, and what happened to anyone it threw out. */
export interface OpResult {
  /** Seats that no longer exist: their sockets get a goodbye. */
  gone: { seatId: string; reason: 'kicked' | 'left' }[]
  /** Nothing anyone can see changed: no need to send views. */
  quiet?: boolean
}

export class PartyRoom {
  private storage: PartyStorage
  private now: () => number
  private cache: Stored | null | undefined = undefined
  /** The ghost piece. Kept in memory only: if the object sleeps it's lost,
   *  which just means the TV stops showing it. */
  private aim: (Aim & { seat: number; rev: number }) | null = null

  constructor(storage: PartyStorage, now: () => number = Date.now) {
    this.storage = storage
    this.now = now
  }

  private async load(): Promise<Stored | null> {
    if (this.cache === undefined) {
      const s = (await this.storage.get<Stored>('room')) ?? null
      this.cache = s && s.lastActive + ROOM_TTL_MS > this.now() ? s : null
    }
    return this.cache
  }

  private async must(): Promise<Stored> {
    const s = await this.load()
    if (!s) throw new RoomError(404, 'no_room', 'That room doesn’t exist, or it has closed.')
    return s
  }

  private async save(s: Stored): Promise<void> {
    s.lastActive = this.now()
    this.cache = s
    await this.storage.put('room', s)
    await this.storage.setAlarm(s.lastActive + ROOM_TTL_MS)
  }

  /** The TV opens the room. Refused if the code is already in use. */
  async create(code: string, hostUserId: string): Promise<{ code: string; tvToken: string }> {
    if (await this.load()) throw new RoomError(409, 'code_taken', 'That code is in use.')
    const tvToken = randomToken()
    const seed = crypto.getRandomValues(new Uint32Array(1))[0]
    await this.save({
      code,
      createdAt: this.now(),
      lastActive: this.now(),
      hostUserId,
      tvHash: await hashToken(tvToken),
      seats: {},
      joinOrder: [],
      state: newTable(seed, hostUserId),
      rev: 1,
    })
    return { code, tvToken }
  }

  async peek(): Promise<Peek> {
    const s = await this.load()
    if (!s) return { ok: false, error: 'no_room', message: 'No room with that code. Check the TV.' }
    return {
      ok: true,
      code: s.code,
      status: s.state.status,
      seats: s.state.seats.map((x) => ({ name: x.name, color: x.color })),
      full: s.state.seats.length >= 4,
    }
  }

  /** A phone takes a seat. */
  async join(rawName: unknown, color: unknown): Promise<{ seatId: string; token: string }> {
    const s = await this.must()
    const name = cleanName(rawName)
    if (!name) throw new RoomError(400, 'bad_name', 'Type a name first.')
    if (typeof color !== 'string' || !PARTY_COLORS.some((c) => c.hex === color)) throw new RoomError(400, 'bad_color', 'Pick a colour.')
    if (s.state.status !== 'lobby') throw new RoomError(409, 'started', 'This game has already started.')
    if (s.state.seats.some((x) => x.color === color)) throw new RoomError(409, 'color_taken', 'Someone just took that colour. Pick another.')
    if (s.state.seats.some((x) => x.name.toLowerCase() === name.toLowerCase())) throw new RoomError(409, 'name_taken', 'Someone here already has that name.')
    const seatId = 'g:' + randomToken(9)
    const r = sit(s.state, seatId, name, color)
    if (!r.ok) throw new RoomError(409, 'full', r.error)
    const token = randomToken()
    s.seats[seatId] = await hashToken(token)
    s.joinOrder.push(seatId)
    s.state = r.state
    s.rev++
    await this.save(s)
    return { seatId, token }
  }

  /** Who holds this token: the TV, a seat, or nobody. */
  async whoIs(token: string): Promise<Who | null> {
    const s = await this.load()
    if (!s) return null
    const h = await hashToken(token)
    if (h === s.tvHash) return { role: 'tv' }
    const seatId = Object.keys(s.seats).find((id) => s.seats[id] === h)
    return seatId ? { role: 'seat', seatId } : null
  }

  private hostSeat(s: Stored): string | null {
    return s.joinOrder.find((id) => s.state.seats.some((x) => x.id === id)) ?? null
  }

  async op(who: Who, o: PartyOp): Promise<OpResult> {
    const s = await this.must()
    const gone: OpResult['gone'] = []
    if (o.op === 'aim') {
      /* Only the player whose turn it is, and it changes nothing stored. */
      const seat = who.role === 'seat' ? s.state.seats.findIndex((x) => x.id === who.seatId) : -1
      if (s.state.status !== 'playing' || seat < 0 || seat !== s.state.turn) return { gone, quiet: true }
      const before = JSON.stringify(this.aim)
      this.aim = o.aim ? { ...o.aim, seat, rev: s.rev } : null
      return { gone, quiet: before === JSON.stringify(this.aim) }
    }
    this.aim = null
    const runsLobby = who.role === 'tv' || (who.role === 'seat' && this.hostSeat(s) === who.seatId)
    const lobbyOnly = () => {
      if (!runsLobby) throw new RoomError(403, 'not_host', 'Only the TV or the host can do that.')
    }
    let r: Result
    switch (o.op) {
      case 'addBot':
        lobbyOnly()
        r = addBot(s.state)
        break
      case 'removeBot': {
        lobbyOnly()
        if (!s.state.seats.find((x) => x.id === o.seatId)?.bot) throw new RoomError(400, 'not_a_bot', 'That seat isn’t a bot.')
        r = leave(s.state, o.seatId)
        break
      }
      case 'kick': {
        lobbyOnly()
        if (!s.seats[o.seatId]) throw new RoomError(400, 'no_seat', 'Nobody is in that seat.')
        if (s.state.status !== 'lobby') throw new RoomError(409, 'started', 'The game has started.')
        r = leave(s.state, o.seatId)
        if (r.ok) gone.push({ seatId: o.seatId, reason: 'kicked' })
        break
      }
      case 'leave': {
        if (who.role !== 'seat') throw new RoomError(400, 'no_seat', 'You’re not in a seat.')
        r = leave(s.state, who.seatId)
        if (r.ok) gone.push({ seatId: who.seatId, reason: 'left' })
        break
      }
      case 'start':
        lobbyOnly()
        r = start(s.state)
        break
      case 'move': {
        if (who.role !== 'seat') throw new RoomError(403, 'no_seat', 'Only players move.')
        if (o.rev !== s.rev) throw new RoomError(409, 'stale', 'The board moved on. Try that again.')
        const move = parseMove(o.move)
        if (!move) throw new RoomError(400, 'bad_move', 'That move doesn’t make sense.')
        const seat = s.state.seats.findIndex((x) => x.id === who.seatId)
        r = applyMove(s.state, seat, move)
        break
      }
    }
    if (!r.ok) throw new RoomError(400, 'not_allowed', r.error)
    for (const g of gone) {
      delete s.seats[g.seatId]
      s.joinOrder = s.joinOrder.filter((id) => id !== g.seatId)
    }
    s.state = runBots(r.state)
    s.rev++
    await this.save(s)
    return { gone }
  }

  async view(who: Who, online: Set<string>): Promise<PartyView | null> {
    const s = await this.load()
    if (!s) return null
    const seatId = who.role === 'seat' ? who.seatId : null
    return {
      code: s.code,
      role: who.role,
      seatId,
      hostSeat: this.hostSeat(s),
      /* A ghost from before the board last moved is stale. */
      aim: this.aim && this.aim.rev === s.rev ? { kind: this.aim.kind, i: this.aim.i, piece: this.aim.piece, seat: this.aim.seat } : null,
      online: Object.fromEntries(s.state.seats.filter((x) => !x.bot).map((x) => [x.id, online.has(x.id)])),
      board: viewFor(s.state, seatId ?? '', s.rev),
    }
  }

  /** The alarm: clears the room if it has gone quiet. True if it's gone. */
  async expire(): Promise<boolean> {
    const s = (await this.storage.get<Stored>('room')) ?? null
    if (s && s.lastActive + ROOM_TTL_MS > this.now()) {
      await this.storage.setAlarm(s.lastActive + ROOM_TTL_MS)
      return false
    }
    this.cache = null
    await this.storage.deleteAll()
    return true
  }
}

/* ---------------------------------------------------------------- sockets */

export interface PartySocket {
  send(text: string): void
  close(code?: number, reason?: string): void
  deserializeAttachment(): unknown
  serializeAttachment(v: unknown): void
}

/** What a socket remembers about itself (survives the object sleeping).
 *  `who` is null until its first message says who it is. */
interface Attachment {
  who: Who | null
}

export class PartyHub {
  private room: PartyRoom
  private sockets: () => PartySocket[]

  constructor(room: PartyRoom, sockets: () => PartySocket[]) {
    this.room = room
    this.sockets = sockets
  }

  private who(ws: PartySocket): Who | null {
    const a = ws.deserializeAttachment() as Attachment | null
    return a?.who ?? null
  }

  private send(ws: PartySocket, m: ServerMsg) {
    try {
      ws.send(JSON.stringify(m))
    } catch {
      /* closing; the close handler tidies up */
    }
  }

  open(ws: PartySocket) {
    ws.serializeAttachment({ who: null } satisfies Attachment)
  }

  /** Seats with a phone connected, leaving out a socket that's closing. */
  private online(except?: PartySocket): Set<string> {
    const out = new Set<string>()
    for (const ws of this.sockets()) {
      if (ws === except) continue
      const w = this.who(ws)
      if (w?.role === 'seat') out.add(w.seatId)
    }
    return out
  }

  /** Sends every identified socket its own view. */
  async broadcast(except?: PartySocket) {
    const online = this.online(except)
    for (const ws of this.sockets()) {
      if (ws === except) continue
      const w = this.who(ws)
      if (!w) continue
      const view = await this.room.view(w, online)
      if (view) this.send(ws, { t: 'state', view })
    }
  }

  async message(ws: PartySocket, raw: unknown) {
    const m = parseClientMsg(raw)
    if (!m) return this.send(ws, { t: 'error', code: 'bad_message', message: 'The server didn’t understand that.' })
    if (m.t === 'ping') return this.send(ws, { t: 'pong' })
    if (m.t === 'auth') {
      /* An empty token watches; anything else must match a seat or the TV. */
      const who: Who | null = m.token === '' ? { role: 'watch' } : await this.room.whoIs(m.token)
      if (!who) {
        this.send(ws, { t: 'bye', reason: 'bad_token' })
        return ws.close(4001, 'bad token')
      }
      if (!(await this.room.view(who, new Set()))) {
        this.send(ws, { t: 'bye', reason: 'closed' })
        return ws.close(4004, 'no room')
      }
      ws.serializeAttachment({ who } satisfies Attachment)
      /* Everyone's "online" dots change when a phone arrives. */
      return this.broadcast()
    }
    const who = this.who(ws)
    if (!who) return this.send(ws, { t: 'error', code: 'no_auth', message: 'Say who you are first.' })
    try {
      const r = await this.room.op(who, m.op)
      if (r.quiet) return
      for (const g of r.gone)
        for (const other of this.sockets()) {
          const w = this.who(other)
          if (w?.role === 'seat' && w.seatId === g.seatId) {
            this.send(other, { t: 'bye', reason: g.reason })
            other.serializeAttachment({ who: null } satisfies Attachment)
            other.close(4000, g.reason)
          }
        }
      await this.broadcast()
    } catch (e) {
      if (!(e instanceof RoomError)) throw e
      this.send(ws, { t: 'error', code: e.code, message: e.message })
      /* A stale move: send the board as it is now. */
      if (e.code === 'stale') {
        const view = await this.room.view(who, this.online())
        if (view) this.send(ws, { t: 'state', view })
      }
    }
  }

  /** A socket closed: the others' "online" dots may change. */
  async close(ws: PartySocket) {
    if (this.who(ws)?.role === 'seat') await this.broadcast(ws)
  }

  /** The room expired: tell everyone and hang up. */
  closeAll() {
    for (const ws of this.sockets()) {
      this.send(ws, { t: 'bye', reason: 'closed' })
      try {
        ws.close(4004, 'closed')
      } catch {
        /* already gone */
      }
    }
  }
}
