import { getDb } from '../connection'

/**
 * Idempotent helper: add column only if it does not already exist.
 * SQLite ALTER TABLE ADD COLUMN has no IF NOT EXISTS,
 * so we check PRAGMA table_info first.
 */
function addColumnIfMissing(table: string, colName: string, colDef: string): void {
  const db = getDb()
  const cols = db.pragma(`table_info(${table})`) as Array<{ name: string }>
  if (cols.some(c => c.name === colName)) return
  db.exec(`ALTER TABLE ${table} ADD COLUMN ${colName} ${colDef}`)
}

/**
 * 用户反馈3.2 F3.2-2 Tier 2：todos.sourcePlanId —— 出处标注（日规划·{date}）数据基础。
 * - nullable TEXT：存量 todo 为 NULL（降级 顺延/手动 规则），不迁移历史数据。
 * - 仅 syncPlanTodos 生成的 todo 写入；quickCreate/手动 create 留 NULL。
 */
export function init004(): void {
  addColumnIfMissing('todos', 'sourcePlanId', 'TEXT')
}
