/* The Roster. Nine playable characters, each a bundle of starting-state
   overrides + permanent rule modifiers + a brag voice pack.

   THIS FILE IS THE SINGLE SOURCE OF TRUTH for character effects. Logic reads
   the fields below at the fixed hook points listed in logic/characters.ts —
   nothing anywhere else branches on a character id. Adding a tenth character
   is a data edit and nothing else. */

import type { CharacterDef } from '../state/types'

/** Every field a def may leave out. Spread first, override after. */
const DEFAULTS = {
  start: {
    cash: 800,
    rank: 'receptionist' as const,
    reputation: 0,
    ownedSwagIds: [] as string[],
    equipped: {},
    properties: [],
  },
  apPerWeek: 5,
  statMods: { hustle: 0, swagger: 0, ego: 0 },
  egoCap: null,
  closeGlobalDelta: 0,
  closePerArchetype: {},
  promotionEarningsMult: 1,
  cringeChanceDelta: 0,
  marketingCostMult: 1,
  repDecayMult: 1,
  flags: [],
  lines: {},
}

const def = (
  partial: Partial<CharacterDef> &
    Pick<
      CharacterDef,
      'id' | 'name' | 'tagline' | 'bio' | 'portrait' | 'brags'
    >,
): CharacterDef => ({
  ...DEFAULTS,
  ...partial,
  start: { ...DEFAULTS.start, ...(partial.start ?? {}) },
})

