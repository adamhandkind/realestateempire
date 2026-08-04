import type { CallBeat, PlayableTactic, Reaction } from '../state/types'

type TellRow = Record<PlayableTactic, Reaction>

/**
 * Default reaction per archetype per tactic. A beat's own `tell` overrides an
 * individual cell; this is the fallback underneath it.
 *
 * DO NOT ALTER THIS TABLE. Every archetype has exactly one `great` and at
 * least one `bad`/`terrible`. The luxury-tier split — Lorenzo and Cleo reward
 * Flex, Otis punishes it — is the single most important balance line in the
 * design, because it forces loadout-aware play on the leads that pay the most.
 */
export const ARCHETYPE_TELLS: Record<string, TellRow> = {
  default: { empathize: 'good', push: 'neutral', namedrop: 'good', flex: 'neutral' },
  firstTimer: { empathize: 'great', push: 'terrible', namedrop: 'good', flex: 'bad' },
  retireeRuth: { empathize: 'great', push: 'bad', namedrop: 'good', flex: 'terrible' },
  nightmareNancy: { empathize: 'great', push: 'bad', namedrop: 'neutral', flex: 'bad' },
  hgtvCouple: { empathize: 'good', push: 'neutral', namedrop: 'great', flex: 'neutral' },
  relocRob: { empathize: 'neutral', push: 'great', namedrop: 'good', flex: 'neutral' },
  cashChad: { empathize: 'bad', push: 'good', namedrop: 'neutral', flex: 'great' },
  flipBro: { empathize: 'neutral', push: 'good', namedrop: 'great', flex: 'good' },
  techTyler: { empathize: 'neutral', push: 'good', namedrop: 'great', flex: 'good' },
  lowballLarry: { empathize: 'neutral', push: 'bad', namedrop: 'great', flex: 'bad' },
  ghostGary: { empathize: 'good', push: 'great', namedrop: 'neutral', flex: 'neutral' },
  influencerIzzy: { empathize: 'bad', push: 'neutral', namedrop: 'neutral', flex: 'great' },
  celebrityCleo: { empathize: 'bad', push: 'bad', namedrop: 'good', flex: 'great' },
  luxLorenzo: { empathize: 'neutral', push: 'bad', namedrop: 'good', flex: 'great' },
  oldMoneyOtis: { empathize: 'good', push: 'terrible', namedrop: 'great', flex: 'terrible' },
}

/** What the client opens each turn with. {name} and {price} are filled at
 *  render time. A beat is drawn at most once per call. */
