/* The online game's state, kept in step with the server.

   Clicks feel instant because the browser runs the same engine: dispatch
   applies the move here immediately and queues it. The queue goes to the
   server in batches (after a short pause, at once on End Week, and when the
   tab is hidden). The server replays the batch itself and answers with a
   fingerprint of its result; the two agree unless something is off, and
   when they don't, the server's game wins and any moves queued since are
   replayed on top of it.

   React reads this through useSyncExternalStore. The store has no React in
   it, so it's tested directly. */

import {
  applyAction,
  applyActions,
  fromWire,
  isClientAction,
  stateDigest,
  type Action,
  type GameState,
} from '../engine'
import type { RawResult } from './api'

export type SyncStatus = 'saved' | 'pending' | 'saving' | 'offline' | 'error'

export interface SyncTransport {
  postActions(body: { baseVersion: number; actions: Action[]; digest: string }, keepalive?: boolean): Promise<RawResult>
  getGame(): Promise<{ version: number; state: string }>
}

export interface StoreOptions {
  /** Quiet time after a click before the queue goes up. */
  debounceMs?: number
  onSignedOut?: () => void
  /** Something worth telling the player ("the server reloaded your game"). */
  onNotice?: (text: string) => void
}

const MAX_BACKOFF = 30_000

export class CloudStore {
  private state: GameState
  private version: number
  private queue: Action[] = []
  private inFlight = false
  private timer: ReturnType<typeof setTimeout> | null = null
  private backoff = 0
  private disposed = false
  private status: SyncStatus = 'saved'
  private listeners = new Set<() => void>()
  private transport: SyncTransport
  private opts: StoreOptions

  constructor(transport: SyncTransport, version: number, stateText: string, opts: StoreOptions = {}) {
    const s = fromWire(stateText)
    if (!s) throw new Error('The server sent a save this build cannot read.')
    this.transport = transport
    this.state = s
    this.version = version
    this.opts = opts
  }

  /* ---- for React ---- */
  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }
  getState = (): GameState => this.state
  getStatus = (): SyncStatus => this.status
  get pending(): number {
    return this.queue.length
  }

  private emit() {
    for (const fn of this.listeners) fn()
  }
  private setStatus(s: SyncStatus) {
    if (this.status === s) return
    this.status = s
    this.emit()
  }

  /** A player move. Moves the server won't take (debug tools, imports) are
   *  ignored here too, so the two copies never drift. */
  dispatch = (action: Action): void => {
    if (this.disposed || !isClientAction(action.type)) return
    this.state = applyAction(this.state, action)
    this.queue.push(action)
    this.status = this.inFlight ? 'saving' : 'pending'
    this.emit()
    this.schedule(action.type === 'END_WEEK' ? 0 : (this.opts.debounceMs ?? 1500))
  }

  private schedule(ms: number) {
    if (this.disposed) return
    if (this.timer) clearTimeout(this.timer)
    this.timer = setTimeout(() => {
      this.timer = null
      void this.flush()
    }, ms)
  }

  /** Replace the local game with the server's, replaying `replay` on top. */
  private adopt(version: number, text: string, replay: Action[]) {
    const base = fromWire(text)
    if (!base) {
      this.setStatus('error')
      return
    }
    this.version = version
    this.state = applyActions(base, replay)
    this.emit()
  }

  /** Sends everything queued. Resolves when that round trip is done. */
  async flush(): Promise<void> {
    if (this.disposed || this.inFlight || this.queue.length === 0) return
    if (this.timer) {
      clearTimeout(this.timer)
      this.timer = null
    }
    /* The batch is the whole queue, so the game as it stands now is the
       game after the batch. Taken before any await, so later clicks don't
       leak into the fingerprint. */
    const batch = this.queue.splice(0)
    const after = this.state
    this.inFlight = true
    this.setStatus('saving')
    let r: RawResult
    try {
      const digest = await stateDigest(after)
      r = await this.transport.postActions({ baseVersion: this.version, actions: batch, digest })
    } catch {
      /* Offline. Put the batch back in front and try again later. */
      this.inFlight = false
      this.queue = batch.concat(this.queue)
      this.backoff = Math.min(MAX_BACKOFF, this.backoff ? this.backoff * 2 : 2000)
      this.setStatus('offline')
      this.schedule(this.backoff)
      return
    }
    this.inFlight = false
    this.backoff = 0
    await this.settle(r, batch)
    if (this.disposed) return
    if (this.queue.length) this.schedule(0)
    else if (this.status !== 'error') this.setStatus('saved')
  }

  private async settle(r: RawResult, batch: Action[]) {
    const d = r.data as { version?: number; state?: string; error?: string; message?: string }
    if (r.status === 200) {
      this.version = d.version ?? this.version + 1
      /* The server disagreed with us. Its game stands. */
      if (typeof d.state === 'string') {
        this.adopt(this.version, d.state, this.queue)
        this.opts.onNotice?.('Your game was out of step with the server and has been refreshed.')
      }
      return
    }
    if (r.status === 409 && typeof d.state === 'string' && typeof d.version === 'number') {
      /* Another tab or device saved first. Play our moves again on its game. */
      this.queue = batch.concat(this.queue)
      this.adopt(d.version, d.state, this.queue)
      this.opts.onNotice?.('This game was also open somewhere else. Picked up where that left off.')
      return
    }
    if (r.status === 401) {
      this.queue = batch.concat(this.queue)
      this.setStatus('error')
      this.opts.onSignedOut?.()
      return
    }
    /* Refused (400) or broken (5xx): reload the server's copy and drop
       what it wouldn't take. */
    try {
      const g = await this.transport.getGame()
      this.queue = []
      this.adopt(g.version, g.state, [])
      this.opts.onNotice?.(
        r.status === 400
          ? 'The server refused a move (' + (d.message ?? d.error) + '). Your game was reloaded.'
          : 'The server had a problem saving. Your game was reloaded from the last save.',
      )
    } catch {
      this.queue = batch.concat(this.queue)
      this.setStatus('error')
      this.schedule(MAX_BACKOFF)
    }
  }

  /** Is the server's copy still ours? Used when the tab comes back into
   *  view, in case the game moved on from another device meanwhile. */
  async checkIn(): Promise<void> {
    if (this.disposed || this.inFlight || this.queue.length) return
    try {
      this.inFlight = true
      const digest = await stateDigest(this.state)
      const r = await this.transport.postActions({ baseVersion: this.version, actions: [], digest })
      this.inFlight = false
      const d = r.data as { version?: number; state?: string; digest?: string }
      if (r.status === 409 && typeof d.state === 'string' && typeof d.version === 'number')
        this.adopt(d.version, d.state, [])
      else if (r.status === 200 && d.digest && d.digest !== digest) {
        const g = await this.transport.getGame()
        this.adopt(g.version, g.state, [])
      }
      if (r.status === 401) this.opts.onSignedOut?.()
    } catch {
      this.inFlight = false
    }
  }

  /** Last chance on tab close: fire the queue with keepalive and hope. */
  flushOnExit(): void {
    if (this.disposed || this.queue.length === 0) return
    const batch = this.queue.splice(0)
    const baseVersion = this.version + (this.inFlight ? 1 : 0)
    /* No digest: hashing is async and the page may be gone before it
       finishes. The next visit loads the server's copy anyway. */
    this.transport.postActions({ baseVersion, actions: batch, digest: '' }, true).catch(() => {})
  }

  dispose(): void {
    this.disposed = true
    if (this.timer) clearTimeout(this.timer)
    this.listeners.clear()
  }
}
