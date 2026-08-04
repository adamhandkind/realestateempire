/* Two helpers that every state change leans on, extracted from the reducer so
   logic/close.ts can use them without an import cycle. */

import { charLine, hasFlag, pushStatModifier } from './characters'
import { deriveStats } from './economy'
import { withLog } from './log'
import { P5 } from '../data/p5'
import type { GameState } from '../state/types'

/** Stats are derived, so every state change re-syncs them. */
export function sync(state: GameState): GameState {
  return { ...state, stats: deriveStats(state) }
}

/** A failed close costs the accent, and the accent was the swagger. Does not
 *  stack: a slip while one is already live is a no-op. */
export function applyAccentSlip(state: GameState): GameState {
  if (!hasFlag(state, 'accentSlip')) return state
  const pushed = pushStatModifier(state, {
    stat: 'swagger',
    delta: -1,
    expiresWeek: state.week + P5.ACCENT_SLIP_WEEKS,
    label: 'Accent Slip',
  })
  if (!pushed) return state
  const line = charLine(state, 'accentSlip')
  return line ? withLog(pushed, 'event', line) : pushed
}
