import type { RankId } from '../state/types'

/** Ten templates per rank tier. Placeholders are filled from live game state
 *  by logic/economy.ts → bragFor(). */
export const BRAG_TEMPLATES: Record<RankId, string[]> = {
  receptionist: [
    'Blessed to announce I refilled the cookie tray at {showings} open houses. Small hinges swing big doors 🙏 #grind',
    'Week {week}. No listings. No car. Just a laminated sign and a dream. 💪',
    'Someone asked me if I worked here today. I said “not yet.” Manifesting. ✨',
    'Woke up at 4am to be first to the printer. The printer was not impressed. I was. #hustle',
    '{cash} in the account and a heart full of untapped potential. Watch this space. 📈',
    'Not everyone gets to fold brochures. I get to fold brochures. Perspective. 🙏',
    'Shoutout to the agent who let me carry the sign today. Mentorship is everything. 🤝',
    'They laughed at the fern on my desk. The fern and I are aligned. 🌿',
    'Reminder: every empire starts with somebody restocking the pens. ✍️',
    "Week {week} of showing up. That's the whole post. #consistency",
  ],
  junior: [
    'Ran {showings} showings this month. Somebody else signed. Still counts. Still climbing. 💪',
    'Grateful to hand yet another close to a senior agent 🙏 Team win! (It was my lead.) #blessed',
    'Just crossed {earnings} in career earnings. Started with a fern. 🌿📈',
    'Unlocking doors for a living. Metaphorically AND literally. 🔑',
    '{leads} people in my pipeline currently deciding whether I exist. 😅 #patience',
    'Week {week}. The lockbox and I have an understanding now. 🤝',
    'My referral cut bought a sandwich. That sandwich tasted like equity. 🥪',
    "Nobody talks about the assistant years. I'm talking about them. Loudly. 📢",
    'Someone called me “the showing guy.” Brand recognition is brand recognition. 🔥',
    "If you want it, wake up and want it again the next day. That's it. That's the tip.",
  ],
  buyerAgent: [
    '🎉 JUST CLOSED! Deal number {deals}. Not bragging, just documenting the journey 🙏 #blessed',
    '{earnings} career earnings and counting. Remember when I was refilling cookie trays? I do. Daily.',
    'Handed a family the keys today. Also handed them a branded pen. Both moments were emotional. 🔑',
    "Your realtor is on a beach. I'm in a crawlspace with a flashlight. Choose wisely. 🔦",
    'Week {week}: {leads} active buyers, zero excuses, one slightly shiny suit. 💼',
    'People ask what I do for fun. I open lockboxes recreationally. 🧍',
    "Closed above asking and below my own expectations of what I'd wear to do it. 😎",
    '{cash} in the bank. Reinvesting all of it into looking like I have more. 📈',
    "Somebody's rival agent tried it this week. Somebody's rival agent did not succeed. 👀",
    'The market is what you make it. I made mine out of voicemails. ☎️',
  ],
  sellerAgent: [
    '🏆 {deals} deals closed. {earnings} career earnings. Humbled. Truly. Deeply. Publicly. 🙏',
    'The blazer is not a costume. The blazer is a commitment. ✨ #industrystandard',
    'Listing appointment ran long because the marble deserved to be discussed. 🪨',
    'Week {week}. {cash} liquid. Still answer my own phone, though. Mostly. ☎️',
    'Someone asked if the car was necessary. Nothing is necessary. That\'s the point. 🚗',
    'Just listed a home with more square footage than my first four apartments combined. 📈',
    'Grateful for every client, every referral, and every reflective surface. 🙏',
    "They don't hate you. They hate that the lapels caught the light. ✨",
    '{leads} in the pipeline. All of them think they found me. 😏',
    'From cookie trays to closing tables. Same person. Better outerwear. 🧥',
  ],
  topProducer: [
    '🏆 Top Producer. I did not become this. I revealed this. 🙏 #blessed',
  ],
}

/** Joins the rotation at the first property. `{properties}` is the door count. */
export const LANDLORD_BRAGS: string[] = [
  'Blessed to provide housing 🙏 #passiveincome (I was awake at 3am about a pipe)',
  'They pay ME to own things. Look it up.',
  'Portfolio update: {properties} doors 🚪 (a duplex is two doors, this is legal)',
  "Cash flow isn't a river. It's a MINDSET. 🌊",
  'Just approved my own repair request. Synergy.',
  'Property #{properties}. My grandkids will inherit these group chats.',
]

/** Joins the rotation at The Machine. */
export const VRBO_BRAGS: string[] = [
  'The Machine ran at 71% occupancy this week. The Machine does not sleep. 🏗️',
  'People said 424 hours a week was impossible. The Machine said nothing. The Machine BOOKED.',
  'Asked The Machine for a day off. Request denied. Respect.',
]

/** In the rotation only while a crash is active. */
export const CRASH_BRAGS: string[] = [
  'Buying opportunities everywhere if you know where to look 👀 (down. look down. prices are down.)',
  'Warren Buffett said be greedy when others are fearful. Anyway I bought a duplex.',
]

/** Joins the rotation permanently once the crown lands. */
export const KING_BRAGS: string[] = [
  'Eight neighbourhoods. One crown. Zero humility. 👑',
  "They said you can't own a whole city. The paperwork disagrees.",
  'Brantford wakes up and thinks of me. I know because the benches face the sunrise.',
]

/** In rotation while the player is dominant anywhere. `{district}` is filled
 *  with a currently-dominant district. */
export const TERRITORY_BRAGS: string[] = [
  'Dominant in {district}. The casseroles were worth it.',
  'My territory map is mostly gold now. My accountant is mostly concerned.',
  'Farming {district} like the Grand carved the valley: slowly, then all at once.',
]

/** Phase 8. Joins the rotation after the first perfect call, and not before —
 *  you have to earn the right to be this annoying. */
export const CALL_BRAGS: string[] = [
  'Closed it on the phone in under six minutes. The phone is a WEAPON. ☎️',
  'Some agents send emails. I call. 📞',
  "'Let me think about it' is just a request for a better phone call.",
]
