import type { PostDef } from '../state/types'

export const POSTS: PostDef[] = [
  {
    id: 'marketUpdate',
    label: 'Market Update',
    tier: 'basic',
    crewRequired: 'none',
    blurb:
      'A carousel of graphs you do not fully understand, captioned with confidence.',
    baseEffects: { leads: 1, rep: 2, cash: 0 },
    attract: ['relocRob', 'techTyler', 'hgtvCouple'],
    viralMod: -0.05,
    embarrassMod: -0.05,
    egoBias: 0,
  },
  {
    id: 'justListed',
    label: 'Just-Listed Post',
    tier: 'basic',
    crewRequired: 'none',
    blurb:
      "'JUST LISTED 🔑' over a photo where the sky has been made illegally blue.",
    baseEffects: { leads: 2, rep: 1, cash: 0 },
    attract: ['firstTimer', 'cashChad', 'flipBro'],
    viralMod: 0,
    embarrassMod: 0,
    egoBias: 1,
  },
  {
    id: 'motivational',
    label: 'Motivational Monologue',
    tier: 'basic',
    crewRequired: 'none',
    blurb:
      'You, walking toward the camera, explaining that most people simply aren’t built for this.',
    baseEffects: { leads: 0, rep: 0, cash: 0 },
    attract: ['flipBro', 'influencerIzzy'],
    viralMod: 0.05,
    embarrassMod: 0.1,
    egoBias: 2,
  },
  {
    id: 'familyAuthenticity',
    label: 'Family Authenticity Post',
    tier: 'basic',
    crewRequired: 'none',
    blurb:
      "'At the end of the day it's about FAMILY.' Someone else's family. A stock family.",
    baseEffects: { leads: 1, rep: 3, cash: 0 },
    attract: ['retireeRuth', 'firstTimer', 'hgtvCouple'],
    viralMod: 0,
    embarrassMod: -0.03,
    egoBias: -1,
  },
  {
    id: 'fakeCandid',
    label: 'Fake Candid Coffee Meeting',
    tier: 'basic',
    crewRequired: 'none',
    blurb:
      'You laughing at nothing, holding a coffee you will not drink, at a meeting that is a photoshoot.',
    baseEffects: { leads: 1, rep: 1, cash: 0 },
    attract: ['cashChad', 'influencerIzzy'],
    viralMod: 0,
    embarrassMod: 0.05,
    egoBias: 1,
  },
  {
    id: 'luxuryCar',
    label: 'Luxury-Car Photo',
    tier: 'produced',
    crewRequired: 'freelancer',
    blurb:
      'You, the car, and a caption implying you bought it with hustle and not a 72-month term.',
    baseEffects: { leads: 1, rep: 2, cash: 0 },
    attract: ['cashChad', 'luxLorenzo', 'influencerIzzy'],
    viralMod: 0.03,
    embarrassMod: 0.08,
    egoBias: 3,
  },
  {
    id: 'justListedVideo',
    label: 'Just-Listed Video',
    tier: 'produced',
    crewRequired: 'freelancer',
    blurb:
      'A cinematic walkthrough with a drone shot of the driveway and a bass drop on the pantry.',
    baseEffects: { leads: 3, rep: 2, cash: 0 },
    attract: ['relocRob', 'hgtvCouple', 'techTyler', 'cashChad'],
    viralMod: 0.05,
    embarrassMod: 0,
    egoBias: 1,
  },
  {
    id: 'dancingTour',
    label: 'Dancing House Tour',
    tier: 'premium',
    crewRequired: 'team',
    blurb:
      'You dance through all four bedrooms. The choreography is committed. The market is watching.',
    baseEffects: { leads: 2, rep: 0, cash: 0 },
    attract: ['influencerIzzy', 'flipBro', 'celebrityCleo'],
    viralMod: 0.15,
    embarrassMod: 0.15,
    egoBias: 2,
  },
  {
    id: 'humbledAward',
    label: "'I Am Humbled' Award Post",
    tier: 'premium',
    crewRequired: 'team',
    blurb:
      "A photo of a trophy with a caption 400 words long about how you don't do it for the trophies.",
    baseEffects: { leads: 1, rep: 4, cash: 0 },
    attract: ['luxLorenzo', 'oldMoneyOtis', 'celebrityCleo'],
    viralMod: 0.03,
    embarrassMod: 0.05,
    egoBias: 2,
  },
]

export const postOf = (id: string): PostDef | undefined =>
  POSTS.find((p) => p.id === id)
