/* Land Grab's table talk: what the TV says when something happens. Adults
   only, filthy on purpose (the room is behind an 18+ check). Every line
   still says what happened, so the joke never hides the move.

   Each moment has a few versions, picked by the table's dice state without
   rolling them, so the dice stay exactly as they were. The four bots have
   their own lines for the big moments. Placeholders in {braces}. */

export type Beat =
  | 'join'
  | 'leave'
  | 'awayOn'
  | 'awayOff'
  | 'dealt'
  | 'first'
  | 'firstHouse'
  | 'secondHouse'
  | 'setupDone'
  | 'house'
  | 'duplex'
  | 'tower'
  | 'roll'
  | 'snakeEyes'
  | 'boxcars'
  | 'crash'
  | 'audit'
  | 'crashMove'
  | 'steal'
  | 'buyDeal'
  | 'bank'
  | 'offer'
  | 'took'
  | 'mainStreet'
  | 'mainStreetLost'
  | 'topProducer'
  | 'era'
  | 'win'
  | 'openHouse'
  | 'zoning'
  | 'hotMarket'
  | 'biddingWar'
  | 'timeout'
  | 'rematch'

const LINES: Record<Beat, string[]> = {
  timeout: [
    '{name} ran out of time. The bot finished for them. Happens to a lot of people.',
    '{name} took too long. The bot had to finish them off.',
    '{name} froze. The bot took over. Nobody’s judging. Everyone’s judging.',
    '{name} timed out. Lasting too long is a problem only in board games.',
  ],
  rematch: [
    'Round two. Same people, lower standards.',
    'Again? Somebody’s insatiable.',
    'Rematch. Everyone pretend the last game didn’t happen.',
  ],
  join: [
    '{name} pulled up a chair and is already eyeing everyone’s cul-de-sac.',
    '{name} sat down with their legs spread across two seats. Classic.',
    '{name} arrived smelling like cologne and poor decisions.',
    '{name} is in. The safe word is “escrow.”',
    '{name} joined and asked if this is the kind of party where keys go in a bowl.',
  ],
  leave: [
    '{name} pulled out early. Nobody is surprised.',
    '{name} left the table. Couldn’t finish, as usual.',
    '{name} is gone. Their side of the bed is still warm.',
  ],
  awayOn: [
    '{name} stepped out. The bot is playing with their seat now. (Ew.)',
    '{name} went for a smoke. A bot is warming their spot.',
  ],
  awayOff: ['{name} is back to finish what the bot started.', '{name} is back. The bot is pretending it didn’t enjoy that.'],
  dealt: ['The board is dealt. {era}: {blurb}'],
  first: ['{name} goes first. Somebody had to be on top.', '{name} places first. Someone has to break the ice.'],
  firstHouse: [
    '{name} put up their first house. It’s small, but it’s how you use it.',
    '{name} built their first house. Everyone pretended to be impressed.',
    '{name} planted a house and is already calling it “cozy.”',
  ],
  secondHouse: [
    '{name} built a second house and pockets {cards}. Getting paid on the first date.',
    '{name} put up house number two and starts with {cards}. Look at the stamina.',
    '{name} built again and walked away with {cards}. Somebody’s been practising.',
  ],
  setupDone: ['Foreplay’s over. {name} rolls first.', 'The awkward fumbling phase is done. {name} rolls first.'],
  house: [
    '{name} built a house. A starter home, much like their personality.',
    '{name} built a house. They used protection: a ten-year warranty.',
    '{name} put up a house. Erections are up 4% this quarter.',
    '{name} built a house with a finished basement and a lock on the door. Don’t ask.',
    '{name} built a house. The neighbours can already hear them.',
    '{name} built a house. Open concept. Very open. Curtains not included.',
    '{name} built a house. Three bedrooms, one of them has a sex swing.',
  ],
  duplex: [
    '{name} turned a house into a duplex. Two units, one thin wall, everyone hears everything.',
    '{name} built a duplex. Now they can disappoint people on two floors.',
    '{name} went duplex. Double occupancy, double the noise complaints.',
    '{name} built a duplex. Up and down, side to side, whatever the tenants are into.',
  ],
  tower: [
    '{name} built a tower. It’s big. They need you to know it’s big.',
    '{name} put up a tower and is now standing like they’re compensating for something.',
    '{name} erected a tower. The whole city got a little uncomfortable looking at it.',
    '{name} built a tower. Everyone at the table just started comparing.',
  ],
  roll: ['{name} rolled {n}.', '{name} rolled {n}.', '{name} rolled {n}.', '{name} blew on the dice and rolled {n}. The dice didn’t ask for that.'],
  snakeEyes: ['{name} rolled snake eyes. Limp.', '{name} rolled a 2. It happens to everybody. Apparently.'],
  boxcars: ['{name} rolled 12. Somebody’s feeling frisky.', '{name} rolled boxcars. Somebody took something before the game.'],
  crash: [
    '📉 Market Crash! Everybody clench.',
    '📉 Market Crash! Prices dropping faster than pants on prom night.',
    '📉 Market Crash! Somebody’s about to get screwed, and not the fun way.',
    '📉 Market Crash! Somebody didn’t pull out in time.',
    '📉 Market Crash! Hope everyone stretched first.',
    '📉 Market Crash! The market is going down, and it isn’t even being paid to.',
  ],
  audit: [
    'Property tax audit! {name} loses {cards}. The CRA bent them over the kitchen island.',
    'Audit! {name} coughs up {cards}. Full cavity search, no warning.',
    'Property tax audit! {name} loses {cards}. They always find where you hide it.',
    'Audit! {name} hands over {cards}. The taxman didn’t even buy them dinner.',
  ],
  crashMove: [
    '{name} parked the Market Crash on {tile}. Everyone there just went soft.',
    '{name} crashed {tile}. Cold shower for the whole neighbourhood.',
    '{name} dumped the crash on {tile}. Rude, but honestly kind of hot.',
    '{name} sat the Market Crash on {tile} like it owed them money.',
    '{name} put the crash on {tile}. That’s a mood killer.',
    '{name} crashed {tile}. Nothing’s getting up there for a while.',
  ],
  steal: [
    '{name} slid a hand into {who}’s pocket and took a card. {who} didn’t hate it.',
    '{name} poached a card from {who}. Didn’t even buy them a drink first.',
    '{name} robbed {who}. {who} will be bringing this up in therapy.',
    '{name} went through {who}’s drawers and took a card. Found some other stuff too.',
    '{name} took a card from {who} and didn’t call the next day.',
    '{name} reached into {who}’s hand. Bold. Uninvited. Effective.',
    '{name} took a card off {who} and made eye contact the whole time.',
  ],
  buyDeal: [
    '{name} bought a deal card. It came in a plain brown envelope.',
    '{name} bought a deal card. Discreet billing, they promise.',
    '{name} bought a deal card from a guy in a trench coat.',
    '{name} bought a deal card. No receipts, no questions.',
    '{name} bought a deal card and hid it like it was their browser history.',
  ],
  bank: [
    '{name} traded {k} {give} to the bank for 1 {get}. The bank always ends up on top.',
    '{name} gave the bank {k} {give} for 1 {get}. The teller winked.',
    '{name} swapped {k} {give} for 1 {get} at the bank. Brutal rate. They like it rough.',
    '{name} paid the bank {k} {give} for 1 {get}. Bit of a sugar-daddy arrangement.',
    '{name} traded {k} {give} for 1 {get}. The bank didn’t even pretend to enjoy it.',
  ],
  offer: [
    '{name} offers {give} for {want}. Very forward.',
    '{name} wants {want} and will give {give}. Slide into their DMs.',
    '{name} is putting {give} on the table for {want}. Who’s taking it?',
  ],
  took: [
    '{who} took {name}’s deal: {give} for {want}. Get a room, you two.',
    '{who} accepted: {give} for {want}. Something was definitely exchanged under the table.',
    '{who} said yes to {name}: {give} for {want}. Nobody’s proud of it.',
  ],
  mainStreet: [
    '{name} owns Main Street ({n} streets in a row): +2 points. Longest one at the table, apparently.',
    '{name} takes Main Street with {n} in a row: +2 points. Size does matter.',
  ],
  mainStreetLost: ['Main Street is up for grabs again. Someone just got cut down to size.'],
  topProducer: [
    '{name} is Top Producer ({n} Open Houses): +2 points. Very generous with their open house.',
    '{name} is Top Producer with {n} Open Houses: +2 points. Their doors are always open. Always.',
  ],
  era: ['📢 {era}! {blurb}'],
  win: [
    '🏆 {name} hits {n} Empire Points and wins Land Grab! They’d like to thank their mother, and several of yours.',
    '🏆 {name} wins with {n} Empire Points. Everyone else, roll over and go to sleep.',
    '🏆 {name} finishes on {n} points and wins. Was it good for you? It was great for them.',
  ],
  openHouse: [
    '{name} played 🎈 Open House. Everyone’s invited, nobody’s wearing pants.',
    '{name} played 🎈 Open House. Shoes off. Everything off, actually.',
  ],
  zoning: [
    '{name} played 🛣️ Zoning Variance. Two free streets, because they know a guy at City Hall. Intimately.',
    '{name} played 🛣️ Zoning Variance. Someone at City Hall owes them a favour, and they collected on a desk.',
  ],
  hotMarket: [
    '{name} played 🔥 Hot Market and took {res}. Things are getting steamy.',
    '{name} played 🔥 Hot Market: {res}, straight from the bank. It was very willing.',
  ],
  biddingWar: [
    '{name} started a 📣 Bidding War for {resName} and collected {n}. Everyone got on their knees and handed it over.',
    '{name} called a 📣 Bidding War for {resName}: {n} handed over. The table feels used.',
  ],
}

