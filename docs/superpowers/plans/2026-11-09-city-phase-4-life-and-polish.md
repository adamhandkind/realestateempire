# City Phase 4: "Life and Polish"

Spec: `docs/superpowers/specs/2026-11-09-isometric-multiplayer-design.md`
(Build phases → Phase 4). Runs during season 1; the Champion's Kit has to be
ready by week 52.

**Goal:** make the city feel alive and give the season its payoff. Agents
walk the streets, and friends who are online see each other. Weather and
light follow the quarter and the clock, and traffic drives the roads. The
champion gets the kit, a portrait on the Hall of Fame wall and an awards
night with a roast for everyone else. A one-column phone check-in covers
days on the road.

## What was built

| Piece | Where | Job |
| --- | --- | --- |
| Season ledger and awards | `citygame/city.ts` (`awardsFor`, `championOf`, `haircutFor`), `citygame/types.ts`, `data/cityAwards.ts`, `data/feedLines.ts` | Per-season record, week-52 awards, the champ's title, feed fanfare |
| Live room | `src/live/presence.ts` (protocol), `worker/live.ts` (`LiveHub`), `worker/cityObject.ts` (hibernating WebSockets), `src/net/live.ts` (browser) | Agents on the map; a push when the tick runs or an offer goes in |
| Getting around | `city/paths.ts` | Walkable tiles, Dijkstra routes (prefers streets), road runs for traffic, crossings for lamps |
| Day and night | `city/daylight.ts`, `CityScene.applyLight` | Sky follows the viewer's clock (longer summer days), or pinned to day or night |
| 3D life | `components/city/agents.ts`, `traffic.ts`, `weather.ts`, `cityMesh.ts` | Figures and the Champion's Kit, cars with lights, petals, fireflies, leaves and snow, lit windows, street lamps, holiday lights, summer pools |
| Screens | `online/AwardsNight.tsx`, `online/Portrait.tsx`, `online/LeagueTab.tsx` (Hall of Fame wall), `online/PhoneCheckIn.tsx` | |
| Schema | `migrations/0003_awards_night.sql` | `seasons.champion_title`, `seasons.awards` |

## Decisions

1. **The champion is last season's winner**, read from `CityState.lastSeason`,
   which already lasted through the next season. They wear the kit from
   awards night until the next one. There's no champion in a city's first
   season.
2. **The kit:** burgundy blazer with shoulder pads, gold buttons, a big
   shiny sculpted haircut and crocodile boots, on the 3D figure and in the
   portrait. The haircut has a name ("The Closer", "The Commission", …),
   hashed from the season and the player, so it's stable. That name is the
   champion's title in labels, the feed and the Hall of Fame.
