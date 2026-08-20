// ========================================
// 阶段6 · 步骤13：data.ts 白名单导入导出 roundtrip（规格 §5.5 / §8 步骤13）
// - 16 表白名单 roundtrip：保留表 + flow 表 FK 链导入后完整
// - 导出不包含旧表键；旧备份（含 plans 等）→ LEGACY_BACKUP_UNSUPPORTED 且原库不变
// - 非法表名 → IMPORT_FAILED；FK 违例 → 事务整体回滚（无半导入残留）
// ========================================

import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest'
import * as fs from 'fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { mockConnectionDb, resetDb } from './flowTestDb'
import { getDb } from '../src/main/db/connection'
import { exportAll, importAll, validatePayload } from '../src/main/services/data'
import { logger } from '../src/main/lib/logger'

// electron dialog mock → 固定临时文件路径
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

mockConnectionDb()

const TMP_FILE = path.join(os.tmpdir(), 'workbuddy-roundtrip-test.json')

/** 种子：项目 + 待办 + flow 周实例（自引用 carry） + 日条目（FK→实例）+ 月目标 + 周焦点（FK→月目标） */
function seedMixed() {
  const db = getDb()
  db.prepare(
    "INSERT INTO projects (id, name, status, isDeleted, createdAt, updatedAt) VALUES ('p1', '项目A', 'active', 0, '2026-08-01T00:00:00.000Z', '2026-08-01T00:00:00.000Z')",
  ).run()
  db.prepare(
    "INSERT INTO todos (id, content, status, projectId, isDeleted, createdAt, updatedAt) VALUES ('t1', '项目待办', 'todo', 'p1', 0, '2026-08-01T00:00:00.000Z', '2026-08-01T00:00:00.000Z')",
  ).run()
  db.prepare(
    "INSERT INTO flow_month_goals (id, month, title, isDeleted, createdAt, updatedAt) VALUES (1, '2026-08', '月目标', 0, '2026-08-01T00:00:00.000Z', '2026-08-01T00:00:00.000Z')",
  ).run()
  db.prepare(
    "INSERT INTO flow_week_instances (id, weekStart, origin, title, kind, targetCount, sortOrder, carriedFrom, isDeleted, createdAt, updatedAt) VALUES (1, '2026-08-10', 'fixed', '周实例A', 'once', 1, 0, NULL, 0, '2026-08-01T00:00:00.000Z', '2026-08-01T00:00:00.000Z')",
  ).run()
  db.prepare(
    "INSERT INTO flow_week_instances (id, weekStart, origin, title, kind, targetCount, sortOrder, carriedFrom, isDeleted, createdAt, updatedAt) VALUES (2, '2026-08-17', 'fixed', '周实例B', 'once', 1, 0, 1, 0, '2026-08-01T00:00:00.000Z', '2026-08-01T00:00:00.000Z')",
  ).run()
  db.prepare(
    "INSERT INTO flow_day_entries (id, date, title, source, locked, weekInstanceId, projectId, isDeleted, createdAt, updatedAt) VALUES (1, '2026-08-10', '日条目', 'rail', 0, 1, NULL, 0, '2026-08-01T00:00:00.000Z', '2026-08-01T00:00:00.000Z')",
  ).run()
  db.prepare(
    "INSERT INTO flow_week_focus (id, weekStart, title, monthGoalId, sortOrder, isDeleted, createdAt, updatedAt) VALUES (1, '2026-08-10', '周焦点', 1, 0, 0, '2026-08-01T00:00:00.000Z', '2026-08-01T00:00:00.000Z')",
  ).run()
}

function countRows(table: string): number {
  return (getDb().prepare(`SELECT COUNT(*) AS c FROM ${table}`).get() as { c: number }).c
}

