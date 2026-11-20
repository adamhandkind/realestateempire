/* The browser's end of a party room: the HTTP calls (host, peek, join), the
   room's WebSocket, and remembering this device's seat so a locked phone or
   a reload drops straight back in. No React in here. */

import { ApiError, raw } from '../net/api'
import { parseServerMsg } from './parse'
import type { PartyOp, PartyView, Peek, ServerMsg } from './protocol'

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  let r
  try {
    r = await raw(method, path, body)
  } catch {
    throw new ApiError(0, { error: 'offline', message: 'Can’t reach the server. Check the Wi-Fi.' })
  }
  if (r.status >= 400 || r.data.error) throw new ApiError(r.status || 400, r.data)
  return r.data as T
}

export const partyApi = {
  host: () => call<{ code: string; tvToken: string }>('POST', '/api/party', {}),
  peek: async (code: string): Promise<Peek> => {
    const r = await raw('GET', '/api/party/' + encodeURIComponent(code)).catch(() => null)
    if (!r) return { ok: false, error: 'offline', message: 'Can’t reach the server. Check the Wi-Fi.' }
    if (typeof r.data.ok === 'boolean') return r.data as unknown as Peek
    if (typeof r.data.error === 'string') return { ok: false, error: r.data.error, message: String(r.data.message ?? 'No room with that code.') }
    /* Something answered that isn't our API: a static host, or plain `vite`. */
    return { ok: false, error: 'no_server', message: 'Party mode needs the game server running.' }
  },
  join: (code: string, name: string, color: string) =>
    call<{ seatId: string; token: string }>('POST', `/api/party/${encodeURIComponent(code)}/join`, { name, color }),
}

/* ------------------------------------------------------------- memory */

export interface Saved {
  code: string
  token: string
}

function read(key: string): Saved | null {
  try {
    const v = JSON.parse(window.localStorage.getItem(key) ?? 'null')
    return v && typeof v.code === 'string' && typeof v.token === 'string' ? v : null
  } catch {
    return null
  }
}
function write(key: string, v: Saved | null) {
  try {
    if (v) window.localStorage.setItem(key, JSON.stringify(v))
    else window.localStorage.removeItem(key)
  } catch {
    /* fine: this device just won't remember */
  }
}

export const tvMemory = { get: () => read('res_party_tv'), set: (v: Saved | null) => write('res_party_tv', v) }
export const seatMemory = { get: () => read('res_party_seat'), set: (v: Saved | null) => write('res_party_seat', v) }

export function rememberedName(): string {
  try {
    return window.localStorage.getItem('res_party_name') ?? ''
  } catch {
    return ''
  }
}
export function rememberName(n: string) {
  try {
    window.localStorage.setItem('res_party_name', n)
  } catch {
    /* fine */
  }
}

/* ------------------------------------------------------------- socket */

export type Link = 'connecting' | 'open' | 'offline'

export interface PartyHandlers {
  onState: (v: PartyView) => void
  onError?: (code: string, message: string) => void
  onBye?: (reason: Extract<ServerMsg, { t: 'bye' }>['reason']) => void
  onLink?: (l: Link) => void
}

const PING_MS = 20_000
const MAX_WAIT = 15_000

/** One live connection to a room. Reconnects on its own, and straight away
 *  when a phone wakes up, since a locked phone quietly drops its socket. */
export class PartyClient {
  private ws: WebSocket | null = null
  private wait = 500
  private retry: ReturnType<typeof setTimeout> | null = null
  private pinger: ReturnType<typeof setInterval> | null = null
  private done = false
  private code: string
  private token: string
  private h: PartyHandlers

  constructor(code: string, token: string, h: PartyHandlers) {
    this.code = code
    this.token = token
    this.h = h
    document.addEventListener('visibilitychange', this.wake)
    window.addEventListener('online', this.wake)
    this.connect()
  }

  private wake = () => {
    if (this.done || document.visibilityState !== 'visible') return
    if (this.ws && this.ws.readyState <= WebSocket.OPEN) return
    if (this.retry) clearTimeout(this.retry)
    this.wait = 500
    this.connect()
  }

  private connect() {
    if (this.done) return
    this.h.onLink?.('connecting')
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    let ws: WebSocket
    try {
      ws = new WebSocket(`${proto}//${window.location.host}/api/party/${encodeURIComponent(this.code)}/live`)
    } catch {
      return this.later()
    }
    this.ws = ws
    ws.onopen = () => {
      this.wait = 500
      ws.send(JSON.stringify({ t: 'auth', token: this.token }))
      this.pinger = setInterval(() => ws.readyState === WebSocket.OPEN && ws.send('{"t":"ping"}'), PING_MS)
    }
    ws.onmessage = (e) => {
      const m = parseServerMsg(e.data)
      if (!m) return
      if (m.t === 'state') {
        this.h.onLink?.('open')
        this.h.onState(m.view)
      } else if (m.t === 'error') this.h.onError?.(m.code, m.message)
      else if (m.t === 'bye') {
        this.done = true
        this.h.onBye?.(m.reason)
      }
    }
    ws.onclose = () => {
      if (this.pinger) clearInterval(this.pinger)
      this.pinger = null
      if (this.ws === ws) this.ws = null
      this.later()
    }
  }

  private later() {
    if (this.done) return
    this.h.onLink?.('offline')
    this.retry = setTimeout(() => this.connect(), this.wait)
    this.wait = Math.min(MAX_WAIT, this.wait * 2)
  }

  send(op: PartyOp): boolean {
    if (this.ws?.readyState !== WebSocket.OPEN) return false
    this.ws.send(JSON.stringify({ t: 'op', op }))
    return true
  }

  dispose() {
    this.done = true
    document.removeEventListener('visibilitychange', this.wake)
    window.removeEventListener('online', this.wake)
    if (this.retry) clearTimeout(this.retry)
    if (this.pinger) clearInterval(this.pinger)
    this.ws?.close()
  }
}
