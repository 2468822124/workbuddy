import { getDb } from '../connection'

/** 旧规划表固定白名单常量，无任何运行时拼接（无注入面） */
export const LEGACY_TABLES = ['plans', 'tasks', 'templates', 'reviews'] as const

/**
 * 阶段6修复批次2 · T1：归档 SQL 下沉 repositories（技术栈规范 §2/§7/§10）。
 * DROP 只出现在本模块的用户触发事务中（规格 §5.4）；备份文件保留逻辑在 service 层。
 */
export const legacyArchiveRepo = {
  /** 现存旧表（sqlite_master 探测） */
  listExisting(): string[] {
    const db = getDb()
    return LEGACY_TABLES.filter(t =>
      !!db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(t),
    )
  },

  /** 读快照（raw DB 行，不解析内容） */
  snapshot(tables: readonly string[]): Record<string, unknown[]> {
    const db = getDb()
    const out: Record<string, unknown[]> = {}
    for (const t of tables) out[t] = db.prepare(`SELECT * FROM ${t}`).all()
    return out
  },

  /** 事务性 DROP（FK 子先父后：tasks.planId → plans(id)，故 tasks 在前）；任一失败整体回滚 */
  dropAll(): void {
    const db = getDb()
    db.transaction(() => {
      db.exec('DROP TABLE IF EXISTS tasks')
      db.exec('DROP TABLE IF EXISTS plans')
      db.exec('DROP TABLE IF EXISTS templates')
      db.exec('DROP TABLE IF EXISTS reviews')
    })()
  },
}
