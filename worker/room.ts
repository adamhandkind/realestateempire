/* One shared city, as the server runs it. The Durable Object (cityObject.ts)
   is a thin shell around this: it owns the storage and the alarm, and every
   call lands here, one at a time (a Durable Object never runs two at once).
   Kept apart from the Cloudflare runtime so the tests can drive it in Node.

   Storage:
     city        the CityState (listings, bids, feed, clock)
     meta        the tick schedule
     p:<userId>  one player: their agent, their game (as wire text), their
                 morning report, and a version that bumps on every change

   The game the browser gets has its dice removed: in a shared city every
   move is played here, so there's nothing for the browser to predict, and
   nothing to peek at. */

import { fromWire, toWire, summarize, type Action, type GameState } from '../src/engine'
import { parseBatch } from '../src/engine/clientActions'
import {
  applyPlayerActions,
  joinCity,
  newCity,
  nextSeed,
  placeBid,
  startSeason,
  tick,
  withCityListings,
  withdrawBid,
} from '../src/citygame/city'
import type { CityPlayer, CityState, MorningReport, SeasonResult } from '../src/citygame/types'
import { cityView, type CityView, type Schedule } from '../src/citygame/view'
import { DEFAULT_TICK_HOUR, DEFAULT_TICK_ZONE, isTimeZone, nextTickAt } from './schedule'

/** Just what the room needs from Durable Object storage. */
export interface RoomStorage {
  get<T>(key: string): Promise<T | undefined>
  put(key: string, value: unknown): Promise<void>
  list<T>(opts: { prefix: string }): Promise<Map<string, T>>
  setAlarm(at: number): Promise<void>
  deleteAlarm(): Promise<void>
}

export interface RoomEnv {
  DB: D1Database
  /** '1' lets the city owner run the tick by hand. Dev and testing only. */
  ALLOW_MANUAL_TICK?: string
}

interface Meta {
  cityId: string
  tickHour: number
  tickZone: string
  nextTickAt: number | null
}

interface StoredPlayer {
  userId: string
  name: string
  color: string
  characterId: string
  game: string
  lastActiveWeek: number
  joinedWeek: number
  report: MorningReport | null
  version: number
}

export interface Agent {
  userId: string
  name: string
  color: string
  characterId: string
}

export interface GameReply {
  version: number
  state: string
  report: MorningReport | null
  city: CityView
}

export class RoomError extends Error {
  status: number
  code: string
  constructor(status: number, code: string, message?: string) {
    super(message ?? code)
    this.status = status
    this.code = code
  }
}

const toStored = (p: CityPlayer, version: number): StoredPlayer => ({
  userId: p.userId,
  name: p.name,
  color: p.color,
  characterId: p.characterId,
  game: toWire(p.game),
  lastActiveWeek: p.lastActiveWeek,
  joinedWeek: p.joinedWeek,
  report: p.report,
  version,
})

function fromStored(s: StoredPlayer): CityPlayer {
  const game = fromWire(s.game)
  if (!game) throw new RoomError(500, 'corrupt_save', 'A save in this city could not be read.')
  return { ...s, game }
}

/** The game as the browser sees it: the city's listings in its market and
 *  no dice. */
export function forBrowser(game: GameState, city: CityState): string {
  return toWire({ ...withCityListings(game, city), rngSeed: 0 })
}

export class Room {
  private storage: RoomStorage
  private env: RoomEnv
  private now: () => number

  constructor(storage: RoomStorage, env: RoomEnv, now: () => number = Date.now) {
    this.storage = storage
    this.env = env
    this.now = now
  }

  /* ------------------------------------------------------------ storage */

  private async meta(cityId: string): Promise<Meta> {
    const m = await this.storage.get<Meta>('meta')
    if (m) return m
    const fresh: Meta = { cityId, tickHour: DEFAULT_TICK_HOUR, tickZone: DEFAULT_TICK_ZONE, nextTickAt: null }
    await this.storage.put('meta', fresh)
    return fresh
  }

  private async city(): Promise<CityState> {
    const c = await this.storage.get<CityState>('city')
    if (c) return c
    const seed = crypto.getRandomValues(new Uint32Array(1))[0]
    const fresh = newCity(seed)
    await this.storage.put('city', fresh)
    return fresh
  }

  private async stored(userId: string): Promise<StoredPlayer | undefined> {
    return this.storage.get<StoredPlayer>('p:' + userId)
  }

  private async all(): Promise<StoredPlayer[]> {
    const m = await this.storage.list<StoredPlayer>({ prefix: 'p:' })
    return [...m.values()].sort((a, b) => a.userId.localeCompare(b.userId))
  }

  private async savePlayer(p: CityPlayer, version: number): Promise<void> {
    await this.storage.put('p:' + p.userId, toStored(p, version))
  }

