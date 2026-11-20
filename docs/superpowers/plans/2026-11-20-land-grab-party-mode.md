# Land Grab: Party Mode

Nov 20, 2026 · Status: **plan, for review — no code yet**

**Goal:** Land Grab becomes a same-room party game. One big screen (a TV or
a laptop on the wall) shows the board. Everyone plays from their own phone:
scan a QR code, type a name, and you're in. About 45 minutes, 2–4 players,
with bots to fill seats.

This replaces the Land Grab tab that went in on Nov 20 (commit "feat: Land
Grab, a hex-board strategy game…"). That tab put the board, your hand and
the controls on one screen for remote play. Remote play is parked (see the
end); it can come back later on the same server.

## Decisions so far

| Question | Decision |
| --- | --- |
| How people join | **Room code, no account.** The TV shows a 4-letter code and a QR code. Scan, type a name, pick a colour. Separate from cities. |
| Placing pieces | **Tap the board on your phone.** Your phone shows the board with your legal spots glowing. The TV shows a ghost of the piece while you choose. |
| Remote online tab | **Party only for now.** The Nov 20 tab and its per-city table come out. |
| Game length | **About 45 minutes.** Win at 10 points, turn timers, eras at 3 / 6 / 8 points. |

## What we keep from the Nov 20 build

| Piece | Where | Change needed |
| --- | --- | --- |
| Rules engine | `src/board/rules.ts`, `types.ts`, `geometry.ts` | Win points and era thresholds become table options instead of constants. Add a turn-timeout move. |
| Bots | `src/board/bot.ts` | Also used to play a timed-out turn (see Timers). |
| Board drawing | `src/components/board/BoardSvg.tsx` | Split into a TV version (big, animated, no clicks) and a phone version (zoom, pan, tap). |
| Server table | `worker/boardRoom.ts`, `boardObject.ts` | Keyed by room code instead of city. Players are guests with a seat token, not accounts. Full state pushed over the socket instead of a nudge. |
| Tests | `src/board/__tests__/` | Kept. Bot simulations re-run to retune for party length. |

What goes: `src/components/board/LandGrab.tsx` (the one-screen tab), the
Land Grab tab in `Game.tsx`, `src/net/board.ts` (the per-city transport),
`worker/board.ts` (the `/api/cities/:id/board` routes), and the practice
mode (a single-device practice game makes no sense when the controls are on
your phone; see Parked).

## How it fits together

```
TV browser  ──WebSocket──┐
phone 1     ──WebSocket──┤
phone 2     ──WebSocket──┼─▶ Worker /api/party/*  ──▶ Party Durable Object, one per room
phone 3     ──WebSocket──┘     (create room, join)      ├─ storage: BoardState, seats, tokens
                                                         ├─ alarm: turn timer
                                                         └─ pushes each socket its own view
```

- **One Durable Object per room**, named by the room code. It holds the game,
  the seat tokens and the turn timer (an alarm). It replaces the per-city
  `BOARD` object, so no new wrangler migration is needed. The class stays;
  only how it's keyed changes.
- **WebSockets carry everything.** Moves go up the socket and each socket
  gets its own view back after every change: the TV gets the public view and
  each phone gets its own hand. A view is a few KB, so this is cheaper and
  snappier than the nudge-then-fetch we use now. Every move carries the
  `rev` it was made against, and a stale one is refused.
- **Routes:** a page each for the TV (`/tv`) and the phone (`/join/ABCD`,
  which the QR code opens). `App.tsx` picks a screen by path before its
  usual "is there a backend?" probe. Static hosting already falls back to
  `index.html`.

## The TV

The TV is for watching, so nothing on it is clickable after the lobby.

- **Lobby:** a big room code, a QR code, the URL in plain text, and the
  seats filling up live (name, colour, "ready"). Buttons to add or remove
  bots and to start, usable from the TV's own mouse or from the first
  player's phone (the host).
- **Game:** the board fills the screen. Around it: the era track, whose turn
  it is with a countdown ring, each player's points and card count (never
  their cards), and the last few table-talk lines.
- **Moments worth a beat on the big screen:** the dice tumbling, resources
  flying from tiles to players, the Market Crash token dropping, a new era
  (a full-screen card: "📢 LANDLORD ERA — duplexes unlocked"), Main Street
  or Top Producer changing hands, a trade being made, and the winner screen.
  Sound effects are on the TV only, with a mute button.
- **It must survive a refresh:** reloading `/tv` with the room code brings
  the board straight back.

## The phone

One screen, one hand. Big buttons, readable at arm's length, works one-handed.

- **Join:** name, colour (taken colours greyed out), Join. Your seat token is
  saved in the phone's storage, so a locked screen or a reload drops you back
  into your seat.
- **Not your turn:** your hand, your deal cards, your points, and whose turn
  it is. A trade offer aimed at you slides up with Accept / Decline.
- **Your turn:** one big action at a time — 🎲 Roll, then a build tray
  (Street · House · Upgrade · Deal card) that greys out what you can't
  afford, plus Trade and End turn.
