/* The browser's CityStore against the real Worker (in-process, on the SQLite
   stand-in and the fake city object): moves go up and the server's game
   comes back, offers land in the city, the tick is noticed, and a stale or
   refused move heals itself. */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fromWire, toWire } from '../../src/engine'
import { CityStore, type CityGameReply, type CityTransport } from '../../src/net/cityStore'
import type { Env } from '../env'
import worker from '../index'
import { makeD1 } from './d1'
import { fakeCityNamespace } from './fakeCity'

const APP = 'https://empire.test'
let env: Env
let city: ReturnType<typeof fakeCityNamespace>
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

const transport = (fail = { on: false }): CityTransport => {
  const base = () => `/api/cities/${cityId}`
  const guard = async <T,>(f: () => Promise<T>) => {
    if (fail.on) throw new TypeError('Failed to fetch')
    return f()
  }
  return {
    act: (b) => guard(() => call('POST', base() + '/act', b)),
    getGame: () => guard(() => call('GET', base() + '/game')),
    getCity: () => guard(() => call('GET', base() + '/city')),
    bid: (b) => guard(() => call('POST', base() + '/bids', b)),
    withdraw: (id) => guard(() => call('DELETE', base() + '/bids/' + id)),
    start: () => guard(() => call('POST', base() + '/season/start', {})),
    schedule: (b) => guard(() => call('POST', base() + '/schedule', b)),
    tick: () => guard(() => call('POST', base() + '/tick', {})),
    checkIn: () => guard(() => call('POST', base() + '/checkin', {})),
  }
}

/** Waits until the store has nothing in flight. */
async function settle(s: CityStore) {
  for (let i = 0; i < 200 && s.busy; i++) await new Promise((r) => setTimeout(r, 1))
}

beforeEach(async () => {
  vi.spyOn(console, 'log').mockImplementation(() => {})
  cookie = ''
  env = {
    DB: makeD1() as unknown as D1Database,
    ASSETS: { fetch: async () => new Response('') } as unknown as Fetcher,
    APP_URL: APP,
    OWNER_EMAILS: 'adam@example.com',
    MAIL_PROVIDER: 'log',
    MAIL_FROM: 't@example.com',
    DEV_EXPOSE_LINKS: '1',
    ALLOW_MANUAL_TICK: '1',
    CITY: null as unknown as Env['CITY'],
  }
  city = fakeCityNamespace(() => env)
  env.CITY = city.namespace as unknown as Env['CITY']
  const r = await call('POST', '/api/auth/request', { email: 'adam@example.com' })
  const token = new URL(r.data.devLink as string).searchParams.get('login')
  await call('POST', '/api/auth/verify', { token })
  await call('POST', '/api/me/adult', { confirm: true })
  cityId = (await call('POST', '/api/cities', { name: 'Brantford' })).data.id as string
  await call('POST', `/api/cities/${cityId}/agent`, { name: 'Adam', color: 'gold', characterId: 'you' })
  await call('POST', `/api/cities/${cityId}/season/start`, {})
})

const load = async () => (await call('GET', `/api/cities/${cityId}/game`)).data as unknown as CityGameReply

describe('CityStore', () => {
  it('plays a move on the server and shows the result', async () => {
    const s = new CityStore(transport(), await load())
    const ap = s.getState().ap
    s.dispatch({ type: 'ASSIST_SHOWING' })
    s.dispatch({ type: 'ASSIST_SHOWING' })
    await settle(s)
    expect(s.getState().ap).toBe(ap - 2)
    expect(s.getStatus()).toBe('saved')
    expect(fromWire((await load()).state)!.ap).toBe(ap - 2)
  })

  it('never sends what a shared city refuses', async () => {
    const s = new CityStore(transport(), await load())
    const before = s.getState()
    s.dispatch({ type: 'END_WEEK' })
    s.dispatch({ type: 'DEBUG_CASH' })
    expect(s.busy).toBe(false)
    expect(s.getState()).toBe(before)
  })

  it('notices the tick and loads the new week', async () => {
    const s = new CityStore(transport(), await load())
    expect(s.getState().week).toBe(1)
    await city.fireAlarms(1)
    await s.checkIn()
    expect(s.getState().week).toBe(2)
    expect(s.getCity().week).toBe(2)
    expect(s.getReport()?.week).toBe(1)
  })

  it('drops a click meant for last week, and says why', async () => {
    const notices: string[] = []
    const s = new CityStore(transport(), await load(), { onNotice: (t) => notices.push(t) })
    await city.fireAlarms(1)
    s.dispatch({ type: 'ASSIST_SHOWING' })
    await settle(s)
    expect(s.getState().week).toBe(2)
    expect(notices.join(' ')).toMatch(/tick ran/)
  })

  it('keeps moves while offline and sends them when it can', async () => {
    vi.useFakeTimers()
    try {
      const fail = { on: true }
      const s = new CityStore(transport(fail), await load())
      const ap = s.getState().ap
      s.dispatch({ type: 'ASSIST_SHOWING' })
      await vi.advanceTimersByTimeAsync(0)
      expect(s.getStatus()).toBe('offline')
      fail.on = false
      await vi.advanceTimersByTimeAsync(2100)
      await vi.advanceTimersByTimeAsync(0)
      expect(s.getState().ap).toBe(ap - 1)
      expect(s.getStatus()).toBe('saved')
    } finally {
      vi.useRealTimers()
    }
  })

  it('places and withdraws offers', async () => {
    const { mem } = city.rooms.get(cityId)!
    for (const [k, v] of mem.data)
      if (k.startsWith('p:')) {
        const p = v as { game: string }
        mem.data.set(k, { ...p, game: toWire({ ...fromWire(p.game)!, rank: 'topProducer', cash: 3_000_000 }) })
      }
    const s = new CityStore(transport(), await load())
    const l = s.getCity().listings[0]
    expect(await s.bid(l.id, l.askPrice, 1)).toBeNull()
    expect(s.getCity().listings.find((x) => x.id === l.id)!.myBid!.amount).toBe(l.askPrice)
    expect(await s.bid(l.id, 1, 1)).toMatch(/Offers run from/)
    expect(await s.withdraw(l.id)).toBeNull()
    expect(s.getCity().listings.find((x) => x.id === l.id)!.myBid).toBeNull()
  })
})
