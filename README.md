# Real Estate Simulator — Phase 1: The Agent Loop

A satirical, dashboard-style tycoon game about climbing the real estate ladder.
Generate leads, run showings, close deals, earn commission, buy ridiculous swag,
rank up. Late-night infomercial energy meets LinkedIn humble-brag.

Phase 1 is the core agent loop only — no property flipping, no tenants, no
marketing channels, no brokerage ownership. Ranks past Seller's Agent are shown
locked on the track and nothing is built behind them.

## Running it

```bash
npm install
```

```bash
npm run dev
```

```bash
npm run build
```

```bash
npm run preview
```

`build` runs `tsc -b` first, so a type error fails the build.

## How it's laid out

```
src/
  main.tsx              entry
  App.tsx               shell: header, tabs, End Week, modals
  styles.css            all styling (extracted from Phase 1's <style> block)
  state/
    types.ts            GameState, Lead, LogEntry, all shared types
    reducer.ts          reducer + initial state factory + End Week
    save.ts             localStorage load/save/export/import
  logic/
    rand.ts             the ONLY source of randomness
    economy.ts          commission, expenses, stats, promotion checks
    leads.ts            lead generation, close formula, patience
    events.ts           weekly event selection & resolution
    log.ts              log append helpers
  data/
    ranks.ts archetypes.ts swag.ts events.ts flavor.ts brags.ts
  components/
    Header BragTicker RankTrack OfficeTab LeadsTab ClosetTab LogTab
    WeekSummaryModal
```

### The city (multiplayer Phase 1)

```
src/
  engine/               the one door into the rules: createGame, applyAction,
                        toWire/fromWire. Server-safe (see boundary test).
  city/                 pure: lot grid from the district map + river
                        (layout), who's on each lot (occupancy), seasons
  components/city/      three.js isometric view, lot card, HUD (lazy-loaded)
```

The City tab shows the 3D city.
Plan and decisions: `docs/superpowers/plans/2026-11-09-city-phase-1-see-the-city.md`.

Import direction is one-way: `components → state/logic → data`. Data files hold
constant arrays and import nothing but types. Logic files are pure — no React,
no direct storage access, randomness only through `rand()`. Components hold no
game rules; anything that decides a game outcome lives in `logic/`.

### Land Grab (the party board game)

