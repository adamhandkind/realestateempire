/* Just enough of D1's API, on Node's built-in SQLite, to run the Worker's
   handlers in vitest against the real migration files. D1 is SQLite too, so
   the SQL is the same SQL production runs. */

import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'

type Param = string | number | bigint | null

class Stmt {
  db: DatabaseSync
  sql: string
  params: Param[] = []
  constructor(db: DatabaseSync, sql: string) {
    this.db = db
    this.sql = sql
  }
  bind(...params: unknown[]): Stmt {
    const s = new Stmt(this.db, this.sql)
    s.params = params.map((p) => {
      if (p === undefined) throw new Error('D1 cannot bind undefined: ' + this.sql)
      if (typeof p === 'boolean') throw new Error('bind 1/0, not booleans: ' + this.sql)
      return p as Param
    })
    return s
  }
  async first<T>(): Promise<T | null> {
    const row = this.db.prepare(this.sql).get(...this.params)
    return row ? ({ ...row } as T) : null
  }
  async all<T>(): Promise<{ results: T[] }> {
    return { results: this.db.prepare(this.sql).all(...this.params).map((r) => ({ ...r }) as T) }
  }
  async run(): Promise<{ meta: { changes: number } }> {
    const r = this.db.prepare(this.sql).run(...this.params)
    return { meta: { changes: Number(r.changes) } }
  }
}

export function makeD1() {
  const db = new DatabaseSync(':memory:')
  db.exec('PRAGMA foreign_keys = ON')
  const dir = join(__dirname, '..', '..', 'migrations')
  for (const f of readdirSync(dir).filter((f) => f.endsWith('.sql')).sort())
    db.exec(readFileSync(join(dir, f), 'utf8'))
  return {
    raw: db,
    prepare: (sql: string) => new Stmt(db, sql),
    async batch(stmts: Stmt[]) {
      db.exec('BEGIN')
      try {
        const out = []
        for (const s of stmts) out.push(await s.run())
        db.exec('COMMIT')
        return out
      } catch (e) {
        db.exec('ROLLBACK')
        throw e
      }
    },
  }
}
