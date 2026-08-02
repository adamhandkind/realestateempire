/* Log helpers. Not in the migration spec's file list, but both the reducer and
   the event resolver append log lines, and logic/ may not import from state/.
   Pure: returns new state, never mutates. */

import type { GameState, LogEntry, LogKind } from '../state/types'

/** Newest first, capped at 300 entries. */
export function logAdd(
  state: GameState,
  kind: LogKind,
  text: string,
): LogEntry[] {
  return [{ week: state.week, kind, text }, ...state.log].slice(0, 300)
}

export function withLog(
  state: GameState,
  kind: LogKind,
  text: string,
): GameState {
  return { ...state, log: logAdd(state, kind, text) }
}
