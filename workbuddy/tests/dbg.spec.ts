import { describe, it, expect, beforeEach, vi } from 'vitest'
import { randomUUID } from 'node:crypto'
import { runMigrations } from '../src/main/db/migrate'
import { planRepo } from '../src/main/db/repositories/planRepo'
import { todoRepo } from '../src/main/db/repositories/todoRepo'
import { projectRepo } from '../src/main/db/repositories/projectRepo'
import { getDb } from '../src/main/db/connection'
vi.mock('../src/main/db/connection', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { DatabaseSync } = require('node:sqlite')
  const db = new DatabaseSync(':memory:')
  db.pragma = (sql: string) => db.prepare(sql.startsWith('PRAGMA') ? sql : `PRAGMA ${sql}`).all()
  db.transaction = (fn: () => void) => () => fn()
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
  return { getDb: () => db }
})
describe('dbg', () => {
  beforeEach(() => {
    const db = getDb()
    db.exec(`
      DROP TABLE IF EXISTS __schema_migrations; DROP TABLE IF EXISTS tasks; DROP TABLE IF EXISTS todos;
      DROP TABLE IF EXISTS plans; DROP TABLE IF EXISTS projects; DROP TABLE IF EXISTS reviews;
      DROP TABLE IF EXISTS settings; DROP TABLE IF EXISTS templates; DROP TABLE IF EXISTS news_items;
    `)
    runMigrations()
  })
  it('probe', () => {
    const pid = randomUUID()
    projectRepo.create({ id: pid, name: '测试项目', status: 'active', description: null, color: null, isDeleted: false, deletedAt: null })
    todoRepo.create({ id: 'a1b2c3d4e5f678', content: '写周报', status: 'todo', planDate: '2026-08-01', projectId: pid, sourcePlanId: null, parentTaskRef: null, isDeleted: false, deletedAt: null, completedAt: null })
    const before = todoRepo.findById('a1b2c3d4e5f678')
    console.log('BEFORE:', JSON.stringify({ id: before?.id, planDate: before?.planDate, projectId: before?.projectId, content: before?.content, isDeleted: before?.isDeleted }))
    const plan = planRepo.create({ id: randomUUID(), date: '2026-08-09', type: 'daily_plan', content: '- [ ] 写周报 <!-- tid:ddd555eee666 parent:a1b2c3d4e5f678 -->', generatedTodoIds: [], templateId: null })
    const r = planRepo.syncPlanTodos(plan.id)
    console.log('SYNC:', JSON.stringify({ synced: r.synced, generatedCount: r.generatedCount, error: r.error, orphanTodoIds: r.orphanTodoIds }))
    const after = todoRepo.findById('a1b2c3d4e5f678')
    console.log('AFTER:', JSON.stringify({ id: after?.id, planDate: after?.planDate, projectId: after?.projectId, content: after?.content, isDeleted: after?.isDeleted, ref: after?.parentTaskRef }))
    expect(true).toBe(true)
  })
})
