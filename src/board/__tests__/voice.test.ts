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
