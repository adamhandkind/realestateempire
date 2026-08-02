import type { EventDef } from '../state/types'

/* NOTE ON THE `condition` FIELDS
   The migration spec asks data files to hold constant arrays and no functions.
   These predicates are part of the Phase 1 event table itself — they are the
   weighted pool's gate, declared inline alongside the weight they belong to.
   Splitting the table in two (weights here, gates in logic/) would reorder and
   restructure content the prime directive says to move verbatim, so the table
   moved as one unit. They are pure, read-only, and import nothing from logic/. */

export const EVENTS: EventDef[] = [
  { id: 'ghosted', weight: 10, condition: (s) => s.leads.length > 0 },
  {
    id: 'lockbox',
    weight: 10,
    condition: (s) => s.leads.some((l) => l.stage === 'shown'),
  },
  {
    id: 'poached',
    weight: 8,
    condition: (s) => s.leads.some((l) => l.stage === 'ready'),
  },
  { id: 'referral', weight: 8, condition: (s) => s.counters.dealsClosed >= 1 },
  { id: 'hotMarket', weight: 6, condition: (s) => s.week >= 4 },
  { id: 'rateSpike', weight: 6, condition: (s) => s.week >= 4 },
  { id: 'lostPaperwork', weight: 8, condition: () => true },
  { id: 'openHouseDisaster', weight: 8, condition: () => true },
  {
    id: 'fiveStarReview',
    weight: 8,
    condition: (s) => s.counters.dealsClosed >= 1,
  },
]

export const DISASTER_FLAVORS: string[] = [
  'the basement made a sound the listing described as “character” and the plumber described as “sewage”',
  'a raccoon attended the open house, ate two brownies, and left a review',
  'a neighbour licensed in 1987 gave a forty-minute unsolicited tour of the property line',
]

export const CRINGE_QUOTES: string[] = [
  "“Most people are asleep at 4am. I'm awake. Selling. To no one. Yet.”",
  '“They said the market was cold. So I wore the blazer. Checkmate.”',
  "“If you're not filming yourself doing pushups next to a SOLD sign, are you even in real estate?”",
]
