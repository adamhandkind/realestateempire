/* =========================================================================
   Shared domain types.
   Lifted from the Phase 1 spec's data model. No behavior lives here.
   ========================================================================= */

export type Stage = 'new' | 'shown' | 'ready'
export type Slot = 'outfit' | 'accessory' | 'vehicle' | 'office' | 'bodyMod'
export type RankId =
  | 'receptionist'
  | 'junior'
  | 'buyerAgent'
  | 'sellerAgent'
  | 'topProducer'
export type LogKind = 'money' | 'event' | 'deal' | 'flavor' | 'promotion'

/* ------------------------------------------------------------------ data */

export interface RankDef {
  id: RankId
  n: number
  name: string
  split: number
  /** `rep` is Phase 2's Top Producer gate; absent means "no rep requirement". */
  req: { earnings: number; showings: number; deals: number; rep?: number }
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
  /** Reputation required before this archetype enters the lead pool. */
  unlockRep?: number
  intros: string[]
  ghosts: string[]
  successes: string[]
}

export interface SwagItem {
  id: string
  name: string
  price: number
  tier: 1 | 2 | 3 | 4
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

export interface Channel {
  id: string
  name: string
  weeklyCost: number
  /** Probability of producing an inbound lead each End Week. */
  inboundChance: number
  /** Archetype ids this channel skews toward. Empty means "no skew". */
  leadPool: string[]
  repPerWeek: number
  unlockRank: RankId
  unlockRep: number
  flavor: string
}

export interface RepThreshold {
  rep: number
  /** Shown in the toast when the player crosses it. */
  toast: string
}

export interface OutfitPreset {
  name: string
  equipped: Partial<Record<Slot, string>>
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
  | 'viralSuccess'
  | 'badReview'
  | 'vrboSpam'
  | 'tvInterview'
  | 'algorithmChange'
  | 'copycatAgent'
  | 'charityGala'

/** The events that pause End Week for a player decision. */
export type ChoiceEventId =
  | 'vrboSpam'
  | 'tvInterview'
  | 'copycatAgent'
  | 'charityGala'

/** Every answer a choice modal can produce. The reducer switches on these. */
export type ChoiceKey =
  | 'decline'
  | 'humble'
  | 'ego'
  | 'cease'
  | 'eat'
  | 'attend'
  | 'skip'

export interface PendingChoice {
  id: ChoiceEventId
  title: string
  body: string
  /** Rendered left-to-right. `key` is echoed back in RESOLVE_CHOICE_EVENT. */
  options: { key: ChoiceKey; label: string; hint: string }[]
}

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
  /** Set when the lead arrived via a marketing channel — drives the badge. */
  channelId?: string
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
  marketing: {
    spend: number
    leads: number
    repChange: number
  }
  net: number
  promo: string | null
  brag: string
}

export interface GameState {
  version: 2
  week: number
  cash: number
  careerEarnings: number
  ap: number
  rank: RankId
  /** Derived from equipped swag + permBonuses; recomputed on every action. */
  stats: Stats
  permBonuses: { hustle: number; swagger: number; ego: number }
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
  /** 0–100, clamped. */
  reputation: number
  activeChannelIds: string[]
  outfitPresets: (OutfitPreset | null)[]
  /** Running-gag bookkeeping. Only the 424/7 VRBO offer uses it so far. */
  gagCounters: { vrboOffers: number; nextVrboWeek: number }
  /** channelId → the week number at which it starts producing again. */
  channelMuteUntil: Record<string, number>
  /** Transient-ish: survives a save so a mid-decision refresh isn't lost. */
  pendingChoice: PendingChoice | null
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
  | { type: 'TOGGLE_CHANNEL'; channelId: string }
  | { type: 'SAVE_PRESET'; index: number; name: string }
  | { type: 'LOAD_PRESET'; index: number }
  | { type: 'RENAME_PRESET'; index: number; name: string }
  | { type: 'RESOLVE_CHOICE_EVENT'; key: ChoiceKey }
  | { type: 'END_WEEK' }
  | { type: 'IMPORT_SAVE'; state: GameState }
  | { type: 'RESTART' }
