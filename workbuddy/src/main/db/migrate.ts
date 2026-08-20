import { getDb, isReadonlyMode } from './connection'
import { logger } from '../lib/logger'
import { init001 } from './migrations/0001_init'
import { init002 } from './migrations/0002_news_items'
import { init003 } from './migrations/0003_plan_review_governance'
import { init004 } from './migrations/0004_todo_source_plan'
import { init005 } from './migrations/0005_task_index_ref_integrity'
import { init006 } from './migrations/0006_todo_source_invalid'
import { init007 } from './migrations/0007_todo_source_task_tid'
import { init008 } from './migrations/0008_flow_task_domain'
import { init009 } from './migrations/0009_today_channel_sync'

interface Migration {
  version: number
  name: string
  up: () => void
}

const migrations: Migration[] = [
  { version: 1, name: '0001_init', up: init001 },
  { version: 2, name: '0002_news_items', up: init002 },
  { version: 3, name: '0003_plan_review_governance', up: init003 },
  { version: 4, name: '0004_todo_source_plan', up: init004 },
  { version: 5, name: '0005_task_index_ref_integrity', up: init005 },
  { version: 6, name: '0006_todo_source_invalid', up: init006 },
  { version: 7, name: '0007_todo_source_task_tid', up: init007 },
  { version: 8, name: '0008_flow_task_domain', up: init008 },
  { version: 9, name: '0009_today_channel_sync', up: init009 },
]

export function runMigrations(): void {
  // 阶段6修复批次 · F5：只读保护模式跳过迁移（__schema_migrations 写入会被 SQLite 拒绝，
  // 破坏启动序列）。只读打开成立的前提是 schema 已存在，跳过迁移安全。
  if (isReadonlyMode()) {
    logger.warn('Skipping migrations: DB in read-only SAFE MODE')
    return
  }
  const db = getDb()

  db.exec(`
    CREATE TABLE IF NOT EXISTS __schema_migrations (
      version INTEGER PRIMARY KEY,
      appliedAt TEXT NOT NULL
    )
  `)

  const applied = new Set(
    db.prepare('SELECT version FROM __schema_migrations').all()
      .map((r: unknown) => (r as { version: number }).version)
  )

  for (const m of migrations) {
    if (applied.has(m.version)) continue
    logger.info(`Running migration ${m.version}: ${m.name}`)
    try {
      db.transaction(() => {
        m.up()
        db.prepare('INSERT INTO __schema_migrations (version, appliedAt) VALUES (?, ?)')
          .run(m.version, new Date().toISOString())
      })()
      logger.info(`Migration ${m.version} done`)
    } catch (e) {
      logger.error(`Migration ${m.version} failed:`, e)
      throw e
    }
  }
}
