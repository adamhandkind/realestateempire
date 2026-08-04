/* Phase 8 tuning. Every number the phone call moves lives here.
   Per the spec's tuning note: if the minigame feels too strong, adjust
   MOMENTUM_MAX and the GREAT/GOOD values first — never the reaction table in
   data/callBeats.ts, which is the game's actual content. */

export const P8 = {
  CALL_THRESHOLD: 400000, // salePrice at or above this triggers a call
  ALWAYS_CALL: ['luxLorenzo', 'celebrityCleo', 'oldMoneyOtis'] as const,
  TURNS: 3,
  MOMENTUM_START: 0,
  /* Momentum IS the close-chance delta, in points. +18 momentum is +0.18 chance. */
  MOMENTUM_MIN: -30,
  MOMENTUM_MAX: 30,
  /* Per-turn momentum deltas, before stat scaling and the repeat penalty. */
  GREAT: 10,
  GOOD: 5,
  NEUTRAL: 0,
  BAD: -6,
  TERRIBLE: -12,
  REPEAT_PENALTY: 4, // subtracted per prior use of the same tactic this call
  READ_COST_AP: 0, // Read is free, but it consumes the turn's tactic slot
  PATIENCE_ON_HANGUP: 1,
  HANGUP_MOMENTUM: -25, // at or below this, turn 2 ends the call immediately
  PERFECT_BONUS: 8, // all three turns GREAT
  EGO_TACTIC_SCALE: 0.4, // Flex scales with ego x egoAffinity
  SWAGGER_TACTIC_SCALE: 0.5, // Push scales with swagger
  RETRY_MOMENTUM: -5, // a second call on the same lead starts here
} as const
