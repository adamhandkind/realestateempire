/* The save format as plain text, with no storage attached. Kept apart from
   save.ts (which touches window.localStorage) so the engine — and the
   server — can serialize a game without a browser in the room. */

import type { GameState } from './types'
import { migrate, restoreForeverTenants } from './migrate'

/** Strips the transient UI fields that never belong in a save file. */
export function serialize(state: GameState): string {
  const { summary: _summary, promo: _promo, ...rest } = state
  return JSON.stringify(rest)
}

/** Returns the parsed save, or null if the JSON parsed but isn't one of ours.
 *  Throws on malformed JSON; the caller catches that and says so.
 *
 *  This is the *loading* path: it runs the migrator, which treats the load
 *  as the player coming back to the game later — an open phone call is hung
 *  up, the post composer is dismissed. Right for a refresh or an import;
 *  wrong for a game that is merely crossing the wire (see parseWire). */
export function parseImport(text: string): GameState | null {
  return migrate(JSON.parse(text))
}

const CURRENT_VERSION: GameState['version'] = 9

/** The exact inverse of serialize for a current-version save: the game comes
 *  back as it left, mid-call and mid-post included. The server reloads a
 *  player's game between every batch of moves, so anything this dropped
 *  would make the server and the browser disagree.
 *
 *  JSON's only loss in a GameState is Infinity (a tenant who never leaves),
 *  which is restored. Older saves still go through the migrator. Only for
 *  text this codebase wrote itself — imports use parseImport. */
export function parseWire(text: string): GameState | null {
  const raw = JSON.parse(text) as Partial<GameState> | null
  if (!raw || typeof raw !== 'object') return null
  if (raw.version !== CURRENT_VERSION) return migrate(raw)
  if (!Array.isArray(raw.properties)) return migrate(raw)
  return {
    ...(raw as GameState),
    properties: raw.properties.map(restoreForeverTenants),
    summary: null,
    promo: null,
  }
}
