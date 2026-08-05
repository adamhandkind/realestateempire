import type { RankDef } from '../state/types'

/** 2.5% gross commission on every sale, split by rank. */
export const COMMISSION_RATE = 0.025
export const DESK_FEE = 150
export const START_CASH = 800
export const LOSE_AT = -1000
export const AP_PER_WEEK = 5

export const RANKS: RankDef[] = [
  {
    id: 'receptionist',
    n: 1,
    name: 'Receptionist',
    split: 0,
    req: { earnings: 0, showings: 0, deals: 0 },
    blurb: 'Side hustles and open-house cookie logistics.',
  },
  {
    id: 'junior',
    n: 2,
    name: 'Junior Showing Assistant',
    split: 0.1,
    /* The showings bar is the point. On $1,500-and-nothing-else a player could
       spam Side Hustles and be promoted at the end of week one, having never
       touched the job. Eight assists is two AP-weeks of the tutorial actually
       being played, and Side Hustle money alone can no longer buy the rank. */
    req: { earnings: 2500, showings: 8, deals: 0 },
    blurb: 'Your own leads — but an actual agent signs the paperwork.',
  },
  {
    id: 'buyerAgent',
    n: 3,
    name: "Buyer's Agent",
    split: 0.35,
    req: { earnings: 5000, showings: 8, deals: 0 },
    blurb: 'The full loop. Your deals, your split.',
  },
  {
    id: 'sellerAgent',
    n: 4,
    name: "Seller's Agent",
    split: 0.5,
    req: { earnings: 25000, showings: 0, deals: 6 },
    blurb: 'Listings. Marble. Tier 3 swag.',
  },
  {
    id: 'topProducer',
    n: 5,
    name: 'Top Producer',
    split: 0.6,
    req: { earnings: 250000, showings: 0, deals: 25, rep: 40 },
    blurb: 'Luxury listings, a TV spot, and a body you paid cash for.',
  },
]

/** Ranks 6–9. Rendered greyed out on the track; nothing is built behind them. */
export const LOCKED_RANKS: string[] = [
  'Team Lead',
  'Managing Broker',
  'Brokerage Owner',
  'Empire Owner',
]
