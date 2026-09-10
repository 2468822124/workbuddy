import { getDb } from '../connection'
import { FlowMonthGoal, FlowWeekFocus } from '@shared/flowTypes'

function rowToGoal(r: Record<string, unknown>): FlowMonthGoal {
  const row = r as unknown as FlowMonthGoal & { isDeleted: unknown }
  return { ...row, isDeleted: !!row.isDeleted }
}

function rowToFocus(r: Record<string, unknown>): FlowWeekFocus {
  const row = r as unknown as FlowWeekFocus & { isDeleted: unknown }
  return { ...row, isDeleted: !!row.isDeleted }
}

// 月目标 + 周核心推进目标（同一仓储，两实体各管各）
export const flowGoalRepo = {
  // ===== 月目标 =====
  listMonthGoals(month: string): FlowMonthGoal[] {
    return getDb()
      .prepare('SELECT * FROM flow_month_goals WHERE month = ? AND isDeleted = 0 ORDER BY createdAt ASC, id ASC')
      .all(month)
      .map((r: unknown) => rowToGoal(r as Record<string, unknown>))
  },

  findGoalById(id: number): FlowMonthGoal | undefined {
    const r = getDb().prepare('SELECT * FROM flow_month_goals WHERE id = ?').get(id)
    return r ? rowToGoal(r as Record<string, unknown>) : undefined
  },

  createGoal(data: Omit<FlowMonthGoal, 'id' | 'isDeleted' | 'deletedAt' | 'createdAt' | 'updatedAt'>): FlowMonthGoal {
    const now = new Date().toISOString()
    const r = getDb().prepare(`
      INSERT INTO flow_month_goals (month, title, closedAt, isDeleted, deletedAt, createdAt, updatedAt)
      VALUES (@month, @title, @closedAt, 0, NULL, @now, @now)
      RETURNING *
    `).get({ ...data, closedAt: data.closedAt ?? null, now }) as Record<string, unknown>
    return rowToGoal(r)
  },

  updateGoal(id: number, data: Partial<Pick<FlowMonthGoal, 'title' | 'closedAt'>>): FlowMonthGoal | undefined {
    const existing = this.findGoalById(id)
    if (!existing) return undefined
    const merged = { ...existing, ...data, updatedAt: new Date().toISOString() }
    getDb().prepare(`
      UPDATE flow_month_goals SET title=@title, closedAt=@closedAt, updatedAt=@updatedAt WHERE id=@id
    `).run({ ...merged, closedAt: merged.closedAt ?? null })
    return this.findGoalById(id)
  },

  softDeleteGoal(id: number): boolean {
    const now = new Date().toISOString()
    const r = getDb().prepare(
      'UPDATE flow_month_goals SET isDeleted=1, deletedAt=?, updatedAt=? WHERE id=? AND isDeleted=0'
    ).run(now, now, id)
    return r.changes > 0
  },

  // ===== 周核心推进目标 =====
  listFocusByWeek(weekStart: string): FlowWeekFocus[] {
    return getDb()
      .prepare('SELECT * FROM flow_week_focus WHERE weekStart = ? AND isDeleted = 0 ORDER BY sortOrder ASC, createdAt ASC, id ASC')
      .all(weekStart)
      .map((r: unknown) => rowToFocus(r as Record<string, unknown>))
  },

  findFocusById(id: number): FlowWeekFocus | undefined {
    const r = getDb().prepare('SELECT * FROM flow_week_focus WHERE id = ?').get(id)
    return r ? rowToFocus(r as Record<string, unknown>) : undefined
  },

  createFocus(data: Omit<FlowWeekFocus, 'id' | 'isDeleted' | 'deletedAt' | 'createdAt' | 'updatedAt'>): FlowWeekFocus {
    // R2 Fix1（U-4）：从月目标重复选取幂等——同周同月目标已有 active 行时返回既有行，不新增
    if (data.monthGoalId !== null) {
      const existing = getDb().prepare(
        'SELECT * FROM flow_week_focus WHERE weekStart = ? AND monthGoalId = ? AND isDeleted = 0 LIMIT 1'
      ).get(data.weekStart, data.monthGoalId)
      if (existing) return rowToFocus(existing as Record<string, unknown>)
    }
    const now = new Date().toISOString()
    const r = getDb().prepare(`
      INSERT INTO flow_week_focus (weekStart, title, monthGoalId, doneAt, sortOrder, isDeleted, deletedAt, createdAt, updatedAt)
      VALUES (@weekStart, @title, @monthGoalId, @doneAt, @sortOrder, 0, NULL, @now, @now)
      RETURNING *
    `).get({ ...data, monthGoalId: data.monthGoalId ?? null, doneAt: data.doneAt ?? null, now }) as Record<string, unknown>
    return rowToFocus(r)
  },

  updateFocus(id: number, data: Partial<Pick<FlowWeekFocus, 'title' | 'doneAt' | 'sortOrder'>>): FlowWeekFocus | undefined {
    const existing = this.findFocusById(id)
    if (!existing) return undefined
    const merged = { ...existing, ...data, updatedAt: new Date().toISOString() }
    getDb().prepare(`
      UPDATE flow_week_focus SET title=@title, doneAt=@doneAt, sortOrder=@sortOrder, updatedAt=@updatedAt WHERE id=@id
    `).run({ ...merged, doneAt: merged.doneAt ?? null })
    return this.findFocusById(id)
  },

  softDeleteFocus(id: number): boolean {
    const now = new Date().toISOString()
    const r = getDb().prepare(
      'UPDATE flow_week_focus SET isDeleted=1, deletedAt=?, updatedAt=? WHERE id=? AND isDeleted=0'
    ).run(now, now, id)
    return r.changes > 0
  },
}
