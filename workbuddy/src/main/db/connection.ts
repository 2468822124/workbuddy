import Database from 'better-sqlite3'
import path from 'path'
import { app } from 'electron'
import { logger } from '../lib/logger'

let db: Database.Database | null = null
let isReadonly = false

export function getDb(): Database.Database {
  if (!db) throw new Error('DB not initialized')
  return db
}

export function isReadonlyMode(): boolean {
  return isReadonly
}

export function initDb(): void {
  const dbPath = path.join(app.getPath('userData'), 'workbuddy.db')
  logger.info(`Opening DB: ${dbPath}`)

  try {
    db = new Database(dbPath)
    db.pragma('journal_mode = WAL')
    db.pragma('foreign_keys = ON')
    isReadonly = false
    logger.info('DB connected, WAL mode')
  } catch (e) {
    logger.error('DB connection failed, trying read-only:', e)
    try {
      db = new Database(dbPath, { readonly: true })
      isReadonly = true
      logger.warn('DB in SAFE MODE (read-only)')
    } catch (e2) {
      logger.error('DB open failed entirely:', e2)
      throw e2
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
