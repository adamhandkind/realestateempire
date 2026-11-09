/* Agents and the shared city's API. Sign-in, membership and the 18+ check
   are D1's business and are checked here; everything about the game itself
   is the city's Durable Object (cityObject.ts → room.ts), which plays every
   move on the server. The browser sends moves and gets the game back.

     GET    /api/cities/:id/game          { version, state, report, city }
     POST   /api/cities/:id/act           { baseVersion, actions } → same, or 409 when stale
     GET    /api/cities/:id/city          the city view (listings, players, feed)
     POST   /api/cities/:id/bids          { listingId, amount, downPct } → city view
     DELETE /api/cities/:id/bids/:listing → city view
     GET    /api/cities/:id/leaderboard
     GET    /api/cities/:id/seasons       the Hall of Fame
     POST   /api/cities/:id/season/start  owner: open the season
     POST   /api/cities/:id/schedule      owner: { hour, zone }
     POST   /api/cities/:id/tick          owner, ALLOW_MANUAL_TICK only
     POST   /api/cities/:id/checkin       the phone check-in: counts as showing up
     GET    /api/cities/:id/live          WebSocket: live agents on the map, tick pushes */

import { AGENT_COLORS, isCharacterId } from '../src/engine'
import { requireUser } from './auth'
import { membership } from './cities'
import type { RoomResult } from './cityObject'
import type { Env } from './env'
import { HttpError, json, readJson, str } from './http'

export function cityRoom(env: Env, cityId: string) {
  return env.CITY.get(env.CITY.idFromName(cityId))
}

export function unwrap<T>(r: RoomResult<T>): T {
  if (r.ok) return r.value
  throw new HttpError(r.status, r.code, r.message)
}

async function member(env: Env, req: Request, cityId: string) {
  const user = await requireUser(env, req)
  const role = await membership(env, cityId, user.id)
  return { user, role, room: cityRoom(env, cityId) }
}

async function owner(env: Env, req: Request, cityId: string) {
  const m = await member(env, req, cityId)
  if (m.role !== 'owner') throw new HttpError(403, 'owner_only', 'Only the city owner can do that.')
  return m
}

/** POST /api/cities/:id/agent  { name, color, characterId, restart? }
 *  Creates the player's agent and a brand-new game for them. `restart`
 *  starts over, which is only allowed once the current game has ended. */
export async function createAgent(env: Env, req: Request, cityId: string): Promise<Response> {
  const user = await requireUser(env, req)
  await membership(env, cityId, user.id)
  if (!user.adult) throw new HttpError(403, 'adult_required', 'Confirm you’re 18 or over first.')
  const body = await readJson(req)
  const name = str(body.name).trim().replace(/\s+/g, ' ').slice(0, 24)
  const color = str(body.color)
  const characterId = str(body.characterId)
  if (name.length < 2) throw new HttpError(400, 'bad_name', 'Your agent needs a name.')
  if (!AGENT_COLORS.some((c) => c.id === color)) throw new HttpError(400, 'bad_color', 'Pick a colour.')
  if (!isCharacterId(characterId)) throw new HttpError(400, 'bad_character', 'Pick an agent.')

  const existing = await env.DB.prepare('SELECT 1 FROM agents WHERE city_id = ? AND user_id = ?')
    .bind(cityId, user.id)
    .first()
  if (existing && body.restart !== true)
    throw new HttpError(409, 'agent_exists', 'You already have an agent in this city.')
  const taken = await env.DB.prepare('SELECT 1 FROM agents WHERE city_id = ? AND color = ? AND user_id != ?')
    .bind(cityId, color, user.id)
    .first()
  if (taken) throw new HttpError(409, 'color_taken', 'Someone in this city already wears that colour.')

  /* The city decides first whether a restart is allowed, so a refused one
     leaves the agent row as it was. */
  const room = cityRoom(env, cityId)
  const joined = unwrap(await room.join(cityId, { userId: user.id, name, color, characterId }, !!existing))
  const now = Date.now()
  await env.DB.prepare(
    `INSERT INTO agents (city_id, user_id, name, color, character_id, created_at) VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT (city_id, user_id) DO UPDATE SET name = excluded.name, color = excluded.color,
       character_id = excluded.character_id`,
  )
    .bind(cityId, user.id, name, color, characterId, now)
    .run()
  return json(joined, { status: 201 })
}

/** GET /api/cities/:id/game */
export async function getGame(env: Env, req: Request, cityId: string): Promise<Response> {
  const { user, room } = await member(env, req, cityId)
  return json(unwrap(await room.game(cityId, user.id)))
}

/** POST /api/cities/:id/act  { baseVersion, actions } */
export async function act(env: Env, req: Request, cityId: string): Promise<Response> {
  const { user, room } = await member(env, req, cityId)
  const body = await readJson(req)
  if (typeof body.baseVersion !== 'number') throw new HttpError(400, 'bad_version')
  const r = unwrap(await room.act(cityId, user.id, body.baseVersion, body.actions))
  return json(r, { status: 'stale' in r && r.stale ? 409 : 200 })
}

/** GET /api/cities/:id/city */
export async function getCity(env: Env, req: Request, cityId: string): Promise<Response> {
  const { user, room } = await member(env, req, cityId)
  return json(unwrap(await room.view(cityId, user.id)))
}

