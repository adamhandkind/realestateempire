import type { CallCard, TacticId } from '../state/types'

/** The tactic buttons, in the order they render. Read is always last. */
export const CALL_CARDS: CallCard[] = [
  {
    id: 'empathize',
    label: 'Empathize',
    hint: 'Slow down. Listen. Mean it.',
    playerLines: [
      "'That's a real concern, and I'd rather you raise it now than after closing.'",
      "'You don't have to decide today. I want you to decide right.'",
      "'Tell me what's actually worrying you. The rest is paperwork.'",
      "'Nobody should feel rushed into the biggest purchase of their life.'",
    ],
  },
  {
    id: 'push',
    label: 'Push',
    hint: 'Create urgency. Ask for the signature.',
    playerLines: [
      "'There are two other showings booked tomorrow. I'm telling you that because it's true.'",
      "'If you want it, we write it up tonight. That's the whole strategy.'",
      "'I can hold it until nine. After that I genuinely can't.'",
      "'Let's stop circling. Yes or no — I'll respect either one.'",
    ],
  },
  {
    id: 'namedrop',
    label: 'Namedrop',
    hint: 'Comps, credentials, and who you know.',
    playerLines: [
      "'The same floorplan two streets over went $30k above ask in eleven days.'",
      "'I sold the house behind yours. And the one behind that.'",
      "'My inspector can be in there Thursday. He owes me one.'",
      "'I've done four of these this quarter. The pattern is very consistent.'",
    ],
  },
  {
    id: 'flex',
    label: 'Flex',
    hint: 'Full presence. Let them see the blazer.',
    playerLines: [
      "'People don't hire me to be quiet. They hire me because I win these.'",
      "'You've seen the benches. That's not vanity, that's market share.'",
      "'I don't lose bidding wars. I'd rather you hear that from me than from someone else.'",
      "'Look — the jacket is doing a lot of work here, but so is my record.'",
    ],
  },
  {
    id: 'read',
    label: 'Read the Room',
    hint: 'Say nothing. Learn one thing. (Costs the turn.)',
    playerLines: [
      'You let the silence sit. It does what silence does.',
      "You say 'mm' and wait. They fill the gap.",
      "You listen to what they're not saying.",
    ],
  },
]

/** Never throws. An unknown id falls back to the first card. */
export const cardOf = (id: TacticId): CallCard =>
  CALL_CARDS.find((c) => c.id === id) ?? CALL_CARDS[0]
