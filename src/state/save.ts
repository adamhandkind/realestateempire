/* localStorage I/O. Key and JSON shape are frozen — a save exported from the
   Phase 1 single-file build must import here and keep playing. Every access is
   wrapped so the game still runs when storage is unavailable. */

import type { GameState } from './types'
import { initialState } from './reducer'

export const SAVE_KEY = 'res_save_v1'

/** Strips the transient UI fields that never belong in a save file. */
export function serialize(state: GameState): string {
  const { summary: _summary, promo: _promo, ...rest } = state
  return JSON.stringify(rest)
}

export function loadSave(): GameState | null {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY)
    if (!raw) return null
    const s = JSON.parse(raw)
    if (!s || (s.version !== 1 && s.version !== 2)) return null
    return { ...initialState(), ...s, summary: null, promo: null }
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

/** Returns the parsed save, or null if the paste isn't one. */
export function parseImport(text: string): GameState | null {
  const parsed = JSON.parse(text)
  if (parsed && (parsed.version === 1 || parsed.version === 2))
    return parsed as GameState
  return null
}