/** The bots' own lines. Keyed by the first word of the bot's name. */
const BOT_LINES: Record<string, Partial<Record<Beat, string[]>>> = {
  Chadwick: {
    join: ['Chadwick (bot) sat down, undid one more shirt button, and asked who your broker is.'],
    steal: ['Chadwick took a card from {who} and left his business card in their underwear drawer.', 'Chadwick slipped a card out of {who}’s hand and his number into their pocket.', 'Chadwick took a card from {who}. He calls it “a tasting.”'],
    tower: ['Chadwick built a tower and named it after himself. Twice. It has a hot tub on the roof.', 'Chadwick built a tower with a mirrored ceiling in the penthouse. Of course he did.'],
    win: ['🏆 Chadwick wins with {n} points. He’s already in the hot tub. Alone. Waiting for you.'],
  },
  Krystal: {
    join: ['Krystal (bot) cleansed the table with sage and said your aura looks “very available.”'],
    steal: ['Krystal took a card from {who} and called it “manifesting.” {who} feels used.', 'Krystal took a card from {who}. Her crystals told her to. Her crystals are horny.', 'Krystal took a card from {who} and cleansed it with a moan.'],
    tower: ['Krystal built a tower and is doing a photoshoot in front of it in very little clothing.', 'Krystal built a tower. Tantric yoga on the roof, Tuesdays.'],
    win: ['🏆 Krystal wins with {n} points. The thirst trap is already posted.'],
  },
  Duke: {
    join: ['Duke (bot) spun a chair around and sat on it backwards. It’s 2026, Duke.'],
    steal: ['Duke took a card from {who}, then asked if they lift.', 'Duke took a card from {who} and slapped their butt. Team spirit.', 'Duke took {who}’s card and did a protein-shake burp.'],
    tower: ['Duke built a tower and flexed at it. The tower did not flex back.', 'Duke built a tower with a gym where the bedrooms should be.'],
    win: ['🏆 Duke wins with {n} points and is taking his shirt off. Nobody asked, Duke.'],
  },
  Brenda: {
    join: ['Brenda (bot) is here with a box of wine and the energy of a woman whose divorce just went through. She’s open to offers.'],
    steal: ['Brenda took a card from {who} and gave them a long, lingering hug. Too long.', 'Brenda took a card from {who} and called them “sweetie” in a way that felt like a threat.', 'Brenda took a card from {who}. Her ex-husband used to do that too.'],
    tower: ['Brenda built a tower. The pool boy comes with it.', 'Brenda built a tower and threw a “divorce party” in the lobby.'],
    win: ['🏆 Brenda wins with {n} points. She’s spending it on the pool boy.'],
  },
}

/** A number from the table's dice state and the log counter, without
 *  advancing the dice. */
function pickIndex(salt: number, n: number): number {
  let t = Math.imul(salt >>> 0, 2654435761)
  t ^= t >>> 15
  t = Math.imul(t, 0x2c1b3c6d)
  t ^= t >>> 12
  return (t >>> 0) % n
}

export function say(
  beat: Beat,
  vars: Record<string, string | number>,
  salt: number,
  /** The bot whose moment this is, if it's a bot's. */
  botName?: string,
): string {
  let pool = LINES[beat]
  const bot = botName ? BOT_LINES[botName.split(' ')[0]]?.[beat] : undefined
  /* A bot uses its own line half the time, so it doesn't get old. */
  if (bot && pickIndex(salt + 7, 2) === 0) pool = bot
  const tpl = pool[pickIndex(salt, pool.length)]
  return tpl.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m))
}
