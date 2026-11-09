/* The browser's end of the live room: one WebSocket to the city, kept open
   while the game is. It brings in the other agents walking the map and a
   nudge when the tick runs or the board changes, so the game no longer has
   to wait for its once-a-minute poll. If the socket can't open (an old proxy,
   a flaky train Wi-Fi), the game works exactly as before, minus the company.

   No React in here; CityGame wires it up. */

import { dedupe, parseServerMessage, type LiveAgent, type Tile } from '../live/presence'

export interface LiveOptions {
  /** The overnight tick ran, or the season opened. */
  onTick?: () => void
  /** Someone placed or withdrew an offer. */
  onCity?: () => void
}

const MAX_BACKOFF = 60_000
const PING_MS = 25_000

export class LiveClient {
  private ws: WebSocket | null = null
  private agents = new Map<string, LiveAgent>()
  private snapshot: LiveAgent[] = []
  /** Server clock minus ours, so a walk that started 3 s ago there is 3 s
   *  along here too. */
  private skew = 0
  private me = ''
  private backoff = 0
  private retry: ReturnType<typeof setTimeout> | null = null
  private pinger: ReturnType<typeof setInterval> | null = null
  private disposed = false
  private listeners = new Set<() => void>()
  private last: { from: Tile; to: Tile } | null = null
  private url: string
  private opts: LiveOptions

  constructor(cityId: string, opts: LiveOptions = {}) {
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    this.url = `${proto}//${window.location.host}/api/cities/${encodeURIComponent(cityId)}/live`
    this.opts = opts
    this.connect()
  }

  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }
  /** Everyone else on the map, with their walk start in our clock. */
  getAgents = (): LiveAgent[] => this.snapshot

  private emit() {
    this.snapshot = dedupe([...this.agents.values()].filter((a) => a.userId !== this.me)).map((a) => ({ ...a, at: a.at - this.skew }))
    for (const fn of this.listeners) fn()
  }

  private connect() {
    if (this.disposed) return
    let ws: WebSocket
    try {
      ws = new WebSocket(this.url)
    } catch {
      return this.later()
    }
    this.ws = ws
    ws.onopen = () => {
      this.backoff = 0
      if (this.last) this.send({ t: 'go', ...this.last })
      this.pinger = setInterval(() => this.send({ t: 'ping' }), PING_MS)
    }
    ws.onmessage = (e) => {
      const m = parseServerMessage(e.data)
      if (!m) return
      switch (m.t) {
        case 'hello':
          this.me = m.you
          this.skew = m.now - Date.now()
          this.agents = new Map(m.agents.map((a) => [a.userId, a]))
          this.emit()
          /* We may have missed a tick while away. */
          this.opts.onTick?.()
          break
        case 'agent':
          this.agents.set(m.agent.userId, m.agent)
          this.emit()
          break
        case 'left':
          this.agents.delete(m.userId)
          this.emit()
          break
        case 'tick':
          this.opts.onTick?.()
          break
        case 'city':
          this.opts.onCity?.()
          break
      }
    }
    ws.onclose = () => {
      if (this.pinger) clearInterval(this.pinger)
      this.pinger = null
      this.ws = null
      if (this.agents.size) {
        this.agents.clear()
        this.emit()
      }
      this.later()
    }
  }

  private later() {
    if (this.disposed) return
    this.backoff = Math.min(MAX_BACKOFF, this.backoff ? this.backoff * 2 : 2000)
    this.retry = setTimeout(() => this.connect(), this.backoff)
  }

  private send(m: unknown) {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(m))
  }

  /** Our agent set off from one tile toward another. */
  go = (from: Tile, to: Tile): void => {
    this.last = { from, to }
    this.send({ t: 'go', from, to })
  }

  dispose(): void {
    this.disposed = true
    if (this.retry) clearTimeout(this.retry)
    if (this.pinger) clearInterval(this.pinger)
    this.ws?.close()
    this.listeners.clear()
  }
}
