/* The ONLY source of randomness in the game. Seedable later without touching
   any caller. */

let _seed: number | null = null

export function rand(): number {
  if (_seed === null) return Math.random()
  _seed = (_seed * 1664525 + 1013904223) % 4294967296
  return _seed / 4294967296
}

/** Not called in Phase 1. Kept so a deterministic mode is a one-liner away. */
export function setSeed(seed: number | null): void {
  _seed = seed
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
