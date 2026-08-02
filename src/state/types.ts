/* =========================================================================
   Shared domain types.
   Lifted from the Phase 1 spec's data model. No behavior lives here.
   ========================================================================= */

export type Stage = 'new' | 'shown' | 'ready'
export type Slot = 'outfit' | 'accessory' | 'vehicle' | 'office'
export type RankId = 'receptionist' | 'junior' | 'buyerAgent' | 'sellerAgent'
export type LogKind = 'money' | 'event' | 'deal' | 'flavor' | 'promotion'

/* ------------------------------------------------------------------ data */

export interface RankDef {
  id: RankId
  n: number
  name: string
  split: number
  req: { earnings: number; showings: number; deals: number }
  blurb: string
}

/** Which rank band a client belongs to. Seller-band clients are gated to
 *  Seller's Agent; everything else is always legal. */
export type RankBand = 'buyer' | 'seller'

export interface Archetype {
  id: string
  label: string
  surnames: string[]
  rankBand: RankBand
  /** [min, max] before the $5,000 rounding step. */
  price: [number, number]
  patience: number
  closeMod: number
  egoAffinity: number
  ghostChance: number
  intros: string[]
  ghosts: string[]
  successes: string[]
}

export interface SwagItem {
  id: string
  name: string
  price: number
  tier: 1 | 2 | 3
  slot: Slot
  hustle: number
  swagger: number
  ego: number
  upkeep: number
  unlockRank: RankId
  flavor: string
}

export interface SlotDef {
  id: Slot
  label: string
}

export type EventId =
  | 'ghosted'
  | 'lockbox'
  | 'poached'
  | 'referral'
  | 'hotMarket'
  | 'rateSpike'
  | 'lostPaperwork'
  | 'openHouseDisaster'
  | 'fiveStarReview'
  | 'cringeEvent'

export interface EventDef {
  id: EventId
  weight: number
  /** Weighted-pool gate. A pure predicate over state — no side effects. */
  condition: (s: GameState) => boolean
}

/* ----------------------------------------------------------------- state */

export interface Lead {
  id: string
  archetypeId: string
  clientName: string
  stage: Stage
  salePrice: number
  patience: number
  maxPatience: number
  retriedClose: boolean
  createdWeek: number
  /** Chosen once at creation so the quote on the card is stable. */
  intro: string
  /** Set by the `referral` event; worth a close-chance bump. */
  referralBonus: boolean
  /** Set on a successful close so the card can show its SOLD stamp for the
   *  rest of the week. Archived at the top of the next End Week. */
  sold?: boolean
}

export interface LogEntry {
  week: number
  text: string
  kind: LogKind
}

export interface Stats {
  hustle: number
  swagger: number
  ego: number
}

export interface Counters {
  showingsRun: number
  dealsClosed: number
  leadsLost: number
}

export interface ActiveModifier {
  closeChanceDelta: number
  expiresWeek: number
}

/** Itemised money line: [label, amount]. Amounts are always positive; the
 *  moneyIn/moneyOut bucket carries the sign. */
export type SummaryLine = [string, number]

export interface WeekSummary {
  week: number
  moneyIn: SummaryLine[]
  moneyOut: SummaryLine[]
  events: string[]
  net: number
  promo: string | null
  brag: string
}

export interface GameState {
  version: 1
  week: number
  cash: number
  careerEarnings: number
  ap: number
  rank: RankId
  /** Derived from equipped swag + permBonuses; recomputed on every action. */
  stats: Stats
  permBonuses: { hustle: number; swagger: number }
  leads: Lead[]
  ownedSwagIds: string[]
  equipped: Partial<Record<Slot, string>>
  counters: Counters
  activeModifiers: ActiveModifier[]
  log: LogEntry[]
  gameOver: boolean
  /** Transient UI state — stripped before persisting, never in a save file. */
  summary: WeekSummary | null
  promo: string | null
}

/* --------------------------------------------------------------- actions */

export type Action =
  | { type: 'WORK_PHONES' }
  | { type: 'ASSIST_SHOWING' }
  | { type: 'RUN_SHOWING'; leadId: string }
  | { type: 'ATTEMPT_CLOSE'; leadId: string }
  | { type: 'SIDE_HUSTLE' }
  | { type: 'BUY_SWAG'; itemId: string }
  | { type: 'EQUIP_SWAG'; itemId: string }
  | { type: 'END_WEEK' }
  | { type: 'IMPORT_SAVE'; state: GameState }
  | { type: 'RESTART' }
