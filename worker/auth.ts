/* Email login links, sessions, the 18+ check, and the "who am I" call.

   Flow: the browser POSTs an email (plus the invite it arrived with, if any)
   to /api/auth/request. If that address may sign in, we email a one-time
   link to APP_URL/?login=<token>. The page at that link POSTs the token to
   /api/auth/verify, which sets an HttpOnly session cookie. The link is a
   page, not an API GET, so mail scanners that pre-fetch links can't burn it.

   Who may sign in: anyone who already has an account, anyone listed in
   OWNER_EMAILS, or anyone holding a live invite. Everyone gets the same
   answer either way, so the endpoint can't be used to test addresses. */

import { hashToken, newId, randomToken } from './crypto'
import type { Env } from './env'
import { HttpError, cookie, getCookie, json, readJson, str } from './http'
import { loginMail, send } from './mail'

export const SESSION_COOKIE = 'res_session'
const MINUTE = 60_000
const DAY = 24 * 60 * MINUTE
const LOGIN_TTL = 15 * MINUTE
const SESSION_TTL = 90 * DAY
/** Sessions slide forward at most once a day, to keep writes rare. */
const SESSION_REFRESH = DAY
const MAX_LINKS_PER_EMAIL_HOUR = 5
const MAX_LINKS_PER_IP_HOUR = 20

export interface User {
  id: string
  email: string
  adult: boolean
  isOwner: boolean
}

export const normalizeEmail = (raw: unknown): string | null => {
  const e = str(raw).trim().toLowerCase()
  return e.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) ? e : null
}

export const ownerEmails = (env: Env): Set<string> =>
  new Set(
    (env.OWNER_EMAILS ?? '')
      .split(',')
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean),
  )

const secure = (env: Env) => env.APP_URL.startsWith('https://')

/* --------------------------------------------------------------- invites */

export interface InviteRow {
  id: string
  city_id: string
  created_by: string
  email: string | null
  expires_at: number
  used_by: string | null
  revoked_at: number | null
}

export async function findInvite(env: Env, token: string): Promise<InviteRow | null> {
  if (!token) return null
  return env.DB.prepare(
    'SELECT id, city_id, created_by, email, expires_at, used_by, revoked_at FROM invites WHERE token_hash = ?',
  )
    .bind(await hashToken(token))
    .first<InviteRow>()
}

/** Why an invite can't be used by `email` right now, or null if it can. */
export function inviteProblem(inv: InviteRow | null, email: string | null, now: number): string | null {
  if (!inv) return 'invite_not_found'
  if (inv.revoked_at) return 'invite_revoked'
  if (inv.used_by) return 'invite_used'
  if (inv.expires_at < now) return 'invite_expired'
  if (email && inv.email && inv.email !== email) return 'invite_wrong_email'
  return null
}

/** Joins the invite's city. A no-op if the user is already a member. */
export async function claimInvite(env: Env, inv: InviteRow, userId: string, now: number): Promise<void> {
  const member = await env.DB.prepare(
    'SELECT 1 FROM city_members WHERE city_id = ? AND user_id = ?',
  )
    .bind(inv.city_id, userId)
    .first()
  if (member) return
  const count = await env.DB.prepare('SELECT COUNT(*) AS n FROM city_members WHERE city_id = ?')
    .bind(inv.city_id)
    .first<{ n: number }>()
  if ((count?.n ?? 0) >= MAX_CITY_MEMBERS)
    throw new HttpError(409, 'city_full', 'That city already has ten agents.')
  const used = await env.DB.prepare(
    'UPDATE invites SET used_by = ?, used_at = ? WHERE id = ? AND used_by IS NULL AND revoked_at IS NULL',
  )
    .bind(userId, now, inv.id)
    .run()
  if (!used.meta.changes) throw new HttpError(409, 'invite_used', 'Someone already used that invite.')
  await env.DB.prepare(
    "INSERT INTO city_members (city_id, user_id, role, joined_at) VALUES (?, ?, 'player', ?)",
  )
    .bind(inv.city_id, userId, now)
    .run()
}

export const MAX_CITY_MEMBERS = 10

/* ------------------------------------------------------------- sessions */

