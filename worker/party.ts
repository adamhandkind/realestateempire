/* Land Grab party mode's API. Hosting needs a signed-in account; joining
   doesn't, so the open routes are rate-limited per IP. Everything after
   joining happens over the room's WebSocket (partyObject.ts).

     POST /api/party                 host (signed in) → { code, tvToken }
     GET  /api/party/:code           → Peek: is it there, who's sitting, is it full
     POST /api/party/:code/join      { name, color, adult: true } → { seatId, token }
     GET  /api/party/:code/live      WebSocket: first message { t: 'auth', token } */

import { requireUser } from './auth'
import type { Env } from './env'
import { unwrap } from './game'
import { HttpError, json, readJson } from './http'
import { CODE_ALPHABET, CODE_LENGTH, normalizeCode } from '../src/party/protocol'

export function partyRoom(env: Env, code: string) {
  return env.PARTY.get(env.PARTY.idFromName('party:' + code))
}

/** Per-IP limit on the routes anyone can call. Skipped where the binding
 *  isn't configured (tests, older local setups). */
async function limit(env: Env, req: Request, bucket: string): Promise<void> {
  if (!env.PARTY_LIMIT) return
  const ip = req.headers.get('cf-connecting-ip') ?? 'unknown'
  const { success } = await env.PARTY_LIMIT.limit({ key: bucket + ':' + ip })
  if (!success) throw new HttpError(429, 'slow_down', 'Too many tries. Wait a minute and try again.')
}

function code(raw: string): string {
  const c = normalizeCode(raw)
  if (!c) throw new HttpError(404, 'no_room', 'Room codes are four letters.')
  return c
}

function randomCode(): string {
  const b = crypto.getRandomValues(new Uint8Array(CODE_LENGTH))
  return [...b].map((x) => CODE_ALPHABET[x % CODE_ALPHABET.length]).join('')
}

/** POST /api/party */
export async function createParty(env: Env, req: Request): Promise<Response> {
  const user = await requireUser(env, req)
  if (!user.adult) throw new HttpError(403, 'adult_required', 'Confirm you’re 18 or over first.')
  await limit(env, req, 'create')
  for (let i = 0; i < 12; i++) {
    const c = randomCode()
    const r = await partyRoom(env, c).create(c, user.id)
    if (r.ok) return json(r.value, { status: 201 })
    if (r.code !== 'code_taken') unwrap(r)
  }
  throw new HttpError(503, 'no_codes', 'Couldn’t find a free room code. Try again.')
}

/** GET /api/party/:code */
export async function peekParty(env: Env, req: Request, raw: string): Promise<Response> {
  await limit(env, req, 'peek')
  return json(unwrap(await partyRoom(env, code(raw)).peek()))
}

/** POST /api/party/:code/join */
export async function joinParty(env: Env, req: Request, raw: string): Promise<Response> {
  await limit(env, req, 'join')
  const c = code(raw)
  const body = await readJson(req)
  /* Land Grab's table talk is filthy: every guest says they're an adult. */
  if (body.adult !== true) throw new HttpError(403, 'adults_only', 'Land Grab is for adults only. Tick the 18+ box.')
  return json(unwrap(await partyRoom(env, c).join(body.name, body.color)), { status: 201 })
}

/** GET /api/party/:code/live */
export async function partyLive(env: Env, req: Request, raw: string): Promise<Response> {
  if (req.headers.get('upgrade')?.toLowerCase() !== 'websocket') throw new HttpError(426, 'websocket_only', 'This one is a WebSocket.')
  const origin = req.headers.get('origin')
  if (origin !== null && origin !== new URL(env.APP_URL).origin) throw new HttpError(403, 'cross_origin')
  await limit(env, req, 'live')
  return partyRoom(env, code(raw)).fetch(new Request('https://party/live', { headers: { upgrade: 'websocket' } }))
}
