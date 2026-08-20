import { vi } from 'vitest'
import { runMigrations } from '../src/main/db/migrate'
import { getDb } from '../src/main/db/connection'

/** 只读模式开关（阶段6：projectTasks IPC 的 READ_ONLY 分支测试需要） */
const { readonlyState } = vi.hoisted(() => ({ readonlyState: { on: false } }))

export function setReadonlyMode(on: boolean): void {
  readonlyState.on = on
}

/**
 * 阶段1 测试公共基座（非 spec 文件，vitest 不执行）：
 * - vi.mock connection → node:sqlite :memory:（better-sqlite3 ABI 为 Electron 130，
 *   node CLI 不兼容——同 planSync.spec 既有约束）
 * - prepare shim：named 参数宽松绑定（仅传 SQL 中出现的 @param）+ 数组 spread（对齐 better-sqlite3）
 * - transaction shim：真实 BEGIN/COMMIT/ROLLBACK（可测事务原子性，优于 planSync 的 no-op 版）
 */
export function mockConnectionDb(): void {
  vi.mock('../src/main/db/connection', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { DatabaseSync } = require('node:sqlite')
    const db = new DatabaseSync(':memory:')
    db.pragma = (sql: string) => db.prepare(sql.startsWith('PRAGMA') ? sql : `PRAGMA ${sql}`).all()
    db.transaction = (fn: () => void) => () => {
      db.exec('BEGIN')
      try {
        fn()
        db.exec('COMMIT')
      } catch (e) {
        db.exec('ROLLBACK')
        throw e
      }
    }

    const rawPrepare = db.prepare.bind(db)
    db.prepare = (sql: string) => {
      const stmt = rawPrepare(sql)
      const names = [...sql.matchAll(/@(\w+)/g)].map(m => m[1])
      const bindNamed = (a: unknown): unknown => {
        if (!names.length || typeof a !== 'object' || a === null) return a
        const out: Record<string, unknown> = {}
        for (const n of names) out[n] = (a as Record<string, unknown>)[n]
        return out
      }
      const bindArgs = (...args: unknown[]): unknown[] => {
        if (args.length === 1 && typeof args[0] === 'object' && args[0] !== null && !Array.isArray(args[0])) {
          return [bindNamed(args[0])]
        }
        return args
      }
      const origGet = stmt.get.bind(stmt)
      const origAll = stmt.all.bind(stmt)
      const origRun = stmt.run.bind(stmt)
      stmt.get = (...args: unknown[]) => origGet(...bindArgs(...args))
      stmt.all = (...args: unknown[]) => origAll(...bindArgs(...args))
      stmt.run = (...args: unknown[]) => origRun(...bindArgs(...args))
      return stmt
    }
    return { getDb: () => db, isReadonlyMode: () => readonlyState.on }
  })
}

/** 全量清库 + 重建 schema（0001-0009）；索引随表 drop 自动清理。
 * 注意：node:sqlite 默认 foreign_keys=ON（与 better-sqlite3 默认 OFF 相反），
 * DROP 父表撞子表 FK → 必须先关 FK 再清库（清库非业务路径，无安全隐患）。 */
export function resetDb(): void {
  const db = getDb()
  db.exec('PRAGMA foreign_keys = OFF')
  const tables = db.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
  ).all() as { name: string }[]
  for (const t of tables) {
    db.exec(`DROP TABLE IF EXISTS "${t.name}"`)
  }
  db.exec('PRAGMA foreign_keys = ON')
  runMigrations()
}

// 固定测试日期（2026-08-14 为周五 ⇒ 8-10 为周一）
export const MONDAY = '2026-08-10'
export const TUESDAY = '2026-08-11'
export const WEDNESDAY = '2026-08-12'
export const THURSDAY = '2026-08-13'
export const FRIDAY = '2026-08-14'
export const NEXT_MONDAY = '2026-08-17'
