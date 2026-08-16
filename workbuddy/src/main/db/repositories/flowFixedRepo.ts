import { getDb } from '../connection'
import { FlowFixedDef } from '@shared/flowTypes'

// 行映射：DB isDeleted 0/1 → boolean（读路径统一转换，杜绝"number 当 boolean 用"）
function rowToDef(r: Record<string, unknown>): FlowFixedDef {
  return { ...(r as unknown as FlowFixedDef), isDeleted: !!(r as { isDeleted: unknown }).isDeleted }
}

export const flowFixedRepo = {
  listActive(): FlowFixedDef[] {
    return getDb()
      .prepare('SELECT * FROM flow_fixed_defs WHERE isDeleted = 0 ORDER BY createdAt ASC, id ASC')
      .all()
      .map((r: unknown) => rowToDef(r as Record<string, unknown>))
  },

  findById(id: number): FlowFixedDef | undefined {
    const r = getDb().prepare('SELECT * FROM flow_fixed_defs WHERE id = ?').get(id)
    return r ? rowToDef(r as Record<string, unknown>) : undefined
  },

  create(data: Omit<FlowFixedDef, 'id' | 'isDeleted' | 'deletedAt' | 'createdAt' | 'updatedAt'>): FlowFixedDef {
    const now = new Date().toISOString()
    const r = getDb().prepare(`
      INSERT INTO flow_fixed_defs (title, kind, targetCount, weekdayMask, recurrence, note, isDeleted, deletedAt, createdAt, updatedAt)
      VALUES (@title, @kind, @targetCount, @weekdayMask, @recurrence, @note, 0, NULL, @now, @now)
      RETURNING *
    `).get({ ...data, note: data.note ?? null, now }) as Record<string, unknown>
    return rowToDef(r)
  },

  update(id: number, data: Partial<Pick<FlowFixedDef, 'title' | 'kind' | 'targetCount' | 'weekdayMask' | 'note'>>): FlowFixedDef | undefined {
    const existing = this.findById(id)
    if (!existing) return undefined
    const merged = { ...existing, ...data, updatedAt: new Date().toISOString() }
    getDb().prepare(`
      UPDATE flow_fixed_defs SET title=@title, kind=@kind, targetCount=@targetCount,
        weekdayMask=@weekdayMask, note=@note, updatedAt=@updatedAt
      WHERE id=@id
    `).run({ ...merged, note: merged.note ?? null })
    return this.findById(id)
  },

  softDelete(id: number): boolean {
    const now = new Date().toISOString()
    const r = getDb().prepare(
      'UPDATE flow_fixed_defs SET isDeleted=1, deletedAt=?, updatedAt=? WHERE id=? AND isDeleted=0'
    ).run(now, now, id)
    return r.changes > 0
  },
}
