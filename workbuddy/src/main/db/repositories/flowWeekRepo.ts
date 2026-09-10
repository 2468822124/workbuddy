import { getDb } from '../connection'
import { FlowWeekInstance } from '@shared/flowTypes'

function rowToInst(r: Record<string, unknown>): FlowWeekInstance {
  const row = r as unknown as FlowWeekInstance & { isDeleted: unknown }
  return { ...row, isDeleted: !!row.isDeleted }
}

export const flowWeekRepo = {
  listByWeek(weekStart: string): FlowWeekInstance[] {
    return getDb()
      .prepare('SELECT * FROM flow_week_instances WHERE weekStart = ? AND isDeleted = 0 ORDER BY sortOrder ASC, createdAt ASC, id ASC')
      .all(weekStart)
      .map((r: unknown) => rowToInst(r as Record<string, unknown>))
  },

  findById(id: number): FlowWeekInstance | undefined {
    const r = getDb().prepare('SELECT * FROM flow_week_instances WHERE id = ?').get(id)
    return r ? rowToInst(r as Record<string, unknown>) : undefined
  },

  /** 幂等判重：该周该固定任务是否已有未删实例 */
  existsByDef(weekStart: string, fixedDefId: number): boolean {
    return !!getDb().prepare(
      'SELECT 1 FROM flow_week_instances WHERE weekStart = ? AND fixedDefId = ? AND isDeleted = 0 LIMIT 1'
    ).get(weekStart, fixedDefId)
  },

  /** 阶段5：转下周幂等——同一 carriedFrom 源实例在目标周是否已有 active 承接实例 */
  findActiveByCarry(sourceId: number, weekStart: string): FlowWeekInstance | undefined {
    const r = getDb().prepare(
      'SELECT * FROM flow_week_instances WHERE carriedFrom = ? AND weekStart = ? AND isDeleted = 0 LIMIT 1'
    ).get(sourceId, weekStart)
    return r ? rowToInst(r as Record<string, unknown>) : undefined
  },

  /** R1 Fix1（U-3）：批量查 active 承接实例（只读展示用；空入参不发查询） */
  listActiveByCarriedFrom(sourceIds: number[]): FlowWeekInstance[] {
    if (sourceIds.length === 0) return []
    const placeholders = sourceIds.map(() => '?').join(',')
    return getDb()
      .prepare(`SELECT * FROM flow_week_instances WHERE carriedFrom IN (${placeholders}) AND isDeleted = 0`)
      .all(...sourceIds)
      .map((r: unknown) => rowToInst(r as Record<string, unknown>))
  },

  /** R3：停用固定定义时，读取生效周之后仍 active 的固定实例。 */
  listActiveByFixedDefAfter(fixedDefId: number, effectiveWeekStart: string): FlowWeekInstance[] {
    return getDb()
      .prepare(`
        SELECT * FROM flow_week_instances
        WHERE fixedDefId = ? AND origin = 'fixed' AND weekStart > ? AND isDeleted = 0
        ORDER BY weekStart ASC, sortOrder ASC, createdAt ASC, id ASC
      `)
      .all(fixedDefId, effectiveWeekStart)
      .map((r: unknown) => rowToInst(r as Record<string, unknown>))
  },

  create(data: Omit<FlowWeekInstance, 'id' | 'isDeleted' | 'deletedAt' | 'createdAt' | 'updatedAt'>): FlowWeekInstance {
    const now = new Date().toISOString()
    const r = getDb().prepare(`
      INSERT INTO flow_week_instances (weekStart, origin, fixedDefId, title, kind, targetCount, sortOrder, skippedAt, carriedFrom, isDeleted, deletedAt, createdAt, updatedAt)
      VALUES (@weekStart, @origin, @fixedDefId, @title, @kind, @targetCount, @sortOrder, @skippedAt, @carriedFrom, 0, NULL, @now, @now)
      RETURNING *
    `).get({
      ...data,
      fixedDefId: data.fixedDefId ?? null,
      skippedAt: data.skippedAt ?? null,
      carriedFrom: data.carriedFrom ?? null,
      now,
    }) as Record<string, unknown>
    return rowToInst(r)
  },

  update(id: number, data: Partial<Pick<FlowWeekInstance, 'title' | 'sortOrder' | 'skippedAt' | 'kind' | 'targetCount'>>): FlowWeekInstance | undefined {
    const existing = this.findById(id)
    if (!existing) return undefined
    const merged = { ...existing, ...data, updatedAt: new Date().toISOString() }
    getDb().prepare(`
      UPDATE flow_week_instances SET title=@title, sortOrder=@sortOrder, skippedAt=@skippedAt,
        kind=@kind, targetCount=@targetCount, updatedAt=@updatedAt
      WHERE id=@id
    `).run({ ...merged, skippedAt: merged.skippedAt ?? null })
    return this.findById(id)
  },

  /** 固定任务改名 → 同步本周未删实例标题（源头显式传播；历史周不追溯） */
  syncTitlesFromDef(fixedDefId: number, weekStart: string, title: string): number {
    const now = new Date().toISOString()
    const r = getDb().prepare(
      'UPDATE flow_week_instances SET title=?, updatedAt=? WHERE fixedDefId=? AND weekStart=? AND isDeleted=0'
    ).run(title, now, fixedDefId, weekStart)
    return r.changes
  },

  softDelete(id: number): boolean {
    const now = new Date().toISOString()
    const r = getDb().prepare(
      'UPDATE flow_week_instances SET isDeleted=1, deletedAt=?, updatedAt=? WHERE id=? AND isDeleted=0'
    ).run(now, now, id)
    return r.changes > 0
  },
}
