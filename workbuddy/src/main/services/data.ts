import { dialog } from 'electron'
import { getDb } from '../db/connection'
import { logger } from '../lib/logger'
import * as fs from 'fs'

const BUSINESS_TABLES = [
  'projects', 'todos', 'settings',
  'inboxes', 'plans', 'templates', 'reviews',
  'tasks', // v0.2修复计划：L2 任务索引（tid 链）随导出/导入走，否则链断裂
  'notes', 'books', 'workout_logs',
] as const

export async function exportAll(): Promise<{ ok: boolean; path?: string; message?: string }> {
  const result = await dialog.showSaveDialog({
    defaultPath: `workbuddy-backup-${new Date().toISOString().slice(0, 10)}.json`,
    filters: [{ name: 'JSON', extensions: ['json'] }],
  })

  if (result.canceled || !result.filePath) {
    return { ok: false, message: 'cancelled' }
  }

  try {
    const db = getDb()
    const tables: Record<string, unknown[]> = {}
    for (const t of BUSINESS_TABLES) {
      // 审查MED-1：tasks 自引用 FK（parentTaskId → tasks(tid)）要求导入时父先子后。
      // 显式 ORDER BY 父先（parentTaskId IS NULL 排前）+ createdAt 稳定序，不依赖底层 rowid
      // 隐式拓扑序（rowid=插入序，正常流程恰好父先子后，但无显式保证 → roundtrip 单测覆盖）。
      tables[t] = t === 'tasks'
        ? db.prepare(`SELECT * FROM ${t} ORDER BY (parentTaskId IS NULL) DESC, createdAt ASC`).all()
        : db.prepare(`SELECT * FROM ${t}`).all()
    }

    const payload = {
      version: 1,
      exportedAt: new Date().toISOString(),
      tables,
    }

    fs.writeFileSync(result.filePath, JSON.stringify(payload, null, 2), 'utf-8')
    logger.info(`Data exported to ${result.filePath}`)
    return { ok: true, path: result.filePath }
  } catch (e: unknown) {
    logger.error('Export failed:', e)
    return { ok: false, message: `导出失败：${(e as Error).message}` }
  }
}

function validatePayload(data: unknown): data is { version: number; tables: Record<string, unknown[]> } {
  if (!data || typeof data !== 'object') return false
  const d = data as Record<string, unknown>
  if (typeof d.version !== 'number' || !d.tables || typeof d.tables !== 'object') return false
  const tables = d.tables as Record<string, unknown>
  for (const key of Object.keys(tables)) {
    if (!BUSINESS_TABLES.includes(key as typeof BUSINESS_TABLES[number])) return false
    if (!Array.isArray(tables[key])) return false
  }
  return true
}

export async function importAll(): Promise<{ ok: boolean; counts?: Record<string, number>; message?: string }> {
  const result = await dialog.showOpenDialog({
    filters: [{ name: 'JSON', extensions: ['json'] }],
    properties: ['openFile'],
  })

  if (result.canceled || result.filePaths.length === 0) {
    return { ok: false, message: 'cancelled' }
  }

  const filePath = result.filePaths[0]

  try {
    const raw = fs.readFileSync(filePath, 'utf-8')
    const data = JSON.parse(raw)

    if (!validatePayload(data)) {
      return { ok: false, message: '格式无效：请选择合法的 WorkBuddy 备份文件' }
    }

    const db = getDb()
    const counts: Record<string, number> = {}

    db.transaction(() => {
      for (const table of BUSINESS_TABLES) {
        db.prepare(`DELETE FROM ${table}`).run()
        const rows = data.tables[table] || []
        for (const row of rows) {
          if (!row || typeof row !== 'object') continue
          const cols = Object.keys(row)
          // 列名注入防护：仅允许字母/数字/下划线
          for (const c of cols) {
            if (!/^[a-zA-Z][a-zA-Z0-9_]*$/.test(c)) {
              throw new Error(`非法列名: "${c}"`)
            }
          }
          const placeholders = cols.map(() => '?').join(', ')
          const values = cols.map(c => (row as Record<string, unknown>)[c])
          db.prepare(`INSERT INTO ${table} (${cols.join(', ')}) VALUES (${placeholders})`).run(...values)
        }
        counts[table] = rows.length
      }
    })()

    logger.info(`Import done`, counts)
    return { ok: true, counts }
  } catch (e: unknown) {
    logger.error('Import failed:', e)
    return { ok: false, message: `导入失败：${(e as Error).message}` }
  }
}