describe('data.ts 白名单导入导出（规格 §5.5）', () => {
  beforeEach(() => {
    resetDb()
    if (fs.existsSync(TMP_FILE)) fs.unlinkSync(TMP_FILE)
  })

  afterAll(() => {
    if (fs.existsSync(TMP_FILE)) fs.unlinkSync(TMP_FILE)
  })

  it('① roundtrip：导出→清库→导入，计数与 FK 链完整', async () => {
    seedMixed()
    const r1 = await exportAll()
    expect(r1.ok).toBe(true)

    const payload = JSON.parse(fs.readFileSync(TMP_FILE, 'utf-8'))
    // 导出 16 表白名单；不导出旧表键
    expect(Object.keys(payload.tables).sort()).toEqual([
      'books', 'flow_day_entries', 'flow_fixed_defs', 'flow_journals', 'flow_month_goals',
      'flow_plan_templates', 'flow_vouchers', 'flow_week_focus', 'flow_week_instances',
      'inboxes', 'news_items', 'notes', 'projects', 'settings', 'todos', 'workout_logs',
    ])

    resetDb()
    const r2 = await importAll()
    expect(r2.ok).toBe(true)
    expect(r2.counts?.projects).toBe(1)
    expect(r2.counts?.todos).toBe(1)
    expect(r2.counts?.flow_week_instances).toBe(2)
    expect(r2.counts?.flow_day_entries).toBe(1)
    expect(r2.counts?.flow_week_focus).toBe(1)

    // FK 链完整：日条目 → 周实例；周焦点 → 月目标；实例 carry 自引用
    const entry = getDb().prepare('SELECT * FROM flow_day_entries WHERE id = 1').get() as { weekInstanceId: number }
    expect(entry.weekInstanceId).toBe(1)
    const focus = getDb().prepare('SELECT * FROM flow_week_focus WHERE id = 1').get() as { monthGoalId: number }
    expect(focus.monthGoalId).toBe(1)
    const carry = getDb().prepare('SELECT * FROM flow_week_instances WHERE id = 2').get() as { carriedFrom: number | null }
    expect(carry.carriedFrom).toBe(1)
    const todo = getDb().prepare('SELECT * FROM todos WHERE id = ?').get('t1') as { projectId: string }
    expect(todo.projectId).toBe('p1')
  })

  it('①b 库有存量数据时导入：DELETE 子先父（FK），导入成功且计数一致', async () => {
    seedMixed()
    expect((await exportAll()).ok).toBe(true)
    // 不 resetDb：库内已有 seed 数据 → 清库阶段撞 FK 即失败
    const r = await importAll()
    expect(r.ok).toBe(true)
    expect(r.counts?.projects).toBe(1)
    expect(r.counts?.flow_week_instances).toBe(2)
    expect(countRows('projects')).toBe(1)
    expect(countRows('flow_day_entries')).toBe(1)
  })

  it('② 旧备份（tables 含 plans）→ LEGACY_BACKUP_UNSUPPORTED，原库不变', async () => {
    seedMixed()
    expect((await exportAll()).ok).toBe(true)

    const payload = JSON.parse(fs.readFileSync(TMP_FILE, 'utf-8'))
    payload.tables.plans = []
    payload.tables.tasks = []
    fs.writeFileSync(TMP_FILE, JSON.stringify(payload), 'utf-8')

    const r = await importAll()
    expect(r.ok).toBe(false)
    expect((r as { code?: string }).code).toBe('LEGACY_BACKUP_UNSUPPORTED')
    // 原库不变（无部分导入）
    expect(countRows('projects')).toBe(1)
    expect(countRows('todos')).toBe(1)
    expect(countRows('flow_week_instances')).toBe(2)
  })

  it('③ 未知表名 → IMPORT_FAILED，原库不变', async () => {
    seedMixed()
    expect((await exportAll()).ok).toBe(true)

    const payload = JSON.parse(fs.readFileSync(TMP_FILE, 'utf-8'))
    payload.tables.hack_table = []
    fs.writeFileSync(TMP_FILE, JSON.stringify(payload), 'utf-8')

    const r = await importAll()
    expect(r.ok).toBe(false)
    expect(countRows('projects')).toBe(1)
  })

  it('④ FK 违例（日条目指向不存在的实例）→ 整体回滚，无半导入残留', async () => {
    seedMixed()
    expect((await exportAll()).ok).toBe(true)

    const payload = JSON.parse(fs.readFileSync(TMP_FILE, 'utf-8'))
    payload.tables.flow_day_entries[0].weekInstanceId = 999
    fs.writeFileSync(TMP_FILE, JSON.stringify(payload), 'utf-8')

    resetDb()
    const r = await importAll()
    expect(r.ok).toBe(false)
    // 事务回滚：此前已导入的表也无残留（规格 §5.5 原子性）
    expect(countRows('projects')).toBe(0)
    expect(countRows('todos')).toBe(0)
    expect(countRows('flow_week_instances')).toBe(0)
  })

  it('⑤ 载荷非对象/非数组行 → IMPORT_FAILED', async () => {
    seedMixed()
    expect((await exportAll()).ok).toBe(true)

    const payload = JSON.parse(fs.readFileSync(TMP_FILE, 'utf-8'))
    payload.tables.projects = [{ bad: 'x' }, 'not-an-object']
    fs.writeFileSync(TMP_FILE, JSON.stringify(payload), 'utf-8')

    const r = await importAll()
    expect(r.ok).toBe(false)
    expect(countRows('projects')).toBe(1) // 校验在 transaction 前，原库未被触碰
  })

  // ===== 阶段6修复批次 · F1：非对象 tables 载荷必须拒绝且库计数不变 =====
  // 根因：typeof [] === 'object' 使 {"version":1,"tables":[]} 通过预校验 → DELETE_ORDER 清空全部业务表
  it('⑥ tables 为数组 [] → IMPORT_FAILED，库计数不变', async () => {
    seedMixed()
    fs.writeFileSync(TMP_FILE, JSON.stringify({ version: 1, tables: [] }), 'utf-8')

    const r = await importAll()
    expect(r.ok).toBe(false)
    expect((r as { code?: string }).code).toBe('IMPORT_FAILED')
    // 修复前此载荷会清空全部业务表后返回 ok；修复后预校验拒绝，计数不变
    expect(countRows('projects')).toBe(1)
    expect(countRows('todos')).toBe(1)
    expect(countRows('flow_week_instances')).toBe(2)
  })

  it('⑦ tables 为 null → IMPORT_FAILED，库计数不变', async () => {
    seedMixed()
    fs.writeFileSync(TMP_FILE, JSON.stringify({ version: 1, tables: null }), 'utf-8')

    const r = await importAll()
    expect(r.ok).toBe(false)
    expect(countRows('projects')).toBe(1)
    expect(countRows('flow_week_instances')).toBe(2)
  })

  it('⑧ 异常原型 tables（Object.create(null)）→ validatePayload 拒绝', () => {
    // JSON.parse 产物原型恒为 Object.prototype；Object.create(null) 防御未来读取方式变化
    const protoLess = Object.create(null)
    protoLess.version = 1
    protoLess.tables = Object.create(null)
    const r = validatePayload(protoLess)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.code).toBe('IMPORT_FAILED')
  })

  // ===== 阶段6修复批次2 · F1：空/不完整 tables 对象载荷必须拒绝且库计数不变 =====
  // 根因（复审）：{"version":1,"tables":{}} 满足"非数组普通对象"校验 → 事务清空全部业务表后返回 ok
  it('⑩ tables 为空对象 {} → IMPORT_FAILED，库计数不变', async () => {
    seedMixed()
    fs.writeFileSync(TMP_FILE, JSON.stringify({ version: 1, tables: {} }), 'utf-8')

    const r = await importAll()
    expect(r.ok).toBe(false)
    expect((r as { code?: string }).code).toBe('IMPORT_FAILED')
    // 修复前此载荷会清空全部业务表后返回 ok；修复后 16 键完整性校验在 transaction 前拒绝
    expect(countRows('projects')).toBe(1)
    expect(countRows('todos')).toBe(1)
    expect(countRows('flow_week_instances')).toBe(2)
  })

  it('⑪ tables 缺少白名单表键 → IMPORT_FAILED，库计数不变', async () => {
    seedMixed()
    expect((await exportAll()).ok).toBe(true)

    const payload = JSON.parse(fs.readFileSync(TMP_FILE, 'utf-8'))
    delete payload.tables.projects
    delete payload.tables.flow_day_entries
    fs.writeFileSync(TMP_FILE, JSON.stringify(payload), 'utf-8')

    const r = await importAll()
    expect(r.ok).toBe(false)
    expect((r as { code?: string }).code).toBe('IMPORT_FAILED')
    expect(countRows('projects')).toBe(1)
    expect(countRows('flow_day_entries')).toBe(1)
  })

  // ===== 阶段6修复批次 · F4：导出日志不得记录完整文件路径（规格 §5.4 只记 counts/错误码） =====
  it('⑨ 导出日志脱敏：不输出 result.filePath，只记各表 counts', async () => {
    seedMixed()
    const infoSpy = vi.spyOn(logger, 'info')
    expect((await exportAll()).ok).toBe(true)

    // 任一日志参数（含对象序列化）都不包含用户文件路径（修复前 "Data exported to <full path>" 泄露）
    const anyArgHasPath = infoSpy.mock.calls.some(call =>
      call.some(arg => typeof arg === 'string' && arg.includes(TMP_FILE)),
    )
    expect(anyArgHasPath).toBe(false)
    // 新日志 = "Export done" + counts 对象（{ 表名: 行数 }）
    expect(infoSpy.mock.calls.some(call => call[0] === 'Export done')).toBe(true)
    const countsArg = infoSpy.mock.calls.find(call => call[0] === 'Export done')?.[1]
    expect(countsArg).toMatchObject({ projects: 1, todos: 1, flow_week_instances: 2 })
    infoSpy.mockRestore()
  })
})
