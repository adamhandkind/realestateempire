#!/usr/bin/env node
/* Prints a one-time sign-in link, for the game owner (or to rescue anyone
   who's locked out). Nothing is emailed anywhere: this writes the link's
   hash straight into D1 with wrangler, the same row the Worker's own
   issueLoginLink would write, and prints the link for you to open.

     npm run login-link -- you@example.com            # production D1
     npm run login-link -- you@example.com --local    # wrangler dev's D1

   The link works once and expires in an hour. Opening it signs you in for
   90 days. An address in OWNER_EMAILS gets its account on first use. */

import { spawnSync } from 'node:child_process'
import { createHash, randomBytes } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'

const TTL = 60 * 60_000

const args = process.argv.slice(2)
const local = args.includes('--local')
const email = (args.find((a) => !a.startsWith('--')) ?? '').trim().toLowerCase()
/* Same rule as the Worker's normalizeEmail, and it keeps the SQL below safe. */
if (!/^[^\s@'"\\]+@[^\s@'"\\]+\.[^\s@'"\\]+$/.test(email) || email.length > 254) {
  console.error('Usage: npm run login-link -- you@example.com [--local]')
  process.exit(1)
}

function appUrl() {
  if (local) {
    const vars = existsSync('.dev.vars') ? readFileSync('.dev.vars', 'utf8') : ''
    return (vars.match(/^APP_URL=(.+)$/m)?.[1] ?? 'http://localhost:5173').trim()
  }
  const m = readFileSync('wrangler.jsonc', 'utf8').match(/"APP_URL"\s*:\s*"([^"]+)"/)
  if (!m) throw new Error('No APP_URL in wrangler.jsonc vars')
  return m[1]
}

const token = randomBytes(32).toString('base64url')
const hash = createHash('sha256').update(token).digest('hex')
const now = Date.now()
const sql =
  `INSERT INTO login_tokens (token_hash, email, created_at, expires_at) ` +
  `VALUES ('${hash}', '${email}', ${now}, ${now + TTL})`

/* Windows needs a shell to find npx, and a shell joins arguments unquoted.
   The SQL has no double quotes (the email check above refuses them). */
const win = process.platform === 'win32'
const cmd = ['wrangler', 'd1', 'execute', 'DB', local ? '--local' : '--remote', '--command', sql]
const stdio = /** @type {const} */ (['inherit', 'ignore', 'inherit'])
const r = win
  ? spawnSync(['npx', ...cmd.map((a) => (a.includes(' ') ? `"${a}"` : a))].join(' '), { stdio, shell: true })
  : spawnSync('npx', cmd, { stdio })
if (r.status !== 0) process.exit(r.status ?? 1)

console.log(`\nSign-in link for ${email} (one use, expires in an hour):\n\n  ${appUrl()}/?login=${token}\n`)