A same-room party game: the board goes on a big screen (a laptop on the TV,
or a console's browser) and everyone plays on their own phone. Two to four
players, bots fill empty seats, about 45 minutes. Adults only: the table
talk is filthy on purpose.

- **Hosting:** open `/tv` while signed in, tick the 18+ box and start a
  room. The TV shows a 4-letter room code and a QR code.
- **Joining:** scan the QR code (or open `/join` and type the code), pick a
  name and a colour, tick 18+. No account needed. The phone remembers its
  seat, so a locked screen or a reload drops you straight back in.
- **Playing:** build streets, houses, duplexes and towers on a hex map of
  the city. Dice pay out five resources (Leads, Lumber, Brick, Permits,
  Cash) that you trade with the table or the bank. A 7 is a Market Crash.
  First to 10 Empire Points wins. Four eras move the whole table on when the
  leader reaches 3, 6 and 8 points: Agent → Landlord (duplexes) → Developer
  (towers) → Mogul (bank trades 3:1).
- **On your phone:** your hand, then on your turn Roll → build tray → Trade
  / Deal cards → End turn. Placing opens the board zoomed in on your legal
  spots; tap one, the TV shows a ghost of the piece, and nothing is spent
  until you press Confirm.
- **The turn clock:** a minute a turn (30 s for opening placement), topped
  up once if you build or trade; 15 s if your phone isn't connected. When it
  runs out the bot finishes your turn without spending your cards.
- **The TV:** the board, big dice, a countdown ring, the latest joke as a
  caption, full-screen cards for a Market Crash and each new era, sound
  (with mute), and a winner screen with awards. Play again keeps the same
  people.

One Durable Object per room (`PARTY` → `worker/partyObject.ts` →
`worker/partyRoom.ts`) holds the game, the seat tokens (hashed) and the turn
clock, and pushes every socket its own view over a WebSocket. Bots move a
second apart on the room's alarm so the room can watch. Rooms are cleared
after 12 hours of quiet. The main game's Land Grab tab points to `/tv`.

```
src/board/             pure rules: types, data, hex geometry, rules engine,
                       bot, table talk (voice.ts)
src/party/             what the TV, phones and server say to each other,
                       the socket client, awards, sound
src/components/party/  the TV, the phone, the phone's zoomable board
src/components/board/  the board drawing (SVG)
worker/party*.ts       routes, the room's Durable Object, the room itself
```

## Saves

`localStorage` key `res_save_v1`, `version: 1`. Autosaves on every state change.
Export/Import live in the Office tab under Settings. The format is unchanged
from the original single-file build — a save from that build imports here and
keeps playing.

## phase1/

`phase1/index.html` is the frozen single-file build this project was migrated
from, kept as the reference for content parity. Don't edit it.

```bash
node scripts/verify-content.mjs
```

That evaluates the frozen file and deep-compares every ranks/archetype/swag/
event/brag structure and the stylesheet against `src/`. It must print
"All content identical."

## Online play (multiplayer Phase 2)

```
worker/                 Cloudflare Worker: /api (invite-link login, invites,
                        cities, agents, cloud saves, leaderboard) + static assets
migrations/             D1 schema
src/net/                browser side: api client, CloudStore (optimistic play,
                        batched saves the server replays and verifies)
src/components/online/  sign-in, 18+ gate, agent creation, League tab
```

If a backend answers `/api`, the game is online; if not (plain `npm run dev`,
a static host), it's the local single-player game exactly as before.

```bash
cp .dev.vars.example .dev.vars && npm run build
npm run dev:api     # Worker + local D1 on :8787
npm run dev         # Vite on :5173, proxies /api
```

Plan, API, decisions and first-time deploy steps:
`docs/superpowers/plans/2026-11-09-city-phase-2-accounts-and-cloud.md`.

## The shared city (multiplayer Phase 3)

```
src/citygame/           pure: the shared city's rules (offers, the tick,
                        the feed, absence, seasons), what a player may see,
                        and the season bots the balance test plays
worker/room.ts          one city on the server: storage, moves, the tick
worker/cityObject.ts    the Durable Object around it (one per city, alarm)
src/net/cityStore.ts    browser side: moves go up, the game comes back
```

Online, every city is shared: the server plays every move and keeps the
dice, and the week ends for everyone at the overnight tick. City-mode tuning
is `src/data/city.ts`; single player is unchanged.
Plan and decisions: `docs/superpowers/plans/2026-11-09-city-phase-3-shared-city.md`.

With `ALLOW_MANUAL_TICK=1` in `.dev.vars` (the example has it), the city
owner gets a "Run the tick now" button for local testing.

## Life and polish (multiplayer Phase 4)

```
src/live/presence.ts    the live room's protocol (agents walking the map)
worker/live.ts          the live room on the server (hibernating WebSockets)
src/net/live.ts         browser side: other agents in, "the tick ran" nudges
src/city/paths.ts       routes for walking agents, road runs for traffic
src/city/daylight.ts    day and night from the viewer's clock
src/components/city/    agents.ts (figures, Champion's Kit), traffic.ts,
                        weather.ts; windows, lamps, holiday lights in cityMesh
src/components/online/  AwardsNight, Portrait (Hall of Fame), PhoneCheckIn
```

Click anywhere in the city to walk there. Online, friends see each other's
agents, and last season's champion walks in the burgundy blazer. Week 52 ends
with awards night. On a phone the game opens as a one-column check-in.
Plan and decisions: `docs/superpowers/plans/2026-11-09-city-phase-4-life-and-polish.md`.

## Today (the front door)

```
src/logic/briefing.ts   pure: what happened, what needs attention, what you
                        can do next, all read from the state
src/components/TodayTab the three-column briefing; opens first
```

The game opens on Today: rent, offers and auction results, renovation
progress, district and market changes; then vacancies, loan payments, open
issues, renovation decisions and clients about to walk; then the moves —
bid/buy, renovate, refinance, list, work leads, or hold cash. Refinancing
(`REFINANCE`, tuned by `REFI` in `src/data/p3.ts`) is a cash-out loan at 70%
of today's value, so the market you refinance in matters.

## Deploying

`npm run deploy` builds, applies D1 migrations remotely and deploys the
Worker (see the Phase 2 plan for one-time setup). `netlify.toml` still
publishes `dist` as a static, local-play-only build.
