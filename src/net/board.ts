/* Where a Land Grab table lives, behind one small interface: on the server
   for a city (online), or right here in the browser against bots (offline
   practice). The board UI only ever talks to a BoardTransport. */

import { runBots } from '../board/bot'
import { addBot, applyMove, leave, newTable, parseMove, setAutopilot, sit, start, viewFor, type Result } from '../board/rules'
import type { BoardState, BoardView, Move } from '../board/types'
import { ApiError, raw } from './api'

export type BoardOp =
  | { op: 'open' }
  | { op: 'sit' }
  | { op: 'leave' }
  | { op: 'addBot' }
  | { op: 'removeBot'; seatId: string }
  | { op: 'start' }
  | { op: 'autopilot'; on: boolean; seatId?: string }
  | { op: 'move'; move: Move; rev: number }

export interface BoardTransport {
  /** Online tables are shared; practice tables are yours alone. */
  kind: 'online' | 'practice'
  load(): Promise<BoardView | null>
  op(o: BoardOp): Promise<BoardView>
  /** Calls back whenever someone else changes the table. */
  subscribe(onChange: () => void): () => void
  /** The city owner can hand anyone's seat to the bot. */
  isOwner: boolean
}

/* ---------------------------------------------------------------- online */

export function onlineBoard(cityId: string, isOwner: boolean): BoardTransport {
  const path = `/api/cities/${encodeURIComponent(cityId)}/board`
  const call = async (method: string, body?: unknown) => {
    const r = await raw(method, path, body)
    if (r.status >= 400) throw new ApiError(r.status, r.data)
    return r.data.view as BoardView | null
  }
  return {
    kind: 'online',
    isOwner,
    load: () => call('GET'),
    op: async (o) => (await call('POST', o))!,
    subscribe(onChange) {
      let ws: WebSocket | null = null
      let stopped = false
      let wait = 1000
      let timer: ReturnType<typeof setTimeout> | null = null
      let pinger: ReturnType<typeof setInterval> | null = null
      const connect = () => {
        if (stopped) return
        const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
        try {
          ws = new WebSocket(`${proto}//${window.location.host}${path}/live`)
        } catch {
          timer = setTimeout(connect, (wait = Math.min(wait * 2, 30_000)))
          return
        }
        ws.onopen = () => {
          wait = 1000
          onChange()
          pinger = setInterval(() => ws?.readyState === WebSocket.OPEN && ws.send('{"t":"ping"}'), 25_000)
        }
        ws.onmessage = (e) => {
          if (typeof e.data === 'string' && e.data.includes('"board"')) onChange()
        }
        ws.onclose = () => {
          if (pinger) clearInterval(pinger)
          ws = null
          if (!stopped) timer = setTimeout(connect, (wait = Math.min(wait * 2, 30_000)))
        }
      }
      connect()
      /* A slow poll too, for networks that won't hold a socket. */
      const poll = setInterval(onChange, 20_000)
      return () => {
        stopped = true
        clearInterval(poll)
        if (timer) clearTimeout(timer)
        if (pinger) clearInterval(pinger)
        ws?.close()
      }
    },
  }
}

/* -------------------------------------------------------------- practice */

const PRACTICE_KEY = 'res_landgrab_practice'
const ME = 'you'

/** A table in this browser: you against bots, saved in localStorage. */
export function practiceBoard(): BoardTransport {
  let state: BoardState | null = null
  let rev = 0
  try {
    const saved = JSON.parse(window.localStorage.getItem(PRACTICE_KEY) ?? 'null')
    if (saved?.state?.version === 1) {
      state = saved.state
      rev = saved.rev ?? 0
    }
  } catch {
    /* start fresh */
  }
  const save = () => {
    try {
      window.localStorage.setItem(PRACTICE_KEY, JSON.stringify({ state, rev }))
    } catch {
      /* fine: practice just won't survive a refresh */
    }
  }
  const fail = (message: string) => new ApiError(400, { error: 'not_allowed', message })
  const commit = (r: Result) => {
    if (!r.ok) throw fail(r.error)
    state = runBots(r.state)
    rev++
    save()
    return viewFor(state, ME, rev)
  }
  return {
    kind: 'practice',
    isOwner: true,
    load: async () => (state ? viewFor(state, ME, rev) : null),
    async op(o) {
      if (o.op === 'open') {
        let s = newTable(Math.floor(Math.random() * 2 ** 32), ME)
        const r = sit(s, ME, 'Your agent', '#e0b100')
        if (!r.ok) throw fail(r.error)
        s = r.state
        for (let i = 0; i < 3; i++) {
          const b = addBot(s)
          if (b.ok) s = b.state
        }
        return commit({ ok: true, state: s })
      }
      if (!state) throw fail('Open a table first.')
      switch (o.op) {
        case 'sit':
          return commit(sit(state, ME, 'Your agent', '#e0b100'))
        case 'leave':
          return commit(leave(state, ME))
        case 'addBot':
          return commit(addBot(state))
        case 'removeBot':
          return commit(leave(state, o.seatId))
        case 'start':
          return commit(start(state))
        case 'autopilot':
          return commit(setAutopilot(state, o.seatId ?? ME, o.on))
        case 'move': {
          const m = parseMove(o.move)
          const seat = state.seats.findIndex((x) => x.id === ME)
          if (!m) throw fail('That move doesn’t make sense.')
          return commit(applyMove(state, seat, m))
        }
      }
    },
    subscribe: () => () => {},
  }
}
