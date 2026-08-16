import { getDb } from '../connection'
import { FlowJournal } from '@shared/flowTypes'

function rowToJournal(r: Record<string, unknown>): FlowJournal {
  const row = r as unknown as FlowJournal & { isDeleted: unknown }
  return { ...row, isDeleted: !!row.isDeleted }
}

// 叙述域（感想/复盘长文）：与任务域物理隔离，唯一约束 = (scope, periodKey) 单篇
export const flowJournalRepo = {
  findByScope(scope: FlowJournal['scope'], periodKey: string): FlowJournal | undefined {
    const r = getDb().prepare(
      'SELECT * FROM flow_journals WHERE scope = ? AND periodKey = ? AND isDeleted = 0 LIMIT 1'
    ).get(scope, periodKey)
    return r ? rowToJournal(r as Record<string, unknown>) : undefined
  },

  upsert(scope: FlowJournal['scope'], periodKey: string, content: string): FlowJournal {
    const now = new Date().toISOString()
    const existing = this.findByScope(scope, periodKey)
    if (existing) {
      getDb().prepare(
        'UPDATE flow_journals SET content=?, updatedAt=? WHERE id=?'
      ).run(content, now, existing.id)
      return this.findByScope(scope, periodKey) as FlowJournal
    }
    const r = getDb().prepare(`
      INSERT INTO flow_journals (scope, periodKey, content, isDeleted, deletedAt, createdAt, updatedAt)
      VALUES (?, ?, ?, 0, NULL, ?, ?)
      RETURNING *
    `).get(scope, periodKey, content, now, now) as Record<string, unknown>
    return rowToJournal(r)
  },
}
