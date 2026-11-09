/* The city newsfeed's voice. Every big move gets posted, with snark.
   Placeholders: {a} {b} (agent names), {house}, {district}, {price}, {n}.
   Constant data only. */

export const FEED_LINES = {
  won: [
    '{a} closed on a {house} in {district} for {price}. The seller cried. Happy tears, allegedly.',
    '{a} just bought a {house} in {district} for {price} and is already calling it "a portfolio."',
    'SOLD to {a}: a {house} in {district}, {price}. Expect the lawn sign by morning.',
  ],
  outbid: [
    '{a} outbid {b} on a {house} in {district}. {b} has posted a vague quote about patience.',
    'Bidding war in {district}: {a} beat {b} to a {house} at {price}. Somebody is going to be weird at brunch.',
    '{b} came second on a {house} in {district}. {a} came first. That is how numbers work.',
  ],
  grudge: [
    'That is {n} times {a} has outbid {b}. This is no longer business. This is personal.',
    'Grudge match: {a} over {b}, {n} times now. The group chat has picked sides.',
  ],
  lowballRejected: [
    "{a}'s lowball on a {house} in {district} was returned to sender with a laughing emoji.",
    'The seller of a {house} in {district} read {a}’s offer out loud at dinner. For laughs.',
  ],
  sold: [
    '{a} flipped a {house} in {district} for {price}. Their LinkedIn post is already 900 words.',
    '{a} sold a {house} in {district}. {price}. Champagne emoji, champagne emoji, champagne emoji.',
  ],
  promoted: ['{a} is now a {rank}. They have ordered new business cards and a slightly bigger head.'],
  bankrupt: [
    '{a} is broke. The bus bench ad is being painted over as we speak.',
    'Pour one out: {a} has moved back in with their parents. The portfolio goes to the bank.',
  ],
  foreclosed: [
    'The bank took back {a}’s {house} in {district}. Nobody had mowed it in weeks.',
    "FORECLOSURE: {a}'s {house} in {district}. It's back on the market, and so, emotionally, is {a}.",
  ],
  neglect: [
    'Nobody has seen {a} in days. Their lawns are knee-high and the tenants have formed a committee.',
    '{a} has gone quiet. Their properties have started to look it.',
  ],
  joined: [
    '{a} has pitched a tent under the bridge. Everybody starts somewhere. Most people start higher.',
    'New in town: {a}, one tent, zero listings, unlimited confidence.',
  ],
  leader: [
    '{a} is the richest agent in the city this week. They have mentioned it.',
    'New number one: {a}. {b} has been seen staring at the leaderboard in the parking lot.',
  ],
  bankAuction: ['Bank auction in {district}: a {house}, sold as-is. "As-is" is doing a lot of work.'],
  seasonStart: ['Season {n} is open. Fifty-two weeks. One blazer. Everybody back to the tent.'],
  seasonEnd: ['Season {n} is over. {a} finishes on top with {price}. Fetch the blazer.'],
} as const

export type FeedLineKey = keyof typeof FEED_LINES
