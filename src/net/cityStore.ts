/* The online game, in a shared city. The server plays every move (it holds
   the dice), so a click goes up and the game comes back. Clicks made while
   one is in flight queue up and go together. The store also keeps the city
   (listings, other players, the feed) and notices when the overnight tick
   has run.

   React reads this through useSyncExternalStore. No React in here, so it's
   tested directly against the Worker. */

import { fromWire, isCityClientAction, type Action, type GameState } from '../engine'
import type { MorningReport } from '../citygame/types'
import type { CityView } from '../citygame/view'
import type { RawResult } from './api'

export type SyncStatus = 'saved' | 'saving' | 'offline' | 'error'

export interface CityGameReply {
  version: number
  state: string
  report: MorningReport | null
  city: CityView
}

export interface CityTransport {
  act(body: { baseVersion: number; actions: Action[] }): Promise<RawResult>
  getGame(): Promise<RawResult>
  getCity(): Promise<RawResult>
  bid(body: { listingId: string; amount: number; downPct: number }): Promise<RawResult>
  withdraw(listingId: string): Promise<RawResult>
  start(): Promise<RawResult>
  schedule(body: { hour: number; zone: string }): Promise<RawResult>
  tick(): Promise<RawResult>
  checkIn(): Promise<RawResult>
}

export interface CityStoreOptions {
  onSignedOut?: () => void
  onNotice?: (text: string) => void
}

const MAX_BACKOFF = 30_000

export class CityStore {
  private state: GameState
  private version: number
  private report: MorningReport | null
  private city: CityView
  private queue: Action[] = []
  private inFlight = false
  private status: SyncStatus = 'saved'
  private backoff = 0
  private timer: ReturnType<typeof setTimeout> | null = null
  private disposed = false
  private listeners = new Set<() => void>()
  private transport: CityTransport
  private opts: CityStoreOptions

  constructor(transport: CityTransport, reply: CityGameReply, opts: CityStoreOptions = {}) {
    const s = fromWire(reply.state)
    if (!s) throw new Error('The server sent a game this build cannot read.')
    this.transport = transport
    this.state = s
    this.version = reply.version
    this.report = reply.report
    this.city = reply.city
    this.opts = opts
  }

  /* ---- for React ---- */
  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }
  getState = (): GameState => this.state
  getStatus = (): SyncStatus => this.status
  getCity = (): CityView => this.city
  getReport = (): MorningReport | null => this.report
  get busy(): boolean {
    return this.inFlight || this.queue.length > 0
  }

  private emit() {
    for (const fn of this.listeners) fn()
  }
  private setStatus(s: SyncStatus) {
    if (this.status === s) return
    this.status = s
    this.emit()
  }

  private adopt(r: CityGameReply) {
    const s = fromWire(r.state)
    if (!s) {
      this.setStatus('error')
      return
    }
    this.state = s
    this.version = r.version
    this.report = r.report
    this.city = r.city
    this.emit()
  }

  /** A player move. Moves a shared city won't take are dropped here. */
  dispatch = (action: Action): void => {
    if (this.disposed || !isCityClientAction(action.type)) return
    this.queue.push(action)
    void this.flush()
  }

  /** Sends what's queued, one request at a time. */
  async flush(): Promise<void> {
    if (this.disposed || this.inFlight || this.queue.length === 0) return
    if (this.timer) {
      clearTimeout(this.timer)
      this.timer = null
    }
    const batch = this.queue.splice(0)
    this.inFlight = true
    this.setStatus('saving')
    let r: RawResult
    try {
      r = await this.transport.act({ baseVersion: this.version, actions: batch })
    } catch {
      this.inFlight = false
      this.queue = batch.concat(this.queue)
      this.backoff = Math.min(MAX_BACKOFF, this.backoff ? this.backoff * 2 : 2000)
      this.setStatus('offline')
      this.timer = setTimeout(() => void this.flush(), this.backoff)
      return
    }
    this.inFlight = false
    this.backoff = 0
    const d = r.data as unknown as CityGameReply & { error?: string; message?: string }
    if (r.status === 200) this.adopt(d)
    else if (r.status === 409 && typeof d.state === 'string') {
      /* The game moved on (the tick, or another tab). Those clicks were
         meant for a game that no longer exists; drop them. */
      this.queue = []
      const before = this.state.week
      this.adopt(d)
      this.opts.onNotice?.(
        this.state.week !== before ? 'The overnight tick ran. Here’s your new week.' : 'This game moved on in another tab. Picked up where that left off.',
      )
    } else if (r.status === 401) {
      this.setStatus('error')
      this.opts.onSignedOut?.()
      return
    } else {
      this.queue = []
      this.opts.onNotice?.(r.status === 400 ? 'The server refused that move (' + (d.message ?? d.error) + ').' : 'The server had a problem with that move.')
      await this.reload()
    }
    if (this.disposed) return
    if (this.queue.length) void this.flush()
    else if (this.status !== 'error') this.setStatus('saved')
  }

  /** Fetches the game again (after the tick, or an error). */
  async reload(): Promise<void> {
    try {
      const r = await this.transport.getGame()
      if (r.status === 200) this.adopt(r.data as unknown as CityGameReply)
      else if (r.status === 401) this.opts.onSignedOut?.()
    } catch {
      this.setStatus('offline')
    }
  }

  /** Cheap: has the city moved on since we last looked? Reloads the game
   *  when the tick has run. Called on a timer and when the tab comes back. */
  async checkIn(): Promise<void> {
    if (this.disposed || this.busy) return
    try {
      const r = await this.transport.getCity()
      if (r.status === 401) return this.opts.onSignedOut?.()
      if (r.status !== 200) return
      const city = r.data as unknown as CityView
      const moved = city.week !== this.city.week || city.season !== this.city.season || city.status !== this.city.status
      this.city = city
      if (moved) await this.reload()
      else this.emit()
      if (this.status === 'offline') this.setStatus('saved')
    } catch {
      this.setStatus('offline')
    }
  }

  /* ---- the city's own calls; each answers with the new city ---- */

  private async cityCall(f: () => Promise<RawResult>, reloadGame = false): Promise<string | null> {
    try {
      const r = await f()
      const d = r.data as { error?: string; message?: string }
      if (r.status === 401) {
        this.opts.onSignedOut?.()
        return 'Signed out.'
      }
      if (r.status !== 200) return d.message ?? d.error ?? 'That didn’t work.'
      if ('city' in r.data && 'state' in r.data) this.adopt(r.data as unknown as CityGameReply)
      else {
        this.city = r.data as unknown as CityView
        this.emit()
      }
      if (reloadGame) await this.reload()
      return null
    } catch {
      return 'You’re offline.'
    }
  }

  /** Returns an error message, or null if the offer is in. */
  bid = (listingId: string, amount: number, downPct: number) => this.cityCall(() => this.transport.bid({ listingId, amount, downPct }))
  withdraw = (listingId: string) => this.cityCall(() => this.transport.withdraw(listingId))
  startSeason = () => this.cityCall(() => this.transport.start(), true)
  setSchedule = (hour: number, zone: string) => this.cityCall(() => this.transport.schedule({ hour, zone }))
  runTick = () => this.cityCall(() => this.transport.tick())
  /** The phone check-in: counts as showing up for the week. */
  markCheckedIn = () => this.cityCall(() => this.transport.checkIn())

  dispose(): void {
    this.disposed = true
    if (this.timer) clearTimeout(this.timer)
    this.listeners.clear()
  }
}
