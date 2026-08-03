import type { TenantEventDef } from '../state/types'

/* Same convention as data/events.ts: the gate predicate belongs beside the
   weight it gates. These are pure and read-only. */
export const TENANT_EVENTS: TenantEventDef[] = [
  {
    id: 'burstPipe',
    weight: 10,
    minor: true,
    fixCost: 300,
    condition: () => true,
    weightMult: () => 1,
  },
  {
    id: 'roofLeak',
    weight: 6,
    minor: true,
    fixCost: 600,
    condition: () => true,
    weightMult: ({ property }) =>
      property.typeId === 'duplex' || property.typeId === 'apartment' ? 2 : 1,
  },
  {
    id: 'noiseComplaint',
    weight: 8,
    minor: true,
    fixCost: 0,
    condition: () => true,
    weightMult: ({ unit }) =>
      unit.tenant?.archetypeId === 'partyPaulie' ? 3 : 1,
  },
  {
    id: 'supportRaccoon',
    weight: 8,
    minor: true,
    fixCost: 150,
    condition: () => true,
    weightMult: () => 1,
  },
  {
    id: 'rentStrike',
    weight: 6,
    minor: false,
    fixCost: 0,
    condition: ({ property }) => property.condition < 40,
    weightMult: () => 1,
  },
  {
    id: 'greatReferral',
    weight: 4,
    minor: false,
    fixCost: 0,
    condition: ({ property }) =>
      property.units.some(
        (u) => u.tenant?.archetypeId === 'perfectPatricia',
      ) && property.units.some((u) => u.tenant === null),
    weightMult: () => 1,
  },
  {
    id: 'cityInspection',
    weight: 6,
    minor: false,
    fixCost: 0,
    condition: () => true,
    weightMult: () => 1,
  },
  {
    id: 'leaseRenewal',
    weight: 6,
    minor: false,
    fixCost: 0,
    condition: ({ unit }) =>
      !!unit.tenant &&
      unit.tenant.tenancyWeeks >= 10 &&
      unit.tenant.archetypeId !== 'sobStorySteve' &&
      unit.tenant.archetypeId !== 'theHoarder',
    weightMult: () => 1,
  },
]

/** Fired when the issue opens. `{nickname}` and `{tenantName}` interpolate. */
export const TENANT_EVENT_LINES: Record<string, string> = {
  burstPipe:
    'A pipe burst in {nickname}. The tenant sent a video. The video has audio.',
  roofLeak: 'The roof at {nickname} has opinions about rain now.',
  noiseComplaint:
    'The neighbors at {nickname} have filed a complaint, in writing, with adjectives.',
  supportRaccoon:
    "There is a raccoon in {nickname}. The tenant says it's a support raccoon. It has a small vest.",
  rentStrike:
    "{tenantName} is withholding rent until 'the building stops being like this.' Honestly? Fair.",
  greatReferral:
    'Patricia knows another Patricia. The Patricia network provides.',
  cityInspection:
    'Inspection failed. The clipboard came out. The clipboard never lies. −$500 + mandated repairs.',
}

/** Fired when the issue closes. */
export const TENANT_FIX_LINES: Record<string, string> = {
  burstPipe:
    "Plumber came, charged $300, said 'you don't want to know.' You did not ask.",
  roofLeak: 'Roofer patched it and pointed at three future problems. $600.',
  noiseComplaint:
    'You had The Conversation. Volume: reduced. Respect: mutual, allegedly.',
  supportRaccoon:
    "$150 cleaning. The raccoon left with dignity and a granola bar. You'll see him again.",
  cityInspection:
    'The mandated repairs are done. The clipboard has moved on to someone else.',
}

export const INSPECTION_PASS_LINE =
  'City inspection at {nickname}: passed. The inspector almost smiled.'

export const NOISE_QUIT_LINE = 'The neighbors win. The unit is silent and empty.'

export const RENEWAL_BODY =
  "{tenantName}'s lease is up. They 'love it here' but also 'have options.'"

export const PROPCO_FIX_PREFIX =
  "PropCo handled it. 'So here's the thing—' you hung up. "
