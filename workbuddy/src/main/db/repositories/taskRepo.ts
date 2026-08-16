import { getDb } from '../connection'
import { Task } from '@shared/types'

function rowToTask(r: Record<string, unknown>): Task {
  return {
    tid: r.tid as string,
    planId: r.planId as string,
    content: r.content as string,
    parentTaskId: (r.parentTaskId as string | null) ?? null,
    consumed: !!r.consumed,
    sortOrder: (r.sortOrder as number) ?? 0,
    isDeleted: !!r.isDeleted,
    deletedAt: (r.deletedAt as string | null) ?? null,
    createdAt: (r.createdAt as string) ?? '',
    updatedAt: (r.updatedAt as string) ?? '',
  }
}

/**
 * v0.2修复计划·参照完整性：tasks 表（planId 下轻量任务索引；plans.content 为 Markdown 真相源）。
 * 软删除（isDeleted）；findByTid 含已删行（来源链失效判定用）。
 */
export const taskRepo = {
  findByPlan(planId: string, includeDeleted = false): Task[] {
    const db = getDb()
    const sql = includeDeleted
      ? 'SELECT * FROM tasks WHERE planId = ? ORDER BY sortOrder ASC, createdAt ASC'
      : 'SELECT * FROM tasks WHERE planId = ? AND isDeleted = 0 ORDER BY sortOrder ASC, createdAt ASC'
    return (db.prepare(sql).all(planId) as Record<string, unknown>[]).map(rowToTask)
  },

  findByTid(tid: string): Task | undefined {
    const r = getDb().prepare('SELECT * FROM tasks WHERE tid = ?').get(tid) as Record<string, unknown> | undefined
    if (!r) return undefined
    return rowToTask(r)
  },

  findByTids(tids: string[]): Task[] {
    if (!tids.length) return []
    const marks = tids.map(() => '?').join(',')
    return (getDb()
      .prepare(`SELECT * FROM tasks WHERE tid IN (${marks})`)
      .all(...tids) as Record<string, unknown>[]).map(rowToTask)
  },

  /** P1-② 幂等查询：同 planId 下按纯文本找未删任务行（复用其 tid）。
   *  兼容历史存量 content 的 `- [ ] text` 标记形式（P2 修复前的旧行）。 */
  findTaskByText(planId: string, text: string): Task | undefined {
    const r = getDb()
      .prepare(
        `SELECT * FROM tasks WHERE planId = ? AND isDeleted = 0 AND (content = ? OR content = ?)
         ORDER BY sortOrder ASC, createdAt ASC LIMIT 1`
      )
      .get(planId, text, `- [ ] ${text}`) as Record<string, unknown> | undefined
    if (!r) return undefined
    return rowToTask(r)
  },

  /**
   * 幂等 upsert：tid 存在 → 更新 content/parentTaskId/consumed/sortOrder 并复活（isDeleted=0）。
   * 不用 INSERT OR REPLACE —— REPLACE 是 DELETE+INSERT，会被 FK CASCADE 误删子任务。
   */
  upsert(data: {
    tid: string
    planId: string
    content: string
    parentTaskId: string | null
    consumed: boolean
    sortOrder: number
  }): void {
    const now = new Date().toISOString()
    getDb().prepare(`
      INSERT INTO tasks (tid, planId, content, parentTaskId, consumed, sortOrder, isDeleted, deletedAt, createdAt, updatedAt)
      VALUES (@tid, @planId, @content, @parentTaskId, @consumed, @sortOrder, 0, NULL, @createdAt, @createdAt)
      ON CONFLICT(tid) DO UPDATE SET
        content = @content, parentTaskId = @parentTaskId, consumed = @consumed, sortOrder = @sortOrder,
        isDeleted = 0, deletedAt = NULL, updatedAt = @createdAt
    `).run({
      tid: data.tid,
      planId: data.planId,
      content: data.content,
      parentTaskId: data.parentTaskId ?? null,
      consumed: data.consumed ? 1 : 0,
      sortOrder: data.sortOrder,
      createdAt: now,
    })
  },

  softDeleteByTid(tid: string): boolean {
    const now = new Date().toISOString()
    const r = getDb()
      .prepare('UPDATE tasks SET isDeleted = 1, deletedAt = ?, updatedAt = ? WHERE tid = ? AND isDeleted = 0')
      .run(now, now, tid)
    return r.changes > 0
  },

  updateConsumed(tid: string, consumed: boolean): void {
    const now = new Date().toISOString()
    getDb()
      .prepare('UPDATE tasks SET consumed = ?, updatedAt = ? WHERE tid = ?')
      .run(consumed ? 1 : 0, now, tid)
  },
}
