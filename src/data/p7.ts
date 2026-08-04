/* Phase 7 tuning. Every number the Goldies move lives here.
   Per the spec's tuning note: if pacing is off, adjust RIVAL_BASE and
   RIVAL_GROWTH_PER_SEASON first — never the table costs, the trophy cap, or
   the perk values. */

import type { SpeechKey } from '../state/types'

export const P7 = {
  SEASON_WEEKS: 13,
  NOMINATION_WEEK_OFFSET: 12, // nominations fire at END of season week 12
  NOMINEES_PER_CATEGORY: 4, // player + 3 rivals, always
  TABLE_TIERS: [
    { id: 'none', label: 'Skip it', cost: 0, scoreBonus: 0, repGain: 0 },
    { id: 'seat', label: 'Single Seat', cost: 500, scoreBonus: 3, repGain: 1 },
    { id: 'table', label: 'Table of Eight', cost: 2500, scoreBonus: 8, repGain: 3 },
    {
      id: 'sponsor',
      label: 'Platinum Sponsor',
      cost: 10000,
      scoreBonus: 18,
      repGain: 8,
    },
  ],
  SPONSOR_CRINGE_DELTA: 0.1, // added to cringe chance for the following season
  SCORE_JITTER: 0.12, // ±12% random on every final score, player and rivals alike
  UPSET_CHANCE: 0.1, // flat chance the top-scored nominee is skipped for #2
  RIVAL_BASE: 40,
  RIVAL_VARIANCE: 25,
  RIVAL_GROWTH_PER_SEASON: 14, // rivals scale so awards stay contested late
  TROPHY_EGO: 1, // each trophy adds +1 Ego permanently while displayed
  TROPHY_DISPLAY_CAP: 6, // only 6 can be displayed at once
  SWEEP_BONUS_REP: 20, // winning 5+ in one night
  SHUTOUT_HUSTLE: 1, // winning 0 while nominated 3+: +1 permanent Hustle (spite)
} as const

/* --------------------------------------------------------------- content */

/** §10.1 — logged when a tier is bought. `none` never logs. */
export const TABLE_LINES: Record<string, string> = {
  seat: 'You bought a single seat at the Goldies. It’s at a table with four mortgage brokers. You will be fine.',
  table:
    'You bought a table of eight. You have invited six people and are “still finalizing” the last two.',
  sponsor:
    'PLATINUM SPONSOR. Your logo is on the podium, the napkins, and — through a printing error — the emergency exit signage.',
}

export const NO_REFUNDS_LINE =
  'The Board does not do refunds. The Board has never done refunds.'

/* §10.2 — the speech. Full ego buys a season of cringe. */
export interface SpeechOption {
  key: SpeechKey
  label: string
  line: string
  rep: number
  ego: number
  cringeSeason: boolean
}

export const SPEECH_OPTIONS: SpeechOption[] = [
  {
    key: 'humble',
    label: 'Humble',
    line: "'I just want to thank my clients, my team, and this city.' Short. Dignified. Nobody expected it.",
    rep: 2,
    ego: 0,
    cringeSeason: false,
  },
  {
    key: 'gracious',
    label: 'Gracious but long',
    line: 'You thanked 31 people by name, including a lender who left in 2019. The music started. You kept going.',
    rep: 1,
    ego: 1,
    cringeSeason: false,
  },
  {
    key: 'fullEgo',
    label: 'Full ego',
    line: "'I don't sell houses. I sell INEVITABILITY.' You dropped the lockbox. On purpose. It bounced.",
    rep: 4,
    ego: 2,
    cringeSeason: true,
  },
]

export const NO_SPEECH_LINE =
  'You did not need to prepare a speech. You prepared one anyway. It’s in your jacket. It will stay there.'

/* §10.3 — system lines. */
export const UPSET_LINE =
  'Upset at the Goldies: the favourite lost. The room made a noise it has never made before.'
export const NOMINATIONS_LINE =
  "The Board announced nominations. You're up for {n}: {list}. You have told four people already."
export const CEREMONY_OPEN_LINE =
  'The Goldies are underway. The salmon is dry. The stakes are enormous.'
export const CEREMONY_CLOSE_LINE =
  'Season {season} of the Goldies is over. You won {w} of {n}. The photos are already posted.'
export const GAME_OVER_CEREMONY_LINE =
  'The Goldies went ahead without you. Someone else used your table.'
export const SWEEP_LINE =
  'You swept. Five trophies. The Board is “reviewing the categories for next year.”'
export const SHUTOUT_LINE =
  'Zero for {n}. You drove home doing 20 over and booked six showings from the car. Spite is a renewable resource.'
export const MIGRATION_LINE =
  'The Board has announced the inaugural Golden Lockbox Awards. Thirteen weeks. Prepare accordingly.'

/** §10.4 — used only when Territory isn't built. The real roster lives in
 *  data/rivals.ts and is imported directly wherever it exists. */
export const FALLBACK_RIVAL_ROSTER: {
  id: string
  name: string
  color: string
}[] = [
  { id: 'chadwick', name: 'Chadwick Sterling III', color: '#8b1e3f' },
  { id: 'zambonis', name: 'The Zamboni Brothers', color: '#2e5e8b' },
  { id: 'krystal', name: 'Krystal Vibe', color: '#b0508b' },
]

/** §10.5 — joins the brag rotation once the player holds >= 1 trophy. */
export const AWARDS_BRAGS: string[] = [
  'Humbled and honoured to be named Top 1% of the Top 1% 🙏 (again)',
  'Hardware doesn’t define us. It does, however, sit on the shelf where clients can see it.',
  'They gave me a trophy shaped like a phone. I have never felt more understood.',
  'Season {seasonIndex} Goldie winner. Some of you were there. Most of you were not.',
]

/* ------------------------------------------------------------------- UI */

export const CEREMONY_TITLE = 'THE GOLDEN LOCKBOX AWARDS'
export const TROPHY_ROOM_EMPTY =
  'No trophies. Yet. The Goldies are in {n} weeks and you have a whole speech ready.'
export const TROPHY_DISPLAY_WARNING =
  'Displayed trophies grant their perks — and their Ego.'
export const NOMINATION_BANNER =
  '🏆 NOMINATED FOR {n} GOLDIES — ceremony in {x} weeks'
export const SPONSOR_CRINGE_WARNING =
  'Your logo everywhere. Cringe chance +10% for one season.'
