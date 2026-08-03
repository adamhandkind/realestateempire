/* Phase 6 tuning. Every number the territory system moves lives here.
   Per the spec's tuning note: if pacing is off, adjust the rival aggression
   ranges in data/rivals.ts and DECAY_INACTIVE first — never the thresholds or
   the transfer amounts. */

export const P6 = {
  SHARE_TOTAL: 100, // per district; owners: 'player' | rivalId | 'indies'
  SHARE_DECIMALS: 1, // store one decimal; round after every transfer
  GAIN_DEAL: 2.0, // closing a deal in the district
  GAIN_FARM: 1.0, // FARM_DISTRICT action
  GAIN_PROPERTY_BUY: 1.0, // one-time on purchase
  GAIN_PROPERTY_PASSIVE: 0.2, // per owned property in district, per week
  GAIN_CHANNEL_TARGET: 0.5, // per targeted channel, per week
  DECAY_INACTIVE: 0.5, // player, per district with zero activity that week
  RIVAL_DECAY_OFFFOCUS: 0.2, // rival, per non-focus district, per week
  RIVAL_HOME_DEFENSE: 2.0, // rival bonus when the player leads their home
  THRESH_PRESENCE: 25, // +0.05 close chance on leads from that district
  THRESH_DOMINANT: 50, // district perk activates
  THRESH_LOCKED: 75, // rivals there floor at 5 combined; lockout event
  RIVAL_LOCKED_FLOOR: 5,
  SHOWDOWN_COST: 500,
  SHOWDOWN_BASE: 0.5,
  SHOWDOWN_SWAGGER_FACTOR: 0.05,
  SHOWDOWN_WIN_SHARE: 4.0,
  SHOWDOWN_LOSE_SHARE: 1.0,
  SHOWDOWN_DECLINE_SHARE: 1.0,
  UNDERCUT_WEEKS: 2,
  UNDERCUT_COMMISSION_MULT: 0.9,
  LEAD_DISTRICT_BASE_WEIGHT: 10,
  KING_REQUIREMENT: 8, // dominant districts needed
} as const

/** The one non-player, non-rival owner. Decay drains here; gains drain it first. */
export const INDIES = 'indies'
export const PLAYER = 'player'

/** How many weeks a district's lockout line stays quiet after firing. */
export const LOCK_REFIRE_WEEKS = 20
/** How many weeks between one rival's home-defense lines. */
export const DEFENSE_COOLDOWN_WEEKS = 4
