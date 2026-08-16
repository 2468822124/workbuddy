import { getDb } from '../connection'
import { FlowDayEntry } from '@shared/flowTypes'

function rowToEntry(r: Record<string, unknown>): FlowDayEntry {
  const row = r as unknown as FlowDayEntry & { isDeleted: unknown; locked: unknown }
  return { ...row, isDeleted: !!row.isDeleted, locked: !!row.locked }
}

export const flowDayRepo = {
  listByDate(date: string): FlowDayEntry[] {
    return getDb()
      .prepare('SELECT * FROM flow_day_entries WHERE date = ? AND isDeleted = 0 ORDER BY createdAt ASC, id ASC')
      .all(date)
      .map((r: unknown) => rowToEntry(r as Record<string, unknown>))
  },

  findByInstance(weekInstanceId: number): FlowDayEntry[] {
    return getDb()
      .prepare('SELECT * FROM flow_day_entries WHERE weekInstanceId = ? AND isDeleted = 0 ORDER BY date ASC, id ASC')
      .all(weekInstanceId)
      .map((r: unknown) => rowToEntry(r as Record<string, unknown>))
  },

  findByInstanceIds(ids: number[]): FlowDayEntry[] {
    if (ids.length === 0) return []
    const placeholders = ids.map(() => '?').join(',')
    return getDb()
      .prepare(`SELECT * FROM flow_day_entries WHERE weekInstanceId IN (${placeholders}) AND isDeleted = 0 ORDER BY date ASC, id ASC`)
      .all(...ids)
      .map((r: unknown) => rowToEntry(r as Record<string, unknown>))
  },

  /**
   * 顺延候选（读时派生用）：早于给定日期、未删、未跳过、自由行、非提醒。
   * 「未完成」属业务判定（凭据池），由 flowDerived 过滤——仓储不做业务判断。
   */
  listDeferredCandidates(beforeDate: string): FlowDayEntry[] {
    return getDb().prepare(`
      SELECT * FROM flow_day_entries
      WHERE date < ? AND isDeleted = 0 AND locked = 0 AND source != 'reminder' AND skippedAt IS NULL
      ORDER BY date ASC, createdAt ASC, id ASC
    `).all(beforeDate).map((r: unknown) => rowToEntry(r as Record<string, unknown>))
  },

  findById(id: number): FlowDayEntry | undefined {
    const r = getDb().prepare('SELECT * FROM flow_day_entries WHERE id = ?').get(id)
    return r ? rowToEntry(r as Record<string, unknown>) : undefined
  },

  create(data: Omit<FlowDayEntry, 'id' | 'isDeleted' | 'deletedAt' | 'createdAt' | 'updatedAt'>): FlowDayEntry {
    const now = new Date().toISOString()
    const r = getDb().prepare(`
      INSERT INTO flow_day_entries (date, title, source, locked, weekInstanceId, projectId, reminderKey, templateId, note, skippedAt, isDeleted, deletedAt, createdAt, updatedAt)
      VALUES (@date, @title, @source, @locked, @weekInstanceId, @projectId, @reminderKey, @templateId, @note, @skippedAt, 0, NULL, @now, @now)
      RETURNING *
    `).get({
      ...data,
      locked: data.locked ? 1 : 0,
      weekInstanceId: data.weekInstanceId ?? null,
      projectId: data.projectId ?? null,
      reminderKey: data.reminderKey ?? null,
      templateId: data.templateId ?? null,
      note: data.note ?? null,
      skippedAt: data.skippedAt ?? null,
      now,
    }) as Record<string, unknown>
    return rowToEntry(r)
  },

  update(id: number, data: Partial<Pick<FlowDayEntry, 'title' | 'date' | 'note' | 'skippedAt'>>): FlowDayEntry | undefined {
    const existing = this.findById(id)
    if (!existing) return undefined
    const merged = { ...existing, ...data, updatedAt: new Date().toISOString() }
    getDb().prepare(`
      UPDATE flow_day_entries SET title=@title, date=@date, note=@note, skippedAt=@skippedAt, updatedAt=@updatedAt
      WHERE id=@id
    `).run({ ...merged, note: merged.note ?? null, skippedAt: merged.skippedAt ?? null })
    return this.findById(id)
  },

  softDelete(id: number): boolean {
    const now = new Date().toISOString()
    const r = getDb().prepare(
      'UPDATE flow_day_entries SET isDeleted=1, deletedAt=?, updatedAt=? WHERE id=? AND isDeleted=0'
    ).run(now, now, id)
    return r.changes > 0
  },

  /** 周任务删除 → 其全部未删安排行软删（回 rail 语义由派生自然实现） */
  softDeleteByInstance(weekInstanceId: number): number {
    const now = new Date().toISOString()
    const r = getDb().prepare(
      'UPDATE flow_day_entries SET isDeleted=1, deletedAt=?, updatedAt=? WHERE weekInstanceId=? AND isDeleted=0'
    ).run(now, now, weekInstanceId)
    return r.changes
  },
}
