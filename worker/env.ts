/* Bindings and settings the Worker runs with. Values live in wrangler.jsonc
   (vars) or `wrangler secret put` (secrets). */

import type { CityObject } from './cityObject'
import type { PartyObject } from './partyObject'

export interface Env {
  DB: D1Database
  /** One Durable Object per city: the live game and the nightly tick. */
  CITY: DurableObjectNamespace<CityObject>
  /** One Durable Object per city: its Land Grab table. */
  /** One Durable Object per Land Grab party room (named 'party:<code>'). */
  PARTY: DurableObjectNamespace<PartyObject>
  /** Per-IP limit on the party routes anyone can call. Optional: absent in
   *  the tests. */
  PARTY_LIMIT?: RateLimit
  /** The built SPA (dist/), served by Workers static assets. */
  ASSETS: Fetcher
  /** Public origin, no trailing slash: sign-in and invite links point here. */
  APP_URL: string
  /** Comma-separated. These addresses can found cities, and sign in with
   *  `npm run login-link`. Everyone else joins with an invite. */
  OWNER_EMAILS: string
  /** '1' in local dev only: the city owner gets a "run the tick now"
   *  button. Never set this in production. */
  ALLOW_MANUAL_TICK?: string
}
