import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest'
import { randomUUID } from 'node:crypto'
import * as fs from 'fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { runMigrations } from '../src/main/db/migrate'
import { getDb } from '../src/main/db/connection'
import { planRepo } from '../src/main/db/repositories/planRepo'
import { taskRepo } from '../src/main/db/repositories/taskRepo'
import { exportAll, importAll } from '../src/main/services/data'

// 审查MED-1 roundtrip 测试：tasks 自引用 FK 要求导入父先子后。
// - electron dialog mock → 固定临时文件路径（exportAll/importAll 内部 dialog 调用）
// - connection mock 同 planSync.spec（node:sqlite in-memory），且显式 `PRAGMA foreign_keys = ON`
//   —— 镜像 production connection.ts（真实 FK 立即检查），否则 FK 违例在测试里静默通过。
vi.mock('electron', () => {
  const os = require('node:os')
  const path = require('node:path')
  return {
    dialog: {
      showSaveDialog: async () => ({
        canceled: false,
        filePath: path.join(os.tmpdir(), 'workbuddy-roundtrip-test.json'),
      }),
      showOpenDialog: async () => ({
        canceled: false,
        filePaths: [path.join(os.tmpdir(), 'workbuddy-roundtrip-test.json')],
      }),
    },
  }
})

vi.mock('../src/main/db/connection', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { DatabaseSync } = require('node:sqlite')
  const db = new DatabaseSync(':memory:')
  db.pragma = (sql: string) => db.prepare(sql.startsWith('PRAGMA') ? sql : `PRAGMA ${sql}`).all()
  // 镜像 better-sqlite3 事务：BEGIN/COMMIT/ROLLBACK（简单包裹，无嵌套/保存点；roundtrip 原子性断言依赖）
  db.transaction = (fn: () => void) => () => {
    db.exec('BEGIN')
    try {
      const r = fn()
      db.exec('COMMIT')
      return r
    } catch (e: unknown) {
      db.exec('ROLLBACK')
      throw e
    }
  }
  db.exec('PRAGMA foreign_keys = ON') // 镜像 connection.ts：FK 立即检查

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

const TMP_FILE = path.join(os.tmpdir(), 'workbuddy-roundtrip-test.json')

function wipeAndMigrate() {
  const db = getDb()
  db.exec(`
    DROP TABLE IF EXISTS __schema_migrations;
    DROP TABLE IF EXISTS tasks;
    DROP TABLE IF EXISTS todos;
    DROP TABLE IF EXISTS plans;
    DROP TABLE IF EXISTS projects;
    DROP TABLE IF EXISTS reviews;
    DROP TABLE IF EXISTS settings;
    DROP TABLE IF EXISTS templates;
    DROP TABLE IF EXISTS news_items;
    DROP TABLE IF EXISTS notes;
    DROP TABLE IF EXISTS books;
    DROP TABLE IF EXISTS workout_logs;
  `)
  runMigrations()
}

/** 造三级链（月→周→日）：parentTaskId 自引用 FK 链。 */
function seedThreeLevelChain(): { monthly: { id: string }; weekly: { id: string }; daily: { id: string } } {
  const monthly = planRepo.create({
    id: randomUUID(), date: '2026-08-01', type: 'monthly_plan',
    content: '- [ ] 月目标 <!-- tid:aaa111000111 -->', generatedTodoIds: [], templateId: null,
  })
  const weekly = planRepo.create({
    id: randomUUID(), date: '2026-08-03', type: 'weekly_plan',
    content: '- [ ] 周任务 <!-- tid:bbb222000222 parent:aaa111000111 -->', generatedTodoIds: [], templateId: null,
  })
  const daily = planRepo.create({
    id: randomUUID(), date: '2026-08-10', type: 'daily_plan',
    content: '- [ ] 日任务 <!-- tid:ccc333000333 parent:bbb222000222 -->', generatedTodoIds: [], templateId: null,
  })
  taskRepo.upsert({ tid: 'aaa111000111', planId: monthly.id, content: '月目标', parentTaskId: null, consumed: false, sortOrder: 0 })
  taskRepo.upsert({ tid: 'bbb222000222', planId: weekly.id, content: '周任务', parentTaskId: 'aaa111000111', consumed: false, sortOrder: 0 })
  taskRepo.upsert({ tid: 'ccc333000333', planId: daily.id, content: '日任务', parentTaskId: 'bbb222000222', consumed: false, sortOrder: 0 })
  return { monthly, weekly, daily }
}

describe('data.ts 导入导出 roundtrip（审查MED-1：tasks 自引用 FK 顺序）', () => {
  beforeEach(() => {
    wipeAndMigrate()
    if (fs.existsSync(TMP_FILE)) fs.unlinkSync(TMP_FILE)
  })

  afterAll(() => {
    if (fs.existsSync(TMP_FILE)) fs.unlinkSync(TMP_FILE)
  })

  it('① 三级链（月→周→日）导出显式父先序，导入新库链完整（规格 §7 往返一致）', async () => {
    seedThreeLevelChain()
    const r1 = await exportAll()
    expect(r1.ok).toBe(true)
    expect(fs.existsSync(TMP_FILE)).toBe(true)

    // 导出文件里 tasks 必须父先（顶层 parentTaskId IS NULL 排前）—— 显式拓扑序，非 rowid 运气
    const payload = JSON.parse(fs.readFileSync(TMP_FILE, 'utf-8'))
    const tids = (payload.tables.tasks as { tid: string }[]).map(t => t.tid)
    expect(tids[0]).toBe('aaa111000111') // 顶层父任务必在首位
    expect(new Set(tids)).toEqual(new Set(['aaa111000111', 'bbb222000222', 'ccc333000333']))

    // 导入到全新库 → 三计划 + 三任务 + FK 链完整（无 FOREIGN KEY constraint failed）
    wipeAndMigrate()
    const r2 = await importAll()
    expect(r2.ok).toBe(true)
    expect(r2.counts?.tasks).toBe(3)
    expect(r2.counts?.plans).toBe(3)
    const c = taskRepo.findByTid('ccc333000333')
    expect(c?.parentTaskId).toBe('bbb222000222')
    expect(taskRepo.findByTid('bbb222000222')?.parentTaskId).toBe('aaa111000111')
    expect(taskRepo.findByTid('aaa111000111')?.parentTaskId).toBeNull()
  })

  it('② 乱序（子先父后）导入 → FK 违例，整体回滚（证明 ORDER BY 必要性）', async () => {
    seedThreeLevelChain()
    expect((await exportAll()).ok).toBe(true)

    // 篡改：tasks 数组逆序（子先父后）—— 模拟无 ORDER BY 导出 + 底层序被打乱
    const payload = JSON.parse(fs.readFileSync(TMP_FILE, 'utf-8'))
    payload.tables.tasks.reverse()
    fs.writeFileSync(TMP_FILE, JSON.stringify(payload), 'utf-8')

    wipeAndMigrate()
    const r = await importAll()
    expect(r.ok).toBe(false)
    expect(r.message).toContain('FOREIGN KEY constraint failed')
    // 事务整体回滚：失败后库内无残留半导入
    expect(taskRepo.findByPlan(planRepo.findByDate('2026-08-01')?.id ?? 'none')).toHaveLength(0)
    expect(planRepo.findByDate('2026-08-01')).toBeUndefined()
  })
})
