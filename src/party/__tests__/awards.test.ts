import { describe, expect, it } from 'vitest'
import { runBots } from '../../board/bot'
import { addBot, newTable, start, viewFor } from '../../board/rules'
import type { BoardState } from '../../board/types'
import { awardsFor } from '../awards'

const ok = (r: { ok: true; state: BoardState } | { ok: false; error: string }) => {
  if (!r.ok) throw new Error(r.error)
  return r.state
}

describe('end-of-game awards', () => {
  it('hands out a few, never twice, with the loser roasted last', () => {
    for (let seed = 1; seed <= 20; seed++) {
      let s = newTable(seed, 'h')
      for (let i = 0; i < 4; i++) s = ok(addBot(s))
      s = runBots(ok(start(s)), 5000)
      const v = viewFor(s, '', 1)
      const awards = awardsFor(v)
      expect(awards.length).toBeGreaterThan(0)
      expect(awards.length).toBeLessThanOrEqual(5)
      expect(new Set(awards.map((a) => a.title)).size).toBe(awards.length)
      for (const a of awards) {
        expect(a.line).not.toMatch(/\{\w+\}/)
        expect(a.line).toContain(v.seats[a.seat].name)
      }
      const last = awards.find((a) => a.title === 'Blue Balls')
      if (last) expect(awards[awards.length - 1]).toBe(last)
      expect(awards.filter((a) => a.seat === v.winner).length).toBeLessThanOrEqual(2)
    }
  })
})