export const CHARACTERS: CharacterDef[] = [
  def({
    id: 'you',
    name: 'You',
    tagline: 'A blank slate with a lanyard.',
    bio: 'No advantages. No baggage. Just $800, a desk near the bathroom, and whatever you make of it. The classic experience.',
    portrait: { initials: 'YOU', accent: '#c9a227', emoji: '🙂' },
    brags: [
      'Day one of the rest of the grind.',
      'No gimmicks. Just listings.',
      'They ask my secret. There is no secret. There is only the phone.',
      "Started from the cubicle now we're… still near the cubicle. For now.",
    ],
  }),

  def({
    id: 'nigel',
    name: 'Nigel Ainsworth-Pemberton',
    tagline: 'Born in Brantford. The accent is from nowhere.',
    bio: "Nigel discovered somewhere around 2019 that saying 'terribly good bones' in Received Pronunciation adds $40,000 to any listing. He has never been to England. His mum calls the office and it's touch and go every time.",
    portrait: { initials: 'NA', accent: '#7a5ea3', emoji: '🎩' },
    statMods: { hustle: -1, swagger: 2, ego: 0 },
    closePerArchetype: { luxLorenzo: 0.1, celebrityCleo: 0.1 },
    flags: ['accentSlip'],
    lines: {
      accentSlip:
        "The close fell through and the accent went with it. 'Ah jeez, sorry— I mean, terribly sorry.' Swagger shaken for the week.",
    },
    brags: [
      'One simply must view this property, as we say back home (Brantford).',
      'Cheerio to the sellers, and indeed, to the market at large. 🇬🇧(?)',
      "A gentleman never discusses commission. A gentleman's assistant posts it.",
      'Splendid open house today. Mum brought squares. MUM. NOT NOW.',
    ],
  }),

  def({
    id: 'doreen',
    name: 'Doreen Kowalski',
    tagline: '42 years in. Has outlived four crashes and six brokerages.',
    bio: "Doreen was selling houses before your brokerage existed and will be selling them after it's a vape shop. She knows the market the way sailors know weather. She owns one blazer. It is beige. It is enough.",
    portrait: { initials: 'DK', accent: '#3f7a5e', emoji: '🔮' },
    statMods: { hustle: 3, swagger: 2, ego: 0 },
    egoCap: 2,
    flags: ['marketInsight', 'flipColdImmune', 'noHighEgoSwag', 'izzyAllergy'],
    lines: {
      boaRefusal:
        "Doreen looked at the {itemName} for four seconds. 'No.' It remains in the bag.",
      izzyGhost:
        "The influencer ghosted Doreen after she asked what a 'link in bio' is. Doreen has already forgotten her name.",
    },
    brags: [
      'Sold another one. This is a job. I do my job.',
      "The market is doing what it did in '94. Nobody listens.",
      "No, I will not be 'hopping on a quick call.'",
      '42 years. Zero boas.',
    ],
  }),

  def({
    id: 'hunter',
    name: 'Hunter "Grindset" Maxx',
    tagline: 'Massive hustle. Has never finished reading a contract.',
    bio: 'Hunter wakes at 4:44am, cold plunges, records the podcast, and generates more leads before 9 than most agents see in a month. What happens to those leads after first contact is between Hunter and whichever clause he skimmed.',
    portrait: { initials: 'HM', accent: '#c8372d', emoji: '🔥' },
    apPerWeek: 7,
    statMods: { hustle: 3, swagger: 0, ego: 0 },
    closeGlobalDelta: -0.1,
    cringeChanceDelta: 0.1,
    start: {
      cash: 800,
      rank: 'receptionist',
      reputation: 0,
      ownedSwagIds: ['thePodcast'],
      equipped: { accessory: 'thePodcast' },
      properties: [],
    },
    lines: {
      podcast: 'Episode 341 of The Grindset dropped. Guest: Hunter. Topic: Hunter.',
    },
    brags: [
      '4:44am club. The market fears the disciplined. 🧊',
      'Generated 31 leads before my second cold plunge. WHO ELSE.',
      "New podcast ep: 'Contracts Are A Mindset.' Link in bio.",
      'Losses are just wins doing cardio. 📈',
    ],
  }),

  def({
    id: 'chip',
    name: 'Chip Vandergeld IV',
    tagline: "His father's face is already on the bus benches.",
    bio: "Chip's grandfather built half the city. Chip's father sold the other half. Chip has a gold blazer, forty thousand dollars, and a promotion committee that has met his family. They are not going to make this easy for him, which is the only hard thing that has ever happened to Chip.",
    portrait: { initials: 'CV', accent: '#c9a227', emoji: '👑' },
    start: {
      cash: 40000,
      rank: 'receptionist',
      reputation: 10,
      ownedSwagIds: ['goldBlazer'],
      equipped: { outfit: 'goldBlazer' },
      properties: [],
    },
    promotionEarningsMult: 1.5,
    lines: {
      promoGrind:
        "The committee 'wants to see a little more' from Chip. They have wanted this since birth.",
    },
    brags: [
      'Self-made (third generation).',
      "Dad says the blazer 'wears me.' Whatever that means. Anyway, SOLD.",
      'Earned every inch of this (the inches were a gift).',
      'Grinding so hard the trust fund is basically decorative.',
    ],
  }),

  def({
    id: 'dave',
    name: 'Pastor Dave Duffy',
    tagline: 'Sells houses six days a week. Physically cannot lie.',
    bio: "Dave describes every defect, disclosed and undisclosed, sometimes mid-handshake. First-time buyers would follow him into the sea. Luxury clients find him 'exhaustingly sincere.' He has never once been sued, reviewed badly, or forgiven a leaky faucet its sins.",
    portrait: { initials: 'PD', accent: '#5e8ba3', emoji: '🙏' },
    closePerArchetype: {
      firstTimer: 0.15,
      retireeRuth: 0.15,
      luxLorenzo: -0.1,
      celebrityCleo: -0.1,
    },
    egoCap: 4,
    flags: ['badReviewImmune'],
    lines: {
      review:
        'Someone tried to leave Pastor Dave a bad review and deleted it halfway through. They knew.',
    },
    brags: [
      'The Hendersons found their home today. All glory to the inspection report.',
      "A house is just walls until it's yours. Also the furnace is from 2009, full disclosure.",
      'Blessed beyond measure and slightly under asking.',
      'No, the blazer is not gold. The blazer is BEIGE, as intended.',
    ],
  }),

  def({
    id: 'svetlana',
    name: 'Svetlana Marchetti-Wong',
    tagline: 'Married into three real estate dynasties. Outlived the dynasties.',
    bio: 'Svetlana arrives with two buildings, two mortgages, two problem tenants, and zero dollars. She has evicted senators. Every widow’s portfolio in the city takes her calls. Do not ask about the husbands; the buildings are lovely.',
    portrait: { initials: 'SM', accent: '#14161f', emoji: '🖤' },
    start: {
      cash: 0,
      rank: 'junior',
      reputation: 5,
      ownedSwagIds: [],
      equipped: {},
      /* Both base mortgage slots are consumed from week 1. This is the design:
         ~$708/wk interest against ~$780/wk potential rent. Do not soften it. */
      properties: [
        {
          typeId: 'starter',
          street: 'Maplecrest',
          baseValue: 210000,
          condition: 55,
          mortgageBalance: 168000,
          tenants: [{ archetypeId: 'lateLenny', rentR: 1.0 }],
        },
        {
          typeId: 'duplex',
          street: 'Old Mill',
          baseValue: 380000,
          condition: 60,
          mortgageBalance: 304000,
          tenants: [{ archetypeId: 'partyPaulie', rentR: 1.0 }, null],
        },
      ],
    },
    flags: ['freeEvictions'],
    lines: {
      evict:
        'Svetlana evicted {tenantName} with a nod. There was no modal. There is never a modal.',
    },
    brags: [
      'Building number two is misbehaving. It will apologize.',
      'People ask my secret. Outlive everyone.',
      "The tenants call me 'ma'am' and pay on Thursdays. Both are correct.",
      'In loving memory of Harold, Giancarlo, and Wong. The portfolio endures.',
    ],
  }),

  def({
    id: 'blaine',
    name: 'Blaine Focus',
    tagline: 'Legally changed his name for SEO reasons.',
    bio: 'Blaine Focus (né Blaine Wojciechowski) exists exactly as much as his ad spend allows. His content calendar has a content calendar. When the campaigns pause, colleagues report difficulty remembering his face.',
    portrait: { initials: 'BF', accent: '#d97706', emoji: '📱' },
    start: {
      cash: 800,
      rank: 'receptionist',
      reputation: 5,
      ownedSwagIds: [],
      equipped: {},
      properties: [],
    },
    marketingCostMult: 0.75,
    repDecayMult: 2,
    flags: ['tiktokEarly'],
    lines: {
      fade: "No active campaigns. Blaine's reputation is fading at double speed. A coworker just called him 'Brian.'",
    },
    brags: [
      'ROAS on the bench ads is UNREAL this week. #BlaineFocus',
      'Just A/B tested my own headshot. Version B (jawline) wins.',
      "If you're reading this, the funnel works.",
      'Reminder: I exist! (paid partnership with myself)',
    ],
  }),

  def({
    id: 'terri',
    name: "Terri Castellano, of Terri's Team",
    tagline: 'There is no team. There has never been a team.',
    bio: "Terri sees the numbers. All of them. She'll tell a client their odds to the percentage point, which is why the sign says Terri's Team — people trust a team. It's her, a spreadsheet, and a headshot from 2011, and she closes exactly as often as the math says she will.",
    portrait: { initials: 'TT', accent: '#5ea37a', emoji: '📊' },
    statMods: { hustle: 0, swagger: -2, ego: 0 },
    flags: ['showRawNumbers'],
    lines: {
      numbers:
        'Terri told the client their exact odds. The silence had a percentage too.',
    },
    brags: [
      'Q-to-date close rate: within 0.4% of projection. The Team delivers.',
      "Some agents sell dreams. Terri's Team sells comps.",
      'Client asked for a gut feeling. Sent a histogram.',
      "The Team is thriving. (It me. I'm the team. The team is fine.)",
    ],
  }),
]

