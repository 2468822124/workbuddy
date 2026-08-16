import { getDb } from '../connection'
import { Setting } from '@shared/types'
import { encrypt, decrypt } from '../../lib/crypto'
import { logger } from '../../lib/logger'
import { getDefaultSettings } from './defaultSettings'

function rowToSetting(r: Record<string, unknown>): Setting {
  let value = r.value as string
  if (r.isEncrypted) {
    try {
      value = decrypt(value)
    } catch {
      logger.warn(`Failed to decrypt setting: ${r.key}`)
      value = ''
    }
  }
  return { key: r.key as string, value, isEncrypted: !!r.isEncrypted, updatedAt: r.updatedAt as string }
}

export const settingsRepo = {
  get(key: string): Setting | undefined {
    const r = getDb().prepare('SELECT * FROM settings WHERE key = ?').get(key) as Record<string, unknown> | undefined
    if (!r) return undefined
    return rowToSetting(r)
  },

  getAll(): Setting[] {
    const rows = getDb().prepare('SELECT * FROM settings ORDER BY key').all() as Record<string, unknown>[]
    return rows.map(rowToSetting)
  },

  set(key: string, value: string, isEncrypted = false): Setting {
    const now = new Date().toISOString()
    let storeValue = value
    if (isEncrypted) {
      storeValue = encrypt(value)
    }
    getDb().prepare(`
      INSERT INTO settings (key, value, isEncrypted, updatedAt)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET value=excluded.value, isEncrypted=excluded.isEncrypted, updatedAt=excluded.updatedAt
    `).run(key, storeValue, isEncrypted ? 1 : 0, now)
    return { key, value, isEncrypted, updatedAt: now }
  },

  seedDefaults(): void {
    for (const s of getDefaultSettings()) {
      const existing = this.get(s.key)
      if (!existing) {
        this.set(s.key, s.value, s.isEncrypted)
      }
    }
    logger.info('Default settings seeded')
  },
}
