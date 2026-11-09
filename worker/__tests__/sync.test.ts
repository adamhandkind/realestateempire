/* The browser's CloudStore talking to the real Worker (in-process, on the
   SQLite stand-in): moves made in the browser end up in the server's copy,
   and every way the two can fall out of step is caught and healed. */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fromWire, stateDigest, toWire, type Action } from '../../src/engine'
import { CloudStore, type SyncTransport } from '../../src/net/cloudStore'
import type { Env } from '../env'
import worker from '../index'
import { makeD1 } from './d1'

const APP = 'https://empire.test'
let env: Env
let db: ReturnType<typeof makeD1>
let cookie = ''
let cityId = ''

async function call(method: string, path: string, body?: unknown) {
  const res = await worker.fetch(
    new Request(APP + path, {
      method,
      headers: { 'content-type': 'application/json', origin: APP, ...(cookie ? { cookie } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
    env,
  )
  const set = res.headers.get('set-cookie')
  if (set?.startsWith('res_session=')) cookie = set.split(';')[0]
  return { status: res.status, data: (await res.json()) as Record<string, unknown> }
}

const transport = (fail = { on: false }): SyncTransport => ({
  async postActions(body) {
    if (fail.on) throw new TypeError('Failed to fetch')
    return call('POST', `/api/cities/${cityId}/game/actions`, body)
  },
  async getGame() {
    return (await call('GET', `/api/cities/${cityId}/game`)).data as { version: number; state: string }
  },
})

const serverGame = async () => {
  const g = (await call('GET', `/api/cities/${cityId}/game`)).data as { version: number; state: string }
  return { version: g.version, state: fromWire(g.state)! }
}

const play: Action[] = [
  { type: 'WORK_PHONES' },
  { type: 'WORK_PHONES' },
  { type: 'ASSIST_SHOWING' },
  { type: 'END_WEEK' },
  { type: 'SKIP_POST' },
  { type: 'WORK_PHONES' },
]

beforeEach(async () => {
  vi.spyOn(console, 'log').mockImplementation(() => {})
  db = makeD1()
  cookie = ''
  env = {
    DB: db as unknown as D1Database,
    ASSETS: { fetch: async () => new Response('') } as unknown as Fetcher,
    APP_URL: APP,
    OWNER_EMAILS: 'adam@example.com',
    MAIL_PROVIDER: 'log',
    MAIL_FROM: 'x@example.com',
    DEV_EXPOSE_LINKS: '1',
  }
  const link = (await call('POST', '/api/auth/request', { email: 'adam@example.com' })).data.devLink as string
  await call('POST', '/api/auth/verify', { token: new URL(link).searchParams.get('login') })
  await call('POST', '/api/me/adult', { confirm: true })
  cityId = (await call('POST', '/api/cities', { name: 'Brantford' })).data.id as string
  await call('POST', `/api/cities/${cityId}/agent`, { name: 'Adam', color: 'gold', characterId: 'you' })
})

async function openStore(t = transport(), notices: string[] = []) {
  const g = (await call('GET', `/api/cities/${cityId}/game`)).data as { version: number; state: string }
  return new CloudStore(t, g.version, g.state, { debounceMs: 10_000, onNotice: (n) => notices.push(n) })
}

describe('CloudStore ↔ Worker', () => {
  it('the server ends up with exactly the game the browser shows', async () => {
    const notices: string[] = []
    const store = await openStore(transport(), notices)
    for (const a of play) store.dispatch(a)
    expect(store.getStatus()).toBe('pending')
    await store.flush()
    expect(store.getStatus()).toBe('saved')
    expect(notices).toEqual([])
    const server = await serverGame()
    expect(server.version).toBe(2)
    expect(await stateDigest(server.state)).toBe(await stateDigest(store.getState()))
    expect(store.getState().week).toBe(2)
    store.dispose()
  })

  it('debug moves never leave the browser, or change it', async () => {
    const store = await openStore()
    const before = toWire(store.getState())
    store.dispatch({ type: 'DEBUG_CASH' })
    store.dispatch({ type: 'DEBUG_SKIP_WEEKS', weeks: 5 })
    expect(store.pending).toBe(0)
    expect(toWire(store.getState())).toBe(before)
    store.dispose()
  })

  it('moves made while a save is in flight go up next', async () => {
    const store = await openStore()
    store.dispatch({ type: 'WORK_PHONES' })
    const first = store.flush()
    store.dispatch({ type: 'WORK_PHONES' })
    await first
    await store.flush()
    const server = await serverGame()
    expect(server.version).toBe(3)
    expect(await stateDigest(server.state)).toBe(await stateDigest(store.getState()))
    store.dispose()
  })

  it('two tabs: the late one replays its moves on the other’s game', async () => {
    const notices: string[] = []
    const a = await openStore()
    const b = await openStore(transport(), notices)
    a.dispatch({ type: 'WORK_PHONES' })
    a.dispatch({ type: 'END_WEEK' })
    await a.flush()
    b.dispatch({ type: 'SIDE_HUSTLE' })
    await b.flush() // 409 → replays on a's game
    await b.flush() // sends the replayed move
    expect(notices[0]).toMatch(/open somewhere else/)
    const server = await serverGame()
    expect(server.state.week).toBe(2)
    expect(server.version).toBe(3)
    expect(await stateDigest(server.state)).toBe(await stateDigest(b.getState()))
    a.dispose()
    b.dispose()
  })

  it('going offline keeps the moves and sends them later', async () => {
    const fail = { on: true }
    const store = await openStore(transport(fail))
    store.dispatch({ type: 'WORK_PHONES' })
    await store.flush()
    expect(store.getStatus()).toBe('offline')
    expect(store.pending).toBe(1)
    fail.on = false
    await store.flush()
    expect(store.getStatus()).toBe('saved')
    expect((await serverGame()).version).toBe(2)
    store.dispose()
  })

  it('if the browser’s game was wrong, the server’s wins', async () => {
    const notices: string[] = []
    const store = await openStore(transport(), notices)
    /* Someone edits the server copy (an admin fix, a migration) under it. */
    const s = (await serverGame()).state
    db.raw.prepare('UPDATE saves SET state = ?').run(toWire({ ...s, cash: 123_456 }))
    store.dispatch({ type: 'WORK_PHONES' })
    await store.flush()
    expect(notices[0]).toMatch(/out of step/)
    expect(store.getState().cash).toBe(123_456)
    store.dispose()
  })

  it('checkIn picks up a game that moved on elsewhere', async () => {
    const a = await openStore()
    const b = await openStore()
    a.dispatch({ type: 'END_WEEK' })
    await a.flush()
    expect(b.getState().week).toBe(1)
    await b.checkIn()
    expect(b.getState().week).toBe(2)
    a.dispose()
    b.dispose()
  })
})
