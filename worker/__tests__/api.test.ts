/* End to end through the Worker's fetch handler: invites, sign-in links, the
   18+ gate, agent creation, cloud saves and the leaderboard, on a real
   SQLite database built from migrations/. */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fromWire, toWire } from '../../src/engine'
import { isClientAction, parseAction, parseBatch, hasNaN } from '../../src/engine/clientActions'
import type { Env } from '../env'
import worker from '../index'
import { issueLoginLink } from '../auth'
import { makeD1 } from './d1'
import { fakeCityNamespace } from './fakeCity'

const APP = 'https://empire.test'
const OWNER = 'adam@example.com'

let env: Env
let db: ReturnType<typeof makeD1>
let city: ReturnType<typeof fakeCityNamespace>

beforeEach(() => {
  db = makeD1()
  vi.spyOn(console, 'log').mockImplementation(() => {})
  env = {
    DB: db as unknown as D1Database,
    ASSETS: { fetch: async () => new Response('<html>spa</html>') } as unknown as Fetcher,
    APP_URL: APP,
    OWNER_EMAILS: OWNER + ', other-owner@example.com',
    ALLOW_MANUAL_TICK: '1',
    CITY: null as unknown as Env['CITY'],
  }
  city = fakeCityNamespace(() => env)
  env.CITY = city.namespace as unknown as Env['CITY']
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
    /** A new player takes an invite; anyone else opens a sign-in link (made
     *  here the way `npm run login-link` makes one). */
    async signIn(email: string, invite?: string) {
      if (invite) return call('POST', '/api/auth/join', { email, invite })
      const { link } = await issueLoginLink(env, email, 60 * 60_000)
      return call('POST', '/api/auth/verify', { token: new URL(link).searchParams.get('login') })
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
  })

  it('has no way to ask for a link by email', async () => {
    expect((await browser().post('/api/auth/request', { email: OWNER })).status).toBe(404)
  })

  it('burns a link on first use', async () => {
    const { link } = await issueLoginLink(env, OWNER, 60_000)
    const token = tokenOf(link, 'login')
    expect((await browser().post('/api/auth/verify', { token })).status).toBe(200)
    const again = await browser().post('/api/auth/verify', { token })
    expect(again.status).toBe(400)
    expect(again.data.error).toBe('link_expired')
  })

  it('refuses an expired link', async () => {
    const { link } = await issueLoginLink(env, OWNER, 60_000)
    db.raw.exec('UPDATE login_tokens SET expires_at = 0')
    const v = await browser().post('/api/auth/verify', { token: tokenOf(link, 'login') })
    expect(v.data.error).toBe('link_expired')
  })

  it('stores only token hashes', async () => {
    const { link } = await issueLoginLink(env, OWNER, 60_000)
    const row = db.raw.prepare('SELECT token_hash FROM login_tokens').get() as { token_hash: string }
    expect(row.token_hash).not.toBe(tokenOf(link, 'login'))
    expect(row.token_hash).toMatch(/^[0-9a-f]{64}$/)
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
    const r = await browser().signIn('two@example.com', token)
    expect(r.status).toBe(403)
    expect(r.data.error).toBe('invite_used')
  })

  it('an email-locked invite is for that address only', async () => {
    const { owner, cityId } = await ownerWithCity()
    const inv = await owner.post(`/api/cities/${cityId}/invites`, { email: 'Dave@Example.com' })
    expect(inv.data.email).toBe('dave@example.com')
    const token = tokenOf(inv.data.link, 'invite')
    const wrong = await browser().signIn('eve@example.com', token)
    expect(wrong.data.error).toBe('invite_wrong_email')
    const right = await browser().signIn('  DAVE@example.com ', token)
    expect(right.status).toBe(200)
  })

  it('joining needs an invite and a real address', async () => {
    expect((await browser().post('/api/auth/join', { email: 'x@example.com' })).data.error).toBe('invite_required')
    const { owner, cityId } = await ownerWithCity()
    const inv = await owner.post(`/api/cities/${cityId}/invites`, {})
    expect((await browser().signIn('not an email', tokenOf(inv.data.link, 'invite'))).status).toBe(400)
  })

  it('an invite cannot open an existing account or an owner account', async () => {
    const { owner, cityId } = await ownerWithCity()
    await friendInCity(owner, cityId, 'dave@example.com')
    for (const email of ['dave@example.com', OWNER, 'other-owner@example.com']) {
      const inv = await owner.post(`/api/cities/${cityId}/invites`, {})
      const r = await browser().signIn(email, tokenOf(inv.data.link, 'invite'))
      expect(r.status).toBe(409)
      expect(r.data.error).toBe('has_account')
      expect(r.setCookie).toBeNull()
    }
  })

  it('the city owner can make a signed-out player a sign-in link', async () => {
    const { owner, cityId } = await ownerWithCity()
    const friend = await friendInCity(owner, cityId, 'dave@example.com')
    await friend.post('/api/auth/logout')
    const list = await owner.get(`/api/cities/${cityId}/invites`)
    const row = list.data.invites[0]
    expect(row).toMatchObject({ status: 'used', usedBy: 'dave@example.com' })
    const r = await owner.post(`/api/cities/${cityId}/members/${row.memberId}/login-link`)
    expect(r.status).toBe(201)
    expect(r.data.expiresAt - Date.now()).toBeGreaterThan(23 * 60 * 60_000)
    const back = browser()
    expect((await back.post('/api/auth/verify', { token: tokenOf(r.data.link, 'login') })).status).toBe(200)
    expect((await back.get('/api/me')).data.user.email).toBe('dave@example.com')
  })

  it('sign-in links are for players in your own city only', async () => {
    const { owner, cityId } = await ownerWithCity()
    const friend = await friendInCity(owner, cityId, 'dave@example.com')
    const daveId = (await friend.get('/api/me')).data.user.id
    const ownerId = (await owner.get('/api/me')).data.user.id
    /* Not for the owner, not by a player, not from another city. */
    expect((await owner.post(`/api/cities/${cityId}/members/${ownerId}/login-link`)).status).toBe(403)
    expect((await friend.post(`/api/cities/${cityId}/members/${daveId}/login-link`)).status).toBe(403)
    const other = browser()
    await other.signIn('other-owner@example.com')
    const c2 = await other.post('/api/cities', { name: 'Paris, Ontario' })
    expect((await other.post(`/api/cities/${c2.data.id}/members/${daveId}/login-link`)).status).toBe(404)
    /* Another city's owner who plays here is off limits too. */
    const inv = await owner.post(`/api/cities/${cityId}/invites`, {})
    await other.post(`/api/invites/${tokenOf(inv.data.link, 'invite')}/accept`)
    const otherId = (await other.get('/api/me')).data.user.id
    expect((await owner.post(`/api/cities/${cityId}/members/${otherId}/login-link`)).data.error).toBe('not_for_owners')
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
    const v = await browser('7.7.7.7').signIn('late@example.com', tokenOf(inv.data.link, 'invite'))
    expect(v.status).toBe(409)
    expect(v.data.error).toBe('city_full')
    /* No half-made account: they can take an invite to a roomier city. */
    expect(db.raw.prepare("SELECT 1 FROM users WHERE email = 'late@example.com'").get()).toBeUndefined()
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
    /* Go broke, the hard way: straight into the city's storage. */
    const { mem } = city.rooms.get(cityId)!
    for (const [k, v] of mem.data)
      if (k.startsWith('p:')) {
        const p = v as { game: string }
        mem.data.set(k, { ...p, game: toWire({ ...fromWire(p.game)!, gameOver: true }) })
      }
    const r = await owner.post(`/api/cities/${cityId}/agent`, body)
    expect(r.status).toBe(201)
    expect(r.data.version).toBe(2)
    expect(fromWire(r.data.state)!.characterId).toBe('chip')
    expect(fromWire(r.data.state)!.gameOver).toBe(false)
  })

  it('outsiders cannot see a city', async () => {
    const { cityId } = await ownerWithCity()
    const other = browser()
    await other.signIn('other-owner@example.com')
    expect((await other.get(`/api/cities/${cityId}/game`)).status).toBe(404)
    expect((await other.get(`/api/cities/${cityId}/leaderboard`)).status).toBe(404)
  })
})

