# City Phase 3: "Shared City"

Spec: `docs/superpowers/specs/2026-11-09-isometric-multiplayer-design.md`
(Build phases → Phase 3). Gate to Phase 4: **the first full season starts.**

**Goal:** one city that ten friends share. Its server holds every player's
game and runs the week for everyone at once, overnight. Listings are real
competition: offers are sealed, and a bidding war goes to the best one. The
newsfeed posts every big move with snark. Absent players' houses fall apart
and go back to the bank. The economy is retuned so a strong player gets from
the tent to the top of the ladder in 52 weeks.

## Architecture

```
browser ──HTTPS──▶ Worker (worker/index.ts, game.ts)      sign-in, membership, 18+ (D1)
                    └─▶ City Durable Object, one per city   cityObject.ts → room.ts
                          ├─ storage: city · meta · p:<user> (each player's game)
                          ├─ alarm: the overnight tick
                          └─▶ D1: standings mirror + seasons (Hall of Fame)
```

| Piece | Where | Job |
| --- | --- | --- |
| City mode in the engine | `logic/cityMode.ts`, `data/city.ts`, `state/reducer.ts` | Calendar market, city tuning, server-only `CITY_*` actions, `settleForTick`, `createCityGame` |
| Shared city rules | `src/citygame/` (pure) | `city.ts`: supply, bids, tick, absence, seasons. `view.ts`: what a player may see. `bot.ts` + `sim.ts`: season bots |
| Feed voice | `data/feedLines.ts` | Every newsfeed line |
| Server | `worker/room.ts`, `worker/cityObject.ts`, `worker/schedule.ts` | Storage, alarm, the tick's clock |
| Schema | `migrations/0002_shared_city.sql` | `seasons` |
| Browser | `src/net/cityStore.ts`, `src/components/online/` (`CityGame`, `TickBar`, `LeagueTab`, `cityContext`), `portfolio/OfferModal.tsx` | |

## Decisions

1. **The server plays every move and keeps the dice.** Phase 2's optimistic
   play needed the RNG seed in the browser, which let a determined player
   preview outcomes. Now a click goes up (`POST /act`) and the game comes
   back with `rngSeed` zeroed. A check-in is a few dozen clicks, so a round
   trip each is fine. Clicks made during one in flight go up together.
2. **Each career is still an ordinary `GameState`**, flagged `cityMode`. The
   city is a layer on top (`CityState`): listings, sealed bids, the feed,
   rivalries, standings, the season clock. The engine changes for city mode
   are small and all read `state.cityMode`; single player is untouched (all
   671 earlier tests pass unchanged).
3. **The market is the calendar.** Spring normal, summer hot, fall normal,
   winter cold, the same for everyone. No per-player crashes in a city (a
   crash would have to hit everyone at once; see "parked").
4. **Listings belong to the city.** Each player's `marketPool` is the city's
   board, injected when the game is sent. `BUY_PROPERTY` and `END_WEEK` are
   refused from a city client (`parseBatch(…, { city: true })`) and ignored
   by the reducer in city mode.
5. **Offers are sealed and settle at the tick**, before rent and bills move
   anyone's cash. With two or more bidders, the best offer at or above 85% of
   ask wins and pays what it bid (ties: first in). A lone offer at ask always
   wins; under ask, the seller decides, and sellers are proud in summer and
   desperate in winter (`AUCTION.LOWBALL_STRICTNESS`). Offers run from 70% to
   300% of ask. **The engine checks the winner can still pay at closing**
   (`CITY_PURCHASE`); if not, the next bidder gets it. You pay the bid, but
   the house is worth what it's worth, so overpaying in a bidding war costs
   you.
6. **New supply:** the board is 6 + 2 per player listings (max 28). Each
   tick, unbid listings older than 6 weeks come down, two more are swapped
   out, and the board is topped up. 15% of fresh listings are bank auctions
   (beaten up, 18% off). Foreclosures come back on at 85% of value.
7. **The tick** (`citygame/city.ts → tick`) runs in a fixed order: answer
   everyone's open questions the safe way (`CITY_SETTLE`: the call drops,
   lowballs are refused, tenants kept, fights conceded, the post skipped, the
   ceremony closed); settle offers; absence; End Week for everyone; the feed;
   standings; the clock. It uses the city's own dice, so it replays exactly
   (tested).
8. **When:** 3 a.m. America/Toronto by default (Brantford time). The owner
   changes the hour and zone in the League tab. DST-safe without a date
   library (`worker/schedule.ts`).
9. **Absence (my numbers, see open questions):** a check-in is any move or
   offer. After 3 missed weeks, every property loses 3 extra condition a
   week and the feed notices. After 7, the bank takes one property a week
   (the most-mortgaged), pays 75% of value minus the mortgage, and lists it.
10. **Going broke** puts every property back on the market as foreclosures.
    The player can start over mid-season, in a tent, at the current week.
11. **Seasons:** a new city waits in the **lobby** until the owner opens
    season 1 (everyone starts fresh at week 1). After week 52 the city is
    **finished** for a day: final standings go to D1's `seasons` table (the
    Hall of Fame) and the feed crowns the champion. The next tick opens the
    next season, everyone back in the tent. The Goldies still run every
    quarter, now on the city's calendar.
12. **The morning report** is the Week Summary the tick produced, kept per
    player with "your offers" lines, shown once per browser.
