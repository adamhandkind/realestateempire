/* The party room and its sockets, driven in Node with fake WebSockets. */

import { describe, expect, it } from 'vitest'
import type { PartyView, ServerMsg } from '../../src/party/protocol'
import { AWAY_MS, BOT_STEP_MS, ROOM_TTL_MS, SETUP_MS } from '../../src/party/protocol'
import { botMove } from '../../src/board/bot'
import { legalHouses } from '../../src/board/rules'
import type { BoardState } from '../../src/board/types'
import { PartyHub, PartyRoom, type PartySocket } from '../partyRoom'
import { memoryStorage } from './fakeCity'

class FakeSocket implements PartySocket {
  att: unknown = null
  inbox: ServerMsg[] = []
  closed: number | null = null
  send(t: string) {
    this.inbox.push(JSON.parse(t))
  }
  close(code?: number) {
    this.closed = code ?? 1000
  }
  deserializeAttachment() {
    return this.att
  }
  serializeAttachment(v: unknown) {
    this.att = structuredClone(v)
  }
  last(): PartyView {
    const s = [...this.inbox].reverse().find((m) => m.t === 'state')
    if (!s || s.t !== 'state') throw new Error('no state yet')
    return s.view
  }
  lastOf<T extends ServerMsg['t']>(t: T) {
    return [...this.inbox].reverse().find((m) => m.t === t) as Extract<ServerMsg, { t: T }> | undefined
  }
}

function setup() {
  const clock = { now: 1_000_000 }
  const mem = memoryStorage()
  const room = new PartyRoom(mem.storage, () => clock.now)
  let sockets: FakeSocket[] = []
  const hub = new PartyHub(room, () => sockets.filter((s) => s.closed === null))
  const connect = async (token: string) => {
    const ws = new FakeSocket()
    sockets.push(ws)
    hub.open(ws)
    await hub.message(ws, JSON.stringify({ t: 'auth', token }))
    return ws
  }
  const drop = async (ws: FakeSocket) => {
    ws.closed = 1001
    sockets = sockets.filter((s) => s !== ws)
    await hub.close(ws)
  }
  const op = (ws: FakeSocket, o: object) => hub.message(ws, JSON.stringify({ t: 'op', op: o }))
  return { clock, mem, room, hub, connect, drop, op }
}

