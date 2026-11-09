/* End to end through the Worker's fetch handler: sign-in links, invites, the
   18+ gate, agent creation, cloud saves and the leaderboard, on a real
   SQLite database built from migrations/. */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { applyActions, fromWire, stateDigest, type Action } from '../../src/engine'
import { isClientAction, parseAction, parseBatch, hasNaN } from '../../src/engine/clientActions'
import type { Env } from '../env'
import worker from '../index'
import { outbox } from '../mail'
import { makeD1 } from './d1'

const APP = 'https://empire.test'
const OWNER = 'adam@example.com'

let env: Env
let db: ReturnType<typeof makeD1>

beforeEach(() => {
  db = makeD1()
  outbox.length = 0
  vi.spyOn(console, 'log').mockImplementation(() => {})
  env = {
    DB: db as unknown as D1Database,
    ASSETS: { fetch: async () => new Response('<html>spa</html>') } as unknown as Fetcher,
    APP_URL: APP,
    OWNER_EMAILS: OWNER + ', other-owner@example.com',
    MAIL_PROVIDER: 'log',
    MAIL_FROM: 'test@example.com',
    DEV_EXPOSE_LINKS: '1',
  }
})

/** One browser: remembers its session cookie like a real one would. */
function browser(ip = '1.2.3.4') {
  let session = ''
  const call = async (method: string, path: string, body?: unknown, headers: Record<string, string> = {}) => {
    const res = await worker.fetch(
      new Request(APP + path, {
        method,
        headers: {
          ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
          ...(session ? { cookie: 'res_session=' + session } : {}),
          origin: APP,
          'cf-connecting-ip': ip,
          ...headers,
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
      }),
      env,
    )
    const set = res.headers.get('set-cookie')
    if (set?.startsWith('res_session=')) session = decodeURIComponent(set.split(';')[0].slice('res_session='.length))
    const text = await res.text()
    let data: any = text
    try {
      data = JSON.parse(text)
    } catch {
      /* not JSON */
    }
    return { status: res.status, data, setCookie: set }
  }
  return {
    call,
    get: (p: string) => call('GET', p),
    post: (p: string, b: unknown = {}) => call('POST', p, b),
    del: (p: string) => call('DELETE', p),
    /** Request a link and click it. */
    async signIn(email: string, invite?: string) {
      const r = await call('POST', '/api/auth/request', { email, invite })
      expect(r.status).toBe(200)
      expect(r.data.devLink).toBeTruthy()
      const token = new URL(r.data.devLink).searchParams.get('login')!
      return call('POST', '/api/auth/verify', { token })
    },
  }
}

const tokenOf = (link: string, key: string) => new URL(link).searchParams.get(key)!

async function ownerWithCity() {
  const owner = browser()
  await owner.signIn(OWNER)
  const city = await owner.post('/api/cities', { name: 'Brantford' })
  expect(city.status).toBe(201)
  return { owner, cityId: city.data.id as string }
}

async function friendInCity(owner: ReturnType<typeof browser>, cityId: string, email: string) {
  const inv = await owner.post(`/api/cities/${cityId}/invites`, {})
  const friend = browser('5.6.7.8')
  const v = await friend.signIn(email, tokenOf(inv.data.link, 'invite'))
  expect(v.status).toBe(200)
  return friend
}

async function readyAgent(b: ReturnType<typeof browser>, cityId: string, color = 'gold', characterId = 'you') {
  await b.post('/api/me/adult', { confirm: true })
  const r = await b.post(`/api/cities/${cityId}/agent`, { name: 'Dave Deals', color, characterId })
  expect(r.status).toBe(201)
  return r.data as { version: number; state: string }
}

describe('sign-in links', () => {
  it('signs an owner in and keeps them signed in', async () => {
    const b = browser()
    const v = await b.signIn(OWNER)
    expect(v.setCookie).toMatch(/HttpOnly/)
    expect(v.setCookie).toMatch(/SameSite=Lax/)
    expect(v.setCookie).toMatch(/Secure/)
    const me = await b.get('/api/me')
    expect(me.status).toBe(200)
    expect(me.data.user).toMatchObject({ email: OWNER, isOwner: true, adult: false })
    expect(me.data.cities).toEqual([])
    expect(outbox).toHaveLength(1)
    expect(outbox[0].text).toContain(APP + '/?login=')
  })

  it('normalizes the address', async () => {
    const b = browser()
    const r = await b.post('/api/auth/request', { email: '  ADAM@Example.com ' })
    expect(r.data.devLink).toBeTruthy()
  })

  it('sends nothing to a stranger, but answers the same', async () => {
    const r = await browser().post('/api/auth/request', { email: 'nobody@example.com' })
    expect(r.status).toBe(200)
    expect(r.data).toEqual({ ok: true })
    expect(outbox).toHaveLength(0)
  })

  it('rejects junk email', async () => {
    const r = await browser().post('/api/auth/request', { email: 'not an email' })
    expect(r.status).toBe(400)
  })

  it('burns a link on first use', async () => {
    const b = browser()
    const r = await b.post('/api/auth/request', { email: OWNER })
    const token = tokenOf(r.data.devLink, 'login')
    expect((await b.post('/api/auth/verify', { token })).status).toBe(200)
    const again = await browser().post('/api/auth/verify', { token })
    expect(again.status).toBe(400)
    expect(again.data.error).toBe('link_expired')
  })

  it('refuses an expired link', async () => {
    const b = browser()
    const r = await b.post('/api/auth/request', { email: OWNER })
    db.raw.exec('UPDATE login_tokens SET expires_at = 0')
    const v = await b.post('/api/auth/verify', { token: tokenOf(r.data.devLink, 'login') })
    expect(v.data.error).toBe('link_expired')
  })

  it('stores only token hashes', async () => {
    const b = browser()
    const r = await b.post('/api/auth/request', { email: OWNER })
    const token = tokenOf(r.data.devLink, 'login')
    const row = db.raw.prepare('SELECT token_hash FROM login_tokens').get() as { token_hash: string }
    expect(row.token_hash).not.toBe(token)
    expect(row.token_hash).toMatch(/^[0-9a-f]{64}$/)
  })

  it('rate-limits links per address', async () => {
    const b = browser()
    for (let i = 0; i < 5; i++) expect((await b.post('/api/auth/request', { email: OWNER })).status).toBe(200)
    expect((await b.post('/api/auth/request', { email: OWNER })).status).toBe(429)
  })

  it('signs out', async () => {
    const b = browser()
    await b.signIn(OWNER)
    await b.post('/api/auth/logout')
    expect((await b.get('/api/me')).status).toBe(401)
  })

  it('refuses a session that has expired', async () => {
    const b = browser()
    await b.signIn(OWNER)
    db.raw.exec('UPDATE sessions SET expires_at = 0')
    expect((await b.get('/api/me')).status).toBe(401)
  })

  it('refuses state-changing calls from another site', async () => {
    const b = browser()
    await b.signIn(OWNER)
    const r = await b.call('POST', '/api/cities', { name: 'Evil' }, { origin: 'https://evil.test' })
    expect(r.status).toBe(403)
  })
})

describe('cities and invites', () => {
  it('only an owner can found a city', async () => {
    const { owner, cityId } = await ownerWithCity()
    const friend = await friendInCity(owner, cityId, 'friend@example.com')
    expect((await friend.post('/api/cities', { name: 'Mine' })).status).toBe(403)
  })

  it('an invite brings a friend into the city', async () => {
    const { owner, cityId } = await ownerWithCity()
    const inv = await owner.post(`/api/cities/${cityId}/invites`, { note: 'for Dave' })
    const token = tokenOf(inv.data.link, 'invite')

    const peek = await browser().get('/api/invites/' + token)
    expect(peek.data).toMatchObject({ ok: true, city: 'Brantford', members: 1, from: 'adam', emailLocked: false })

    const friend = browser('9.9.9.9')
    await friend.signIn('dave@example.com', token)
    const me = await friend.get('/api/me')
    expect(me.data.user.isOwner).toBe(false)
    expect(me.data.cities).toEqual([
      { id: cityId, name: 'Brantford', season: 1, role: 'player', agent: null },
    ])

    const list = await owner.get(`/api/cities/${cityId}/invites`)
    expect(list.data.invites[0]).toMatchObject({ status: 'used', usedBy: 'dave@example.com', note: 'for Dave' })
  })

  it('an invite works once', async () => {
    const { owner, cityId } = await ownerWithCity()
    const inv = await owner.post(`/api/cities/${cityId}/invites`, {})
    const token = tokenOf(inv.data.link, 'invite')
    await browser().signIn('one@example.com', token)
    const r = await browser().post('/api/auth/request', { email: 'two@example.com', invite: token })
    expect(r.status).toBe(403)
    expect(r.data.error).toBe('invite_used')
  })

  it('an email-locked invite is for that address only, and is emailed', async () => {
    const { owner, cityId } = await ownerWithCity()
    const inv = await owner.post(`/api/cities/${cityId}/invites`, { email: 'Dave@Example.com' })
    expect(inv.data.emailed).toBe(true)
    expect(outbox.at(-1)!.to).toBe('dave@example.com')
    expect(outbox.at(-1)!.subject).toContain('Brantford')
    const token = tokenOf(inv.data.link, 'invite')
    const wrong = await browser().post('/api/auth/request', { email: 'eve@example.com', invite: token })
    expect(wrong.data.error).toBe('invite_wrong_email')
    const right = await browser().signIn('dave@example.com', token)
    expect(right.status).toBe(200)
  })

  it('a revoked invite is dead', async () => {
    const { owner, cityId } = await ownerWithCity()
    const inv = await owner.post(`/api/cities/${cityId}/invites`, {})
    await owner.del(`/api/cities/${cityId}/invites/${inv.data.id}`)
    const peek = await browser().get('/api/invites/' + tokenOf(inv.data.link, 'invite'))
    expect(peek.data).toMatchObject({ ok: false, error: 'invite_revoked' })
  })

  it('a signed-in player can accept another invite', async () => {
    const { owner, cityId } = await ownerWithCity()
    const friend = await friendInCity(owner, cityId, 'f@example.com')
    const other = browser()
    await other.signIn('other-owner@example.com')
    const c2 = await other.post('/api/cities', { name: 'Paris, Ontario' })
    const inv = await other.post(`/api/cities/${c2.data.id}/invites`, {})
    const r = await friend.post(`/api/invites/${tokenOf(inv.data.link, 'invite')}/accept`)
    expect(r.data).toEqual({ ok: true, cityId: c2.data.id })
    expect((await friend.get('/api/me')).data.cities).toHaveLength(2)
  })

  it('caps a city at ten agents', async () => {
    const { owner, cityId } = await ownerWithCity()
    for (let i = 0; i < 9; i++) await friendInCity(owner, cityId, `p${i}@example.com`)
    const inv = await owner.post(`/api/cities/${cityId}/invites`, {})
    const late = browser('7.7.7.7')
    const v = await late.signIn('late@example.com', tokenOf(inv.data.link, 'invite'))
    expect(v.data.inviteError).toBe('city_full')
    const list = await owner.get(`/api/cities/${cityId}/invites`)
    expect(list.data.invites[0].status).toBe('open')
  })

  it('only the city owner manages invites', async () => {
    const { owner, cityId } = await ownerWithCity()
    const friend = await friendInCity(owner, cityId, 'f@example.com')
    expect((await friend.post(`/api/cities/${cityId}/invites`, {})).status).toBe(403)
    expect((await friend.get(`/api/cities/${cityId}/invites`)).status).toBe(403)
  })
})

describe('agents', () => {
  it('needs the 18+ confirmation first', async () => {
    const { owner, cityId } = await ownerWithCity()
    const r = await owner.post(`/api/cities/${cityId}/agent`, { name: 'Adam', color: 'gold', characterId: 'you' })
    expect(r.status).toBe(403)
    expect(r.data.error).toBe('adult_required')
    await owner.post('/api/me/adult', { confirm: true })
    expect((await owner.get('/api/me')).data.user.adult).toBe(true)
  })

  it('creates a fresh, server-seeded game', async () => {
    const { owner, cityId } = await ownerWithCity()
    const g = await readyAgent(owner, cityId, 'gold', 'svetlana')
    expect(g.version).toBe(1)
    const s = fromWire(g.state)!
    expect(s.characterId).toBe('svetlana')
    expect(s.week).toBe(1)
    const me = await owner.get('/api/me')
    expect(me.data.cities[0].agent).toEqual({ name: 'Dave Deals', color: 'gold', characterId: 'svetlana' })
  })

  it('validates name, colour and character', async () => {
    const { owner, cityId } = await ownerWithCity()
    await owner.post('/api/me/adult', { confirm: true })
    const bad = (b: object) => owner.post(`/api/cities/${cityId}/agent`, { name: 'Ok', color: 'gold', characterId: 'you', ...b })
    expect((await bad({ name: 'x' })).data.error).toBe('bad_name')
    expect((await bad({ color: 'beige' })).data.error).toBe('bad_color')
    expect((await bad({ characterId: 'gordon' })).data.error).toBe('bad_character')
  })

  it('one colour per city, one agent per player', async () => {
    const { owner, cityId } = await ownerWithCity()
    await readyAgent(owner, cityId, 'gold')
    const friend = await friendInCity(owner, cityId, 'f@example.com')
    await friend.post('/api/me/adult', { confirm: true })
    const r = await friend.post(`/api/cities/${cityId}/agent`, { name: 'Copycat', color: 'gold', characterId: 'you' })
    expect(r.data.error).toBe('color_taken')
    const again = await owner.post(`/api/cities/${cityId}/agent`, { name: 'Again', color: 'teal', characterId: 'you' })
    expect(again.data.error).toBe('agent_exists')
  })

  it('restarting is only for a game that has ended', async () => {
    const { owner, cityId } = await ownerWithCity()
    await readyAgent(owner, cityId)
    const body = { name: 'Phoenix', color: 'gold', characterId: 'chip', restart: true }
    expect((await owner.post(`/api/cities/${cityId}/agent`, body)).data.error).toBe('game_running')
    db.raw.exec('UPDATE saves SET game_over = 1')
    const r = await owner.post(`/api/cities/${cityId}/agent`, body)
    expect(r.status).toBe(201)
    expect(r.data.version).toBe(2)
    expect(fromWire(r.data.state)!.characterId).toBe('chip')
  })

  it('outsiders cannot see a city', async () => {
    const { cityId } = await ownerWithCity()
    const other = browser()
    await other.signIn('other-owner@example.com')
    expect((await other.get(`/api/cities/${cityId}/game`)).status).toBe(404)
    expect((await other.get(`/api/cities/${cityId}/leaderboard`)).status).toBe(404)
  })
})

describe('cloud saves', () => {
  const week: Action[] = [
    { type: 'WORK_PHONES' },
    { type: 'WORK_PHONES' },
    { type: 'SIDE_HUSTLE' },
    { type: 'END_WEEK' },
  ]

  it('replays the browser’s moves and agrees with it', async () => {
    const { owner, cityId } = await ownerWithCity()
    const g = await readyAgent(owner, cityId)
    const local = applyActions(fromWire(g.state)!, week)
    const r = await owner.post(`/api/cities/${cityId}/game/actions`, {
      baseVersion: 1,
      actions: week,
      digest: await stateDigest(local),
    })
    expect(r.status).toBe(200)
    expect(r.data.version).toBe(2)
    expect(r.data.state).toBeUndefined()
    expect(r.data.digest).toBe(await stateDigest(local))

    const saved = await owner.get(`/api/cities/${cityId}/game`)
    expect(saved.data.version).toBe(2)
    expect(fromWire(saved.data.state)!.week).toBe(2)
  })

  it('a browser that got it wrong gets the server’s game', async () => {
    const { owner, cityId } = await ownerWithCity()
    await readyAgent(owner, cityId)
    const r = await owner.post(`/api/cities/${cityId}/game/actions`, { baseVersion: 1, actions: week, digest: 'nope' })
    expect(r.status).toBe(200)
    expect(fromWire(r.data.state)!.week).toBe(2)
  })

  it('a stale browser is told so, with the current game', async () => {
    const { owner, cityId } = await ownerWithCity()
    await readyAgent(owner, cityId)
    await owner.post(`/api/cities/${cityId}/game/actions`, { baseVersion: 1, actions: week })
    const r = await owner.post(`/api/cities/${cityId}/game/actions`, { baseVersion: 1, actions: week })
    expect(r.status).toBe(409)
    expect(r.data.version).toBe(2)
    expect(fromWire(r.data.state)!.week).toBe(2)
  })

  it('refuses debug moves, imports and bad payloads, and saves nothing', async () => {
    const { owner, cityId } = await ownerWithCity()
    const g = await readyAgent(owner, cityId)
    const cheat = fromWire(g.state)!
    for (const action of [
      { type: 'DEBUG_CASH' },
      { type: 'DEBUG_SKIP_WEEKS', weeks: 10 },
      { type: 'IMPORT_SAVE', state: { ...cheat, cash: 1e9 } },
      { type: 'NEW_GAME', characterId: 'you' },
      { type: 'BUY_PROPERTY', listingId: 'x', downPct: 'all of it' },
      { type: 'SET_RENT', propertyId: 'p', unitId: 'u', r: null },
      { type: 'MAKE_IT_RAIN' },
    ]) {
      const r = await owner.post(`/api/cities/${cityId}/game/actions`, { baseVersion: 1, actions: [action] })
      expect(r.status, action.type).toBe(400)
    }
    expect((await owner.get(`/api/cities/${cityId}/game`)).data.version).toBe(1)
  })

  it('an empty batch is a cheap check-in', async () => {
    const { owner, cityId } = await ownerWithCity()
    const g = await readyAgent(owner, cityId)
    const r = await owner.post(`/api/cities/${cityId}/game/actions`, { baseVersion: 1, actions: [] })
    expect(r.data.version).toBe(1)
    expect(r.data.digest).toBe(await stateDigest(fromWire(g.state)!))
  })
})

describe('leaderboard', () => {
  it('ranks the city by net worth', async () => {
    const { owner, cityId } = await ownerWithCity()
    await readyAgent(owner, cityId, 'gold', 'you')
    const friend = await friendInCity(owner, cityId, 'f@example.com')
    await friend.post('/api/me/adult', { confirm: true })
    await friend.post(`/api/cities/${cityId}/agent`, { name: 'Svet', color: 'teal', characterId: 'svetlana' })
    const board = await friend.get(`/api/cities/${cityId}/leaderboard`)
    expect(board.data.city).toBe('Brantford')
    expect(board.data.rows).toHaveLength(2)
    const worths = board.data.rows.map((r: { netWorth: number }) => r.netWorth)
    expect(worths).toEqual([...worths].sort((a, b) => b - a))
    expect(board.data.rows.filter((r: { you: boolean }) => r.you)).toHaveLength(1)
    expect(board.data.rows.find((r: { you: boolean }) => r.you).name).toBe('Svet')
  })
})

describe('routing', () => {
  it('serves the game for anything that is not /api', async () => {
    const r = await browser().get('/some/page')
    expect(r.data).toContain('spa')
  })
  it('404s unknown API paths and 405s wrong methods', async () => {
    expect((await browser().get('/api/nope')).status).toBe(404)
    expect((await browser().get('/api/auth/request')).status).toBe(405)
  })
  it('wants JSON', async () => {
    const r = await browser().call('POST', '/api/auth/request', undefined, { 'content-type': 'text/plain' })
    expect(r.status).toBe(415)
  })
})

describe('action gate', () => {
  it('allows play and refuses tools', () => {
    expect(isClientAction('END_WEEK')).toBe(true)
    expect(isClientAction('DEBUG_CASH')).toBe(false)
    expect(isClientAction('IMPORT_SAVE')).toBe(false)
    expect(isClientAction('toString')).toBe(false)
  })
  it('drops fields the spec does not name', () => {
    const p = parseAction({ type: 'RUN_SHOWING', leadId: 'L1', cash: 1e9 })
    expect(p).toEqual({ ok: true, action: { type: 'RUN_SHOWING', leadId: 'L1' } })
  })
  it('accepts a null district for SET_CHANNEL_TARGET', () => {
    expect(parseAction({ type: 'SET_CHANNEL_TARGET', channelId: 'bench', districtId: null }).ok).toBe(true)
  })
  it('caps batch size and string length', () => {
    expect(parseBatch(Array(201).fill({ type: 'WORK_PHONES' })).ok).toBe(false)
    expect(parseAction({ type: 'RUN_SHOWING', leadId: 'x'.repeat(81) }).ok).toBe(false)
  })
  it('spots NaN anywhere', () => {
    expect(hasNaN({ a: [1, { b: NaN }] })).toBe(true)
    expect(hasNaN({ a: [1, { b: Infinity }] })).toBe(false)
  })
})
