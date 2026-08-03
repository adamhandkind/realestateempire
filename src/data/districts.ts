/* The map of Brantford, Ontario. Eight districts based on real neighbourhoods,
   with the real Grand River running through them.

   Tone rule, binding: the satire targets realtor culture, never the residents.
   Eagle Place is scrappy and beloved, not a punchline. Do not add jokes at a
   neighbourhood's expense beyond what is written here.

   The polygons are stylized but geographically honest — West Brant, Eagle
   Place, and Tutela Heights sit south of the river; Holmedale hugs its north
   bank; Dufferin and the North End stack above Downtown; Echo Place holds the
   east side. */

import type { DistrictDef } from '../state/types'

/** The Grand River, drawn beneath every district. */
export const RIVER_PATH =
  'M 0 435 C 250 400, 420 370, 560 330 S 850 275, 1000 255'

export const MAP_VIEWBOX = '0 0 1000 700'

export const DISTRICTS: DistrictDef[] = [
  {
    id: 'northEnd',
    name: 'The North End (Brier Park)',
    blurb:
      "Brier Park bungalows, quiet crescents, the Gretzky Parkway humming past. Everyone's first sale happens up here.",
    priceMult: 0.75,
    polygon: '0,0 250,0 260,110 230,225 90,240 0,215',
    labelPos: { x: 115, y: 110 },
    leadAffinity: {
      firstTimer: 5,
      lowballLarry: 2,
      nightmareNancy: 2,
      luxLorenzo: 0,
      oldMoneyOtis: 0,
    },
    propertyTypes: ['starter', 'townhouse'],
    dominantPerk: {
      id: 'firstNamesBasis',
      text: 'Every first-timer heard about you at the rink. Leads from the North End get +1 starting patience.',
    },
    farmLines: [
      'You worked the rink lobby during a 6am practice. This is Brantford; the rink is load-bearing.',
      'Fridge magnets on every crescent in Brier Park. The fridge remains the neighbourhood’s town square.',
    ],
  },
  {
    id: 'dufferin',
    name: 'Dufferin',
    blurb:
      'Century homes with turrets and opinions along Dufferin Avenue. The hedges predate the telephone — which, locally, is saying something.',
    priceMult: 1.5,
    polygon: '250,0 560,0 555,120 540,205 350,215 260,110',
    labelPos: { x: 405, y: 100 },
    leadAffinity: {
      oldMoneyOtis: 6,
      retireeRuth: 3,
      luxLorenzo: 2,
      firstTimer: 0,
      flipBro: 0,
    },
    propertyTypes: ['luxury', 'townhouse'],
    dominantPerk: {
      id: 'saleBoost',
      text: 'Old Brantford approves. Sales of your properties here close +5% higher.',
    },
    farmLines: [
      'You complimented a wraparound porch for eleven unbroken minutes. Doors opened.',
      'You attended a heritage-committee meeting and nodded at all the correct mouldings.',
    ],
  },
  {
    id: 'echoPlace',
    name: 'Echo Place & East Ward',
    blurb:
      'The east side: Colborne Street commerce, the college kids, the mall, and every drive-thru known to science.',
    priceMult: 0.9,
    polygon: '560,0 1000,0 1000,410 620,335 555,320 555,120',
    labelPos: { x: 795, y: 180 },
    leadAffinity: {
      influencerIzzy: 3,
      flipBro: 2,
      ghostGary: 2,
      retireeRuth: 0,
      oldMoneyOtis: 0,
    },
    propertyTypes: ['duplex', 'apartment', 'starter'],
    dominantPerk: {
      id: 'roomForRent',
      text: 'Every student on Colborne knows your sign. Rental applicant chance here +15%.',
    },
    farmLines: [
      'Free pizza seminar at the college: “Renting vs. Owning vs. Your Roommate Kyle.”',
      'You hit every plaza on Colborne East and left cards at three counters and one drive-thru window.',
    ],
  },
  {
    id: 'holmedale',
    name: 'Holmedale',
    blurb:
      'Mill-town streets gone artisanal along the Grand. The rail trail to Paris is the real main street.',
    priceMult: 0.85,
    polygon: '0,215 90,240 230,225 250,330 210,415 0,420',
    labelPos: { x: 115, y: 320 },
    leadAffinity: { flipBro: 5, influencerIzzy: 2, techTyler: 2, retireeRuth: 0 },
    propertyTypes: ['duplex', 'apartment', 'starter'],
    dominantPerk: {
      id: 'tradeRates',
      text: 'The trades drink where you drink. Renovations on properties here cost −10%.',
    },
    farmLines: [
      'You walked the rail trail handing out cards and calling every mill window “a feature.”',
      'You bought a round of cold brew at the trailhead. Belonged instantly.',
    ],
  },
  {
    id: 'downtown',
    name: 'Downtown Brantford',
    blurb:
      'Harmony Square, the Sanderson, condo cranes, Laurier kids — and your face on every bench.',
    priceMult: 1.15,
    polygon: '230,225 350,215 540,205 555,320 420,370 250,330',
    labelPos: { x: 395, y: 285 },
    leadAffinity: { relocRob: 4, techTyler: 4, cashChad: 2, influencerIzzy: 2 },
    propertyTypes: ['condo', 'apartment'],
    dominantPerk: {
      id: 'benchmark',
      text: 'Your benches, your blocks. +1 extra Reputation per week from marketing.',
    },
    farmLines: [
      'You sat on your own bench ad in Harmony Square and made eye contact with commuters.',
      'You worked the Sanderson lobby at intermission. Culture AND leads.',
    ],
  },
  {
    id: 'westBrant',
    name: 'West Brant (Shellard Lane)',
    blurb:
      'Shellard Lane’s endless new builds. Every third house is a model home; every fourth is a soccer schedule.',
    priceMult: 1.0,
    polygon: '0,420 210,415 250,330 420,370 330,700 0,700',
    labelPos: { x: 190, y: 540 },
    leadAffinity: { hgtvCouple: 4, retireeRuth: 3, firstTimer: 2, relocRob: 2 },
    propertyTypes: ['starter', 'townhouse', 'duplex'],
    dominantPerk: {
      id: 'referralNetwork',
      text: 'The Shellard Lane group chats have spoken. Referral event weight ×2.',
    },
    farmLines: [
      'You sponsored the U-11 soccer team. The banner on Shellard Lane is enormous.',
      'A cul-de-sac barbecue was worked. Three casseroles, two leads-in-waiting.',
    ],
  },
  {
    id: 'eaglePlace',
    name: 'Eagle Place',
    blurb:
      "The old grid by Mohawk Park, wrapped on three sides by the river. 'Up and coming' since 1974. Bring boots in April.",
    priceMult: 0.7,
    polygon: '420,370 620,335 700,520 560,700 330,700',
    labelPos: { x: 520, y: 530 },
    leadAffinity: {
      lowballLarry: 4,
      flipBro: 3,
      ghostGary: 2,
      luxLorenzo: 0,
      oldMoneyOtis: 0,
    },
    propertyTypes: ['starter', 'duplex'],
    dominantPerk: {
      id: 'localsDeal',
      text: "You're 'old Eagle Place' now. Listing ask prices here −10% for you.",
    },
    farmLines: [
      'You wore the boots down by Mohawk Park. The locals noticed the boots. Respect: earned.',
      'You called the spring water table “character-building” in front of witnesses.',
    ],
  },
  {
    id: 'tutelaHeights',
    name: 'Tutela Heights',
    blurb:
      'Estate lots above the river valley. Bell invented the telephone here; residents have been screening calls ever since.',
    priceMult: 1.6,
    polygon: '620,335 1000,410 1000,700 560,700 700,520',
    labelPos: { x: 810, y: 540 },
    leadAffinity: {
      luxLorenzo: 6,
      celebrityCleo: 6,
      cashChad: 2,
      techTyler: 2,
      firstTimer: 0,
    },
    propertyTypes: ['luxury'],
    dominantPerk: {
      id: 'luxPipeline',
      text: 'The estate crowd takes your calls now. Luxury client weights ×2 in lead generation.',
    },
    farmLines: [
      'You door-knocked the estates with your card on a small silver tray. Effective.',
      'You praised a view of the river valley you could not afford to insure.',
    ],
  },
]

