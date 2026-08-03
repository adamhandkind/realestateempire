/* The character layer. Every hook point in the game reads a CharacterDef field
   through one of these helpers — no module anywhere branches on a character id.

   The complete hook map (Phase 5A spec §5), and where each one lives:

     1  deriveStats            logic/economy.ts   statMods, egoCap, statModifiers
     2  closeChance            logic/leads.ts     closeGlobalDelta, closePerArchetype
     3  AP reset / pips        state/reducer.ts, components/Header.tsx
     4  shouldCringe           logic/events.ts    cringeChanceDelta
     5  nextRank               logic/economy.ts   promotionEarningsMult
     6  marketing billing      logic/marketing.ts marketingCostMult, repDecayMult,
                                                  tiktokEarly
     7  badReview condition    data/events.ts     badReviewImmune
     8  ghost rolls            logic/leads.ts     izzyAllergy
     9  BUY_SWAG / EQUIP_SWAG  state/reducer.ts   noHighEgoSwag, starting kit
     10 EVICT                  state/reducer.ts   freeEvictions
     11 flip resolution        logic/portfolio.ts flipColdImmune
     12 market insight         logic/portfolio.ts marketInsight
     13 brag rotation          logic/economy.ts   brags
     14 accentSlip             state/reducer.ts   accentSlip
     15 raw numbers (UI only)  LeadsTab, UnitRow  showRawNumbers                */

import { CHARACTERS } from '../data/characters'
import { DEFAULT_CHARACTER_ID, P5 } from '../data/p5'
import type {
  CharFlag,
  CharacterDef,
  GameState,
  StatModifier,
  Stats,
} from '../state/types'

export const FALLBACK_CHARACTER: CharacterDef = CHARACTERS.find(
  (c) => c.id === DEFAULT_CHARACTER_ID,
)!

export const characterOf = (id: string): CharacterDef | undefined =>
  CHARACTERS.find((c) => c.id === id)

/** The active character. An unknown id plays as 'you'. */
export const getChar = (s: GameState): CharacterDef =>
  characterOf(s.characterId) ?? FALLBACK_CHARACTER

export const hasFlag = (s: GameState, flag: CharFlag): boolean =>
  getChar(s).flags.includes(flag)

/** A character's line, with `{token}` placeholders filled. */
export function charLine(
  s: GameState,
  key: string,
  vars: Record<string, string> = {},
): string | null {
  const raw = getChar(s).lines[key]
  if (!raw) return null
  return Object.keys(vars).reduce(
    (t, k) => t.split('{' + k + '}').join(vars[k]),
    raw,
  )
}

/* ------------------------------------------------------------- hook 1 */

/** Summed deltas per stat from every unexpired stat modifier. */
export function statModifierDelta(s: GameState, stat: keyof Stats): number {
  return (s.statModifiers ?? []).reduce(
    (t, m) => (m.expiresWeek > s.week && m.stat === stat ? t + m.delta : t),
    0,
  )
}

/** The ego ceiling: the global cap, lowered by the character's own cap. */
export const egoCapFor = (s: GameState, globalCap: number): number =>
  Math.min(globalCap, getChar(s).egoCap ?? Infinity)

export const STAT_FLOOR = P5.STAT_MOD_FLOOR

/** Non-stacking: a second slip while one is live is a no-op. */
export function pushStatModifier(
  s: GameState,
  mod: StatModifier,
): GameState | null {
  const live = (s.statModifiers ?? []).some(
    (m) => m.label === mod.label && m.expiresWeek > s.week,
  )
  if (live) return null
  return { ...s, statModifiers: [...(s.statModifiers ?? []), mod] }
}
