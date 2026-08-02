import type { PropertyTypeDef, RenoProjectDef } from '../state/types'

/** The buyable types. The VRBO is not here — it is never in the market pool. */
export const PROPERTY_TYPES: PropertyTypeDef[] = [
  {
    id: 'starter',
    label: 'Starter Home',
    band: { min: 160000, max: 260000 },
    units: 1,
    baseRentPerUnit: 400,
    hoaWeekly: 0,
    unlockRank: 'sellerAgent',
    renoEligible: ['cosmetic', 'full'],
    weight: 12,
    blurbs: [
      'Good bones. The bones are load-bearing wallpaper.',
      'Priced to move. The previous owner certainly did.',
    ],
  },
  {
    id: 'condo',
    label: 'Condo',
    band: { min: 200000, max: 320000 },
    units: 1,
    baseRentPerUnit: 450,
    hoaWeekly: 80,
    unlockRank: 'sellerAgent',
    renoEligible: ['cosmetic', 'full'],
    weight: 10,
    blurbs: [
      'Amenities include a gym no one has ever used.',
      "HOA is 'very involved.'",
    ],
  },
  {
    id: 'townhouse',
    label: 'Townhouse',
    band: { min: 260000, max: 400000 },
    units: 1,
    baseRentPerUnit: 550,
    hoaWeekly: 0,
    unlockRank: 'sellerAgent',
    renoEligible: ['cosmetic', 'full', 'luxuryPkg'],
    weight: 10,
    blurbs: [
      'Three floors of vertical living. The stairs are cardio.',
      'End unit. Only one shared wall of mystery sounds.',
    ],
  },
  {
    id: 'duplex',
    label: 'Duplex',
    band: { min: 300000, max: 480000 },
    units: 2,
    baseRentPerUnit: 400,
    hoaWeekly: 0,
    unlockRank: 'sellerAgent',
    renoEligible: ['cosmetic', 'full'],
    weight: 8,
    blurbs: [
      'Live in one, rent the other, referee both.',
      'Two doors. Two mailboxes. Two sets of problems.',
    ],
  },
  {
    id: 'apartment',
    label: 'Apartment Building',
    band: { min: 600000, max: 900000 },
    units: 4,
    baseRentPerUnit: 380,
    hoaWeekly: 0,
    unlockRank: 'topProducer',
    renoEligible: ['cosmetic', 'full'],
    weight: 5,
    blurbs: [
      'Four units of pure cash flow (results may vary).',
      "The furnace is 'a character.'",
    ],
  },
  {
    id: 'luxury',
    label: 'Luxury Home',
    band: { min: 700000, max: 1200000 },
    units: 1,
    baseRentPerUnit: 1400,
    hoaWeekly: 0,
    unlockRank: 'topProducer',
    renoEligible: ['cosmetic', 'full', 'luxuryPkg'],
    weight: 5,
    blurbs: [
      "Marble in rooms that don't need marble.",
      'The listing photos required a drone AND a boat.',
    ],
  },
]

export const RENO_PROJECTS: RenoProjectDef[] = [
  {
    id: 'cosmetic',
    label: 'Cosmetic Refresh',
    costPct: 0.08,
    weeks: 2,
    valueMult: 1.08,
    conditionAdd: 20,
    conditionSet: null,
    requiresVacant: false,
    requiresTopProducer: false,
  },
  {
    id: 'full',
    label: 'Full Renovation',
    costPct: 0.2,
    weeks: 5,
    valueMult: 1.3,
    conditionAdd: null,
    conditionSet: 100,
    requiresVacant: true,
    requiresTopProducer: false,
  },
  {
    id: 'luxuryPkg',
    label: 'Luxury Package',
    costPct: 0.3,
    weeks: 6,
    valueMult: 1.45,
    conditionAdd: null,
    conditionSet: 100,
    requiresVacant: true,
    requiresTopProducer: true,
  },
]

/** Shown when a `full` or `luxuryPkg` job is blocked by a sitting tenant. */
export const RENO_OCCUPIED_REFUSAL = "You can't gut it around Patricia."

export const RENO_COMPLETE_LINE =
  'Renovation complete at {nickname}. It smells like new paint and margin.'

/** Shown on a renovating card. `{n}` and `{total}` are the week counters. */
export const RENO_PROGRESS_LINE =
  'Week {n} of {total} — currently arguing with a subfloor'

export const STREET_NAMES: string[] = [
  'Maplecrest',
  'Birchwood',
  'Dundurn',
  'Elm Ridge',
  'Copperfield',
  'Grand River',
  'Willow Bend',
  'Stonegate',
  'Harrow Lane',
  'Cedar Hollow',
  'Fairview',
  'Old Mill',
]
