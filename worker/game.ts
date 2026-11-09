/* Agents, cloud saves and the leaderboard.

   The server is the referee. The browser applies a move the instant it's
   clicked (same engine, same seed, same result), and every so often sends
   the moves it made since the last save:

     POST /api/cities/:id/game/actions  { baseVersion, actions, digest }

   The server loads its own copy, replays those moves through the engine,
   and stores the result. `digest` is the browser's fingerprint of what it
   ended up with; if the server's copy disagrees, the reply carries the
   server's state and the browser adopts it. A stale `baseVersion` (another
   tab got there first) is a 409 with the current state, and the browser
   replays its unsent moves on top of that.

   So the leaderboard only ever reflects games the engine itself played:
   no debug actions, no save imports, no edited cash. */

import {
  AGENT_COLORS,
  applyActions,
  createGame,
  fromWire,
  isCharacterId,
  stateDigest,
  summarize,
  toWire,
  type GameState,
} from '../src/engine'
import { hasNaN, parseBatch } from '../src/engine/clientActions'
import { requireUser } from './auth'
import { membership } from './cities'
import { randomSeed } from './crypto'
import type { Env } from './env'
import { HttpError, json, readJson, str } from './http'

interface SaveRow {
  version: number
  state: string
}

const loadSave = (env: Env, cityId: string, userId: string) =>
  env.DB.prepare('SELECT version, state FROM saves WHERE city_id = ? AND user_id = ?')
    .bind(cityId, userId)
    .first<SaveRow>()

/** Insert or overwrite (when `expectVersion` matches) one save, copying the
 *  leaderboard columns out of the state. Returns false on a version race. */
async function writeSave(
  env: Env,
  cityId: string,
  userId: string,
  state: GameState,
  text: string,
  expectVersion: number | null,
): Promise<boolean> {
  const s = summarize(state)
  const now = Date.now()
  if (expectVersion === null) {
    await env.DB.prepare(
      `INSERT INTO saves (city_id, user_id, version, state, week, cash, net_worth, rank, game_over, updated_at)
       VALUES (?, ?, 1, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (city_id, user_id) DO UPDATE SET
         version = saves.version + 1, state = excluded.state, week = excluded.week, cash = excluded.cash,
         net_worth = excluded.net_worth, rank = excluded.rank, game_over = excluded.game_over,
         updated_at = excluded.updated_at`,
    )
      .bind(cityId, userId, text, s.week, s.cash, s.netWorth, s.rank, s.gameOver ? 1 : 0, now)
      .run()
    return true
  }
  const r = await env.DB.prepare(
    `UPDATE saves SET version = version + 1, state = ?, week = ?, cash = ?, net_worth = ?, rank = ?,
            game_over = ?, updated_at = ?
      WHERE city_id = ? AND user_id = ? AND version = ?`,
  )
    .bind(text, s.week, s.cash, s.netWorth, s.rank, s.gameOver ? 1 : 0, now, cityId, userId, expectVersion)
    .run()
  return r.meta.changes > 0
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
  if (existing) {
    const g = await env.DB.prepare('SELECT game_over FROM saves WHERE city_id = ? AND user_id = ?')
      .bind(cityId, user.id)
      .first<{ game_over: number }>()
    if (g && !g.game_over) throw new HttpError(409, 'game_running', 'Your current game is still going.')
  }
  const taken = await env.DB.prepare('SELECT 1 FROM agents WHERE city_id = ? AND color = ? AND user_id != ?')
    .bind(cityId, color, user.id)
    .first()
  if (taken) throw new HttpError(409, 'color_taken', 'Someone in this city already wears that colour.')

  const now = Date.now()
  await env.DB.prepare(
    `INSERT INTO agents (city_id, user_id, name, color, character_id, created_at) VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT (city_id, user_id) DO UPDATE SET name = excluded.name, color = excluded.color,
       character_id = excluded.character_id`,
  )
    .bind(cityId, user.id, name, color, characterId, now)
    .run()
  const state = createGame(characterId, randomSeed())
  const text = toWire(state)
  await writeSave(env, cityId, user.id, state, text, null)
  const save = await loadSave(env, cityId, user.id)
  return json({ version: save!.version, state: save!.state }, { status: 201 })
}

