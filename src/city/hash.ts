/** FNV-1a. Stable across runs and machines: same string, same number. Used for
 *  every "random-looking" choice the city makes, so the map never consumes the
 *  game's RNG and never changes between renders. */
export function hash(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  /* murmur3's finalizer: FNV alone leaves the high bits nearly identical for
     ids that differ in one digit, which clumps "random" parks into stripes. */
  h ^= h >>> 16
  h = Math.imul(h, 0x85ebca6b)
  h ^= h >>> 13
  h = Math.imul(h, 0xc2b2ae35)
  h ^= h >>> 16
  return h >>> 0
}

/** hash() as a number in [0, 1). */
export const unit = (s: string): number => hash(s) / 4294967296
