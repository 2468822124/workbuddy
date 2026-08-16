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
