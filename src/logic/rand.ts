/* The ONLY source of randomness in the game.
 *
 * The seed lives here, but its OWNER is GameState.rngSeed: the reducer seeds
 * from state on the way in and reads the cursor back out on the way out. That
 * is what makes the reducer pure without threading a seed through the hundred
 * or so call sites that draw from it — none of them changed, and none of them
 * need to know. A draw taken outside the reducer (a component rendering, a
 * test poking a helper directly) is harmless: the next dispatch re-seeds from
 * state and overwrites whatever the cursor drifted to. */

const MOD = 4294967296

let _seed: number | null = null

export function rand(): number {
  if (_seed === null) return Math.random()
  _seed = (_seed * 1664525 + 1013904223) % MOD
  return _seed / MOD
}

/** `null` hands the game back to Math.random — the unseeded escape hatch.
 *  Anything that isn't a finite number is treated as null rather than stored:
 *  a NaN seed would make every subsequent draw NaN, and every `chance()` built
 *  on it silently false, which is a very quiet way to break a whole game. */
export function setSeed(seed: number | null | undefined): void {
  _seed = typeof seed === 'number' && Number.isFinite(seed) ? seed : null
}

/** Where the cursor is now, so the reducer can store it. Null while unseeded. */
export function currentSeed(): number | null {
  return _seed
}

/** A fresh unpredictable seed for a brand new game. */
export function randomSeed(): number {
  return Math.floor(Math.random() * MOD)
}

export const pick = <T,>(a: T[]): T => a[Math.floor(rand() * a.length)]
export const randInt = (lo: number, hi: number): number =>
  lo + Math.floor(rand() * (hi - lo + 1))
export const chance = (p: number): boolean => rand() < p
export const money = (n: number): string =>
  (n < 0 ? '-$' : '$') + Math.abs(Math.round(n)).toLocaleString()

/** Rounds `n` to the nearest multiple of `step`. A step of 0 or 1 is a plain
 *  round, which keeps callers from special-casing "no rounding". */
export const roundTo = (n: number, step: number): number =>
  step > 1 ? Math.round(n / step) * step : Math.round(n)

/** Weighted choice over an arbitrary list. Returns null when nothing is
 *  eligible, so callers can fall through to a different pool. */
export function weightedPick<T>(items: T[], weightOf: (item: T) => number): T | null {
  const pool = items.filter((i) => weightOf(i) > 0)
  const total = pool.reduce((t, i) => t + weightOf(i), 0)
  if (total <= 0) return null
  let roll = rand() * total
  for (const i of pool) {
    roll -= weightOf(i)
    if (roll <= 0) return i
  }
  return pool[pool.length - 1]
}
