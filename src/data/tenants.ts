import type { TenantArchetype } from '../state/types'

/* Order matters only for the test above; the applicant system picks by tier
   and weight, never by index. Condition rules that need code (Dave's monthly
   coin flip, the content house's monthly roll) live in logic/portfolioWeek.ts
   and are keyed off these ids. */
export const TENANTS: TenantArchetype[] = [
  {
    id: 'perfectPatricia',
    label: 'Perfect Patricia',
    qualityTier: 1,
    weight: 8,
    payChance: 1.0,
    onSkip: 'recoverHalfLater',
    conditionPerWeek: -0.5,
    stayMin: 20,
    stayMax: 40,
    rentMod: 1.0,
    availableMinCondition: 0,
    availableMaxR: 1.0,
    intro: [
      'Patricia-type applicant. References: four. Holiday card: pre-addressed.',
      '{name} asked where to submit rent EARLY.',
    ],
    leave: [
      '{name} moved out, left the place cleaner than move-in, and a note. You kept the note.',
    ],
    skip: [],
  },
  {
    id: 'corpLease',
    label: 'Corporate Lease',
    qualityTier: 1,
    weight: 6,
    payChance: 1.0,
    onSkip: 'recoverHalfLater',
    conditionPerWeek: -0.5,
    stayMin: 12,
    stayMax: 16,
    rentMod: 1.2,
    availableMinCondition: 70,
    availableMaxR: 1.4,
    intro: [
      'A corporation now rents this unit. It pays +20% and feels nothing.',
    ],
    leave: [
      'The corporate lease ended precisely on schedule. The unit smells like nothing.',
    ],
    skip: [],
  },
  {
    id: 'lateLenny',
    label: 'Late-Rent Lenny',
    qualityTier: 2,
    weight: 10,
    payChance: 0.75,
    onSkip: 'recoverHalfLater',
    conditionPerWeek: -1,
    stayMin: 15,
    stayMax: 30,
    rentMod: 1.0,
    availableMinCondition: 0,
    availableMaxR: 1.4,
    intro: ['{name} seems great. His Venmo history is a saga.'],
    leave: [
      "{name} moved out owing ${owed}. The group chat says he's 'good for it.'",
    ],
    skip: [
      "{name}'s rent is 'coming Friday.' Which Friday remains theoretical.",
      '{name} sent half a rent payment and a thumbs-up emoji.',
    ],
  },
  {
    id: 'diyDave',
    label: 'DIY Dave',
    qualityTier: 2,
    weight: 8,
    payChance: 0.9,
    onSkip: 'recoverHalfLater',
    conditionPerWeek: -1,
    stayMin: 15,
    stayMax: 30,
    rentMod: 1.0,
    availableMinCondition: 0,
    availableMaxR: 1.4,
    intro: [
      "{name} asked if you 'mind if he improves things.' You said no. He heard yes.",
    ],
    leave: [
      '{name} moved out. The unit now has one skylight you did not commission.',
    ],
    skip: [
      "{name} deducted 'materials' from rent. The materials are visible from the street.",
    ],
  },
  {
    id: 'partyPaulie',
    label: 'Party Animal',
    qualityTier: 3,
    weight: 10,
    payChance: 0.95,
    onSkip: 'recoverHalfLater',
    conditionPerWeek: -3,
    stayMin: 10,
    stayMax: 20,
    rentMod: 1.0,
    availableMinCondition: 0,
    availableMaxR: 1.4,
    intro: [
      '{name} asked about the noise policy in a way that answered the noise policy.',
    ],
    leave: ['{name} moved out. The neighbors sent a fruit basket. To you.'],
    skip: ['{name} paid late; the DJ was paid on time.'],
  },
  {
    id: 'sobStorySteve',
    label: 'Sob Story Steve',
    qualityTier: 3,
    weight: 8,
    payChance: 0.55,
    onSkip: 'gone',
    conditionPerWeek: -1,
    stayMin: 0,
    stayMax: null,
    rentMod: 1.0,
    availableMinCondition: 0,
    availableMaxR: 1.4,
    intro: ["{name}'s references were all 'going through something.'"],
    leave: [
      '{name} left. His final story was genuinely moving. You checked your wallet afterward.',
    ],
    skip: [
      "{name}'s rent was eaten by a medical thing involving a parrot.",
      "{name} can't pay: his car, his cousin, and Mercury are all in retrograde.",
      "This week's story involved a boat he does not own.",
    ],
    evictBody:
      "Steve looks up. 'You know what, you're right. I'll be out by Friday. It's just… my grandmother's koi surgery was this Friday.' (There is no koi. There may not be a grandmother.)",
  },
  {
    id: 'contentCrew',
    label: 'Content House Crew',
    qualityTier: 3,
    weight: 6,
    payChance: 0.9,
    onSkip: 'recoverHalfLater',
    conditionPerWeek: -2.5,
    stayMin: 8,
    stayMax: 16,
    rentMod: 1.3,
    availableMinCondition: 0,
    availableMaxR: 1.4,
    intro: ['Four roommates, one brand, one ring light per human.'],
    leave: ["The content house 'pivoted to Bali.' The unit echoes."],
    skip: [],
  },
  {
    id: 'theHoarder',
    label: 'The Collector',
    qualityTier: 3,
    weight: 6,
    payChance: 0.85,
    onSkip: 'recoverHalfLater',
    conditionPerWeek: -2,
    stayMin: 0,
    stayMax: null,
    rentMod: 1.0,
    availableMinCondition: 0,
    availableMaxR: 1.4,
    intro: [
      '{name} arrived with a moving truck. Then another. Then a third, unexplained.',
    ],
    leave: [
      "{name} is out. The crew found: 14 identical toasters, a canoe, and a filing cabinet labeled 'MISC 1994.'",
    ],
    skip: ["{name} paid in exact cash from an envelope marked 'ENVELOPES.'"],
  },
]

/** DIY Dave's every-fourth-week coin flip. */
export const DAVE_GOOD = "{name} retiled the bathroom. It's… good? It's good."
export const DAVE_BAD =
  "{name} removed a wall. He is 'pretty sure' it wasn't load-bearing."

/** The content house's every-fourth-week coin flip. */
export const CREW_VIRAL =
  "The content house posted a tour. Comments ask who the landlord is. It's you. You're famous-adjacent."
export const CREW_DAMAGE = 'A challenge video happened. The drywall lost.'