13. **The map is shared.** Everyone's buildings are placed in one fixed order
    (by player, then building) with the same lot hashing as Phase 1, so every
    browser draws the same street. Other players' lots carry their colour
    flag; each player's tent sits at a camp under a bridge.
14. **D1 is the record, not the game.** The tick mirrors each player's
    standing and a backup of their game into `saves`, and archives finished
    seasons. A D1 failure is logged and never undoes a tick.

## The 52-week rebalance

`data/city.ts → CITY`, pinned by `citygame/__tests__/balance.test.ts`
(bots play three full seasons):

| Knob | Single player | City |
| --- | --- | --- |
| Commission | ×1 | ×1.8 |
| Seller's Agent earnings bar | $25,000 | $20,000 |
| Top Producer earnings / deals | $250,000 / 25 | $125,000 / 18 |
| Property appreciation | none | 0.5% a week |

Before (single-player numbers, strong bot): Top Producer around week 45–50,
$150k–$330k net worth, 2–3 starter homes, never a tower. After: Top Producer
by week 19–31 (median ≈ 24), $500k–$1.4M, and the ones who save for it own
condo blocks and towers by winter. A casual bot (checks in 4 days in 5, plays
loosely) reaches Seller's Agent, owns a house or two and stays solvent.

## API (new or changed)

| Method | Path | Who | Does |
| --- | --- | --- | --- |
| GET | `/api/cities/:id/game` | member | `{ version, state, report, city }` |
| POST | `/api/cities/:id/act` | member | `{ baseVersion, actions }` → same; 409 + current game when stale |
| GET | `/api/cities/:id/city` | member | the city view (listings + bid counts, players, feed, grudges) |
| POST / DELETE | `/api/cities/:id/bids[/:listingId]` | member | sealed offer / withdraw |
| GET | `/api/cities/:id/seasons` | member | Hall of Fame |
| POST | `/api/cities/:id/season/start` | owner | open the season |
| POST | `/api/cities/:id/schedule` | owner | `{ hour, zone }` |
| POST | `/api/cities/:id/tick` | owner | run the tick now: only with `ALLOW_MANUAL_TICK=1` (dev) |

Removed: Phase 2's `POST /game/actions` and the browser's `CloudStore`.

## Deploying

Same as Phase 2 (`npm run deploy`). `wrangler.jsonc` now declares the
`CITY` Durable Object (SQLite-backed, migration tag `v1`), and
`migrations/0002_shared_city.sql` adds `seasons`. Phase 2 was never deployed,
so there are no live saves to move. Never set `ALLOW_MANUAL_TICK` in
production.

## Verified

- `citygame/__tests__/city.test.ts`: joining (incl. mid-season), the city
  gate, offer validation, bidding wars, ties, a winner who can't close, the
  calendar, determinism, absence → foreclosure, season end → season 2, feed
  grammar.
- `citygame/__tests__/balance.test.ts`: the rebalance, above.
- `worker/__tests__/api.test.ts`: lobby → open season (3 a.m. Toronto),
  server-played moves with no dice, refusals, stale versions, sealed offers
  settled by the tick, D1 mirror, **52 nightly alarms through to the Hall of
  Fame and season 2**, schedule changes, manual tick refused in production.
- `worker/__tests__/cityStore.test.ts`: the browser store against the
  Worker, covering moves, refusals, noticing the tick, a click meant for last
  week, offline retry, and offers.
- In Chromium against `wrangler dev` (real Durable Object, local D1): owner
  signs in, founds the city, makes an agent, invites a friend who joins; the
  owner opens the season; moves; the tick runs; both players are on week 2;
  post composer → morning report; leaderboard, feed and tick desk render. No
  page errors. The offer dialog and another player's lot card were checked in
  a render harness.
- `wrangler deploy --dry-run` bundles the Worker with the Durable Object.

## Status

- [x] One Durable Object per city with the overnight tick
- [x] Sealed offers and bidding wars, settled at the tick
- [x] Newsfeed with snark, grudge matches, leader changes
- [x] New supply: churn, expiry, bank auctions, foreclosures
- [x] Inactive-player decay and foreclosure
- [x] Economy rebalanced for a 52-week season
- [x] Seasons: lobby → running → finished → next season; Hall of Fame in D1
- [ ] **Deploy** (still needs the Phase 2 setup: D1 id, APP_URL, mail)
- [ ] **Gate:** the first full season starts

## Parked

- **Building on empty lots** (tent → shack → … → tower as construction) and
  combining lots for a condo block. The ladder exists as property types you
  buy; building them is the next big feature.
- **Player-to-player sales.** A listed property still sells to an outside
  buyer (the existing flip roll); the feed posts it.
- A city-wide market crash, rent from other campers, tent "street cred".
- Live presence over WebSockets. The browser polls once a minute and when the
  tab comes back, which is enough for a once-a-day game. Live agents on the
  map need the socket, so it comes with Phase 4.
- Svetlana starts mortgaged to the eyes, and a player who ignores her
  tenants goes broke within weeks, in single player too. Left as is, but
  worth a look if a friend picks her.

## Open questions for Adam

- [ ] Tick time: 3 a.m. Toronto is the default. Keep it?
- [ ] Absence: 3 missed days → wear, 7 → foreclosure. Too harsh, too soft?
- [ ] Should an absent player still pay the desk fee? Right now a friend who
      stops playing at Junior slowly goes broke from it.
- [ ] Late joiners start at the current week with nothing. Give them a
      catch-up bonus?
- [ ] Is a finished season's one-day pause long enough before the next opens,
      or should the owner open each season by hand?