/** GET /api/cities/:id/game — the player's save as wire text. */
export async function getGame(env: Env, req: Request, cityId: string): Promise<Response> {
  const user = await requireUser(env, req)
  await membership(env, cityId, user.id)
  const save = await loadSave(env, cityId, user.id)
  if (!save) throw new HttpError(404, 'no_agent', 'Create your agent first.')
  return json({ version: save.version, state: save.state })
}

/** POST /api/cities/:id/game/actions  { baseVersion, actions, digest? } */
export async function postActions(env: Env, req: Request, cityId: string): Promise<Response> {
  const user = await requireUser(env, req)
  await membership(env, cityId, user.id)
  const body = await readJson(req)
  const baseVersion = body.baseVersion
  if (typeof baseVersion !== 'number') throw new HttpError(400, 'bad_version')
  const batch = parseBatch(body.actions)
  if (!batch.ok) throw new HttpError(400, 'bad_action', batch.error)
  const clientDigest = str(body.digest)

  const save = await loadSave(env, cityId, user.id)
  if (!save) throw new HttpError(404, 'no_agent', 'Create your agent first.')
  if (save.version !== baseVersion) return json({ error: 'stale', version: save.version, state: save.state }, { status: 409 })
  const base = fromWire(save.state)
  if (!base) throw new HttpError(500, 'corrupt_save', 'Your save could not be read.')
  if (batch.actions.length === 0) return json({ version: save.version, digest: await stateDigest(base) })

  let next: GameState
  try {
    next = applyActions(base, batch.actions)
  } catch {
    throw new HttpError(400, 'bad_action', 'One of those moves broke the rules engine.')
  }
  if (hasNaN(next)) throw new HttpError(400, 'bad_action', 'Those moves produced an impossible game.')

  const text = toWire(next)
  if (!(await writeSave(env, cityId, user.id, next, text, baseVersion))) {
    const fresh = await loadSave(env, cityId, user.id)
    return json({ error: 'stale', version: fresh!.version, state: fresh!.state }, { status: 409 })
  }
  const digest = await stateDigest(next)
  const version = baseVersion + 1
  /* Only ship the whole game back when the browser got it wrong. */
  return json(clientDigest === digest ? { version, digest } : { version, digest, state: text })
}

/** GET /api/cities/:id/leaderboard — every agent, richest first. */
export async function leaderboard(env: Env, req: Request, cityId: string): Promise<Response> {
  const user = await requireUser(env, req)
  await membership(env, cityId, user.id)
  const { results } = await env.DB.prepare(
    `SELECT a.user_id, a.name, a.color, a.character_id,
            s.week, s.cash, s.net_worth, s.rank, s.game_over, s.updated_at
       FROM agents a LEFT JOIN saves s ON s.city_id = a.city_id AND s.user_id = a.user_id
      WHERE a.city_id = ?
      ORDER BY COALESCE(s.net_worth, 0) DESC, a.created_at`,
  )
    .bind(cityId)
    .all<{
      user_id: string
      name: string
      color: string
      character_id: string
      week: number | null
      cash: number | null
      net_worth: number | null
      rank: string | null
      game_over: number | null
      updated_at: number | null
    }>()
  const city = await env.DB.prepare('SELECT name, season FROM cities WHERE id = ?')
    .bind(cityId)
    .first<{ name: string; season: number }>()
  return json({
    city: city?.name,
    season: city?.season,
    rows: results.map((r, i) => ({
      place: i + 1,
      you: r.user_id === user.id,
      name: r.name,
      color: r.color,
      characterId: r.character_id,
      week: r.week ?? 0,
      cash: r.cash ?? 0,
      netWorth: r.net_worth ?? 0,
      rank: r.rank,
      gameOver: !!r.game_over,
      lastPlayed: r.updated_at,
    })),
  })
}
