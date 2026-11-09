/* localStorage I/O. Key and JSON shape are frozen — a save exported from the
   Phase 1 single-file build must import here and keep playing. Every access is
   wrapped so the game still runs when storage is unavailable. */

import type { GameState } from './types'
import { migrate } from './migrate'
import { parseImport, serialize } from './serial'

export { parseImport, serialize }

export const SAVE_KEY = 'res_save_v1'

export function loadSave(): GameState | null {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY)
    if (!raw) return null
    return migrate(JSON.parse(raw))
  } catch {
    return null
  }
}

export function writeSave(state: GameState): void {
  try {
    window.localStorage.setItem(SAVE_KEY, serialize(state))
  } catch {
    /* storage unavailable — game continues in memory */
  }
}
