/* Phase 5A tuning. Character effects read these; no call site hardcodes one. */

export const P5 = {
  /** Derived hustle/swagger never below 1 after negative statMods. */
  STAT_MOD_FLOOR: 1,
  ACCENT_SLIP_WEEKS: 1,
  IZZY_ALLERGY_GHOST: 0.75,
  /** Character brags appear twice as often as rank brags in the rotation. */
  BRAG_CHAR_WEIGHT: 2,
} as const

/** The default character. Migrated saves and unknown ids land here. */
export const DEFAULT_CHARACTER_ID = 'you'
