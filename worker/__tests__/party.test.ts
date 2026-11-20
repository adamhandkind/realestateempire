/* The party room and its sockets, driven in Node with fake WebSockets. */

import { describe, expect, it } from 'vitest'
import type { PartyView, ServerMsg } from '../../src/party/protocol'
import { ROOM_TTL_MS } from '../../src/party/protocol'
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
    expect(await t.room.expire()).toBe(false)
    t.clock.now += ROOM_TTL_MS
    expect(await t.room.expire()).toBe(true)
    expect(t.mem.data.size).toBe(0)
    expect((await t.room.peek()).ok).toBe(false)
    /* The code can be used again. */
    await expect(t.room.create('ABCD', 'h3')).resolves.toBeTruthy()
  })
})
