/* The rules engine: the one door into the game's rules.

   Everything the game decides — leads, closes, rent, tenants, rivals, the
   week tick — goes through here, and nothing behind this door touches React,
   the DOM, storage, the clock or Math.random. That is what lets the same code
   run in the browser today and inside the city's server (a Cloudflare Durable
   Object) in Phase 3: the browser sends Actions, the server applies them, and
   the result is identical wherever it runs.

   Rules of the road (enforced by engine/__tests__/boundary.test.ts):
   - logic/, data/, state/ (except save.ts), city/ and engine/ never import
     react, react-dom, three or a component, and never read window, document,
     localStorage, Date.now or Math.random (rand.ts owns the one escape hatch).
   - All randomness comes from logic/rand, seeded from GameState.rngSeed by
     the reducer, so a state plus an action list is a complete replay.
   - A state survives a JSON round trip (toWire/fromWire) and keeps playing
     exactly as the in-memory one would. */

import { CHARACTERS } from '../data/characters'
import { rankOf } from '../logic/economy'
import { netWorth } from '../logic/portfolio'
import { setSeed, currentSeed } from '../logic/rand'
import { calendarMarket, quarterOf, quarterStart } from '../logic/cityMode'
import { endWeek, initialState, newGame, reducer } from '../state/reducer'
import { parseWire, serialize } from '../state/serial'
import type { Action, GameState } from '../state/types'

export type { Action, GameState }
export { endWeek, initialState }
export { canonicalJson, digestText, stateDigest } from './digest'
export { isClientAction, isCityClientAction } from './clientActions'
export { settleForTick } from '../state/reducer'
export { AGENT_COLORS } from '../data/agentColors'

/** A brand new game for `characterId`, fully determined by `seed`. */
export function createGame(characterId: string, seed: number): GameState {
  setSeed(seed)
  try {
    const s = newGame(characterId)
    return { ...s, rngSeed: currentSeed() ?? seed }
  } finally {
    setSeed(null)
  }
}

/** A new game in a shared city, joining at city week `week` (1 for a
 *  season's start; later for someone who joins mid-season). The calendar
 *  numbers inside the game (log weeks, the Goldies quarter, the VRBO
 *  salesman's schedule) are moved along so it plays as if it began then. */
export function createCityGame(characterId: string, seed: number, week = 1): GameState {
  const fresh = createGame(characterId, seed)
  const d = Math.max(0, Math.floor(week) - 1)
  const w = d + 1
  return {
    ...fresh,
    cityMode: true,
    marketPool: [],
    week: w,
    marketState: calendarMarket(w),
    nextMarketState: calendarMarket(w + 1),
    log: fresh.log.map((l) => ({ ...l, week: l.week + d })),
    gagCounters: { ...fresh.gagCounters, nextVrboWeek: fresh.gagCounters.nextVrboWeek + d },
    firstP3Week: fresh.firstP3Week + d,
    properties: fresh.properties.map((p) => ({ ...p, boughtWeek: p.boughtWeek + d })),
    /* The Goldies run every quarter, on the city's calendar. */
    seasonStartWeek: quarterStart(w),
    season: { ...fresh.season, seasonIndex: quarterOf(w) },
  }
}

/** Applies one player action. Pure: same state + same action → same result. */
export const applyAction: (state: GameState, action: Action) => GameState =
  reducer

/** Applies actions in order — a replay, or one player's queued moves. */
export function applyActions(state: GameState, actions: Action[]): GameState {
  return actions.reduce(applyAction, state)
}

/** The state as text for storage or the wire. Drops transient UI fields. */
export const toWire: (state: GameState) => string = serialize

/** Back from text exactly as it went out (an older save version is
 *  migrated first). Null if it isn't a game. */
export function fromWire(text: string): GameState | null {
  try {
    return parseWire(text)
  } catch {
    return null
  }
}

/* ---- What the server copies out of a save for the leaderboard ---- */

export const isCharacterId = (id: string): boolean =>
  CHARACTERS.some((c) => c.id === id)

export interface GameSummary {
  week: number
  cash: number
  netWorth: number
  rank: string
  rankName: string
  gameOver: boolean
}

export function summarize(state: GameState): GameSummary {
  return {
    week: state.week,
    cash: Math.round(state.cash),
    netWorth: Math.round(netWorth(state)),
    rank: state.rank,
    rankName: rankOf(state.rank).name,
    gameOver: state.gameOver,
  }
}
