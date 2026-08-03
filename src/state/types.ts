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

/* ------------------------------------------------------------- phase 3 */

export type MarketState = 'hot' | 'normal' | 'cold'
export type PropertyTypeId =
  | 'starter'
  | 'condo'
  | 'townhouse'
  | 'duplex'
  | 'apartment'
  | 'luxury'
  | 'vrbo'
export type RenoProjectId = 'cosmetic' | 'full' | 'luxuryPkg'

export interface PropertyTypeDef {
  id: PropertyTypeId
  label: string
  band: { min: number; max: number }
  units: number
  baseRentPerUnit: number
  hoaWeekly: number
  unlockRank: RankId
  renoEligible: RenoProjectId[]
  weight: number
  blurbs: string[]
}

export interface RenoProjectDef {
  id: RenoProjectId
  label: string
  /** Fraction of baseValue charged at start. */
  costPct: number
  weeks: number
  /** baseValue multiplier applied on completion. */
  valueMult: number
  /** Condition delta (`cosmetic`) or absolute target (`full`, `luxuryPkg`). */
  conditionAdd: number | null
  conditionSet: number | null
  requiresVacant: boolean
  requiresTopProducer: boolean
}

export interface TenantArchetype {
  id: string
  label: string
  qualityTier: 1 | 2 | 3
  weight: number
  payChance: number
  onSkip: 'recoverHalfLater' | 'gone'
  /** Baseline condition change per week. Negative wears the place down. */
  conditionPerWeek: number
  stayMin: number
  /** `null` means "never leaves voluntarily" — plannedStayWeeks is Infinity. */
  stayMax: number | null
  rentMod: number
  /** Gates checked at move-in against the property and the rent ratio. */
  availableMinCondition: number
  availableMaxR: number
  intro: string[]
  leave: string[]
  skip: string[]
  /** Only Steve has one; shown as the eviction confirmation body. */
  evictBody?: string
}

export interface TenantEventContext {
  property: Property
  unit: UnitState
  state: GameState
}

export interface TenantEventDef {
  id: string
  weight: number
  minor: boolean
  fixCost: number
  condition: (ctx: TenantEventContext) => boolean
  /** Multiplier applied on top of `weight` for this context. */
  weightMult: (ctx: TenantEventContext) => number
}

export interface MilestoneDef {
  id: string
  threshold: number
  label: string
  line: string
}

export interface OpenIssue {
  eventId: string
  weeksOpen: number
  fixCost: number
}

export interface UnitState {
  id: string
  tenant: null | {
    archetypeId: string
    name: string
    tenancyWeeks: number
    /** `Infinity` for archetypes that never leave voluntarily. */
    plannedStayWeeks: number
    owed: number
  }
  /** 0.70–1.40. Persists through vacancy. */
  rentR: number
  openIssue: OpenIssue | null
  /** Non-null means an eviction is in progress: no rent, tenant still present. */
  evictionWeeksLeft: number | null
}

export interface Property {
  id: string
  typeId: PropertyTypeId
  nickname: string
  /** Market-state-independent. Renovations modify THIS. */
  baseValue: number
  condition: number
  mortgage: { balance: number } | null
  /** Empty for the VRBO. */
  units: UnitState[]
  renovation: { projectId: RenoProjectId; weeksLeft: number } | null
  listedForSale: boolean
  boughtWeek: number
  isVrbo: boolean
  vrboProfitStreak: number
  /** Set true when a `full` renovation completes on the VRBO. */
  vrboRenoDone: boolean
}

export interface Listing {
  id: string
  typeId: PropertyTypeId
  intrinsicValue: number
  condition: number
  askPrice: number
  blurb: string
}

/** The generic choice queue. Distinct from Phase 2's `PendingChoice`, which is
 *  the single-slot choice-EVENT modal and is unchanged. */
export interface PortfolioChoice {
  id: string
  kind: 'lowball' | 'renewal' | 'vrboBuy'
  title: string
  body: string
  options: { label: string; actionTag: string }[]
  payload: Record<string, unknown>
}

export interface PortfolioSummaryRow {
  nickname: string
  rentIn: number
  moneyOut: number
  net: number
  events: string[]
  /** VRBO only — the diegetic occupancy percentage. */
  occupancyPct?: number
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
  | 'declineForever'
  | 'buyVrbo'
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
  portfolio: PortfolioSummaryRow[]
  net: number
  promo: string | null
  brag: string
}

export interface GameState {
  version: 3
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
  gagCounters: {
    vrboOffers: number
    nextVrboWeek: number
    vrboOwned: boolean
    /** Set by "Decline (forever)". Stops all future offers. */
    vrboDeclinedForever: boolean
  }
  /** channelId → the week number at which it starts producing again. */
  channelMuteUntil: Record<string, number>
  /** Transient-ish: survives a save so a mid-decision refresh isn't lost. */
  pendingChoice: PendingChoice | null
  properties: Property[]
  marketPool: Listing[]
  marketState: MarketState
  /** Pre-rolled at step 10 so Market Insight can't be save-scummed. */
  nextMarketState: MarketState
  /** `weeksLeft: 0` means no crash is active. */
  crash: { weeksLeft: number; lastCrashWeek: number }
  milestonesUnlocked: string[]
  propCoActive: boolean
  pendingChoices: PortfolioChoice[]
  nextPropertyId: number
  nextListingId: number
  nextChoiceId: number
  peakNetWorth: number
  /** The week Phase 3 state was first created. Gates the crash event. */
  firstP3Week: number
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
  | { type: 'BUY_PROPERTY'; listingId: string; downPct: number }
  | { type: 'SET_RENT'; propertyId: string; unitId: string; r: number }
  | { type: 'RENAME_PROPERTY'; propertyId: string; nickname: string }
  | { type: 'START_RENOVATION'; propertyId: string; projectId: RenoProjectId }
  | { type: 'LIST_FOR_SALE'; propertyId: string }
  | { type: 'DELIST'; propertyId: string }
  | { type: 'RESOLVE_PORTFOLIO_CHOICE'; choiceId: string; actionTag: string }
  | { type: 'HANDLE_ISSUE'; propertyId: string; unitId: string }
  | { type: 'EMERGENCY_REPAIR'; propertyId: string }
  | { type: 'EVICT'; propertyId: string; unitId: string }
  | { type: 'PAY_PRINCIPAL'; propertyId: string }
  | { type: 'TOGGLE_PROPCO' }
  | { type: 'BUY_VRBO'; downPct: number }
  | { type: 'DEBUG_SET_MARKET'; marketState: MarketState }
  | { type: 'DEBUG_FORCE_CRASH' }
  | { type: 'DEBUG_FILL_VACANCIES' }
  | { type: 'DEBUG_CASH' }
