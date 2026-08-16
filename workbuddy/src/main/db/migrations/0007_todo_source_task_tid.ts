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
 * 第三轮实测·问题乙：todo 与"生成它的日规划任务行"的任务级关联。
 * todos.sourceTaskTid：生成该 todo 的日规划任务行内联 tid（childTid，tasks 表同 tid）。
 * syncPlanTodos 复用优先按 sourceTaskTid（改名文本变、行 tid 不变 → 复用同一 todo，完成态保留）。
 * 注意与 parentTaskRef.parentTaskId（周/月上级任务 tid）区分。存量数据 NULL（不迁移历史，
 * 历史 todo 文本复用路径不变）。
 */
export function init007(): void {
  addColumnIfMissing('todos', 'sourceTaskTid', 'TEXT')
}
