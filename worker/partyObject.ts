/* A Land Grab party room's Durable Object, one per room code. It owns the
   room's storage, its expiry alarm and its WebSockets (hibernatable, so a
   quiet room costs nothing), and hands everything to PartyRoom and PartyHub
   (partyRoom.ts). The Worker (party.ts) checks the host's sign-in and the
   rate limits before calling in. */

import { DurableObject } from 'cloudflare:workers'
import type { RoomResult } from './cityObject'
import type { Env } from './env'
import { PartyHub, PartyRoom, type PartySocket } from './partyRoom'
import { RoomError } from './room'

async function wrap<T>(f: () => Promise<T>): Promise<RoomResult<T>> {
  try {
    return { ok: true, value: await f() }
  } catch (e) {
    if (e instanceof RoomError) return { ok: false, status: e.status, code: e.code, message: e.message }
    throw e
  }
}

export class PartyObject extends DurableObject<Env> {
  private room: PartyRoom
  private hub: PartyHub

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env)
    const s = ctx.storage
    this.room = new PartyRoom({
      get: (k) => s.get(k),
      put: (k, v) => s.put(k, v),
      deleteAll: () => s.deleteAll(),
      setAlarm: (t) => s.setAlarm(t),
    })
    this.hub = new PartyHub(this.room, () => ctx.getWebSockets() as unknown as PartySocket[])
  }

  async fetch(req: Request): Promise<Response> {
    if (req.headers.get('upgrade')?.toLowerCase() !== 'websocket') return new Response('websocket only', { status: 426 })
    const pair = new WebSocketPair()
    const [client, server] = Object.values(pair)
    this.ctx.acceptWebSocket(server)
    this.hub.open(server as unknown as PartySocket)
    return new Response(null, { status: 101, webSocket: client })
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    await this.hub.message(ws as unknown as PartySocket, typeof message === 'string' ? message : '')
  }
  async webSocketClose(ws: WebSocket): Promise<void> {
    await this.hub.close(ws as unknown as PartySocket)
  }
  async webSocketError(ws: WebSocket): Promise<void> {
    await this.hub.close(ws as unknown as PartySocket)
  }

  create(code: string, hostUserId: string) {
    return wrap(() => this.room.create(code, hostUserId))
  }
  peek() {
    return wrap(() => this.room.peek())
  }
  async join(name: unknown, color: unknown) {
    const r = await wrap(() => this.room.join(name, color))
    if (r.ok) await this.hub.broadcast()
    return r
  }

  async alarm(): Promise<void> {
    if (await this.room.expire()) this.hub.closeAll()
  }
}