export const DISTRICT_IDS: string[] = DISTRICTS.map((d) => d.id)

export const districtOf = (id: string): DistrictDef | undefined =>
  DISTRICTS.find((d) => d.id === id)

/** Never throws — an unknown id falls back to the first district so a corrupt
 *  save renders a map instead of a crash. */
export const districtOrFirst = (id: string): DistrictDef =>
  districtOf(id) ?? DISTRICTS[0]

/** priceMult rendered as a price tier, per the map UI contract. */
export function priceTier(mult: number): string {
  if (mult <= 0.7) return '$'
  if (mult <= 0.9) return '$$'
  if (mult <= 1.15) return '$$$'
  if (mult <= 1.5) return '$$$$'
  return '$$$$$'
}

/* --------------------------------------------------------- threshold lines */

export const PRESENCE_LINE =
  "You're a known quantity in {district} now. (+ close odds there)"
export const DOMINANT_LINE = '{district} is YOURS. Perk active: {perk}'
export const LOST_DOMINANT_LINE =
  '{district} slipped below dominance. The perk sleeps.'
/** One line per week TOTAL for decay, so the log never floods. */
export const QUIET_WEEK_LINE = 'Quiet week in {n} districts. The city forgets fast.'
export const CONCEDE_LINE = 'You conceded the block. The flyers won.'

export const KING_TITLE = 'KING OF BRANTFORD'
export const KING_SUBTITLE = 'Every bench. Every bridge. Every block.'
