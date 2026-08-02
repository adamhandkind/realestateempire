import type { RepThreshold } from '../state/types'

export const REP_MIN = 0
export const REP_MAX = 100

/** Rep lost each week the player has no marketing running at all. */
export const REP_DECAY_PER_WEEK = 1
/** Rep earned per closed deal. */
export const REP_PER_DEAL = 1
/** Rep lost by a cringe event once the player is famous enough to be noticed. */
export const REP_CRINGE_PENALTY = 5
/** Rep at or above which cringe events start costing reputation. */
export const REP_CRINGE_SCALES_AT = 50

/* The single source of truth for every rep gate. Logic reads these constants
   by name; nothing hardcodes a number at a call site. */
export const REP_INBOUND_AT = 15
export const REP_BETTER_CLIENTS_AT = 30
export const REP_PRESTIGE_AT = 50
export const REP_CELEBRITY_AT = 75
export const REP_FREE_LEAD_AT = 90

export const REP_THRESHOLDS: RepThreshold[] = [
  {
    rep: REP_INBOUND_AT,
    toast:
      "You've been recognized at a gas station. The phone starts ringing on its own now.",
  },
  {
    rep: REP_BETTER_CLIENTS_AT,
    toast:
      'A stranger said “I know you from somewhere” and meant it kindly. Better clients are circling.',
  },
  {
    rep: REP_PRESTIGE_AT,
    toast:
      'A local producer has your number. So does a man who whispers about money.',
  },
  {
    rep: REP_CELEBRITY_AT,
    toast:
      'Someone asked for a selfie and did not ask what you do first. Verified.',
  },
  {
    rep: REP_FREE_LEAD_AT,
    toast: 'Your face IS the marketing now. People just show up.',
  },
]
