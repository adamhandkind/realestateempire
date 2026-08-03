export interface VrboEventDef {
  id: string
  cash: number
  rep: number
  condition: number
  line: string
}

/** Equal weights — a flat `pick`. */
export const VRBO_EVENTS: VrboEventDef[] = [
  {
    id: 'bachelorParty',
    cash: -800,
    rep: 2,
    condition: 0,
    line: 'A bachelor party happened. The reviews are five stars. The hot tub is not.',
  },
  {
    id: 'filmCrew',
    cash: 2500,
    rep: 0,
    condition: 0,
    line: "A film crew rented it for a movie called 'Equity 2'. No further questions.",
  },
  {
    id: 'influencerSummit',
    cash: 0,
    rep: 3,
    condition: -5,
    line: 'An influencer summit. The content is up. The towels are gone.',
  },
  {
    id: 'plumbingCatastrophe',
    cash: -1200,
    rep: 0,
    condition: -10,
    line: 'All of the plumbing. Everywhere. At once.',
  },
]

export const VRBO_NICKNAME = 'The 424/7 VRBO'

export const VRBO_TOOLTIP =
  'Breaks even at 424 hours/week of bookings. There are 168 hours in a week.'

/** Replaces the pitch body once the offer converts into a real purchase. */
export const VRBO_OFFER_BODY =
  "The wholesaler's voice cracks. 'Look. $480,000. That's BELOW my course price-per-unit math. This property is a MACHINE waiting for an operator.'"

export const VRBO_DECLINE_FOREVER_LINE = "You'll always wonder."

export const MACHINE_TITLE = 'THE MACHINE'
export const MACHINE_SUBTITLE = '424/7. Fully operational.'