  private schedule(meta: Meta): Schedule {
    return {
      nextTickAt: meta.nextTickAt,
      tickHour: meta.tickHour,
      tickZone: meta.tickZone,
      manualTick: this.env.ALLOW_MANUAL_TICK === '1',
    }
  }

  private async viewFor(cityId: string, userId: string, city?: CityState): Promise<CityView> {
    const c = city ?? (await this.city())
    const players = (await this.all()).map(fromStored)
    return cityView(c, players, userId, this.schedule(await this.meta(cityId)))
  }

  private async reply(cityId: string, userId: string): Promise<GameReply> {
    const s = await this.stored(userId)
    if (!s) throw new RoomError(404, 'no_agent', 'Create your agent first.')
    const city = await this.city()
    const p = fromStored(s)
    return { version: s.version, state: forBrowser(p.game, city), report: s.report, city: await this.viewFor(cityId, userId, city) }
  }

  /* ------------------------------------------------------------- agents */

  /** A new agent, or a restart after going broke. */
  async join(cityId: string, agent: Agent, restart: boolean): Promise<GameReply> {
    await this.meta(cityId)
    const existing = await this.stored(agent.userId)
    if (existing && !restart) {
      /* Name or colour changed in D1; the game carries on. */
      await this.storage.put('p:' + agent.userId, { ...existing, name: agent.name, color: agent.color })
      return this.reply(cityId, agent.userId)
    }
    if (existing && restart && !fromStored(existing).game.gameOver)
      throw new RoomError(409, 'game_running', 'Your current game is still going.')
    let city = await this.city()
    const s = nextSeed(city)
    city = s.city
    const joined = joinCity(city, agent, s.seed, !existing)
    city = joined.city
    await this.storage.put('city', city)
    await this.savePlayer(joined.player, (existing?.version ?? 0) + 1)
    await this.mirror(cityId, [joined.player])
    return this.reply(cityId, agent.userId)
  }

  async game(cityId: string, userId: string): Promise<GameReply> {
    return this.reply(cityId, userId)
  }

  async view(cityId: string, userId: string): Promise<CityView> {
    return this.viewFor(cityId, userId)
  }

  /* -------------------------------------------------------------- moves */

  /** The player's moves, played here. A stale baseVersion (the tick ran, or
   *  another tab moved first) plays nothing and hands back the current game. */
  async act(cityId: string, userId: string, baseVersion: number, rawActions: unknown): Promise<GameReply & { stale?: true }> {
    const batch = parseBatch(rawActions, { city: true })
    if (!batch.ok) throw new RoomError(400, 'bad_action', batch.error)
    const s = await this.stored(userId)
    if (!s) throw new RoomError(404, 'no_agent', 'Create your agent first.')
    if (s.version !== baseVersion) return { ...(await this.reply(cityId, userId)), stale: true }
    if (batch.actions.length === 0) return this.reply(cityId, userId)
    const city = await this.city()
    if (city.status === 'finished') throw new RoomError(409, 'season_over', 'The season is over. The next one starts at the tick.')
    const p = fromStored(s)
    let next: CityPlayer
    try {
      next = applyPlayerActions(city, { ...p, game: withCityListings(p.game, city) }, batch.actions as Action[])
    } catch {
      throw new RoomError(400, 'bad_action', 'One of those moves broke the rules engine.')
    }
    next = { ...next, game: { ...next.game, marketPool: [], summary: null, promo: null } }
    await this.savePlayer(next, s.version + 1)
    return this.reply(cityId, userId)
  }

  async bid(cityId: string, userId: string, body: { listingId: string; amount: number; downPct: number }): Promise<CityView> {
    const s = await this.stored(userId)
    if (!s) throw new RoomError(404, 'no_agent', 'Create your agent first.')
    const city = await this.city()
    const r = placeBid(city, fromStored(s), body)
    if (!r.ok) throw new RoomError(400, r.error, r.message)
    await this.storage.put('city', r.city)
    /* An offer counts as checking in. */
    await this.storage.put('p:' + userId, { ...s, lastActiveWeek: r.city.week })
    return this.viewFor(cityId, userId, r.city)
  }

  async withdraw(cityId: string, userId: string, listingId: string): Promise<CityView> {
    const city = withdrawBid(await this.city(), userId, listingId)
    await this.storage.put('city', city)
    return this.viewFor(cityId, userId, city)
  }

  /* ------------------------------------------------------------- clock */

