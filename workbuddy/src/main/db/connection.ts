import Database from 'better-sqlite3'
import path from 'path'
import { app } from 'electron'
import { logger } from '../lib/logger'

/**
 * 阶段6修复批次 · F5：DB 三态安全模式
 * - normal：读写打开，迁移/seed/全部 IPC 正常；
 * - readonly：损坏/锁定后只读打开成功 → 跳过迁移与一切写入任务，
 *   可读 IPC 保留原 handler，写通道统一返回 READ_ONLY（不再出现 No handler registered）；
 * - unavailable：只读打开也失败 → 不触碰 DB，全部 IPC 通道统一返回 DB_UNAVAILABLE。
 */
export type DbMode = 'normal' | 'readonly' | 'unavailable'

let db: Database.Database | null = null
let mode: DbMode = 'normal'

export function getDb(): Database.Database {
  if (!db) throw new Error('DB not initialized')
  return db
}

export function getDbMode(): DbMode {
  return mode
}

export function isReadonlyMode(): boolean {
  return mode === 'readonly'
}

export function initDb(): void {
  const dbPath = path.join(app.getPath('userData'), 'workbuddy.db')

  try {
    db = new Database(dbPath)
    db.pragma('journal_mode = WAL')
    db.pragma('foreign_keys = ON')
    mode = 'normal'
    logger.info('DB connected, WAL mode')
  } catch (e) {
    logger.error('DB connection failed, trying read-only:', e)
    try {
      db = new Database(dbPath, { readonly: true })
      // 阶段6修复批次2 · F5：只读构造成功 ≠ 数据库可查询——探针查询失败立即转 unavailable
      //（修复前损坏文件只读打开成功即误判 readonly，健康/读路径返回 DB_ERROR 而非全通道 DB_UNAVAILABLE）
      db.prepare('SELECT 1 FROM sqlite_master LIMIT 1').get()
      mode = 'readonly'
      logger.warn('DB in SAFE MODE (read-only)')
    } catch (e2) {
      try {
        db?.close()
      } catch {
        /* 已关闭则忽略 */
      }
      logger.error('DB open failed entirely:', e2)
      db = null
      mode = 'unavailable'
      logger.warn('DB unavailable: read-only open or probe failed; protection mode active')
    }
  }
}

export function closeDb(): void {
  if (db) {
    db.close()
    db = null
    logger.info('DB closed')
  }
}
