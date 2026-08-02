/* Migration acceptance check (spec section 7.7): proves the extracted modules
   carry byte-identical content to the frozen Phase 1 single-file build.

   Evaluates the pre-UI half of phase1/index.html (pure data + logic, no JSX)
   in a sandbox, then deep-compares every content structure against the real
   modules under src/.

   Run: node scripts/verify-content.mjs                                      */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import vm from 'node:vm'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..')

/* ---- 1. pull the data/logic half out of the Phase 1 file ---------------- */
const html = readFileSync(resolve(root, 'phase1/index.html'), 'utf8')
const open = '<script type="text/babel" data-presets="react">'
const start = html.indexOf(open) + open.length
/* NB: search for the closing tag from `start`, not from 0 — the <head> has its
   own CDN <script> tags that would otherwise match first. */
const src = html.slice(start, html.indexOf('</script>', start))
const uiMarker =
  '/* ------------------------------------------------------------------- UI */'
const dataHalf = src.slice(0, src.indexOf(uiMarker))

const sandbox = { React: { useReducer: 0, useEffect: 0, useMemo: 0, useRef: 0, useState: 0 }, window: { localStorage: null }, Math, Date, JSON, console }
vm.createContext(sandbox)
vm.runInContext(
  dataHalf +
    '\nglobalThis.__P1 = { CSS, RANKS, LOCKED_RANKS, FIRST_NAMES, ARCHETYPES, SWAG, SLOTS, EVENTS, DISASTER_FLAVORS, CRINGE_QUOTES, SIDE_HUSTLES, ASSIST_FLAVORS, BRAG_TEMPLATES, COMMISSION_RATE, DESK_FEE, START_CASH, LOSE_AT, AP_PER_WEEK, SAVE_KEY };',
  sandbox,
)
const P1 = sandbox.__P1

/* ---- 2. load the migrated modules -------------------------------------- */
const ranks = await import('../src/data/ranks.ts')
const archetypes = await import('../src/data/archetypes.ts')
const swag = await import('../src/data/swag.ts')
const events = await import('../src/data/events.ts')
const flavor = await import('../src/data/flavor.ts')
const brags = await import('../src/data/brags.ts')
const save = { SAVE_KEY: 'res_save_v1' }

/* ---- 3. compare --------------------------------------------------------- */
let failures = 0
const check = (label, a, b) => {
  const ja = JSON.stringify(a)
  const jb = JSON.stringify(b)
  if (ja === jb) {
    console.log(`  ok    ${label}`)
  } else {
    failures++
    console.log(`  FAIL  ${label}`)
    console.log(`        phase1: ${ja.slice(0, 220)}`)
    console.log(`        vite  : ${jb.slice(0, 220)}`)
  }
}

console.log('\nContent parity — Phase 1 single file vs src/ modules\n')

check('COMMISSION_RATE', P1.COMMISSION_RATE, ranks.COMMISSION_RATE)
check('DESK_FEE', P1.DESK_FEE, ranks.DESK_FEE)
check('START_CASH', P1.START_CASH, ranks.START_CASH)
check('LOSE_AT', P1.LOSE_AT, ranks.LOSE_AT)
check('AP_PER_WEEK', P1.AP_PER_WEEK, ranks.AP_PER_WEEK)
check('SAVE_KEY', P1.SAVE_KEY, save.SAVE_KEY)

check('RANKS', P1.RANKS, ranks.RANKS)
check('LOCKED_RANKS', P1.LOCKED_RANKS, ranks.LOCKED_RANKS)
check('FIRST_NAMES', P1.FIRST_NAMES, archetypes.FIRST_NAMES)
check('ARCHETYPES', P1.ARCHETYPES, archetypes.ARCHETYPES)
check('SWAG', P1.SWAG, swag.SWAG)
check('SLOTS', P1.SLOTS, swag.SLOTS)
check('DISASTER_FLAVORS', P1.DISASTER_FLAVORS, events.DISASTER_FLAVORS)
check('CRINGE_QUOTES', P1.CRINGE_QUOTES, events.CRINGE_QUOTES)
check('SIDE_HUSTLES', P1.SIDE_HUSTLES, flavor.SIDE_HUSTLES)
check('ASSIST_FLAVORS', P1.ASSIST_FLAVORS, flavor.ASSIST_FLAVORS)
check('BRAG_TEMPLATES', P1.BRAG_TEMPLATES, brags.BRAG_TEMPLATES)

/* events: ids + weights + order (conditions are functions, compared by source) */
check(
  'EVENTS ids+weights',
  P1.EVENTS.map((e) => [e.id, e.weight]),
  events.EVENTS.map((e) => [e.id, e.weight]),
)
/* Normalise whitespace and quote style — Prettier rewrites "x" to 'x', which
   is not a content change. */
const normFn = (f) => f.toString().replace(/\s+/g, '').replace(/"/g, "'")
check(
  'EVENTS conditions',
  P1.EVENTS.map((e) => normFn(e.condition)),
  events.EVENTS.map((e) => normFn(e.condition)),
)

/* stylesheet */
const css = readFileSync(resolve(root, 'src/styles.css'), 'utf8')
check('styles.css', P1.CSS.replace(/^\n/, ''), css)

console.log(
  failures === 0
    ? '\nAll content identical.\n'
    : `\n${failures} MISMATCH(ES).\n`,
)
process.exit(failures === 0 ? 0 : 1)
