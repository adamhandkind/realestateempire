# City Phase 1 — "See the City"

Spec: `docs/superpowers/specs/2026-11-09-isometric-multiplayer-design.md`
(Build phases → Phase 1). Gate to Phase 2: **you like the look in your browser.**

**Goal:** an isometric, low-poly city you can pan, zoom and rotate; clicking a
lot opens the game's existing property and deal screens; and the rules are
restructured so they can move onto a server in Phase 3.

**Architecture:** three layers, one-way imports.

| Layer | Where | Pure? | Job |
| --- | --- | --- | --- |
| Rules engine | `src/engine/` (+ `logic/`, `state/`, `data/`) | yes | The one door into the rules: `createGame(seed)`, `applyAction`, `applyActions`, `toWire`/`fromWire`. |
| City model | `src/city/` | yes | The lot grid (`layout.ts`), who/what is on each lot (`occupancy.ts`), market quarters (`season.ts`). |
| City view | `src/components/city/` | no | three.js scene, geometry, HUD, lot card. Lazy-loaded. |

---

## Decisions

1. **three.js, vanilla, no art assets.** Every building is boxes, pyramids and
   prisms in vertex colours, merged into one mesh (`builder.ts`, `cityMesh.ts`).
   The whole city is a handful of draw calls. Each vertex carries its lot index,
   so a click on any wall, roof or lawn resolves to a lot with one raycast.
2. **The map is the existing Brantford map.** The 1000×700 district polygons
   and the Grand River SVG path in `data/districts.ts` are sampled onto a 40×28
   grid (one tile = 25 map units). Roads every 6 columns / 5 rows make blocks;
   three roads bridge the river; riverbank lots beside a bridge are **camp
   lots** (tents) — where every player starts in the shared city.
3. **Lots aren't in the save yet.** The rules still think in districts,
   listings and properties. `city/occupancy.ts` maps them onto lots by hashing
   ids (stable across renders and reloads). A bought property carries
   `fromListingId` so it stays on the lot its listing stood on. Rival territory
   share becomes rival-flagged lots. Phase 3 makes lots first-class state.
4. **Clients are on the map.** Each lead appears at an independent home in its
   district (green marker); clicking it shows the Leads-tab card with Run
   Showing / Attempt Close. Early careers have no listings, so this is what
   makes the city playable before the market opens.
5. **Every action is an existing one.** The lot card hands off to `BuyModal`,
   `PropertyCard`, `LeadCard` and `DistrictSheet`. No new game rules.
6. **Season look follows the market quarter** (`seasonOf(week)`): blossoms in
   spring, full green in summer, orange in fall, snow in winter.
7. **The flat district map stays** as the "Territory" view in the City tab.
   The City tab is now the first tab and the default.

## Server-readiness (what "restructure the rules" means here)

- `engine/__tests__/boundary.test.ts` fails the build if anything in
  `engine/ logic/ data/ state/ city/` imports React, three.js or a component,
  or touches `window`, `document`, `localStorage`, the clock or `Math.random`
  (only `logic/rand.ts` may). `state/save.ts` is the one browser file.
- `engine/__tests__/engine.test.ts` proves: same seed → same game; an action
  log replays to the identical state; a game shipped through `toWire`/
  `fromWire` keeps playing identically to the one that stayed in memory.
- Fixed on the way: tenants who never leave (`plannedStayWeeks: Infinity`)
  came back from a save as `null` and moved out the next week. `migrate`
  restores `Infinity`. Lead ids no longer read `Date.now()`.
- The RNG cursor is still module-global, seeded per reducer call from
  `GameState.rngSeed`. That is safe in a Durable Object (one city, one thread).

## Controls

Drag to pan · scroll or `+`/`−` to zoom · `Q`/`E` or ⟲ ⟳ to turn 90° ·
arrows/WASD to pan · `0` or ⌂ for the whole city · click any lot · `Esc`
closes the card. HUD chips jump between your listings, your doors and your
clients.

## Status

- [x] Engine entry point, boundary and determinism tests, Infinity fix
- [x] City layout from districts + river; bridges; camp lots; addresses
- [x] Occupancy: listings, properties, rivals, independents, empty, camps
- [x] Low-poly building kit for every property type; tents; parks; trees
- [x] Isometric camera: pan, zoom, 90° rotation, fit-to-city
- [x] Picking (buildings, lawns, floating markers) and hover line
- [x] Lot card → BuyModal / PropertyCard / LeadCard / DistrictSheet
- [x] Seasonal palettes
- [ ] **Gate:** Adam plays it in a browser and signs off on the look

## Ideas parked for later phases

- Lots as first-class server state; pitching a tent on a camp lot (Phase 3)
- Other players' agents walking the map; traffic; day/night (Phase 4)
- Building on empty lots, upgrading tent → tower step by step (Phase 3)
