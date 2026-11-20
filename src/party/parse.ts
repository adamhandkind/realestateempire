/* Reads a message from the room's server. The server is ours, but a proxy
   or a half-delivered frame shouldn't crash a phone. */

import type { ServerMsg } from './protocol'

export function parseServerMsg(raw: unknown): ServerMsg | null {
  if (typeof raw !== 'string') return null
  let m: unknown
  try {
    m = JSON.parse(raw)
  } catch {
    return null
  }
  if (typeof m !== 'object' || m === null) return null
  const t = (m as { t?: unknown }).t
  return t === 'state' || t === 'error' || t === 'pong' || t === 'bye' ? (m as ServerMsg) : null
}
