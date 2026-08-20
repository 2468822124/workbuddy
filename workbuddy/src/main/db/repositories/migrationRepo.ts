import { getDb } from '../connection'

/**
 * 阶段6修复批次2 · T1：schema 迁移版本只读查询（IPC DB_HEALTH 使用；SQL 只在 repositories）。
 */
export function getMaxSchemaVersion(): number {
  const r = getDb().prepare('SELECT MAX(version) as v FROM __schema_migrations').get() as { v: number } | undefined
  return r?.v ?? 0
}
