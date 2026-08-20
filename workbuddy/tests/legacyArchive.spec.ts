// ========================================
// 阶段6 · 步骤11：旧表归档与物理清理单测（规格 §8 步骤11 / §5.4）
// - 备份文件 payload 结构与计数
// - 事务性 DROP：四表清除、保留表不受影响、幂等 NO_LEGACY_TABLES
// - 写失败 → ARCHIVE_FAILED 且不 DROP、无 .tmp 残留
// - 部分表存在 → 只归档现存表
// ========================================

import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest'
import * as fs from 'fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { mockConnectionDb, resetDb } from './flowTestDb'
import { getDb } from '../src/main/db/connection'
import { archiveLegacy } from '../src/main/services/legacyArchive'
import { logger } from '../src/main/lib/logger'

mockConnectionDb()
vi.spyOn(logger, 'error').mockImplementation(() => {})
vi.spyOn(logger, 'info').mockImplementation(() => {})

const TMP_FILE = path.join(os.tmpdir(), 'workbuddy-legacy-archive-test.json')

function seedLegacyRows(): { plans: number; tasks: number; templates: number; reviews: number } {
  const db = getDb()
  db.prepare(
    "INSERT INTO plans (id, date, type, content, generatedTodoIds, templateId, createdAt) VALUES ('p1', '2026-08-01', 'monthly_plan', '月计划正文', '[]', NULL, '2026-08-01T00:00:00.000Z')",
  ).run()
  db.prepare(
    "INSERT INTO tasks (tid, planId, content, parentTaskId, consumed, sortOrder) VALUES ('t1', 'p1', '月任务正文', NULL, 0, 0)",
  ).run()
  db.prepare(
    "INSERT INTO templates (id, name, type, content, isDefault) VALUES ('tpl1', '默认', 'weekly_plan', '模板正文', 1)",
  ).run()
  db.prepare(
    "INSERT INTO reviews (id, date, type, content, linkedProjectIds) VALUES ('r1', '2026-08-09', 'weekly_review', '复盘正文', '[]')",
  ).run()
  return { plans: 1, tasks: 1, templates: 1, reviews: 1 }
}

function legacyTables(): string[] {
  return (
    getDb()
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('plans','tasks','templates','reviews')")
      .all() as { name: string }[]
  ).map(r => r.name)
}

describe('legacyArchive 旧表归档', () => {
  beforeEach(() => {
    resetDb()
    if (fs.existsSync(TMP_FILE)) fs.unlinkSync(TMP_FILE)
  })

  afterAll(() => {
    if (fs.existsSync(TMP_FILE)) fs.unlinkSync(TMP_FILE)
  })

  it('① 归档成功：payload 结构正确、四表 DROP、保留表不受影响', () => {
    seedLegacyRows()
    const r = archiveLegacy(TMP_FILE)

    expect(r.ok).toBe(true)
    expect(r.path).toBe(TMP_FILE)
    expect(r.counts).toEqual({ plans: 1, tasks: 1, templates: 1, reviews: 1 })

    // payload 结构（规格 §5.4）：version/kind/exportedAt/tables/counts，行是原始列
    const payload = JSON.parse(fs.readFileSync(TMP_FILE, 'utf-8'))
    expect(payload.version).toBe(1)
    expect(payload.kind).toBe('workbuddy-legacy-archive')
    expect(typeof payload.exportedAt).toBe('string')
    expect(payload.counts).toEqual({ plans: 1, tasks: 1, templates: 1, reviews: 1 })
    expect(payload.tables.plans[0]).toMatchObject({ id: 'p1', content: '月计划正文' })
    expect(payload.tables.tasks[0]).toMatchObject({ tid: 't1', planId: 'p1' })
    expect(payload.tables.reviews[0]).toMatchObject({ id: 'r1' })

    // DROP 后：四张旧表不存在
    expect(legacyTables()).toEqual([])
    // 保留表不受影响
    const kept = getDb().prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('projects','todos','settings','flow_week_instances')",
    ).all() as { name: string }[]
    expect(kept.map(r => r.name).sort()).toEqual(['flow_week_instances', 'projects', 'settings', 'todos'])
  })

  it('② 幂等：清理成功后再次触发 → NO_LEGACY_TABLES，不建文件', () => {
    seedLegacyRows()
    expect(archiveLegacy(TMP_FILE).ok).toBe(true)
    if (fs.existsSync(TMP_FILE)) fs.unlinkSync(TMP_FILE)

    const r = archiveLegacy(TMP_FILE)
    expect(r.ok).toBe(false)
    expect(r.code).toBe('NO_LEGACY_TABLES')
    expect(fs.existsSync(TMP_FILE)).toBe(false)
  })

  it('③ 写失败：目标路径不可写 → ARCHIVE_FAILED、四表保留、无 .tmp 残留', () => {
    seedLegacyRows()
    const badPath = path.join(os.tmpdir(), 'no-such-dir-xyz', 'archive.json')
    const r = archiveLegacy(badPath)

    expect(r.ok).toBe(false)
    expect(r.code).toBe('ARCHIVE_FAILED')
    expect(legacyTables().sort()).toEqual(['plans', 'reviews', 'tasks', 'templates'])
    expect(fs.existsSync(`${badPath}.tmp`)).toBe(false)
  })

  it('④ 部分表存在：只归档现存表，counts 对缺失表记 0', () => {
    seedLegacyRows()
    getDb().exec('DROP TABLE templates')
    getDb().exec('DROP TABLE reviews')

    const r = archiveLegacy(TMP_FILE)
    expect(r.ok).toBe(true)
    expect(r.counts).toEqual({ plans: 1, tasks: 1, templates: 0, reviews: 0 })

    const payload = JSON.parse(fs.readFileSync(TMP_FILE, 'utf-8'))
    expect(Object.keys(payload.tables).sort()).toEqual(['plans', 'tasks'])
    expect(payload.counts).toEqual({ plans: 1, tasks: 1, templates: 0, reviews: 0 })
    expect(legacyTables()).toEqual([])
  })

  it('⑤ 空表也存在（无数据）→ 可归档，counts 全 0，仍执行 DROP', () => {
    // resetDb 后四张旧表存在但无数据
    const r = archiveLegacy(TMP_FILE)
    expect(r.ok).toBe(true)
    expect(r.counts).toEqual({ plans: 0, tasks: 0, templates: 0, reviews: 0 })
    expect(legacyTables()).toEqual([])
  })
})
