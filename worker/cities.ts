/* Cities and invites. A city is a private group of up to ten friends. Only
   addresses in OWNER_EMAILS can found one; each city's owner hands out
   personal, single-use invite links. */

import { claimInvite, findInvite, inviteMessage, inviteProblem, normalizeEmail, requireUser, type User } from './auth'
import { hashToken, newId, randomToken } from './crypto'
import type { Env } from './env'
import { HttpError, json, readJson, str } from './http'
import { inviteMail, send } from './mail'

const INVITE_TTL = 14 * 24 * 60 * 60_000

export async function membership(env: Env, cityId: string, userId: string): Promise<'owner' | 'player'> {
  const row = await env.DB.prepare('SELECT role FROM city_members WHERE city_id = ? AND user_id = ?')
    .bind(cityId, userId)
    .first<{ role: 'owner' | 'player' }>()
  /* Not-a-member and no-such-city look the same from outside. */
  if (!row) throw new HttpError(404, 'no_city', "That city doesn't exist, or you're not in it.")
  return row.role
}

async function requireCityOwner(env: Env, req: Request, cityId: string): Promise<User> {
  const user = await requireUser(env, req)
  if ((await membership(env, cityId, user.id)) !== 'owner')
    throw new HttpError(403, 'owner_only', 'Only the city owner can do that.')
  return user
}

/** POST /api/cities  { name } */
export async function createCity(env: Env, req: Request): Promise<Response> {
  const user = await requireUser(env, req)
  if (!user.isOwner) throw new HttpError(403, 'owner_only', 'Only the game owner can found a city.')
  const body = await readJson(req)
  const name = str(body.name).trim().slice(0, 40)
  if (name.length < 2) throw new HttpError(400, 'bad_name', 'Give the city a name.')
  const id = newId()
  const now = Date.now()
  await env.DB.batch([
    env.DB.prepare('INSERT INTO cities (id, name, owner_id, created_at) VALUES (?, ?, ?, ?)').bind(id, name, user.id, now),
    env.DB.prepare("INSERT INTO city_members (city_id, user_id, role, joined_at) VALUES (?, ?, 'owner', ?)").bind(
      id,
      user.id,
      now,
    ),
  ])
  return json({ id, name }, { status: 201 })
}

/** The name a friend sees on an invite: the owner's agent if they've made
 *  one, otherwise the part of their email before the @. */
async function inviterName(env: Env, cityId: string, userId: string): Promise<string> {
  const a = await env.DB.prepare('SELECT name FROM agents WHERE city_id = ? AND user_id = ?')
    .bind(cityId, userId)
    .first<{ name: string }>()
  if (a) return a.name
  const u = await env.DB.prepare('SELECT email FROM users WHERE id = ?').bind(userId).first<{ email: string }>()
  return u ? u.email.split('@')[0] : 'A friend'
}

/** POST /api/cities/:id/invites  { email?, note? } → a link, shown once. */
export async function createInvite(env: Env, req: Request, cityId: string): Promise<Response> {
  const user = await requireCityOwner(env, req, cityId)
  const body = await readJson(req)
  let email: string | null = null
  if (str(body.email).trim()) {
    email = normalizeEmail(body.email)
    if (!email) throw new HttpError(400, 'bad_email', "That doesn't look like an email address.")
  }
  const note = str(body.note).trim().slice(0, 60) || null
  const token = randomToken()
  const id = newId()
  const now = Date.now()
  await env.DB.prepare(
    `INSERT INTO invites (id, token_hash, city_id, created_by, email, note, created_at, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(id, await hashToken(token), cityId, user.id, email, note, now, now + INVITE_TTL)
    .run()
  const link = `${env.APP_URL}/?invite=${encodeURIComponent(token)}`
  let emailed = false
  if (email) {
    const city = await env.DB.prepare('SELECT name FROM cities WHERE id = ?').bind(cityId).first<{ name: string }>()
    await send(env, inviteMail(email, link, city?.name ?? 'the city', await inviterName(env, cityId, user.id)))
    emailed = true
  }
  return json({ id, link, email, note, emailed, expiresAt: now + INVITE_TTL }, { status: 201 })
}

/** GET /api/cities/:id/invites — the owner's list. Links aren't stored, so
 *  they can't be shown again; a lost one gets revoked and reissued. */
export async function listInvites(env: Env, req: Request, cityId: string): Promise<Response> {
  await requireCityOwner(env, req, cityId)
  const { results } = await env.DB.prepare(
    `SELECT i.id, i.email, i.note, i.created_at, i.expires_at, i.used_at, i.revoked_at, u.email AS used_by_email
       FROM invites i LEFT JOIN users u ON u.id = i.used_by
      WHERE i.city_id = ? ORDER BY i.created_at DESC LIMIT 100`,
  )
    .bind(cityId)
    .all<{
      id: string
      email: string | null
      note: string | null
      created_at: number
      expires_at: number
      used_at: number | null
      revoked_at: number | null
      used_by_email: string | null
    }>()
  const now = Date.now()
  return json({
    invites: results.map((r) => ({
      id: r.id,
      email: r.email,
      note: r.note,
      createdAt: r.created_at,
      expiresAt: r.expires_at,
      usedBy: r.used_by_email,
      status: r.revoked_at ? 'revoked' : r.used_at ? 'used' : r.expires_at < now ? 'expired' : 'open',
    })),
  })
}

/** DELETE /api/cities/:id/invites/:inviteId */
export async function revokeInvite(env: Env, req: Request, cityId: string, inviteId: string): Promise<Response> {
  await requireCityOwner(env, req, cityId)
  await env.DB.prepare('UPDATE invites SET revoked_at = ? WHERE id = ? AND city_id = ? AND used_at IS NULL')
    .bind(Date.now(), inviteId, cityId)
    .run()
  return json({ ok: true })
}

/** GET /api/invites/:token — public; what the join page shows. */
export async function peekInvite(env: Env, token: string): Promise<Response> {
  const inv = await findInvite(env, token)
  const problem = inviteProblem(inv, null, Date.now())
  if (!inv || problem)
    return json({ ok: false, error: problem ?? 'invite_not_found', message: inviteMessage(problem ?? 'invite_not_found') })
  const city = await env.DB.prepare(
    'SELECT c.name, (SELECT COUNT(*) FROM city_members m WHERE m.city_id = c.id) AS members FROM cities c WHERE c.id = ?',
  )
    .bind(inv.city_id)
    .first<{ name: string; members: number }>()
  return json({
    ok: true,
    city: city?.name ?? 'a city',
    members: city?.members ?? 0,
    from: await inviterName(env, inv.city_id, inv.created_by),
    /* Whether it's locked to one address — never which one. */
    emailLocked: inv.email !== null,
  })
}

/** POST /api/invites/:token/accept — for someone already signed in. */
export async function acceptInvite(env: Env, req: Request, token: string): Promise<Response> {
  const user = await requireUser(env, req)
  const inv = await findInvite(env, token)
  const now = Date.now()
  const problem = inviteProblem(inv, user.email, now)
  if (problem) throw new HttpError(403, problem, inviteMessage(problem))
  await claimInvite(env, inv!, user.id, now)
  return json({ ok: true, cityId: inv!.city_id })
}
