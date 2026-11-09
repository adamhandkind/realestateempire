/* The browser's side of /api. Thin on purpose: every call is a fetch with the
   session cookie (same origin), JSON both ways, and an ApiError carrying the
   server's error code when it says no. */

export class ApiError extends Error {
  status: number
  code: string
  data: Record<string, unknown>
  constructor(status: number, data: Record<string, unknown>) {
    super(typeof data.message === 'string' ? data.message : String(data.error ?? 'Request failed'))
    this.status = status
    this.code = String(data.error ?? 'error')
    this.data = data
  }
}

export interface RawResult {
  status: number
  data: Record<string, unknown>
}

/** Never throws for an HTTP status; only for a network failure. */
export async function raw(
  method: string,
  path: string,
  body?: unknown,
  init: RequestInit = {},
): Promise<RawResult> {
  const res = await fetch(path, {
    method,
    credentials: 'same-origin',
    headers: body !== undefined ? { 'content-type': 'application/json' } : {},
    body: body !== undefined ? JSON.stringify(body) : undefined,
    ...init,
  })
  let data: Record<string, unknown> = {}
  try {
    data = await res.json()
  } catch {
    /* empty or not JSON */
  }
  return { status: res.status, data }
}

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  const r = await raw(method, path, body)
  if (r.status >= 400) throw new ApiError(r.status, r.data)
  return r.data as T
}

/* ---------------------------------------------------------------- types */

import type { Award, SeasonStanding } from '../citygame/types'
import type { CityGameReply, CityTransport } from './cityStore'

export interface Me {
  user: { id: string; email: string; adult: boolean; isOwner: boolean }
  cities: CitySummary[]
}

export interface CitySummary {
  id: string
  name: string
  season: number
  role: 'owner' | 'player'
  agent: { name: string; color: string; characterId: string } | null
}

/** A player's game in a shared city, as the server sends it. */
export type SaveText = CityGameReply

export interface HallSeason {
  season: number
  finishedAt: number
  champion: { name: string; color: string; characterId: string; netWorth: number; title: string | null } | null
  standings: SeasonStanding[]
  awards: Award[]
}

export interface InvitePeek {
  ok: boolean
  error?: string
  message?: string
  city?: string
  members?: number
  from?: string
  emailLocked?: boolean
}

export interface InviteRow {
  id: string
  email: string | null
  note: string | null
  createdAt: number
  expiresAt: number
  usedBy: string | null
  status: 'open' | 'used' | 'expired' | 'revoked'
}

export interface BoardRow {
  place: number
  you: boolean
  name: string
  color: string
  characterId: string
  week: number
  cash: number
  netWorth: number
  rank: string | null
  gameOver: boolean
  lastPlayed: number | null
}

/* ---------------------------------------------------------------- calls */

/** What's behind /api: 'none' on a static host (local play), 'signedOut',
 *  or the signed-in player. Throws only when a real backend is erroring. */
export async function probe(): Promise<{ kind: 'none' } | { kind: 'signedOut' } | { kind: 'me'; me: Me }> {
  let res: Response
  try {
    res = await fetch('/api/me', { credentials: 'same-origin' })
  } catch {
    return { kind: 'none' }
  }
  if (res.headers.get('x-res-api') !== '1') return { kind: 'none' }
  if (res.status === 401) return { kind: 'signedOut' }
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new ApiError(res.status, data)
  return { kind: 'me', me: data as Me }
}

export const api = {
  requestLink: (email: string, invite?: string) =>
    call<{ ok: true; devLink?: string }>('POST', '/api/auth/request', { email, invite }),
  verify: (token: string) =>
    call<{ ok: true; inviteError?: string; inviteMessage?: string }>('POST', '/api/auth/verify', { token }),
  logout: () => call<{ ok: true }>('POST', '/api/auth/logout', {}),
  confirmAdult: () => call<{ ok: true }>('POST', '/api/me/adult', { confirm: true }),
  createCity: (name: string) => call<{ id: string; name: string }>('POST', '/api/cities', { name }),
  peekInvite: (token: string) => call<InvitePeek>('GET', '/api/invites/' + encodeURIComponent(token)),
  acceptInvite: (token: string) =>
    call<{ ok: true; cityId: string }>('POST', '/api/invites/' + encodeURIComponent(token) + '/accept', {}),
  createInvite: (cityId: string, email: string, note: string) =>
    call<{ id: string; link: string; emailed: boolean; expiresAt: number }>(
      'POST',
      `/api/cities/${cityId}/invites`,
      { email, note },
    ),
  listInvites: (cityId: string) => call<{ invites: InviteRow[] }>('GET', `/api/cities/${cityId}/invites`),
  revokeInvite: (cityId: string, id: string) => call<{ ok: true }>('DELETE', `/api/cities/${cityId}/invites/${id}`),
  createAgent: (cityId: string, body: { name: string; color: string; characterId: string; restart?: boolean }) =>
    call<SaveText>('POST', `/api/cities/${cityId}/agent`, body),
  getGame: (cityId: string) => call<SaveText>('GET', `/api/cities/${cityId}/game`),
  leaderboard: (cityId: string) =>
    call<{ city: string; season: number; rows: BoardRow[] }>('GET', `/api/cities/${cityId}/leaderboard`),
  seasons: (cityId: string) => call<{ seasons: HallSeason[] }>('GET', `/api/cities/${cityId}/seasons`),
}

/** The shared city's calls, for CityStore. */
export function cityTransport(cityId: string): CityTransport {
  const base = `/api/cities/${cityId}`
  return {
    act: (body) => raw('POST', base + '/act', body),
    getGame: () => raw('GET', base + '/game'),
    getCity: () => raw('GET', base + '/city'),
    bid: (body) => raw('POST', base + '/bids', body),
    withdraw: (listingId) => raw('DELETE', base + '/bids/' + encodeURIComponent(listingId)),
    start: () => raw('POST', base + '/season/start', {}),
    schedule: (body) => raw('POST', base + '/schedule', body),
    tick: () => raw('POST', base + '/tick', {}),
    checkIn: () => raw('POST', base + '/checkin', {}),
  }
}