3. **Fanfare:** the feed uses its own lines when the champ wins a listing at
   the tick, and once a week when the champ closes deals ("walked into a
   showing in the full kit").
4. **Awards night** happens at the tick that ends week 52: the crown, then
   one roast per category, each going to the worst offender **other than the
   champion**. A category nobody earned is skipped. The categories are Always
   the Bridesmaid (most outbid), Slumlord of the Year (foreclosures, then
   condition under 60%), the Hindenburg Award (biggest fall from peak, and
   going broke beats everything), Lowballer of the Year (lone lowballs turned
   down) and Bidding War Hero (most listings won). The record behind them is
   `CityState.ledger`, reset when each season opens. The ceremony shows once
   per browser when the season ends (or in the first week of the next, for
   anyone who missed it), and again from the Hall of Fame.
5. **Live agents carry no game state.** A browser sends "walking from tile A
   to tile B". The city stamps it with the sender and the time and passes it
   on. Every browser works out the same route, so a walk looks the same
   everywhere without streaming positions. Positions live in each socket's
   attachment, so the Durable Object can hibernate. Each browser can send at
   most 4 updates a second. A person with two tabs open is one agent.
6. **The socket is also the doorbell.** The city pushes `tick` after the
   alarm, the manual tick and season start, and `city` after an offer goes in
   or comes out. The browser then checks in right away. The one-minute poll
   stays as a fallback, so a blocked socket loses nothing but company.
7. **Security:** the Worker checks the session, membership and the
   `Origin` header (a WebSocket handshake is a GET, so the POST-only origin
   check doesn't cover it). It passes the user to the object in a header
   that only the Worker can set.
8. **Walking:** click any lot, road or park and your agent walks there,
   preferring streets and stopping in front of a lot rather than inside the
   house. Water is refused. Where you left your agent is kept per browser.
   "Find me" follows your agent.
9. **Day and night follow the viewer's own clock**, because a once-a-day game
   is checked at very different hours. The sky button switches between your
   clock, always day and always night. At night windows light up (not all of
   them), street lamps glow, and cars show headlights and tail lights.
10. **Weather follows the quarter:** blossom petals in spring, fireflies on
    summer nights, falling leaves in fall, and snow plus holiday lights in
    winter. Backyard pools are only open in summer. A reduced-motion setting
    turns the weather off by default, and the ❄ button toggles it.
11. **Budget:** the city went from about 40k to about 70k triangles in winter
    (windows are flat panes and bulbs are tiny pyramids), and a rebuild takes
    about 70 ms in the test (the limit is 120). Cars and particles are
    instanced or points, moved on the CPU: 46 cars and up to 650 snowflakes.
12. **The phone check-in** is what opens on screens under 640px. It has one
    button, "Check in" (`POST /checkin`, which counts as showing up for the
    absence rules), plus the overnight report, your offers (withdraw from
    there), the standings and the feed. "Open the full game" is always one
    tap away.

## API (new)

| Method | Path | Who | Does |
| --- | --- | --- | --- |
| POST | `/api/cities/:id/checkin` | member | Counts as this week's check-in → the city view |
| GET (WebSocket) | `/api/cities/:id/live` | member, same origin | The live room |
| GET | `/api/cities/:id/seasons` | member | Now includes `champion.title` and `awards` |

`CityView` gains `champion`; `SeasonResult` gains `title`, `awards`, and
per-player `doors`, `deals`, `won`.

Live protocol (`src/live/presence.ts`):
- The browser sends `{t:'go', from:[c,r], to:[c,r]}` or `{t:'ping'}`.
- The city sends `hello` (everyone on the map, plus the server clock),
  `agent`, `left`, `tick`, `city` or `pong`.

## Deploying

`npm run deploy` applies `0003_awards_night.sql`. No Durable Object migration
is needed, because WebSockets need no new class. The Vite dev proxy now
forwards WebSockets (`ws: true`).

## Verified

- `citygame/__tests__/awards.test.ts`: the ledger at the tick, the reset
  each season, roast picking (never the champ, nobody for nothing), awards
  on the record at week 52, the champion through the next season,
  fanfare.
- `worker/__tests__/live.test.ts`: hello, walks passed on, one agent per
  person across tabs, leaving, rate limits, junk messages.
- `worker/__tests__/api.test.ts`: the phone check-in, the live route
  (426 / cross-origin 403 / 401), the Hall of Fame with title and awards
  after 52 alarms.
- `city/__tests__/paths.test.ts`, `daylight.test.ts`, `cityMesh.test.ts`:
  routes, road runs, sunrise and sunset, glow and holiday-light geometry,
  rebuild time.
- In Chromium against `wrangler dev` (a real Durable Object with real
  WebSockets): owner and friend in one city, 52 manual ticks, then awards
  night (the champ's own version), the season 2 kit, and the friend's
  browser seeing the owner's agent walk in the kit with their title. Also
  checked: the Hall of Fame wall, and the phone check-in at 390×844. No page
  errors. Day, night, fall and winter were each checked close up.

## Status

- [x] Live agents on the map
- [x] Seasonal weather
- [x] Champion's Kit, Hall of Fame wall, week-52 awards night
- [x] Simple phone check-in
- [x] Traffic and day/night
- [ ] Deploy (still waiting on the Phase 2 setup)

## Parked

- Chat between players (the spec's open question). The live room could
  carry it easily.
- Opening a rivalry from an agent's card. (Clicking an agent now opens
  their card: rank, standing, doors, head to head, and the closet they have
  on. Equipped swag isn't drawn on the figures yet.)
- Seeing each other walk needs both people online. Nothing marks where
  someone was last standing once they leave.
- A way back to the phone view after "Open the full game" (reload for now).

## Open questions for Adam

- [ ] Roast categories and their names. Add or cut any?
- [ ] Should the sky follow each viewer's clock (now) or the city's tick
      time zone?
