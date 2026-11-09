/* A fingerprint of a game state, computed identically in the browser and on
   the server. The browser applies its own moves straight away; when it sends
   them, it sends this too, and the server answers with its own copy of the
   game only if the two disagree.

   It hashes the game's *content*, not its JSON text: keys are sorted, so two
   equal games always match even if their objects were built in a different
   order (one fresh from the reducer, one reloaded from storage). Values
   follow JSON's rules — undefined is skipped, non-finite numbers are null —
   and the transient summary/promo fields are left out, as in a save. */

import type { GameState } from '../state/types'

export async function digestText(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text)
  const hash = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(hash), (b) => b.toString(16).padStart(2, '0')).join('')
}

/** JSON.stringify with sorted keys. */
export function canonicalJson(v: unknown): string {
  if (v === null || typeof v !== 'object') {
    if (typeof v === 'number') return Number.isFinite(v) ? JSON.stringify(v) : 'null'
    if (v === undefined || typeof v === 'function' || typeof v === 'symbol') return 'null'
    return JSON.stringify(v)
  }
  if (Array.isArray(v)) return '[' + v.map(canonicalJson).join(',') + ']'
  const parts: string[] = []
  for (const k of Object.keys(v).sort()) {
    const x = (v as Record<string, unknown>)[k]
    if (x === undefined || typeof x === 'function' || typeof x === 'symbol') continue
    parts.push(JSON.stringify(k) + ':' + canonicalJson(x))
  }
  return '{' + parts.join(',') + '}'
}

export function stateDigest(state: GameState): Promise<string> {
  const { summary: _summary, promo: _promo, ...rest } = state
  return digestText(canonicalJson(rest))
}