describe('the shared city', () => {
  const act = (b: ReturnType<typeof browser>, cityId: string, baseVersion: number, actions: unknown[]) =>
    b.post(`/api/cities/${cityId}/act`, { baseVersion, actions })

  async function twoPlayers() {
    const { owner, cityId } = await ownerWithCity()
    await readyAgent(owner, cityId, 'gold')
    const friend = await friendInCity(owner, cityId, 'f@example.com')
    await readyAgent(friend, cityId, 'teal')
    return { owner, friend, cityId }
  }

  it('starts in the lobby until the owner opens the season', async () => {
    const { owner, friend, cityId } = await twoPlayers()
    const v = await owner.get(`/api/cities/${cityId}/city`)
    expect(v.data.status).toBe('lobby')
    expect(v.data.players).toHaveLength(2)
    expect((await friend.post(`/api/cities/${cityId}/season/start`)).status).toBe(403)
    const s = await owner.post(`/api/cities/${cityId}/season/start`)
    expect(s.status).toBe(200)
    expect(s.data.status).toBe('running')
    expect(s.data.listings.length).toBeGreaterThan(0)
    expect(s.data.nextTickAt).toBeGreaterThan(city.clock.now)
    /* Three in the morning, Toronto time. */
    const local = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Toronto', hour: 'numeric', hourCycle: 'h23' }).format(new Date(s.data.nextTickAt))
    expect(Number(local)).toBe(3)
  })

  it('plays moves on the server and never hands out the dice', async () => {
    const { owner, cityId } = await twoPlayers()
    await owner.post(`/api/cities/${cityId}/season/start`)
    const g = await owner.get(`/api/cities/${cityId}/game`)
    expect(fromWire(g.data.state)!.rngSeed).toBe(0)
    expect(fromWire(g.data.state)!.cityMode).toBe(true)
    const r = await act(owner, cityId, g.data.version, [{ type: 'ASSIST_SHOWING' }, { type: 'ASSIST_SHOWING' }])
    expect(r.status).toBe(200)
    expect(r.data.version).toBe(g.data.version + 1)
    const s = fromWire(r.data.state)!
    expect(s.ap).toBe(fromWire(g.data.state)!.ap - 2)
    expect(s.rngSeed).toBe(0)
    /* The city's listings are the player's market. */
    expect(s.marketPool.length).toBe(r.data.city.listings.length)
  })

  it('refuses End Week, instant buys, cheats and junk', async () => {
    const { owner, cityId } = await twoPlayers()
    await owner.post(`/api/cities/${cityId}/season/start`)
    const g = await owner.get(`/api/cities/${cityId}/game`)
    for (const action of [
      { type: 'END_WEEK' },
      { type: 'BUY_PROPERTY', listingId: 'CL1', downPct: 1 },
      { type: 'DEBUG_CASH' },
      { type: 'IMPORT_SAVE', state: {} },
      { type: 'CITY_PURCHASE', listing: {}, price: 1, downPct: 1 },
      { type: 'MAKE_IT_RAIN' },
    ]) {
      const r = await act(owner, cityId, g.data.version, [action])
      expect(r.status, action.type).toBe(400)
    }
    expect((await owner.get(`/api/cities/${cityId}/game`)).data.version).toBe(g.data.version)
  })

  it('says so when the game moved on (another tab, or the tick)', async () => {
    const { owner, cityId } = await twoPlayers()
    await owner.post(`/api/cities/${cityId}/season/start`)
    const g = await owner.get(`/api/cities/${cityId}/game`)
    await act(owner, cityId, g.data.version, [{ type: 'ASSIST_SHOWING' }])
    const r = await act(owner, cityId, g.data.version, [{ type: 'ASSIST_SHOWING' }])
    expect(r.status).toBe(409)
    expect(r.data.version).toBe(g.data.version + 1)
  })

  it('takes sealed offers, hides the amounts, and settles them at the tick', async () => {
    const { owner, friend, cityId } = await twoPlayers()
    await owner.post(`/api/cities/${cityId}/season/start`)
    const view = (await owner.get(`/api/cities/${cityId}/city`)).data
    const target = view.listings.find((l: { typeId: string }) => l.typeId === 'starter') ?? view.listings[0]
    /* Nobody can buy as a receptionist. */
    const early = await owner.post(`/api/cities/${cityId}/bids`, { listingId: target.id, amount: target.askPrice, downPct: 1 })
    expect(early.status).toBe(400)
    expect(early.data.error).toBe('rank_locked')
    /* Promote both players the hard way, in storage. */
    const { mem } = city.rooms.get(cityId)!
    for (const [k, v] of mem.data)
      if (k.startsWith('p:')) {
        const p = v as { game: string }
        mem.data.set(k, { ...p, game: toWire({ ...fromWire(p.game)!, rank: 'topProducer', cash: 3_000_000 }) })
      }
    const a = await owner.post(`/api/cities/${cityId}/bids`, { listingId: target.id, amount: target.askPrice, downPct: 1 })
    expect(a.status).toBe(200)
    const b = await friend.post(`/api/cities/${cityId}/bids`, { listingId: target.id, amount: target.askPrice + 10_000, downPct: 1 })
    expect(b.status).toBe(200)
    const seen = b.data.listings.find((l: { id: string }) => l.id === target.id)
    expect(seen.bids).toBe(2)
    expect(seen.myBid.amount).toBe(target.askPrice + 10_000)
    expect(JSON.stringify(b.data)).not.toContain(String(target.askPrice) + ',"downPct"')

    expect((await friend.post(`/api/cities/${cityId}/tick`)).status).toBe(403)
    const t = await owner.post(`/api/cities/${cityId}/tick`)
    expect(t.status).toBe(200)
    expect(t.data.city.week).toBe(2)
    expect(t.data.report.week).toBe(1)
    expect(t.data.report.offers.join(' ')).toMatch(/beat you/)
    const fg = await friend.get(`/api/cities/${cityId}/game`)
    expect(fromWire(fg.data.state)!.properties.some((p) => p.fromListingId === target.id)).toBe(true)
    expect(fg.data.city.feed.some((f: { kind: string }) => f.kind === 'outbid')).toBe(true)
    /* The tick mirrors standings into D1. */
    const row = db.raw.prepare('SELECT week FROM saves WHERE city_id = ? LIMIT 1').get(cityId) as { week: number }
    expect(row.week).toBe(2)
  })

  it('withdraws an offer', async () => {
    const { owner, cityId } = await twoPlayers()
    await owner.post(`/api/cities/${cityId}/season/start`)
    const { mem } = city.rooms.get(cityId)!
    for (const [k, v] of mem.data)
      if (k.startsWith('p:')) {
        const p = v as { game: string }
        mem.data.set(k, { ...p, game: toWire({ ...fromWire(p.game)!, rank: 'topProducer', cash: 3_000_000 }) })
      }
    const l = (await owner.get(`/api/cities/${cityId}/city`)).data.listings[0]
    await owner.post(`/api/cities/${cityId}/bids`, { listingId: l.id, amount: l.askPrice, downPct: 1 })
    const r = await owner.del(`/api/cities/${cityId}/bids/${l.id}`)
    expect(r.data.listings.find((x: { id: string }) => x.id === l.id).myBid).toBeNull()
  })

  it('runs the tick on its alarm, every night, through to the Hall of Fame', async () => {
    const { owner, cityId } = await twoPlayers()
    await owner.post(`/api/cities/${cityId}/season/start`)
    const nights = await city.fireAlarms(52)
    expect(nights).toBe(52)
    const v = (await owner.get(`/api/cities/${cityId}/city`)).data
    expect(v.status).toBe('finished')
    expect(v.lastSeason.standings).toHaveLength(2)
    const hof = await owner.get(`/api/cities/${cityId}/seasons`)
    expect(hof.data.seasons).toHaveLength(1)
    expect(hof.data.seasons[0].champion.name).toBe(v.lastSeason.standings[0].name)
    /* Awards night is on the record too. */
    expect(hof.data.seasons[0].champion.title).toBe(v.lastSeason.title)
    expect(hof.data.seasons[0].awards[0]).toMatchObject({ id: 'champion', name: v.lastSeason.standings[0].name })
    expect(v.champion).toMatchObject({ name: v.lastSeason.standings[0].name, season: 1 })
    /* The next night opens season 2. */
    await city.fireAlarms(1)
    const v2 = (await owner.get(`/api/cities/${cityId}/city`)).data
    expect(v2.season).toBe(2)
    expect(v2.week).toBe(1)
    expect((await owner.get('/api/me')).data.cities[0].season).toBe(2)
  })

  it('lets the owner move the tick', async () => {
    const { owner, cityId } = await twoPlayers()
    await owner.post(`/api/cities/${cityId}/season/start`)
    expect((await owner.post(`/api/cities/${cityId}/schedule`, { hour: 25 })).status).toBe(400)
    expect((await owner.post(`/api/cities/${cityId}/schedule`, { hour: 6, zone: 'Mars/Olympus' })).status).toBe(400)
    const r = await owner.post(`/api/cities/${cityId}/schedule`, { hour: 6, zone: 'America/Vancouver' })
    expect(r.data.tickHour).toBe(6)
    const local = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Vancouver', hour: 'numeric', hourCycle: 'h23' }).format(new Date(r.data.nextTickAt))
    expect(Number(local)).toBe(6)
  })

  it('counts a phone check-in as showing up', async () => {
    const { owner, friend, cityId } = await twoPlayers()
    await owner.post(`/api/cities/${cityId}/season/start`)
    await city.fireAlarms(3)
    const before = (await friend.get(`/api/cities/${cityId}/city`)).data
    expect(before.players.find((p: { you: boolean }) => p.you).missed).toBe(3)
    const r = await friend.post(`/api/cities/${cityId}/checkin`)
    expect(r.status).toBe(200)
    expect(r.data.players.find((p: { you: boolean }) => p.you).missed).toBe(0)
    expect((await browser('9.9.9.9').post(`/api/cities/${cityId}/checkin`)).status).toBe(401)
  })

  it('only upgrades the live room for a member, from this site', async () => {
    const { owner, cityId } = await twoPlayers()
    expect((await owner.get(`/api/cities/${cityId}/live`)).status).toBe(426)
    const evil = await owner.call('GET', `/api/cities/${cityId}/live`, undefined, { upgrade: 'websocket', origin: 'https://evil.test' })
    expect(evil.status).toBe(403)
    const stranger = await browser('7.7.7.7').call('GET', `/api/cities/${cityId}/live`, undefined, { upgrade: 'websocket' })
    expect(stranger.status).toBe(401)
  })

  it('refuses the manual tick in production', async () => {
    const { owner, cityId } = await twoPlayers()
    env.ALLOW_MANUAL_TICK = undefined
    await owner.post(`/api/cities/${cityId}/season/start`)
    expect((await owner.post(`/api/cities/${cityId}/tick`)).status).toBe(403)
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
    expect((await browser().get('/api/auth/join')).status).toBe(405)
  })
  it('wants JSON', async () => {
    const r = await browser().call('POST', '/api/auth/join', undefined, { 'content-type': 'text/plain' })
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
