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
 * v0.2测试修复计划1.0-参照完整性：L2 半规范化。
 * - tasks 表：planId 下轻量任务索引（plans.content 仍为 Markdown 真相源）。
 *   内联隐形 tid 使级联匹配键从 text 升级为 tid（改名后关联仍存活）。
 * - todos.parentTaskRef TEXT：todo → 上级任务 JSON 引用（来源链逐级向上）。
 * - FK ON DELETE CASCADE：规格 DDL 为裸 REFERENCES；因 connection 已启用
 *   foreign_keys=ON，导入 roundtrip（DELETE FROM plans 整表重灌）会撞 FK，
 *   故加 CASCADE——应用层只有软删除（isDeleted），CASCADE 仅导入时触发。
 *   记录为偏差（当前状态.md §19）。
 */
export function init005(): void {
  const db = getDb()
  db.exec(`
    CREATE TABLE IF NOT EXISTS tasks (
      tid TEXT PRIMARY KEY,
      planId TEXT NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
      content TEXT NOT NULL,
      parentTaskId TEXT REFERENCES tasks(tid) ON DELETE CASCADE,
      consumed INTEGER NOT NULL DEFAULT 0,
      sortOrder INTEGER NOT NULL DEFAULT 0,
      isDeleted INTEGER NOT NULL DEFAULT 0,
      deletedAt TEXT,
      createdAt TEXT NOT NULL DEFAULT '',
      updatedAt TEXT NOT NULL DEFAULT ''
    );
    CREATE INDEX IF NOT EXISTS idx_tasks_plan ON tasks(planId) WHERE isDeleted = 0;
    CREATE INDEX IF NOT EXISTS idx_tasks_parent ON tasks(parentTaskId) WHERE parentTaskId IS NOT NULL AND isDeleted = 0;
  `)
  addColumnIfMissing('todos', 'parentTaskRef', 'TEXT')
}
