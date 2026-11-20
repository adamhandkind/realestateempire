/* Land Grab's API. Sign-in and membership are checked here against D1; the
   game itself is the table's Durable Object (boardObject.ts → boardRoom.ts).

     GET  /api/cities/:id/board        { view }  (view is null until someone opens a table)
     POST /api/cities/:id/board        { op, ... } → { view }
     GET  /api/cities/:id/board/live   WebSocket: { t: 'board', rev } whenever the table changes */

import { AGENT_COLORS } from '../src/engine'
import { parseOp, type Player } from './boardRoom'
import { requireUser } from './auth'
import { membership } from './cities'
import type { Env } from './env'
import { unwrap } from './game'
import { HttpError, json, readJson } from './http'

export function boardRoom(env: Env, cityId: string) {
  return env.BOARD.get(env.BOARD.idFromName(cityId))
}

/** The player as the table shows them: their agent's name and colour if
 *  they've made one in this city, otherwise the front of their email. */
async function player(env: Env, req: Request, cityId: string): Promise<Player> {
  const user = await requireUser(env, req)
  const role = await membership(env, cityId, user.id)
  const agent = await env.DB.prepare('SELECT name, color FROM agents WHERE city_id = ? AND user_id = ?')
    .bind(cityId, user.id)
    .first<{ name: string; color: string }>()
  const hex = AGENT_COLORS.find((c) => c.id === agent?.color)?.hex ?? AGENT_COLORS[0].hex
  return { userId: user.id, name: agent?.name ?? user.email.split('@')[0].slice(0, 24), color: hex, isOwner: role === 'owner' }
}

/** GET /api/cities/:id/board */
export async function getBoard(env: Env, req: Request, cityId: string): Promise<Response> {
  const p = await player(env, req, cityId)
  return json({ view: unwrap(await boardRoom(env, cityId).view(p.userId)) })
}

/** POST /api/cities/:id/board  { op, ... } */
export async function boardOp(env: Env, req: Request, cityId: string): Promise<Response> {
  const p = await player(env, req, cityId)
  const op = parseOp(await readJson(req))
  if (!op) throw new HttpError(400, 'bad_op', 'That isn’t something you can do at the table.')
  return json({ view: unwrap(await boardRoom(env, cityId).op(p, op)) })
}

/** GET /api/cities/:id/board/live */
export async function boardLive(env: Env, req: Request, cityId: string): Promise<Response> {
  if (req.headers.get('upgrade')?.toLowerCase() !== 'websocket') throw new HttpError(426, 'websocket_only', 'This one is a WebSocket.')
  const origin = req.headers.get('origin')
  if (origin !== null && origin !== new URL(env.APP_URL).origin) throw new HttpError(403, 'cross_origin')
  const p = await player(env, req, cityId)
  const headers = new Headers({ upgrade: 'websocket', 'x-res-user': p.userId })
  return boardRoom(env, cityId).fetch(new Request('https://board/live', { headers }))
}