  /** The owner opens the season: everyone's game starts fresh at week 1 and
   *  the nightly alarm is set. */
  async start(cityId: string, userId: string): Promise<CityView> {
    const meta = await this.meta(cityId)
    const city = await this.city()
    if (city.status === 'running') throw new RoomError(409, 'already_running', 'The season is already running.')
    const players = (await this.all()).map(fromStored)
    if (!players.length) throw new RoomError(409, 'no_players', 'Make your agent first.')
    const versions = new Map((await this.all()).map((s) => [s.userId, s.version]))
    const r = startSeason(city, players)
    await this.storage.put('city', r.city)
    for (const p of r.players) await this.savePlayer(p, (versions.get(p.userId) ?? 0) + 1)
    await this.env.DB.prepare('UPDATE cities SET season = ? WHERE id = ?').bind(r.city.season, cityId).run()
    await this.mirror(cityId, r.players)
    await this.arm(meta)
    return this.viewFor(cityId, userId, r.city)
  }

  async setSchedule(cityId: string, userId: string, hour: number, zone: string): Promise<CityView> {
    if (!Number.isInteger(hour) || hour < 0 || hour > 23) throw new RoomError(400, 'bad_hour', 'Pick an hour from 0 to 23.')
    if (!isTimeZone(zone)) throw new RoomError(400, 'bad_zone', 'That isn’t a time zone.')
    const meta = { ...(await this.meta(cityId)), tickHour: hour, tickZone: zone }
    await this.storage.put('meta', meta)
    if ((await this.city()).status !== 'lobby') await this.arm(meta)
    return this.viewFor(cityId, userId)
  }

  private async arm(meta: Meta): Promise<void> {
    const at = nextTickAt(this.now(), meta.tickHour, meta.tickZone)
    await this.storage.put('meta', { ...meta, nextTickAt: at })
    await this.storage.setAlarm(at)
  }

  /** The overnight tick, from the alarm (or the owner's button in dev). */
  async runTick(): Promise<SeasonResult | null> {
    const meta = await this.storage.get<Meta>('meta')
    if (!meta) return null
    const city = await this.city()
    if (city.status === 'lobby') {
      await this.storage.put('meta', { ...meta, nextTickAt: null })
      await this.storage.deleteAlarm()
      return null
    }
    const stored = await this.all()
    const versions = new Map(stored.map((s) => [s.userId, s.version]))
    const r = tick(city, stored.map(fromStored))
    await this.storage.put('city', r.city)
    for (const p of r.players) await this.savePlayer(p, (versions.get(p.userId) ?? 0) + 1)
    await this.arm(meta)
    /* The D1 side is a record, not the game: a failure there must not undo
       a tick everyone has already had. */
    try {
      await this.mirror(meta.cityId, r.players)
      if (r.seasonOver) await this.archive(meta.cityId, r.seasonOver)
      if (city.status === 'finished')
        await this.env.DB.prepare('UPDATE cities SET season = ? WHERE id = ?').bind(r.city.season, meta.cityId).run()
    } catch (e) {
      console.error('tick mirror failed', meta.cityId, e)
    }
    return r.seasonOver
  }

  async manualTick(): Promise<void> {
    if (this.env.ALLOW_MANUAL_TICK !== '1') throw new RoomError(403, 'no_manual_tick', 'The tick runs overnight.')
    await this.runTick()
  }

  /* ---------------------------------------------------------------- D1 */

  /** Copies each player's standing (and a backup of their game) into D1, for
   *  the account pages and in case a city ever has to be rebuilt. */
  private async mirror(cityId: string, players: CityPlayer[]): Promise<void> {
    const now = this.now()
    const stmts = players.map((p) => {
      const s = summarize(p.game)
      return this.env.DB.prepare(
        `INSERT INTO saves (city_id, user_id, version, state, week, cash, net_worth, rank, game_over, updated_at)
         VALUES (?, ?, 1, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (city_id, user_id) DO UPDATE SET
           version = saves.version + 1, state = excluded.state, week = excluded.week, cash = excluded.cash,
           net_worth = excluded.net_worth, rank = excluded.rank, game_over = excluded.game_over,
           updated_at = excluded.updated_at`,
      ).bind(cityId, p.userId, toWire(p.game), s.week, s.cash, s.netWorth, s.rank, s.gameOver ? 1 : 0, now)
    })
    if (stmts.length) await this.env.DB.batch(stmts)
  }

  /** Week 52 is in the books: the season goes on the wall for good. */
  private async archive(cityId: string, result: SeasonResult): Promise<void> {
    const champ = result.standings[0]
    await this.env.DB.prepare(
      `INSERT INTO seasons (city_id, season, finished_at, champion_user_id, champion_name, champion_color,
                            champion_character_id, champion_net_worth, standings)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (city_id, season) DO NOTHING`,
    )
      .bind(
        cityId,
        result.season,
        this.now(),
        champ?.userId ?? null,
        champ?.name ?? null,
        champ?.color ?? null,
        champ?.characterId ?? null,
        champ?.netWorth ?? null,
        JSON.stringify(result.standings),
      )
      .run()
  }
}