export const CALL_BEATS: CallBeat[] = [
  /* ---- turn 1: the opening ---- */
  {
    id: 't1_generic_a',
    archetypeIds: 'any',
    turn: 1,
    text: "'So. We've seen it, we've talked about it. Where are we at?'",
  },
  {
    id: 't1_generic_b',
    archetypeIds: 'any',
    turn: 1,
    text: "'My spouse asked me last night if we're actually doing this. I didn't have an answer.'",
    tell: { push: 'bad' },
  },
  {
    id: 't1_generic_c',
    archetypeIds: 'any',
    turn: 1,
    text: "'Talk me through the number one more time. {price} is a lot of number.'",
    tell: { namedrop: 'great' },
  },
  {
    id: 't1_first',
    archetypeIds: ['firstTimer', 'retireeRuth'],
    turn: 1,
    text: "'I keep waking up at three in the morning about this. Is that normal?'",
    tell: { empathize: 'great', flex: 'terrible' },
  },
  {
    id: 't1_lux',
    archetypeIds: ['luxLorenzo', 'celebrityCleo'],
    turn: 1,
    text: "'I've had three agents call me this week. Why are we still talking?'",
    tell: { flex: 'great', empathize: 'bad' },
  },
  {
    id: 't1_otis',
    archetypeIds: ['oldMoneyOtis'],
    turn: 1,
    text: "'I don't need this sold quickly. I need it sold *properly*.'",
    tell: { push: 'terrible', namedrop: 'great' },
  },
  {
    id: 't1_investor',
    archetypeIds: ['flipBro', 'techTyler', 'cashChad'],
    turn: 1,
    text: "'Run me the numbers again. Not the story. The numbers.'",
    tell: { namedrop: 'great', empathize: 'bad' },
  },

  /* ---- turn 2: the objection ---- */
  {
    id: 't2_price',
    archetypeIds: 'any',
    turn: 2,
    text: "'I think it's overpriced. I'm not saying it's not nice. I'm saying it's overpriced.'",
    tell: { namedrop: 'great' },
  },
  {
    id: 't2_timing',
    archetypeIds: 'any',
    turn: 2,
    text: "'What if we just… waited? Until spring. Or next spring.'",
    tell: { push: 'good' },
  },
  {
    id: 't2_other_agent',
    archetypeIds: 'any',
    turn: 2,
    text: "'Someone else told me they could get it for less. I don't know if I believe them.'",
    tell: { flex: 'good', empathize: 'neutral' },
  },
  {
    id: 't2_cold_feet',
    archetypeIds: ['firstTimer', 'nightmareNancy', 'retireeRuth'],
    turn: 2,
    text: "'What if we hate it? What if in a year we hate it?'",
    tell: { empathize: 'great', push: 'terrible' },
  },
  {
    id: 't2_ego',
    archetypeIds: ['influencerIzzy', 'celebrityCleo', 'cashChad'],
    turn: 2,
    text: "'Be honest — are you actually the right person for this?'",
    tell: { flex: 'great', empathize: 'bad' },
  },
  {
    id: 't2_deference',
    archetypeIds: ['oldMoneyOtis', 'retireeRuth'],
    turn: 2,
    text: "'My family has been in this house for forty years. I want that respected.'",
    tell: { empathize: 'great', flex: 'terrible', push: 'terrible' },
  },

  /* ---- turn 3: the decision ---- */
  {
    id: 't3_generic_a',
    archetypeIds: 'any',
    turn: 3,
    text: "'Okay. Okay. Say the thing that makes me sign.'",
  },
  {
    id: 't3_generic_b',
    archetypeIds: 'any',
    turn: 3,
    text: "'One reason. Give me one good reason and I'll do it.'",
    tell: { push: 'great' },
  },
  {
    id: 't3_wobble',
    archetypeIds: 'any',
    turn: 3,
    text: "'I'm at fifty-fifty. Genuinely fifty-fifty.'",
  },
  {
    id: 't3_soft',
    archetypeIds: ['firstTimer', 'retireeRuth', 'hgtvCouple'],
    turn: 3,
    text: "'If you tell me this is the right move, I'll believe you.'",
    tell: { empathize: 'great', flex: 'bad' },
  },
  {
    id: 't3_hard',
    archetypeIds: ['cashChad', 'relocRob', 'techTyler'],
    turn: 3,
    text: "'I've got another call in four minutes. Land it.'",
    tell: { push: 'great', empathize: 'terrible' },
  },
  {
    id: 't3_lux',
    archetypeIds: ['luxLorenzo', 'celebrityCleo'],
    turn: 3,
    text: "'Convince me you're the person whose name goes on this.'",
    tell: { flex: 'great' },
  },
]

/**
 * Last-resort beats, never drawn while any normal candidate remains. They
 * reuse the text of the plainest beat for their turn and carry no tell
 * overrides, so they always fall through to the archetype row.
 */
export const GENERIC_BEATS: Record<1 | 2 | 3, CallBeat> = {
  1: {
    id: 'genericBeat1',
    archetypeIds: 'any',
    turn: 1,
    text: "'So. We've seen it, we've talked about it. Where are we at?'",
  },
  2: {
    id: 'genericBeat2',
    archetypeIds: 'any',
    turn: 2,
    text: "'I think it's overpriced. I'm not saying it's not nice. I'm saying it's overpriced.'",
  },
  3: {
    id: 'genericBeat3',
    archetypeIds: 'any',
    turn: 3,
    text: "'Okay. Okay. Say the thing that makes me sign.'",
  },
}

/** Replies are generated per reaction tier, not per beat. Keeps the data small
 *  and still reads fine, because the beat already carried the specifics. */
export const CLIENT_REPLIES: Record<Reaction, string[]> = {
  great: [
    "'…Okay. Yeah. Okay, that's exactly it.'",
    "There's a pause, and it's the good kind.",
    "'That's the first straight answer I've gotten all month.'",
    'You can hear them nodding. People nod audibly. It’s a real thing.',
  ],
  good: [
    "'Hm. That's fair.'",
    "'Alright, I hear you.'",
    "'That does help, actually.'",
    "'Okay, keep going.'",
  ],
  neutral: [
    "'Mm-hm.'",
    "'Sure.'",
    'A noise that could mean anything.',
    "'Right, right.'",
  ],
  bad: [
    "'…I don't know about that.'",
    "There's a silence, and it's the other kind.",
    "'That's not really what I asked.'",
    'You hear a chair move. Never a good sign.',
  ],
  terrible: [
    "'Wow. Okay.'",
    "'You know what, forget it.'",
    'The temperature of the call drops through the floor.',
    "'I'm going to be honest, that was the wrong thing to say.'",
  ],
}
