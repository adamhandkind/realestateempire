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
  /** Never rendered in the shop. Only a character's starting kit grants it. */
  shopHidden?: boolean
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
  /** Phase 6. Inherited from the listing it was bought as. */
  districtId: string
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
  /** Phase 6. Chosen from the districts whose propertyTypes include typeId. */
  districtId: string
}

/** The generic choice queue. Distinct from Phase 2's `PendingChoice`, which is
 *  the single-slot choice-EVENT modal and is unchanged. */
export interface PortfolioChoice {
  id: string
  kind: 'lowball' | 'renewal' | 'vrboBuy' | 'showdown'
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

/* ------------------------------------------------------------- phase 5a */

/** Minimal seed; expanded to a full Property at init. */
export interface StartingProperty {
  typeId: PropertyTypeId
  street: string
  baseValue: number
  condition: number
  mortgageBalance: number | null
  /** One entry per unit. `null` is a vacancy. */
  tenants: (null | { archetypeId: string; rentR: number })[]
}

export type CharFlag =
  /** badReview's event condition returns false. */
  | 'badReviewImmune'
  /** EVICT costs $0 (still 1 AP) and skips the guilt modal entirely. */
  | 'freeEvictions'
  /** nextMarketState visible from week 1, same UI as the $500k milestone. */
  | 'marketInsight'
  /** Cold markets (and a crash) contribute 0 to her saleChance. */
  | 'flipColdImmune'
  /** UI: exact close % on Ready lead cards; tenant payChance % on unit rows. */
  | 'showRawNumbers'
  /** Cannot EQUIP swag with ego >= 2. Buying stays legal. */
  | 'noHighEgoSwag'
  /** A failed close costs 1 Swagger for a week. */
  | 'accentSlip'
  /** influencerIzzy leads ghost at P5.IZZY_ALLERGY_GHOST. */
  | 'izzyAllergy'
  /** TikTok's unlockRank evaluates as 'junior' for this character. */
  | 'tiktokEarly'

export interface CharacterDef {
  id: string
  name: string
  /** One-liner under the name on the card. */
  tagline: string
  /** 2–3 sentences, select screen detail panel. */
  bio: string
  portrait: { initials: string; accent: string; emoji: string }
  start: {
    cash: number
    rank: RankId
    reputation: number
    /** Starting items BYPASS rank/tier unlock checks. */
    ownedSwagIds: string[]
    equipped: Partial<Record<Slot, string>>
    properties: StartingProperty[]
  }
  /** Default 5; used everywhere AP_PER_WEEK was used. */
  apPerWeek: number
  /** Added inside deriveStats, before caps. */
  statMods: { hustle: number; swagger: number; ego: number }
  /** Overrides the ego stat cap when lower. */
  egoCap: number | null
  closeGlobalDelta: number
  /** archetypeId -> delta, added in closeChance. */
  closePerArchetype: Record<string, number>
  /** Multiplies reqEarnings in nextRank. */
  promotionEarningsMult: number
  cringeChanceDelta: number
  /** Multiplies channel weeklyCost at billing. */
  marketingCostMult: number
  repDecayMult: number
  flags: CharFlag[]
  /** Exactly 4. Joins the brag rotation at ALL ranks. */
  brags: string[]
  /** Special log lines, keyed per character. */
  lines: Record<string, string>
}

/* -------------------------------------------------------------- phase 6 */

/** Which listing types generate in a district, and who lives there. */
export interface DistrictDef {
  id: string
  name: string
  blurb: string
  /** Multiplies every sale price and intrinsic value rolled here. */
  priceMult: number
  /** SVG polygon points, in the 1000x700 map viewBox. */
  polygon: string
  labelPos: { x: number; y: number }
  /** archetypeId -> multiplier on its base weight. Unlisted is 1; 0 is never. */
  leadAffinity: Record<string, number>
  propertyTypes: PropertyTypeId[]
  /** Active while the player holds >= P6.THRESH_DOMINANT share here. */
  dominantPerk: { id: DistrictPerkId; text: string }
  /** Exactly 2. One is logged per FARM_DISTRICT. */
  farmLines: string[]
}

export type DistrictPerkId =
  | 'saleBoost'
  | 'luxPipeline'
  | 'referralNetwork'
  | 'tradeRates'
  | 'benchmark'
  | 'roomForRent'
  | 'localsDeal'
  | 'firstNamesBasis'

export interface RivalDef {
  id: string
  name: string
  firm: string
  /** Their fill colour wherever they hold the plurality. */
  color: string
  /** Read against the player's Swagger stat in a showdown. */
  swagger: number
  homeDistrict: string
  focusDistricts: string[]
  /** Weekly share points, inclusive. */
  aggression: { min: number; max: number }
  lines: {
    gain: string
    defense: string
    showdownWin: string
    showdownLoss: string
    locked: string
    poach: string
  }
}

/** One district's ownership split. Keys: 'player', 'indies', each rivalId.
 *  Always sums to exactly P6.SHARE_TOTAL. */
export interface DistrictShareState {
  shares: Record<string, number>
}

/* -------------------------------------------------------------- phase 7 */

export type TableTierId = 'none' | 'seat' | 'table' | 'sponsor'

/** Which speech the player gave. Echoed back in GIVE_SPEECH. */
export type SpeechKey = 'humble' | 'gracious' | 'fullEgo'

export interface AwardDef {
  id: string
  name: string
  /** The joke line under the category name. */
  subtitle: string
  /** The player's RAW score, pre-normalization, pre-jitter, pre-table-bonus. */
  score: (s: GameState, season: SeasonStats) => number
  /**
   * The raw score a dominant season in this category produces. §6 divides by
   * this to put all nine categories on one ~0–100 scale, which is the only
   * thing that makes a single flat RIVAL_BASE meaningful across formulas whose
   * natural magnitudes differ by an order of magnitude.
   */
  reference: number
  /** rivalId -> multiplier on their rolled score. Missing reads as 1. */
  rivalAffinity: Record<string, number>
  /** Active while the trophy is DISPLAYED. */
  perk: { id: string; text: string }
  /** Logged and shown on the ceremony card. */
  winLine: string
  /** Shown when a rival takes it. `{winner}` is interpolated. */
  loseLine: string
}

/** Accumulated during a season, reset to zero at the ceremony. */
export interface SeasonStats {
  /** 0-based; season 1 is index 0. */
  seasonIndex: number
  dealsClosed: number
  commissionEarned: number
  showingsRun: number
  leadsLost: number
  biggestSale: number
  closeAttempts: number
  closeSuccesses: number
  cringeEvents: number
  swagSpend: number
  /** 0 if Phase 2 absent. */
  marketingSpend: number
  /** 0 if Phase 2 absent. */
  repGained: number
  renovationsCompleted: number
  tenantsEvicted: number
  tenantIssuesFixed: number
  /** 0 if Territory absent. */
  districtsFarmed: number
  propertiesBought: number
}

/** Every countable field of SeasonStats. `seasonIndex` is not one of them. */
export type SeasonStatKey = Exclude<keyof SeasonStats, 'seasonIndex'>

export interface AwardResult {
  awardId: string
  winnerId: string
  playerScore: number
  /** nomineeId -> final score. Always four entries. */
  scores: Record<string, number>
}

export interface CeremonyState {
  seasonIndex: number
  results: AwardResult[]
  /** The ceremony UI walks through results one at a time. */
  revealIndex: number
  speechGiven: boolean
}

export interface Trophy {
  awardId: string
  seasonIndex: number
  displayed: boolean
}

export interface StatModifier {
  stat: 'hustle' | 'swagger' | 'ego'
  delta: number
  expiresWeek: number
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
  | 'viralSuccess'
  | 'badReview'
  | 'vrboSpam'
  | 'tvInterview'
  | 'algorithmChange'
  | 'copycatAgent'
  | 'charityGala'
  | 'marketCrash'
  | 'showdown'
  | 'fruitBasket'
  | 'undercut'
  | 'krystalViral'

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
  /** Phase 6. Every lead belongs to a district; the card shows its chip. */
  districtId: string
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
  /** Phase 6. One row per district that moved, plus the rival headlines. */
  territory: {
    rows: { name: string; delta: number; holder: string }[]
    rivalMoves: string[]
  }
  net: number
  promo: string | null
  brag: string
}

export interface GameState {
  version: 6
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
  /** Temporary stat swings. Expired entries drop in the END_WEEK expiry step. */
  statModifiers: StatModifier[]
  /** The chosen agent. Unknown ids fall back to 'you' via getChar. */
  characterId: string
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
    /* Phase 5A gag bookkeeping. Optional so a state literal built before the
       roster existed still type-checks; every read defaults. */
    /** The suppressed-bad-review line fires once per run. */
    daveReviewLine?: boolean
    /** Ranks the committee has already complained about. */
    chipPromoRanks?: string[]
    /** True while mid-dry-spell, so the fade line fires once per spell. */
    blaineDrySpell?: boolean
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

