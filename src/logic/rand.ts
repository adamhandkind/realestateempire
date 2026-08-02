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
