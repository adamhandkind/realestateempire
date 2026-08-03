import { hasFlag } from '../logic/characters'
import { pluralityOwner, showdownDistrict } from '../logic/territory'
import { DISTRICT_IDS } from './districts'
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
  /* ---- phase 6: the rivals ---- */
  {
    id: 'showdown',
    weight: 6,
    condition: (s) => showdownDistrict(s) !== null,
  },
  { id: 'fruitBasket', weight: 4, condition: (s) => s.week >= 6 },
  {
    id: 'undercut',
    weight: 5,
    condition: (s) =>
      s.rivalEffects.undercutWeeksLeft === 0 &&
      DISTRICT_IDS.some((d) => pluralityOwner(s, d) === 'zambonis'),
  },
  { id: 'krystalViral', weight: 5, condition: () => true },
  { id: 'hotMarket', weight: 6, condition: (s) => s.week >= 4 },
  { id: 'rateSpike', weight: 6, condition: (s) => s.week >= 4 },
  { id: 'lostPaperwork', weight: 8, condition: () => true },
  { id: 'openHouseDisaster', weight: 8, condition: () => true },
  {
    id: 'fiveStarReview',
    weight: 8,
    condition: (s) => s.counters.dealsClosed >= 1,
  },
  {
    id: 'viralSuccess',
    weight: 6,
    condition: (s) => s.activeChannelIds.length > 0,
  },
  {
    id: 'badReview',
    weight: 8,
    /* Some people are simply not reviewable. */
    condition: (s) =>
      s.counters.dealsClosed >= 3 && !hasFlag(s, 'badReviewImmune'),
  },
  { id: 'tvInterview', weight: 5, condition: (s) => s.reputation >= 50 },
  {
    id: 'algorithmChange',
    weight: 6,
    condition: (s) => s.activeChannelIds.includes('tiktok'),
  },
  {
    id: 'copycatAgent',
    weight: 6,
    condition: (s) =>
      s.activeChannelIds.includes('billboard') ||
      s.activeChannelIds.includes('benchDomination'),
  },
  { id: 'charityGala', weight: 6, condition: (s) => s.reputation >= 30 },
  {
    id: 'vrboSpam',
    weight: 10,
    condition: (s) => s.rank === 'sellerAgent' || s.rank === 'topProducer',
  },
  {
    id: 'marketCrash',
    weight: 3,
    condition: (s) =>
      s.week >= s.firstP3Week + 8 &&
      s.crash.weeksLeft === 0 &&
      s.week - s.crash.lastCrashWeek >= 40,
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

/** The badReview weight before Community Sponsorship halves it. */
export const BAD_REVIEW_BASE_WEIGHT = 8
/** The weekly cringe roll, once ego is at the threshold. */
export const CRINGE_WEEKLY_CHANCE = 0.2
/** Guaranteed VRBO cadence, in weeks. */
export const VRBO_MIN_GAP = 6
export const VRBO_MAX_GAP = 9

export const VIRAL_SCENARIOS: string[] = [
  'A fifteen-second clip of you opening a stubborn front door with your hip got two million views.',
  'You said “this is a hallway” in a tone the internet found deeply comforting. It is now a sound.',
  'Someone stitched your listing tour with a nature documentary narration and it improved both.',
  'A dog wandered into frame during your walkthrough. The dog is now the face of your brand.',
  'You mispronounced “quartz” with total confidence and the internet adopted it as canon.',
  'Your drone shot of a cul-de-sac was set to sad piano music by a stranger and people cried.',
]

export const BAD_REVIEW_LINES: string[] = [
  'A one-star review appeared from a name you have never seen, describing a showing you never ran.',
  'Someone gave you one star for “energy” and wrote nine paragraphs about a parking space.',
  'A review accuses you of being “too available.” It is the most-liked review on the page.',
  'One star. The review is a single word. The word is “no.” It has forty upvotes.',
]

export const CRINGE_HIGH_FAME: string[] = [
  'Your motivational speech at the regional expo included the phrase “sell or be sold” eleven times and a slide of your own face.',
  'Your drone got a little close to the open house. Then a little closer. Then into the pergola, on camera, in front of the buyers.',
  'Your gala speech ran nineteen minutes, thanked your own reflection, and was livestreamed by four separate people.',
]

export const NEWS_COVERAGE: string[] = [
  'The local station ran it under the chyron LOCAL AGENT, LOCAL INCIDENT.',
  'A morning show played the clip twice and the hosts did not speak afterward.',
  'The newspaper covered it in the section normally reserved for raccoons.',
]

/** Five escalating pitches for the 424/7 VRBO. Index = offer count - 1. */
export const VRBO_PITCHES: string[] = [
  'A wholesaler in a lanyard has an opportunity for you: the 424/7 VRBO. Six bedrooms, nine bathrooms, one hot tub of unknown provenance. Cash-flow positive, he says, at full occupancy. Full occupancy is 424 hours a week. There are 168 hours in a week. He does not appear to know this.',
  'The wholesaler is back. He has laminated the numbers now. “Look, if you just book it 424 hours a week, it prints.” He has added a second hot tub to the pro forma. The math has not moved.',
  'He found you at a closing. He has a hat with the property on it. He explains that “424 is aspirational, but so was the moon landing.” He is sweating through the hat.',
  'He is now offering seller financing, a bonus jet ski, and “equity in the concept.” The spreadsheet has a tab called DREAM CASE. The DREAM CASE assumes 501 hours.',
  'He has brought his mother. She calls it “the family opportunity.” The listing photos now include a man in a bathrobe who does not live there. The hot tubs number four. He says this is the last time he will ask. It is not.',
]

export const COPYCAT_LINES: string[] = [
  'Chadwick Sterling III has recreated your ad shot for shot: same pose, same golden hour, same finger pointing at nothing. His font is worse and somehow bigger.',
  'Chadwick Sterling III put up a billboard directly across the highway from yours, mirrored, so drivers see two of you pointing at each other.',
]

export const GALA_LINES: string[] = [
  'The Chamber of Commerce charity gala. Five hundred a plate, a silent auction, and a room full of people with houses.',
  'A black-tie charity gala for a cause everyone in the room will describe slightly differently. Five hundred to get in.',
]