  /* ------------------------------------------------------------ phase 6 */

  /** districtId -> share split. Every district is always present. */
  territory: Record<string, DistrictShareState>
  rivalEffects: {
    /** Zamboni undercut countdown. 0 means no discount is active. */
    undercutWeeksLeft: number
    /** rivalId -> the week their defense line last fired. */
    lastDefense: Record<string, number>
    /** districtId -> the week its lockout line last fired. */
    lastLock: Record<string, number>
  }
  /** The fruit-basket reveal. Renders as a pulse for one week, then clears. */
  chadwickIntel: { district: string; week: number } | null
  kingOfBrantford: boolean
  /** channelId -> districtId. Only billboard/benchDomination/tvCommercial. */
  channelTargets: Record<string, string>
  /** Districts the player did something in this week. Cleared at week end. */
  weekDealDistricts: string[]
  /** Districts farmed this week. Cleared at week end alongside the above. */
  weekFarmedDistricts: string[]

  /* ------------------------------------------------------------ phase 7 */

  /** The running season ledger. Reset at every ceremony. */
  season: SeasonStats
  /** The week the current season began. `seasonWeek()` reads this. */
  seasonStartWeek: number
  /** awardIds the player is nominated for; null outside the window. */
  nominations: string[] | null
  /** Bought for the CURRENT pending ceremony; reset after it. */
  tableTier: TableTierId
  /** Non-null means the ceremony modal is open. */
  ceremony: CeremonyState | null
  trophies: Trophy[]
  awardHistory: { seasonIndex: number; results: AwardResult[] }[]
  /** >0 means the sponsor cringe penalty is live; decremented per season. */
  sponsorCringeSeasons: number
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
  | { type: 'NEW_GAME'; characterId: string }
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
  /** Testing tool only — swaps the active character live. */
  | { type: 'DEBUG_SET_CHARACTER'; characterId: string }
  /* ---- phase 6 ---- */
  | { type: 'FARM_DISTRICT'; districtId: string }
  | { type: 'SET_CHANNEL_TARGET'; channelId: string; districtId: string | null }
  | { type: 'DEBUG_ADD_SHARE'; districtId: string }
  | {
      type: 'DEBUG_SET_SHARES'
      districtId: string
      shares: Record<string, number>
    }
  | { type: 'DEBUG_FORCE_SHOWDOWN' }
  | { type: 'DEBUG_KING_CHECK' }
  /* ---- phase 7 ---- */
  | { type: 'BUY_TABLE'; tierId: TableTierId }
  | { type: 'ADVANCE_CEREMONY' }
  | { type: 'GIVE_SPEECH'; key: SpeechKey }
  | { type: 'CLOSE_CEREMONY' }
  | { type: 'TOGGLE_TROPHY'; awardId: string; seasonIndex: number }
  | { type: 'DEBUG_JUMP_TO_NOMINATIONS' }
  | { type: 'DEBUG_FORCE_CEREMONY' }
  | { type: 'DEBUG_GRANT_TROPHY'; awardId: string }
