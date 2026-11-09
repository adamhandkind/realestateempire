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

import { setSeed, currentSeed } from '../logic/rand'
import { endWeek, initialState, newGame, reducer } from '../state/reducer'
import { parseImport, serialize } from '../state/serial'
import type { Action, GameState } from '../state/types'

export type { Action, GameState }
export { endWeek, initialState }

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

/** Applies one player action. Pure: same state + same action → same result. */
export const applyAction: (state: GameState, action: Action) => GameState =
  reducer

/** Applies actions in order — a replay, or one player's queued moves. */
export function applyActions(state: GameState, actions: Action[]): GameState {
  return actions.reduce(applyAction, state)
}

/** The state as text for storage or the wire. Drops transient UI fields. */
export const toWire: (state: GameState) => string = serialize

/** Back from text, through the save migrator. Null if it isn't a game. */
export function fromWire(text: string): GameState | null {
  try {
    return parseImport(text)
  } catch {
    return null
  }
}
