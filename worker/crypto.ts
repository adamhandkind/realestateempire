/* Tokens and ids. Every token handed to a person (login link, session
   cookie, invite link) is 32 random bytes; the database only ever sees its
   SHA-256, so a leaked table can't sign anybody in. */

import { digestText } from '../src/engine/digest'

export function randomToken(bytes = 32): string {
  const b = crypto.getRandomValues(new Uint8Array(bytes))
  let s = ''
  for (const x of b) s += String.fromCharCode(x)
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export const hashToken = (token: string): Promise<string> => digestText(token)

export const newId = (): string => crypto.randomUUID()

/** A game seed for createGame. The client never chooses it. */
export const randomSeed = (): number =>
  crypto.getRandomValues(new Uint32Array(1))[0] || 1
