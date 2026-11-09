/* The city's Durable Object: one per city, named by the city's id. It owns
   the city's storage and its nightly alarm and hands every call to Room
   (room.ts). The Worker only reaches it after checking who's asking
   (game.ts), so nothing here re-checks sign-in or membership. */

import { DurableObject } from 'cloudflare:workers'
import type { Env } from './env'
import { LiveHub, type LiveSocket } from './live'
import { Room, RoomError, type Agent, type RoomStorage } from './room'

export type RoomResult<T> = { ok: true; value: T } | { ok: false; status: number; code: string; message: string }

/** RPC can't carry a custom error class, so failures come back as data. */
async function wrap<T>(f: () => Promise<T>): Promise<RoomResult<T>> {
  try {
    return { ok: true, value: await f() }
  } catch (e) {
    if (e instanceof RoomError) return { ok: false, status: e.status, code: e.code, message: e.message }
    throw e
  }
}

export class CityObject extends DurableObject<Env> {
  private room: Room
  private live: LiveHub

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env)
    const s = ctx.storage
    const storage: RoomStorage = {
      get: (k) => s.get(k),
      put: (k, v) => s.put(k, v),
      list: (o) => s.list(o),
      setAlarm: (t) => s.setAlarm(t),
      deleteAlarm: () => s.deleteAlarm(),
    }
    this.room = new Room(storage, env)
    this.live = new LiveHub(() => ctx.getWebSockets() as unknown as LiveSocket[])
  }

  /** The live room. Only the Worker reaches this (game.ts → live), after
   *  checking the session and membership; it passes the user in a header. */
  async fetch(req: Request): Promise<Response> {
    const userId = req.headers.get('x-res-user')
    if (req.headers.get('upgrade')?.toLowerCase() !== 'websocket' || !userId) return new Response('websocket only', { status: 426 })
    const who = await this.room.agentOf(userId)
    if (!who) return new Response('no agent', { status: 404 })
    const pair = new WebSocketPair()
    const [client, server] = Object.values(pair)
    /* Hibernatable: the object can sleep between messages. */
    this.ctx.acceptWebSocket(server, [userId])
    this.live.open(server as unknown as LiveSocket, { userId, ...who })
    return new Response(null, { status: 101, webSocket: client })
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    this.live.message(ws as unknown as LiveSocket, message)
  }
  async webSocketClose(ws: WebSocket): Promise<void> {
    this.live.close(ws as unknown as LiveSocket)
  }
  async webSocketError(ws: WebSocket): Promise<void> {
    this.live.close(ws as unknown as LiveSocket)
  }

  /** Tells every open browser to look again. */
  private async ping<T>(r: Promise<RoomResult<T>>, t: 'tick' | 'city'): Promise<RoomResult<T>> {
    const out = await r
    if (out.ok) this.live.broadcast({ t })
    return out
  }

  join(cityId: string, agent: Agent, restart: boolean) {
    return wrap(() => this.room.join(cityId, agent, restart))
  }
  game(cityId: string, userId: string) {
    return wrap(() => this.room.game(cityId, userId))
  }
  view(cityId: string, userId: string) {
    return wrap(() => this.room.view(cityId, userId))
  }
  act(cityId: string, userId: string, baseVersion: number, actions: unknown) {
    return wrap(() => this.room.act(cityId, userId, baseVersion, actions))
  }
  bid(cityId: string, userId: string, body: { listingId: string; amount: number; downPct: number }) {
    return this.ping(wrap(() => this.room.bid(cityId, userId, body)), 'city')
  }
  withdraw(cityId: string, userId: string, listingId: string) {
    return this.ping(wrap(() => this.room.withdraw(cityId, userId, listingId)), 'city')
  }
  checkIn(cityId: string, userId: string) {
    return wrap(() => this.room.checkIn(cityId, userId))
  }
  start(cityId: string, userId: string) {
    return this.ping(wrap(() => this.room.start(cityId, userId)), 'tick')
  }
  setSchedule(cityId: string, userId: string, hour: number, zone: string) {
    return wrap(() => this.room.setSchedule(cityId, userId, hour, zone))
  }
  manualTick() {
    return this.ping(wrap(() => this.room.manualTick()), 'tick')
  }

  async alarm(): Promise<void> {
    await this.room.runTick()
    this.live.broadcast({ t: 'tick' })
  }
}
