/* The winner screen's awards: who got robbed the most, who lived at the
   bank, who ran out the clock. Worked out from the final board, so the TV
   and every phone agree. Same voice as the table talk: adults only. */

import type { BoardView } from '../board/types'

export interface Award {
  icon: string
  title: string
  seat: number
  line: string
}

interface Def {
  icon: string
  title: string
  /** The number this award is for, per seat. */
  score: (b: BoardView, seat: number) => number
  line: string
  /** Lowest wins instead of highest. */
  low?: boolean
}

const towers = (b: BoardView, seat: number) => Object.values(b.buildings).filter((x) => x.seat === seat && x.kind === 'tower').length
const points = (b: BoardView, seat: number) => b.seats[seat].totalPoints ?? b.seats[seat].points

const DEFS: Def[] = [
  { icon: '🍑', title: 'Most Violated', score: (b, i) => b.seats[i].stats.robbed, line: '{name} got robbed {n} times and kept coming back for more.' },
  { icon: '🧤', title: 'Sticky Fingers', score: (b, i) => b.seats[i].stats.stole, line: '{name} took {n} cards that weren’t theirs. Hands everywhere.' },
  { icon: '🧾', title: 'The Taxman’s Favourite', score: (b, i) => b.seats[i].stats.audited, line: '{name} lost {n} cards to audits. Bent over, repeatedly.' },
  { icon: '💸', title: 'Sugar Baby', score: (b, i) => b.seats[i].stats.bank, line: '{name} went to the bank {n} times. It’s not love, it’s money.' },
  { icon: '🔄', title: 'Swinger', score: (b, i) => b.seats[i].stats.trades, line: '{name} swapped with other players {n} times. In everybody’s pot.' },
  { icon: '📉', title: 'Crash Test Dummy', score: (b, i) => b.seats[i].stats.sevens, line: '{name} rolled {n} sevens. Ruined it for everyone, every time.' },
  { icon: '⏰', title: 'Couldn’t Finish', score: (b, i) => b.seats[i].stats.timeouts, line: 'The clock ran out on {name} {n} times. The bot had to finish them off.' },
  { icon: '🌽', title: 'Most Fertile', score: (b, i) => b.seats[i].stats.collected, line: '{name} collected {n} cards from the dice. Must be nice.' },
  { icon: '🏙️', title: 'Biggest Package', score: towers, line: '{name} put up {n} towers. We get it. It’s big.' },
  { icon: '🛣️', title: 'Obsessed With Length', score: (b, i) => b.seats[i].streetLength, line: '{name} laid {n} streets in a row and won’t stop talking about it.' },
]

const LAST: Def = { icon: '🥀', title: 'Blue Balls', score: points, low: true, line: '{name} finished last with {n} points. So close to nothing.' }

/** The best of each award, if one seat clearly has it. */
function winnerOf(b: BoardView, d: Def): { seat: number; n: number } | null {
  const scores = b.seats.map((_, i) => d.score(b, i))
  const best = d.low ? Math.min(...scores) : Math.max(...scores)
  if (!d.low && best <= 0) return null
  const who = scores.flatMap((x, i) => (x === best ? [i] : []))
  return who.length === 1 ? { seat: who[0], n: best } : null
}

const fill = (line: string, name: string, n: number) => line.replace('{name}', name).replace('{n}', String(n))

/** Up to `max` awards, spread across the table where possible, with the
 *  last-place award always at the end. */
export function awardsFor(b: BoardView, max = 5): Award[] {
  const out: Award[] = []
  const won = DEFS.map((d) => ({ d, w: winnerOf(b, d) })).filter((x): x is { d: Def; w: { seat: number; n: number } } => x.w !== null)
  const give = (x: (typeof won)[number]) => out.push({ icon: x.d.icon, title: x.d.title, seat: x.w.seat, line: fill(x.d.line, b.seats[x.w.seat].name, x.w.n) })
  /* One award each first, so everyone gets roasted; then seconds. */
  const has = new Set<number>()
  for (const x of won)
    if (out.length < max - 1 && !has.has(x.w.seat)) {
      has.add(x.w.seat)
      give(x)
    }
  for (const x of won) if (out.length < max - 1 && !out.some((a) => a.title === x.d.title) && out.filter((a) => a.seat === x.w.seat).length < 2) give(x)
  const last = winnerOf(b, LAST)
  if (last && last.seat !== b.winner) out.push({ icon: LAST.icon, title: LAST.title, seat: last.seat, line: fill(LAST.line, b.seats[last.seat].name, last.n) })
  return out
}