/** POST /api/cities/:id/bids  { listingId, amount, downPct } */
export async function bid(env: Env, req: Request, cityId: string): Promise<Response> {
  const { user, room } = await member(env, req, cityId)
  const body = await readJson(req)
  const listingId = str(body.listingId)
  const amount = body.amount
  const downPct = body.downPct
  if (!listingId || typeof amount !== 'number' || typeof downPct !== 'number')
    throw new HttpError(400, 'bad_bid', 'An offer needs a listing, an amount and a down payment.')
  return json(unwrap(await room.bid(cityId, user.id, { listingId, amount, downPct })))
}

/** DELETE /api/cities/:id/bids/:listingId */
export async function withdraw(env: Env, req: Request, cityId: string, listingId: string): Promise<Response> {
  const { user, room } = await member(env, req, cityId)
  return json(unwrap(await room.withdraw(cityId, user.id, listingId)))
}

/** POST /api/cities/:id/season/start */
export async function startSeason(env: Env, req: Request, cityId: string): Promise<Response> {
  const { user, room } = await owner(env, req, cityId)
  return json(unwrap(await room.start(cityId, user.id)))
}

/** POST /api/cities/:id/schedule  { hour, zone } */
export async function setSchedule(env: Env, req: Request, cityId: string): Promise<Response> {
  const { user, room } = await owner(env, req, cityId)
  const body = await readJson(req)
  if (typeof body.hour !== 'number') throw new HttpError(400, 'bad_hour', 'Pick an hour.')
  return json(unwrap(await room.setSchedule(cityId, user.id, body.hour, str(body.zone) || 'America/Toronto')))
}

/** POST /api/cities/:id/tick — dev and testing only. */
export async function manualTick(env: Env, req: Request, cityId: string): Promise<Response> {
  const { user, room } = await owner(env, req, cityId)
  unwrap(await room.manualTick())
  return json(unwrap(await room.game(cityId, user.id)))
}

/** POST /api/cities/:id/checkin */
export async function checkIn(env: Env, req: Request, cityId: string): Promise<Response> {
  const { user, room } = await member(env, req, cityId)
  return json(unwrap(await room.checkIn(cityId, user.id)))
}

/** GET /api/cities/:id/live — upgrades to a WebSocket held by the city's
 *  Durable Object. Who's asking is checked here; the object trusts the
 *  header because only this Worker can reach it. */
export async function live(env: Env, req: Request, cityId: string): Promise<Response> {
  if (req.headers.get('upgrade')?.toLowerCase() !== 'websocket') throw new HttpError(426, 'websocket_only', 'This one is a WebSocket.')
  /* Cookies are Lax, but a WebSocket handshake isn't a POST, so check the
     origin here too: nobody else's page gets a socket on your session. */
  const origin = req.headers.get('origin')
  if (origin !== null && origin !== new URL(env.APP_URL).origin) throw new HttpError(403, 'cross_origin')
  const { user } = await member(env, req, cityId)
  const headers = new Headers({ upgrade: 'websocket', 'x-res-user': user.id, 'x-res-city': cityId })
  return cityRoom(env, cityId).fetch(new Request('https://city/live', { headers }))
}

/** GET /api/cities/:id/leaderboard — every agent, richest first. */
export async function leaderboard(env: Env, req: Request, cityId: string): Promise<Response> {
  const { user, room } = await member(env, req, cityId)
  const view = unwrap(await room.view(cityId, user.id))
  const city = await env.DB.prepare('SELECT name, season FROM cities WHERE id = ?')
    .bind(cityId)
    .first<{ name: string; season: number }>()
  return json({
    city: city?.name,
    season: view.season,
    week: view.week,
    status: view.status,
    rows: view.players.map((p) => ({
      place: p.place,
      you: p.you,
      name: p.name,
      color: p.color,
      characterId: p.characterId,
      week: view.week,
      cash: p.cash,
      netWorth: p.netWorth,
      rank: p.rank,
      gameOver: p.gameOver,
      missed: p.missed,
      doors: p.buildings.length,
    })),
  })
}

/** GET /api/cities/:id/seasons — the Hall of Fame, newest first. */
export async function seasons(env: Env, req: Request, cityId: string): Promise<Response> {
  await member(env, req, cityId)
  const { results } = await env.DB.prepare(
    `SELECT season, finished_at, champion_name, champion_color, champion_character_id, champion_net_worth, standings,
            champion_title, awards
       FROM seasons WHERE city_id = ? ORDER BY season DESC`,
  )
    .bind(cityId)
    .all<{
      season: number
      finished_at: number
      champion_name: string | null
      champion_color: string | null
      champion_character_id: string | null
      champion_net_worth: number | null
      standings: string
      champion_title: string | null
      awards: string | null
    }>()
  return json({
    seasons: results.map((r) => ({
      season: r.season,
      finishedAt: r.finished_at,
      champion: r.champion_name
        ? {
            name: r.champion_name,
            color: r.champion_color,
            characterId: r.champion_character_id,
            netWorth: r.champion_net_worth,
            title: r.champion_title,
          }
        : null,
      standings: JSON.parse(r.standings),
      awards: r.awards ? JSON.parse(r.awards) : [],
    })),
  })
}
