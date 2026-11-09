# City Phase 2: "Accounts and Cloud"

Spec: `docs/superpowers/specs/2026-11-09-isometric-multiplayer-design.md`
(Build phases → Phase 2). Gate to Phase 3: **friends can sign in and play.**

**Goal:** the game runs on Cloudflare Workers. Players sign in with an emailed
link (no passwords), join a city only through the owner's invite, confirm
they're 18+, create an agent, and play a game that saves to the cloud and
shows on a city leaderboard. The server referees every save.

## Architecture

```
browser ──HTTPS──▶ Worker (worker/index.ts)
                    ├─ /api/*  → auth.ts · cities.ts · game.ts ──▶ D1 (migrations/)
                    │                                   └─ engine (src/engine)
                    └─ else    → static assets (dist/, SPA fallback)
```

| Piece | Where | Job |
| --- | --- | --- |
| Worker | `worker/` | Router, email-link auth, sessions, cities, invites, agents, saves, leaderboard |
| Schema | `migrations/0001_accounts.sql` | users, sessions, login_tokens, cities, city_members, invites, agents, saves |
| Shared rules | `src/engine/` | `createGame`, `applyActions`, `toWire`/`fromWire`, `stateDigest`, the client-action gate (`clientActions.ts`), `summarize` |
| Browser sync | `src/net/` | `api.ts` (fetch wrapper, backend probe), `cloudStore.ts` (optimistic play + batched saves) |
| Online UI | `src/components/online/` | Sign-in, 18+ gate, found city, create agent, League tab, save status |
| Shell | `src/App.tsx` → `LocalGame.tsx` or `OnlineApp.tsx`, both rendering `Game.tsx` | |

## Decisions

1. **The server replays every move.** The browser runs the same engine, so a
   click applies instantly. Moves queue and go up in batches (after 1.5 s of
   quiet, at once on End Week, and when the tab hides). The server loads its
   copy, replays the batch through `applyActions`, and stores the result. The
   browser sends a fingerprint of its own result; the server sends its state
   back only when the two differ. The leaderboard therefore only ever shows
   games the engine itself played.
2. **The client-action gate is exhaustive.** `src/engine/clientActions.ts`
   maps *every* `Action['type']` to a payload spec or `null` (refused), so a
   new action that nobody has classified is a type error. Refused online:
   every `DEBUG_*`, `IMPORT_SAVE`, `NEW_GAME`, `RESTART`. Payloads are rebuilt
   from the spec (extra fields dropped, types and lengths checked). A batch
   that makes the reducer throw, or produces a NaN anywhere, is rejected
   whole.
3. **The wire is lossless.** `fromWire` used to run the save migrator, which
   treats a load as "the player came back later": it hangs up any phone call
   and dismisses the post composer. The server reloads between batches, so
   that silently changed games mid-call (found in the browser smoke test:
   `SKIP_POST` after End Week diverged). `fromWire` now uses
   `state/serial.parseWire`, an exact inverse of `serialize` for
   current-version saves, and only migrates older ones. `loadSave` and
   imports keep the refresh semantics. `engine/__tests__/wire.test.ts` plays
   thousands of moves (calls, posts, ceremonies, tenants, choices) and checks
   after **every** move that "apply in memory" and "save, reload, apply"
   agree. It fails within two moves on the old path.
4. **The fingerprint is canonical.** `stateDigest` hashes sorted-key JSON of
   the save content, so object key order never causes a false mismatch.
5. **Conflicts heal themselves.** If another tab or device saved first (409),
   the browser takes the server's game and replays its unsent moves on top.
   Offline, it keeps the queue and retries with backoff. When the tab comes
   back into view, an empty batch checks the server's copy still matches.
6. **Login links are pages, not API GETs.** The email links to
   `APP_URL/?login=<token>`, and the page POSTs the token. Mail scanners that
   pre-fetch links can't burn it. Tokens are single use, last 15 minutes, and
   only their SHA-256 is stored (same for sessions and invites).
7. **No address probing.** `/api/auth/request` answers the same whether or
   not it sent anything. Mail goes only to existing users, `OWNER_EMAILS`, or
   holders of a live invite. Rate-limited per address (5/h) and per IP (20/h).
8. **Sessions:** an HttpOnly, Secure, SameSite=Lax cookie lasting 90 days,
   sliding forward at most once a day. State-changing calls from another
   origin are refused as well.
9. **Invites** are single use, last 14 days, are optionally locked to one
   address (and emailed), and can be revoked. A city holds 10 agents at most.
   Only `OWNER_EMAILS` can found a city.