describe('party room', () => {
  it('runs a lobby from the TV: phones join, appear live, bots fill in, the game starts', async () => {
    const t = setup()
    const { tvToken } = await t.room.create('ABCD', 'host-user')
    const tv = await t.connect(tvToken)
    expect(tv.last()).toMatchObject({ code: 'ABCD', role: 'tv', seatId: null, hostSeat: null })

    const a = await t.room.join('Ann', '#e8573f')
    await t.hub.broadcast()
    const phoneA = await t.connect(a.token)
    expect(phoneA.last()).toMatchObject({ role: 'seat', seatId: a.seatId, hostSeat: a.seatId })
    expect(tv.last().online[a.seatId]).toBe(true)
    expect(tv.last().board.seats.map((s) => s.name)).toEqual(['Ann'])

    const b = await t.room.join('Bo', '#e0b100')
    const phoneB = await t.connect(b.token)
    /* Only the TV and the host seat run the lobby. */
    await t.op(phoneB, { op: 'addBot' })
    expect(phoneB.lastOf('error')?.code).toBe('not_host')
    await t.op(phoneA, { op: 'addBot' })
    expect(tv.last().board.seats).toHaveLength(3)

    await t.op(tv, { op: 'start' })
    expect(tv.last().board.status).toBe('playing')
    /* The TV sees no hands; each phone sees only its own. */
    expect(tv.last().board.seats.every((s) => s.hand === undefined)).toBe(true)
    const mine = phoneA.last().board.seats.filter((s) => s.hand)
    expect(mine.map((s) => s.id)).toEqual([a.seatId])
    /* Too late to join now. */
    await expect(t.room.join('Late', '#7bc142')).rejects.toMatchObject({ code: 'started' })
  })

  it('shows a phone going away and coming back with the same token', async () => {
    const t = setup()
    const { tvToken } = await t.room.create('ABCD', 'h')
    const tv = await t.connect(tvToken)
    const a = await t.room.join('Ann', '#e8573f')
    const p1 = await t.connect(a.token)
    expect(tv.last().online[a.seatId]).toBe(true)
    await t.drop(p1)
    expect(tv.last().online[a.seatId]).toBe(false)
    const p2 = await t.connect(a.token)
    expect(p2.last().seatId).toBe(a.seatId)
    expect(tv.last().online[a.seatId]).toBe(true)
  })

  it('refuses a made-up token, and lets an empty one watch', async () => {
    const t = setup()
    await t.room.create('ABCD', 'h')
    const bad = await t.connect('nope')
    expect(bad.lastOf('bye')?.reason).toBe('bad_token')
    expect(bad.closed).toBe(4001)
    const watcher = await t.connect('')
    expect(watcher.last().role).toBe('watch')
    await t.op(watcher, { op: 'start' })
    expect(watcher.lastOf('error')?.code).toBe('not_host')
  })

  it('kicks from the lobby and lets people leave; the host seat passes on', async () => {
    const t = setup()
    const { tvToken } = await t.room.create('ABCD', 'h')
    const tv = await t.connect(tvToken)
    const a = await t.room.join('Ann', '#e8573f')
    const b = await t.room.join('Bo', '#e0b100')
    const pa = await t.connect(a.token)
    const pb = await t.connect(b.token)
    await t.op(pa, { op: 'leave' })
    expect(pa.lastOf('bye')?.reason).toBe('left')
    expect(tv.last().hostSeat).toBe(b.seatId)
    expect(await t.room.whoIs(a.token)).toBeNull()
    await t.op(tv, { op: 'kick', seatId: b.seatId })
    expect(pb.lastOf('bye')?.reason).toBe('kicked')
    expect(pb.closed).toBe(4000)
    expect(tv.last().board.seats).toHaveLength(0)
    /* Their colour is free again. */
    await expect(t.room.join('Cy', '#e0b100')).resolves.toBeTruthy()
  })

  it('refuses a stale move and sends the board as it is', async () => {
    const t = setup()
    const { tvToken } = await t.room.create('ABCD', 'h')
    const tv = await t.connect(tvToken)
    const a = await t.room.join('Ann', '#e8573f')
    const pa = await t.connect(a.token)
    await t.op(tv, { op: 'addBot' })
    await t.op(tv, { op: 'start' })
    const rev = pa.last().board.rev
    await t.op(pa, { op: 'move', rev: rev - 1, move: { t: 'roll' } })
    expect(pa.lastOf('error')?.code).toBe('stale')
    expect(pa.last().board.rev).toBe(rev)
  })

  it('takes a code once, and clears a quiet room after 12 hours', async () => {
    const t = setup()
    await t.room.create('ABCD', 'h')
    await expect(t.room.create('ABCD', 'h2')).rejects.toMatchObject({ code: 'code_taken' })
    expect(t.mem.alarm()).toBe(t.clock.now + ROOM_TTL_MS)
    t.clock.now += ROOM_TTL_MS - 1
    expect(await t.room.alarm()).toBeNull()
    t.clock.now += ROOM_TTL_MS
    expect(await t.room.alarm()).toBe('expired')
    expect(t.mem.data.size).toBe(0)
    expect((await t.room.peek()).ok).toBe(false)
    /* The code can be used again. */
    await expect(t.room.create('ABCD', 'h3')).resolves.toBeTruthy()
  })

  it('shows the TV a ghost of the piece the player whose turn it is is looking at', async () => {
    const t = setup()
    const { tvToken } = await t.room.create('ABCD', 'host-user')
    const tv = await t.connect(tvToken)
    const a = await t.room.join('Ann', '#e8573f')
    const b = await t.room.join('Bo', '#e0b100')
    const phones = { [a.seatId]: await t.connect(a.token), [b.seatId]: await t.connect(b.token) }
    await t.op(tv, { op: 'start' })
    const board = tv.last().board
    const upId = board.seats[board.turn].id
    const up = phones[upId]
    const other = phones[upId === a.seatId ? b.seatId : a.seatId]
    const spot = legalHouses(board, board.turn, true)[0]

    /* Someone whose turn it isn't can't put a ghost up; nothing is sent. */
    const before = tv.inbox.length
    await t.op(other, { op: 'aim', aim: { kind: 'vertex', i: spot, piece: 'house' } })
    expect(tv.inbox.length).toBe(before)

    await t.op(up, { op: 'aim', aim: { kind: 'vertex', i: spot, piece: 'house' } })
    expect(tv.last().aim).toEqual({ kind: 'vertex', i: spot, piece: 'house', seat: board.turn })
    /* Aiming changes nothing stored, so a move made against this rev still counts. */
    expect(tv.last().board.rev).toBe(board.rev)
    /* The same aim again sends nothing. */
    const n = tv.inbox.length
    await t.op(up, { op: 'aim', aim: { kind: 'vertex', i: spot, piece: 'house' } })
    expect(tv.inbox.length).toBe(n)

    /* Nonsense is refused before it reaches the room. */
    await t.op(up, { op: 'aim', aim: { kind: 'vertex', i: 99, piece: 'house' } })
    expect(up.lastOf('error')?.code).toBe('bad_message')

    /* Placing the piece clears the ghost. */
    await t.op(up, { op: 'move', move: { t: 'house', vertex: spot }, rev: board.rev })
    expect(tv.last().board.buildings[spot]).toBeDefined()
    expect(tv.last().aim).toBeNull()
  })

  it('plays a whole game with every move made from a phone', async () => {
    const t = setup()
    const { tvToken } = await t.room.create('ABCD', 'host-user')
    const tv = await t.connect(tvToken)
    const joined = [await t.room.join('Ann', '#e8573f'), await t.room.join('Bo', '#e0b100'), await t.room.join('Cy', '#7bc142')]
    const phones = new Map<string, FakeSocket>()
    for (const j of joined) phones.set(j.seatId, await t.connect(j.token))
    await t.op(tv, { op: 'addBot' })
    await t.op(tv, { op: 'start' })

    /* Each phone plays what a bot would, through the socket like a real phone. */
    let moves = 0
    for (; moves < 4000; moves++) {
      const view = tv.last()
      if (view.board.status === 'over') break
      const state = (await t.mem.storage.get<{ state: BoardState }>('room'))!.state
      const up = state.seats[state.turn]
      if (up.bot) {
        /* Bots move a beat apart, on the room's alarm. */
        expect(tv.last().deadline).toBe(t.clock.now + BOT_STEP_MS)
        t.clock.now += BOT_STEP_MS
        expect(await t.room.alarm()).toBe('moved')
        await t.hub.broadcast()
        continue
      }
      const phone = phones.get(up.id)!
      const m = botMove(state)
      /* A bot would offer trades; a phone in this test just builds and ends. */
      const move = m.t === 'offer' ? { t: 'end' as const } : m
      await t.op(phone, { op: 'move', move, rev: phone.last().board.rev })
      const err = phone.lastOf('error')
      if (err) throw new Error(`move ${moves} (${JSON.stringify(move)}) refused: ${err.message}`)
    }
    const end = tv.last().board
    expect(end.status).toBe('over')
    expect(end.winner).not.toBeNull()
    /* Every phone saw the same finish. */
    for (const p of phones.values()) expect(p.last().board.winner).toBe(end.winner)
    /* The winner screen says how the game went. */
    expect(end.seats.reduce((n, x) => n + x.stats.collected, 0)).toBeGreaterThan(0)

    /* Play again: same people, same phones, back in the lobby. */
    await t.op([...phones.values()][1], { op: 'again' })
    expect([...phones.values()][1].lastOf('error')?.code).toBe('not_host')
    await t.op(tv, { op: 'again' })
    const lobby = tv.last().board
    expect(lobby.status).toBe('lobby')
    expect(lobby.seats.map((x) => x.name).sort()).toEqual(end.seats.map((x) => x.name).sort())
    expect(lobby.seats.every((x) => x.stats.collected === 0)).toBe(true)
    for (const [id, p] of phones) expect(p.last().seatId).toBe(id)
    await t.op(tv, { op: 'start' })
    expect(tv.last().board.status).toBe('playing')
  })

  it('runs a turn clock, and the bot finishes the turn when it runs out', async () => {
    const t = setup()
    const { tvToken } = await t.room.create('ABCD', 'host-user')
    const tv = await t.connect(tvToken)
    const a = await t.room.join('Ann', '#e8573f')
    const b = await t.room.join('Bo', '#e0b100')
    const phones = { [a.seatId]: await t.connect(a.token), [b.seatId]: await t.connect(b.token) }
    await t.op(tv, { op: 'start' })
    let v = tv.last()
    const first = v.board.turn
    expect(v.deadline).toBe(t.clock.now + SETUP_MS)

    /* Nothing happens before the clock runs out. */
    t.clock.now += SETUP_MS - 1000
    expect(await t.room.alarm()).toBeNull()

    t.clock.now += 2000
    expect(await t.room.alarm()).toBe('moved')
    await t.hub.broadcast()
    v = tv.last()
    /* The bot placed their house and street, and it's the next person's go. */
    expect(Object.values(v.board.buildings).filter((x) => x.seat === first)).toHaveLength(1)
    expect(Object.values(v.board.streets).filter((x) => x === first)).toHaveLength(1)
    expect(v.board.seats[first].stats.timeouts).toBe(1)
    expect(v.board.turn).not.toBe(first)
    expect(v.deadline).toBe(t.clock.now + SETUP_MS)

    /* Their phone dies: the clock drops to the short one. */
    const upId = v.board.seats[v.board.turn].id
    await t.drop(phones[upId])
    expect(tv.last().deadline).toBe(t.clock.now + AWAY_MS)
  })
})
