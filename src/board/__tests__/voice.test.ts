import { describe, expect, it } from 'vitest'
import { runBots } from '../bot'
import { addBot, newTable, start } from '../rules'
import type { BoardState } from '../types'

const ok = (r: { ok: true; state: BoardState } | { ok: false; error: string }) => {
  if (!r.ok) throw new Error(r.error)
  return r.state
}

describe('table talk', () => {
  it('fills in every blank, across many whole games', () => {
    for (let seed = 1; seed <= 40; seed++) {
      let s = newTable(seed, 'h')
      for (let i = 0; i < 4; i++) s = ok(addBot(s))
      s = runBots(ok(start(s)), 5000)
      for (const l of s.log) expect(l.text, l.text).not.toMatch(/\{\w+\}|undefined|NaN/)
    }
  })

  it('gives the bots their own lines', () => {
    let s = newTable(3, 'h')
    for (let i = 0; i < 4; i++) s = ok(addBot(s))
    expect(s.log.some((l) => /Chadwick|Krystal|Duke|Brenda/.test(l.text))).toBe(true)
  })
})

describe('the turn clock', () => {
  it('ends a timed-out turn without spending the player’s cards', async () => {
    const { timeOut } = await import('../bot')
    const { applyMove, sit } = await import('../rules')
    let checked = 0
    for (let seed = 1; seed <= 30 && checked < 5; seed++) {
      let s = ok(sit(newTable(seed, 'h'), 'me', 'Me', '#e8573f'))
      for (let i = 0; i < 2; i++) s = ok(addBot(s))
      s = ok(start(s))
      /* Get past the opening and roll on one of my turns. */
      for (let i = 0; i < 200 && !(s.phase === 'main' && s.seats[s.turn].id === 'me'); i++) {
        s = runBots(s)
        if (s.seats[s.turn].id !== 'me') continue
        if (s.phase === 'roll') s = ok(applyMove(s, s.turn, { t: 'roll' }))
        else if (s.phase !== 'main') s = timeOut(s)
      }
      if (s.phase !== 'main') continue
      const me = s.turn
      const before = { ...s.seats[me].hand }
      const after = timeOut(s)
      expect(after.seats[me].hand).toEqual(before)
      expect(after.turn).not.toBe(me)
      expect(after.seats[me].stats?.timeouts).toBeGreaterThan(0)
      checked++
    }
    expect(checked).toBeGreaterThan(0)
  })
})