export async function currentUser(env: Env, req: Request): Promise<User | null> {
  const token = getCookie(req, SESSION_COOKIE)
  if (!token) return null
  const hash = await hashToken(token)
  const now = Date.now()
  const row = await env.DB.prepare(
    `SELECT u.id, u.email, u.adult_confirmed_at, s.expires_at, s.last_seen_at
       FROM sessions s JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = ?`,
  )
    .bind(hash)
    .first<{ id: string; email: string; adult_confirmed_at: number | null; expires_at: number; last_seen_at: number }>()
  if (!row || row.expires_at < now) return null
  if (now - row.last_seen_at > SESSION_REFRESH)
    await env.DB.prepare('UPDATE sessions SET last_seen_at = ?, expires_at = ? WHERE token_hash = ?')
      .bind(now, now + SESSION_TTL, hash)
      .run()
  return {
    id: row.id,
    email: row.email,
    adult: row.adult_confirmed_at !== null,
    isOwner: ownerEmails(env).has(row.email),
  }
}

export async function requireUser(env: Env, req: Request): Promise<User> {
  const u = await currentUser(env, req)
  if (!u) throw new HttpError(401, 'signed_out', 'Sign in first.')
  return u
}

/* --------------------------------------------------------------- routes */

/** POST /api/auth/request  { email, invite? } */
export async function requestLink(env: Env, req: Request): Promise<Response> {
  const body = await readJson(req)
  const email = normalizeEmail(body.email)
  if (!email) throw new HttpError(400, 'bad_email', "That doesn't look like an email address.")
  const invite = str(body.invite)
  const now = Date.now()
  const ip = req.headers.get('cf-connecting-ip') ?? ''

  const recent = await env.DB.prepare(
    `SELECT
       (SELECT COUNT(*) FROM login_tokens WHERE email = ?1 AND created_at > ?3) AS by_email,
       (SELECT COUNT(*) FROM login_tokens WHERE ip = ?2 AND ip != '' AND created_at > ?3) AS by_ip`,
  )
    .bind(email, ip, now - 60 * MINUTE)
    .first<{ by_email: number; by_ip: number }>()
  if ((recent?.by_email ?? 0) >= MAX_LINKS_PER_EMAIL_HOUR || (recent?.by_ip ?? 0) >= MAX_LINKS_PER_IP_HOUR)
    throw new HttpError(429, 'slow_down', 'Too many login links. Try again in an hour.')

  const known = await env.DB.prepare('SELECT 1 FROM users WHERE email = ?').bind(email).first()
  const inv = invite ? await findInvite(env, invite) : null
  const inviteOk = inv !== null && inviteProblem(inv, email, now) === null
  const allowed = known !== null || ownerEmails(env).has(email) || inviteOk

  let devLink: string | undefined
  if (allowed) {
    const token = randomToken()
    await env.DB.prepare(
      `INSERT INTO login_tokens (token_hash, email, invite_token_hash, ip, created_at, expires_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
      .bind(await hashToken(token), email, inviteOk ? await hashToken(invite) : null, ip, now, now + LOGIN_TTL)
      .run()
    const link = `${env.APP_URL}/?login=${encodeURIComponent(token)}`
    await send(env, loginMail(email, link))
    if (env.DEV_EXPOSE_LINKS === '1') devLink = link
  } else if (invite && inv) {
    /* The one case worth telling them: they hold a real invite that's dead
       or locked to someone else. That reveals nothing about other users. */
    const problem = inviteProblem(inv, email, now)
    if (problem) throw new HttpError(403, problem, inviteMessage(problem))
  }
  return json({ ok: true, ...(devLink ? { devLink } : {}) })
}

export const inviteMessage = (code: string): string =>
  ({
    invite_not_found: "That invite link isn't one of ours.",
    invite_revoked: 'That invite was cancelled.',
    invite_used: 'That invite has already been used.',
    invite_expired: 'That invite expired. Ask for a new one.',
    invite_wrong_email: 'That invite is for a different email address.',
  })[code] ?? 'That invite is no good.'

/** POST /api/auth/verify  { token } */
export async function verifyLink(env: Env, req: Request): Promise<Response> {
  const body = await readJson(req)
  const token = str(body.token)
  if (!token) throw new HttpError(400, 'bad_token')
  const hash = await hashToken(token)
  const now = Date.now()
  const row = await env.DB.prepare(
    'SELECT email, invite_token_hash, expires_at, used_at FROM login_tokens WHERE token_hash = ?',
  )
    .bind(hash)
    .first<{ email: string; invite_token_hash: string | null; expires_at: number; used_at: number | null }>()
  if (!row || row.used_at || row.expires_at < now)
    throw new HttpError(400, 'link_expired', 'That login link has expired or was already used. Ask for a new one.')
  const burned = await env.DB.prepare('UPDATE login_tokens SET used_at = ? WHERE token_hash = ? AND used_at IS NULL')
    .bind(now, hash)
    .run()
  if (!burned.meta.changes) throw new HttpError(400, 'link_expired', 'That login link was already used.')

  let user = await env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(row.email).first<{ id: string }>()
  if (!user) {
    user = { id: newId() }
    await env.DB.prepare('INSERT INTO users (id, email, created_at) VALUES (?, ?, ?)')
      .bind(user.id, row.email, now)
      .run()
  }

  /* An invite that went stale between the email and the click doesn't stop
     the sign-in; the response says what happened to it. */
  let inviteError: string | undefined
  if (row.invite_token_hash) {
    const inv = await env.DB.prepare(
      'SELECT id, city_id, created_by, email, expires_at, used_by, revoked_at FROM invites WHERE token_hash = ?',
    )
      .bind(row.invite_token_hash)
      .first<InviteRow>()
    const problem = inviteProblem(inv, row.email, now)
    if (problem) inviteError = problem
    else {
      try {
        await claimInvite(env, inv!, user.id, now)
      } catch (e) {
        inviteError = e instanceof HttpError ? e.code : 'invite_failed'
      }
    }
  }

  const session = randomToken()
  await env.DB.prepare(
    'INSERT INTO sessions (token_hash, user_id, created_at, expires_at, last_seen_at) VALUES (?, ?, ?, ?, ?)',
  )
    .bind(await hashToken(session), user.id, now, now + SESSION_TTL, now)
    .run()
  /* Spent and expired login links are no use to anyone. */
  await env.DB.prepare('DELETE FROM login_tokens WHERE expires_at < ?').bind(now - DAY).run()

  return json(
    { ok: true, ...(inviteError ? { inviteError, inviteMessage: inviteMessage(inviteError) } : {}) },
    {
      headers: {
        'set-cookie': cookie(SESSION_COOKIE, session, { maxAge: SESSION_TTL / 1000, secure: secure(env) }),
      },
    },
  )
}

/** POST /api/auth/logout */
export async function logout(env: Env, req: Request): Promise<Response> {
  const token = getCookie(req, SESSION_COOKIE)
  if (token) await env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(await hashToken(token)).run()
  return json({ ok: true }, { headers: { 'set-cookie': cookie(SESSION_COOKIE, '', { maxAge: 0, secure: secure(env) }) } })
}

/** GET /api/me — the signed-in user and the cities they belong to. */
export async function me(env: Env, req: Request): Promise<Response> {
  const user = await requireUser(env, req)
  const { results } = await env.DB.prepare(
    `SELECT c.id, c.name, c.season, m.role, a.name AS agent_name, a.color, a.character_id
       FROM city_members m
       JOIN cities c ON c.id = m.city_id
       LEFT JOIN agents a ON a.city_id = m.city_id AND a.user_id = m.user_id
      WHERE m.user_id = ?
      ORDER BY m.joined_at`,
  )
    .bind(user.id)
    .all<{ id: string; name: string; season: number; role: string; agent_name: string | null; color: string | null; character_id: string | null }>()
  return json({
    user,
    cities: results.map((r) => ({
      id: r.id,
      name: r.name,
      season: r.season,
      role: r.role,
      agent: r.agent_name ? { name: r.agent_name, color: r.color, characterId: r.character_id } : null,
    })),
  })
}

/** POST /api/me/adult  { confirm: true } — the one-time 18+ check. */
export async function confirmAdult(env: Env, req: Request): Promise<Response> {
  const user = await requireUser(env, req)
  const body = await readJson(req)
  if (body.confirm !== true) throw new HttpError(400, 'confirm_required')
  await env.DB.prepare('UPDATE users SET adult_confirmed_at = COALESCE(adult_confirmed_at, ?) WHERE id = ?')
    .bind(Date.now(), user.id)
    .run()
  return json({ ok: true })
}
