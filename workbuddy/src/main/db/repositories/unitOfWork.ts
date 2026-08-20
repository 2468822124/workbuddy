import { getDb } from '../connection'

/**
 * 阶段6修复批次2 · T1：repositories 层统一事务入口（技术栈规范 §2/§7/§10）。
 * SQL 只准在 repositories，事务包装同样只准在 repositories——service/IPC 不再直接触碰 DB API。
 */
export function runInTransaction<T>(fn: () => T): T {
  return getDb().transaction(fn)()
}
