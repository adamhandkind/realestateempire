/* The Worker: serves the built game (dist/, via static assets) and the
   /api/* routes. Workers static assets answers every non-/api path itself
   (wrangler.jsonc: run_worker_first = ["/api/*"]), so this only ever sees
   API calls, and anything else falls through to ASSETS. */

import { confirmAdult, logout, me, requestLink, verifyLink } from './auth'
import { acceptInvite, createCity, createInvite, listInvites, peekInvite, revokeInvite } from './cities'
import type { Env } from './env'
import { act, bid, checkIn, createAgent, live, getCity, getGame, leaderboard, manualTick, seasons, setSchedule, startSeason, withdraw } from './game'
import { HttpError, errorResponse, json } from './http'

export type { Env }
export { CityObject } from './cityObject'

type Handler = (env: Env, req: Request, params: string[]) => Promise<Response>

const ID = '([A-Za-z0-9_-]{1,64})'
const routes: [method: string, pattern: RegExp, handler: Handler][] = [
  ['POST', /^\/api\/auth\/request$/, (env, req) => requestLink(env, req)],
  ['POST', /^\/api\/auth\/verify$/, (env, req) => verifyLink(env, req)],
  ['POST', /^\/api\/auth\/logout$/, (env, req) => logout(env, req)],
  ['GET', /^\/api\/me$/, (env, req) => me(env, req)],
  ['POST', /^\/api\/me\/adult$/, (env, req) => confirmAdult(env, req)],
  ['POST', /^\/api\/cities$/, (env, req) => createCity(env, req)],
  ['POST', new RegExp(`^/api/cities/${ID}/invites$`), (env, req, [c]) => createInvite(env, req, c)],
  ['GET', new RegExp(`^/api/cities/${ID}/invites$`), (env, req, [c]) => listInvites(env, req, c)],
  ['DELETE', new RegExp(`^/api/cities/${ID}/invites/${ID}$`), (env, req, [c, i]) => revokeInvite(env, req, c, i)],
  ['GET', new RegExp(`^/api/invites/${ID}$`), (env, _req, [t]) => peekInvite(env, t)],
  ['POST', new RegExp(`^/api/invites/${ID}/accept$`), (env, req, [t]) => acceptInvite(env, req, t)],
  ['POST', new RegExp(`^/api/cities/${ID}/agent$`), (env, req, [c]) => createAgent(env, req, c)],
  ['GET', new RegExp(`^/api/cities/${ID}/game$`), (env, req, [c]) => getGame(env, req, c)],
  ['POST', new RegExp(`^/api/cities/${ID}/act$`), (env, req, [c]) => act(env, req, c)],
  ['GET', new RegExp(`^/api/cities/${ID}/city$`), (env, req, [c]) => getCity(env, req, c)],
  ['POST', new RegExp(`^/api/cities/${ID}/bids$`), (env, req, [c]) => bid(env, req, c)],
  ['DELETE', new RegExp(`^/api/cities/${ID}/bids/${ID}$`), (env, req, [c, l]) => withdraw(env, req, c, l)],
  ['GET', new RegExp(`^/api/cities/${ID}/seasons$`), (env, req, [c]) => seasons(env, req, c)],
  ['POST', new RegExp(`^/api/cities/${ID}/season/start$`), (env, req, [c]) => startSeason(env, req, c)],
  ['POST', new RegExp(`^/api/cities/${ID}/schedule$`), (env, req, [c]) => setSchedule(env, req, c)],
  ['POST', new RegExp(`^/api/cities/${ID}/tick$`), (env, req, [c]) => manualTick(env, req, c)],
  ['GET', new RegExp(`^/api/cities/${ID}/leaderboard$`), (env, req, [c]) => leaderboard(env, req, c)],
  ['POST', new RegExp(`^/api/cities/${ID}/checkin$`), (env, req, [c]) => checkIn(env, req, c)],
  ['GET', new RegExp(`^/api/cities/${ID}/live$`), (env, req, [c]) => live(env, req, c)],
]

/** Cookies are SameSite=Lax, which already stops cross-site POSTs carrying
 *  them; this refuses any state-changing call from another origin too. */
function crossOrigin(env: Env, req: Request): boolean {
  if (req.method === 'GET' || req.method === 'HEAD') return false
  const origin = req.headers.get('origin')
  return origin !== null && origin !== new URL(env.APP_URL).origin
}

export async function handleApi(req: Request, env: Env): Promise<Response> {
  const path = new URL(req.url).pathname
  try {
    if (crossOrigin(env, req)) throw new HttpError(403, 'cross_origin')
    let pathMatched = false
    for (const [method, pattern, handler] of routes) {
      const m = pattern.exec(path)
      if (!m) continue
      pathMatched = true
      if (method !== req.method) continue
      return await handler(env, req, m.slice(1))
    }
    throw pathMatched ? new HttpError(405, 'method_not_allowed') : new HttpError(404, 'not_found')
  } catch (e) {
    if (e instanceof HttpError) return errorResponse(e)
    console.error('api error', path, e)
    return json({ error: 'server_error', message: 'Something broke on our end.' }, { status: 500 })
  }
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const path = new URL(req.url).pathname
    if (path === '/api' || path.startsWith('/api/')) return handleApi(req, env)
    return env.ASSETS.fetch(req)
  },
} satisfies ExportedHandler<Env>
