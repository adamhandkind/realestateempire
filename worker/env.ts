/* Bindings and settings the Worker runs with. Values live in wrangler.jsonc
   (vars) or `wrangler secret put` (secrets). */

export interface Env {
  DB: D1Database
  /** The built SPA (dist/), served by Workers static assets. */
  ASSETS: Fetcher
  /** Public origin, no trailing slash: login and invite links point here. */
  APP_URL: string
  /** Comma-separated. These addresses can sign in without an invite and
   *  found cities. Everyone else needs an invite the first time. */
  OWNER_EMAILS: string
  /** 'resend' sends real mail; 'log' prints links to the Worker log. */
  MAIL_PROVIDER: string
  /** e.g. "Real Estate Empire <login@yourdomain.com>" */
  MAIL_FROM: string
  /** Secret. Only needed with MAIL_PROVIDER=resend. */
  RESEND_API_KEY?: string
  /** '1' in local dev only: login/invite links come back in API responses so
   *  nobody needs a mailbox to test. Never set this in production. */
  DEV_EXPOSE_LINKS?: string
}
