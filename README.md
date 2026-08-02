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

Import direction is one-way: `components → state/logic → data`. Data files hold
constant arrays and import nothing but types. Logic files are pure — no React,
no direct storage access, randomness only through `rand()`. Components hold no
game rules; anything that decides a game outcome lives in `logic/`.

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

## Deploying

`netlify.toml` builds with `npm run build` and publishes `dist`. Static SPA, no
routing, no redirects or functions needed.