- **Placing:** pick Street or House and the phone shows the board, zoomed to
  fit, with your legal spots glowing. Pinch to zoom, tap a spot, then a
  Confirm button (an accidental tap mustn't spend your cards). The TV shows a
  ghost piece where you're looking, so the room can heckle.
- **Market Crash:** the phone shows the tiles to pick from, then the faces of
  the players you can take a card from.
- **Haptics:** a buzz when it's your turn and when someone offers you a
  trade (where the phone supports it).

## Trading at the table

The fun of the genre is shouting offers across the room, so the phone only
has to make the deal binding.

- The player whose turn it is builds an offer on their phone ("2 🧱 for 1 📜")
  and sends it to everyone, or to one player.
- It pops up on those phones. The first to accept gets it, as now.
- The offerer can cancel. Offers clear at the end of the turn.
- **New:** a player who isn't up can send a counter-offer to the active
  player, which they accept or decline. This is the only rules addition here.
- The bank trade stays (4:1, or 3:1 in the Mogul Era).

## Timers and people wandering off

- **Turn timer:** 60 seconds for a turn, 30 for opening placement, shown on
  the TV and the phone, with a warning at 10. Each turn the timer restarts
  once if the player does something (a build or a trade), so a busy turn
  isn't cut off.
- **On timeout,** the bot finishes that step for them: it rolls, places the
  best spot, or ends the turn. It never spends their cards on anything but
  the move it has to make.
- **Phone gone** (socket closed for 20 s): the seat shows "away" on the TV,
  and their turns are played by the bot until the phone comes back. Same
  mechanism as autopilot today.
- **The host can kick a seat** (handing it to a bot) from the TV lobby.

## Rule changes for party length

Bot games today run about 24 rounds to 12 points. For roughly 45 minutes with
4 people taking around 40 s a turn, we want about 15–17 rounds.

| Rule | Now | Party |
| --- | --- | --- |
| Win | 12 points | **10 points** |
| Eras | 4 / 7 / 10 points | **3 / 6 / 8 points** |
| Turn timer | none | **60 s** (placement 30 s) |

These are starting values. Phase 4 retunes them with the bot simulation
until median game length lands in range and all four eras show up in most
games.

## Security without accounts

Joining needs no account, so:

- **Hosting a room needs a signed-in account** (anyone in any city, or the
  game owner). This stops strangers using our Workers bill for their own
  parties. Guests only join. *(Open question 1.)*
- **Room codes** are 4 letters from an alphabet with no lookalikes (no O/0,
  I/1), so about 330k codes. They expire 12 hours after the last move.
  Joining is rate-limited by IP (as the invite routes are now).
- **Seat tokens** are random secrets held by each phone. Holding the token
  is what lets you play that seat; a stolen code alone only lets you watch.
- **Names** are trimmed to 16 characters. They only ever appear on the TV in
  the room, so there's no moderation beyond that.
- **18+:** the main game is adults-only. Land Grab's text is mild, but it
  shares the voice. *(Open question 2.)*

## Build phases

Each phase ends with something we can play, and a gate to pass before the
next one.

1. **Rooms and joining.** Party Durable Object keyed by room code, create /
   join / reconnect, seat tokens, the TV lobby with QR code, the phone join
   screen, live seats. *Gate: four phones join a TV in under a minute, and a
   phone that locks and unlocks lands back in its seat.*
2. **Phone controller.** Hand, roll, build tray, tap-to-place with Confirm,
   Market Crash and steal, deal cards, bank trade. The TV mirrors everything,
   with the ghost piece. *Gate: a full game played start to finish with
   nothing but phones.*
3. **Party flow.** Trade offers and counters between phones, turn timers
   with bot fallback, "away" seats, TV animations and sound, era cards,
   winner screen, "play again" with the same players. *Gate: a real game
   night where nobody needs to touch the TV after the lobby.*
4. **Tuning and clean-up.** Retune win and era thresholds from bot
   simulations and the playtest. Remove the Nov 20 tab and its per-city
   routes. README and test updates. *Gate: playtest games land at 35–55
   minutes, and everyone wants another.*

## Testing

- **Rules:** the existing suite, plus party options (10 points, new eras),
  the timeout move, and counter-offers. Bot simulation reports game length.
- **Server:** the Party room driven in Node like `BoardRoom` is now —
  create, join, reconnect by token, stale `rev`, timer alarm firing a bot
  move, room expiry, a guest refused hosting rights.
- **End to end:** Playwright with one TV page and four phone-sized pages
  (iPhone and Pixel emulation) playing a whole game against the local
  worker, with screenshots of the TV and one phone at each phase.
- **In person:** a TV, real phones, and real friends before Phase 4 ends.

## Parked

- **Remote play** (everyone on their own screen, from anywhere). The server
  will already do everything it needs; it's mainly a desktop layout. Worth
  bringing back if the party version lands.
- **5–6 players.** Needs a bigger board (more tiles and numbers). The
  geometry code handles a larger radius, but the balance needs its own work.
- **Practice against bots on one device.**
- **Ports or harbours** for better bank rates on the coast.
- **Linking to city careers** — e.g. a Land Grab win giving swag or brag
  posts in the main game.
- **Casting** to a Chromecast or Apple TV. Opening `/tv` in a laptop browser
  on the TV is the supported way for now.

## Open questions for Adam

1. **Who can host?** The plan says a signed-in account is needed to create a
   room (cheap protection for the bill). Or should anyone be able to host?
2. **18+:** should the TV lobby show a "this game is for adults" line that
   the host confirms, or should Land Grab be written to be fine for anyone?
3. **What will the big screen be?** A laptop on HDMI, a smart TV's own
   browser, or a Chromecast tab? Smart-TV browsers are slow, which changes
   how much animation we can afford.
4. **Name:** keep "Land Grab"?
5. **Counter-offers:** the plan adds them (any player can propose a trade to
   the player whose turn it is). Keep that, or stick to the active player
   making all offers?