/** Select-screen copy. Mint for perks, sold-red for flaws. */
export const PERK_FLAW: Record<string, { perk: string; flaw: string }> = {
  nigel: {
    perk: 'Luxury clients respect the accent (+ close)',
    flaw: 'Failed closes shake the accent (−Swagger for a week)',
  },
  doreen: {
    perk: "Sees next week's market · shrugs off cold markets · starts sharp",
    flaw: 'Ego capped at 2 · refuses flashy gear · influencers flee her',
  },
  hunter: {
    perk: '7 AP · +3 Hustle · owns The Podcast',
    flaw: '−10% on every close · cringe-prone',
  },
  chip: {
    perk: '$40k, Rep 10, and the Gold Blazer on day one',
    flaw: 'Promotions cost 50% more earnings — nobody believes him',
  },
  dave: {
    perk: 'First-timers & retirees trust him (+ close) · immune to bad reviews',
    flaw: 'Luxury clients find him exhausting (− close) · Ego capped at 4',
  },
  svetlana: {
    perk: 'Starts at Junior with two rental buildings · evictions are free and painless',
    flaw: '$0 cash · both mortgage slots full · both tenants are Problems',
  },
  blaine: {
    perk: 'Marketing 25% off · TikTok early · starts with Rep 5',
    flaw: 'Reputation decays twice as fast without active ads',
  },
  terri: {
    perk: 'Sees exact percentages on closes and tenants',
    flaw: '−2 Swagger — the honesty unnerves people',
  },
  you: { perk: 'None', flaw: "None. That's the point." },
}

/** Logged when an imported save names a character nobody has heard of. */
export const UNKNOWN_CHARACTER_LINE =
  'This agent’s file is… unusual. Treating them as a civilian.'
