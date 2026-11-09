/* The save format as plain text, with no storage attached. Kept apart from
   save.ts (which touches window.localStorage) so the engine — and one day the
   server — can serialize a game without a browser in the room. */

import type { GameState } from './types'
import { migrate } from './migrate'

/** Strips the transient UI fields that never belong in a save file. */
export function serialize(state: GameState): string {
  const { summary: _summary, promo: _promo, ...rest } = state
  return JSON.stringify(rest)
}

/** Returns the parsed save, or null if the JSON parsed but isn't one of ours.
 *  Throws on malformed JSON; the caller catches that and says so. */
export function parseImport(text: string): GameState | null {
  return migrate(JSON.parse(text))
}
