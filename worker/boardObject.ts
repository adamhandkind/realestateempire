/* The Land Grab table's Durable Object: one per city, named by the city's
   id. It owns the table's storage and the open browsers' WebSockets, and
   hands every call to BoardRoom (boardRoom.ts). The Worker only reaches it
   after checking who's asking (board.ts), so nothing here re-checks sign-in
   or membership.

   The sockets only carry a nudge ({ t: 'board', rev }); each browser then
   asks for its own view, because every player sees a different hand. */

import { DurableObject } from 'cloudflare:workers'
import { BoardRoom, type BoardOp, type Player } from './boardRoom'
import type { RoomResult } from './cityObject'
import type { Env } from './env'
import { RoomError } from './room'

async function wrap<T>(f: () => Promise<T>): Promise<RoomResult<T>> {
  try {
    return { ok: true, value: await f() }
  } catch (e) {
    if (e instanceof RoomError) return { ok: false, status: e.status, code: e.code, message: e.message }
    throw e
  }
}

export class BoardObject extends DurableObject<Env> {
  private room: BoardRoom

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env)
    const s = ctx.storage
    this.room = new BoardRoom({ get: (k) => s.get(k), put: (k, v) => s.put(k, v) })
  }

  async fetch(req: Request): Promise<Response> {
    const userId = req.headers.get('x-res-user')
    if (req.headers.get('upgrade')?.toLowerCase() !== 'websocket' || !userId) return new Response('websocket only', { status: 426 })
    const pair = new WebSocketPair()
    const [client, server] = Object.values(pair)
    this.ctx.acceptWebSocket(server, [userId])
    return new Response(null, { status: 101, webSocket: client })
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    if (message === '{"t":"ping"}') ws.send('{"t":"pong"}')
  }

  private broadcast(rev: number) {
    const text = JSON.stringify({ t: 'board', rev })
    for (const ws of this.ctx.getWebSockets()) {
      try {
        ws.send(text)
      } catch {
        /* closing */
      }
    }
  }

  view(userId: string) {
    return wrap(() => this.room.view(userId))
  }

  async op(player: Player, op: BoardOp) {
    const r = await wrap(() => this.room.op(player, op))
    if (r.ok) this.broadcast(r.value.rev)
    return r
  }
}
