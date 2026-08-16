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
 * 第二轮实测·问题②：同级日规划 done orphan 失效标注。
 * todos.sourceInvalid：生成它的日规划任务行已被删除（syncPlanTodos orphan 分流时置 1；
 * 同文本行重新加回复用时清零）。labelTodoSource 读此字段输出「来源已删」。
 * 存量数据默认 0（不迁移历史——历史 orphan 的失效状态无法回溯，保持现状）。
 */
export function init006(): void {
  addColumnIfMissing('todos', 'sourceInvalid', 'INTEGER NOT NULL DEFAULT 0')
}
