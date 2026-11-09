/* The 52-week rebalance, pinned. Bots play whole shared seasons against the
   city tuning in data/city.ts. A strong player should go from the tent to
   Top Producer by about the end of summer and finish rich enough to be
   buying condo blocks and towers; a casual one should still get to Seller's
   Agent and stay solvent. If a tuning change breaks these, it changed the
   game's shape, not just its numbers. */

import { describe, expect, it } from 'vitest'
import { netWorth } from '../../logic/portfolio'
import { simulateSeason, type SimSeat } from '../sim'

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b)
  return s[Math.floor(s.length / 2)]
}

/* Svetlana is left out of the casual seats: she starts mortgaged to the eyes
   on purpose, and a player who ignores her tenants is meant to go under. */
const SEATS: SimSeat[] = [
  { style: 'strong', characterId: 'you' },
  { style: 'strong', characterId: 'nigel' },
  { style: 'strong', characterId: 'doreen' },
  { style: 'strong', characterId: 'hunter' },
  { style: 'casual', characterId: 'chip', showUp: 0.8 },
  { style: 'casual', characterId: 'dave', showUp: 0.8 },
  { style: 'casual', characterId: 'blaine', showUp: 0.8 },
]

describe('a 52-week season', () => {
  const runs = [1, 2, 3].map((seed) => simulateSeason(SEATS, seed))
  const strong = runs.flatMap((r) => r.players.filter((_, i) => SEATS[i].style === 'strong').map((p) => ({ p, ranks: r.ranks[p.userId] })))
  const casual = runs.flatMap((r) => r.players.filter((_, i) => SEATS[i].style === 'casual').map((p) => ({ p, ranks: r.ranks[p.userId] })))

  it('runs to the end and crowns somebody', () => {
    for (const r of runs) {
      expect(r.result?.season).toBe(1)
      expect(r.city.status).toBe('finished')
      expect(r.result!.standings).toHaveLength(SEATS.length)
    }
  })

  it('gets a strong player from the tent to Top Producer by the end of summer-ish', () => {
    const weeks = strong.map((s) => s.ranks.topProducer ?? 99)
    expect(weeks.every((w) => w <= 36)).toBe(true)
    expect(median(weeks)).toBeLessThanOrEqual(28)
  })

  it('makes a strong player rich, and lets the best of them reach the top of the ladder', () => {
    const worth = strong.map((s) => netWorth(s.p.game))
    expect(strong.every((s) => !s.p.game.gameOver)).toBe(true)
    expect(median(worth)).toBeGreaterThan(550_000)
    expect(Math.max(...worth)).toBeGreaterThan(1_000_000)
    const bigBuildings = strong.filter((s) => s.p.game.properties.some((x) => x.typeId === 'apartment' || x.typeId === 'luxury'))
    expect(bigBuildings.length).toBeGreaterThanOrEqual(strong.length / 2)
  })

  it("keeps a casual player solvent and gets them to Seller's Agent", () => {
    expect(casual.every((c) => !c.p.game.gameOver)).toBe(true)
    const reached = casual.filter((c) => c.ranks.sellerAgent !== undefined)
    expect(reached.length).toBeGreaterThanOrEqual(casual.length * 0.6)
    /* ...without catching the strong players. */
    expect(median(casual.map((c) => netWorth(c.p.game)))).toBeLessThan(median(strong.map((s) => netWorth(s.p.game))) / 3)
  })
})