10. **Agents** have a name, one of 10 colours (unique per city, none of them a
    rival's), and a character from the existing select screen. The server
    picks the game seed. After a game over, "New Game" restarts in the same
    city. The server refuses a restart while the game is still running.
11. **Local play still works.** If nothing answers `/api` with the
    `x-res-api` header (plain `npm run dev`, a static host), the app is the
    old single-player game with localStorage saves. Online, the Office tab
    hides Import and the cheat panel.
12. **Mail:** `MAIL_PROVIDER=resend` (one HTTP call, free tier covers this
    easily) or `log` (prints links, for dev and tests). Any other service is
    one more case in `worker/mail.ts`.

## API

| Method | Path | Who | Does |
| --- | --- | --- | --- |
| POST | `/api/auth/request` | anyone | `{email, invite?}` → emails a login link if allowed |
| POST | `/api/auth/verify` | anyone | `{token}` → session cookie; claims the invite it came with |
| POST | `/api/auth/logout` | signed in | ends the session |
| GET | `/api/me` | signed in | user (adult, isOwner) + cities with agent |
| POST | `/api/me/adult` | signed in | `{confirm:true}` → the 18+ check |
| POST | `/api/cities` | owner | `{name}` → new city |
| POST/GET | `/api/cities/:id/invites` | city owner | make (link shown once) / list |
| DELETE | `/api/cities/:id/invites/:inviteId` | city owner | revoke |
| GET | `/api/invites/:token` | anyone | what the join page shows |
| POST | `/api/invites/:token/accept` | signed in | join another city |
| POST | `/api/cities/:id/agent` | member, 18+ | `{name, color, characterId, restart?}` → new game |
| GET | `/api/cities/:id/game` | member | `{version, state}` |
| POST | `/api/cities/:id/game/actions` | member | `{baseVersion, actions, digest}` → `{version, digest, state?}` / 409 |
| GET | `/api/cities/:id/leaderboard` | member | agents by net worth |

## Running it locally

```bash
cp .dev.vars.example .dev.vars   # MAIL_PROVIDER=log, DEV_EXPOSE_LINKS=1
npm run build                    # wrangler wants dist/ to exist
npm run dev:api                  # local D1 migrations + Worker on :8787
npm run dev                      # Vite on :5173, proxies /api to :8787
```

Sign in with an address from `OWNER_EMAILS`. With `DEV_EXPOSE_LINKS=1`, the
"Check your email" screen shows the login link itself.

## Deploying (first time)

1. `npx wrangler login`
2. `npx wrangler d1 create real-estate-empire`, then paste the printed id
   into `database_id` in `wrangler.jsonc`.
3. In `wrangler.jsonc` `vars`, set `APP_URL` (the workers.dev URL or a
   custom domain, no trailing slash) and `MAIL_FROM`. Check `OWNER_EMAILS`.
4. Mail: create a Resend account, verify the sending domain, then
   `npx wrangler secret put RESEND_API_KEY`.
5. `npm run deploy` (build → remote migrations → deploy).
6. Open the site, sign in, found the city, and send invites from the
   League tab.

## Verified

- `worker/__tests__/api.test.ts`: 39 tests on the real fetch handler and real
  migration SQL (Node's SQLite standing in for D1). Covers links, rate limits,
  expiry, sessions, cross-origin refusal, invites (single use, email lock,
  revoke, city cap), the 18+ gate, agent rules, saves, cheats refused, and
  the leaderboard.
- `worker/__tests__/sync.test.ts`: the browser's `CloudStore` against the
  Worker, covering agreement, two tabs, offline retry, server-wins and checkIn.
- `src/engine/__tests__/wire.test.ts`: the per-move wire soak described above.
- In Chromium against `wrangler dev` with local D1: sign in → 18+ → found
  city → create agent → play a week → reload (game comes back) → invite →
  friend joins (taken colour greyed out) → shared leaderboard. No divergence
  notices, no page errors. Without a backend the app falls back to local play.

## Status

- [x] Worker + static assets + D1 schema
- [x] Email login links, sessions, logout
- [x] Invites (link or email, single use, revoke), city cap, owner-only cities
- [x] 18+ check, agent creation (name, colour, character), restart after game over
- [x] Server-refereed cloud saves with optimistic play and conflict healing
- [x] Lossless wire format + per-move soak test
- [x] Leaderboard (League tab), save status indicator
- [ ] **Deploy:** D1 id, APP_URL, mail domain + Resend key (needs Adam's Cloudflare account)
- [ ] **Gate:** friends can sign in and play

## Known limits (deliberately left for Phase 3)

- **End Week is still on demand.** Each player runs their own clock, as in
  single-player. The overnight tick (Durable Object alarm) replaces this in
  Phase 3, which is also when the leaderboard becomes a fair race.
- **The RNG seed travels to the browser**, because optimistic play needs it.
  A determined player could run the engine locally to preview outcomes before
  committing. Phase 3 keeps the seed server-side, since queued moves resolve
  at the tick anyway.
- Each player's game is still their own copy of the city. Shared lots,
  auctions and the newsfeed are Phase 3.

## Open questions for Adam

- [ ] Email service: Resend is wired up. Which domain do the login emails come from?
- [ ] Hostname: workers.dev, or a custom domain?
- [ ] `OWNER_EMAILS`: only you, or a co-owner too?
- `scripts/verify-content.mjs` was already failing on `main` before this
  phase (an ESM resolution error on `src/data/reputation`), so it's unrelated
  to Phase 2 but worth a separate fix.
