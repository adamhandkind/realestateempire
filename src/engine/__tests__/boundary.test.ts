/* Guards the line between "rules" and "browser". Everything on the rules side
   must be able to run inside a server with no DOM, no React and no clock —
   see engine/index.ts. A failure here names the file and the offending line. */

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

const SRC = join(__dirname, '..', '..')
const RULES_DIRS = ['engine', 'logic', 'data', 'state', 'city']
/** Browser-side on purpose: localStorage lives here. */
const ALLOWED = new Set(['state/save.ts'])

function walk(dir: string): string[] {
  let out: string[] = []
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) {
      if (name !== '__tests__') out = out.concat(walk(p))
    } else if (/\.tsx?$/.test(name)) out.push(p)
  }
  return out
}

const FORBIDDEN: [RegExp, string][] = [
  [/from ['"](react|react-dom)(\/[^'"]*)?['"]/, 'imports React'],
  [/from ['"]three(\/[^'"]*)?['"]/, 'imports three.js'],
  [/from ['"][./]*\/components\//, 'imports a component'],
  [/\bwindow\.[A-Za-z_]/, 'touches window'],
  [/\bdocument\.[A-Za-z_]/, 'touches document'],
  [/\blocalStorage\b/, 'touches localStorage'],
  [/\bDate\.now\(|\bnew Date\(/, 'reads the clock'],
  [/\bMath\.random\(/, 'uses Math.random (go through logic/rand)'],
]

/** Comments are prose; the rules apply to code. */
const stripComments = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')

describe('rules boundary', () => {
  const files = RULES_DIRS.flatMap((d) => {
    try {
      return walk(join(SRC, d))
    } catch {
      return []
    }
  })

  it('finds the rules files', () => {
    expect(files.length).toBeGreaterThan(40)
  })

  it('keeps the rules free of browser, React, clock and stray randomness', () => {
    const problems: string[] = []
    for (const f of files) {
      const rel = relative(SRC, f).replace(/\\/g, '/')
      if (ALLOWED.has(rel)) continue
      const lines = stripComments(readFileSync(f, 'utf8')).split('\n')
      lines.forEach((line, i) => {
        for (const [re, why] of FORBIDDEN) {
          if (rel === 'logic/rand.ts' && why.startsWith('uses Math.random')) continue
          if (re.test(line)) problems.push(`${rel}:${i + 1} ${why}`)
        }
      })
    }
    expect(problems).toEqual([])
  })
})
