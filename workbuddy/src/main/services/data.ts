import { dialog } from 'electron'
import { logger } from '../lib/logger'
import * as fs from 'fs'
import { IMPORT_ORDER, dataTransferRepo } from '../db/repositories/dataTransferRepo'

/**
 * 阶段6 · 步骤13：正常数据导入导出（规格 §5.5）
 *
 * - 固定白名单 16 张表（8 保留表 + 8 flow_* 表）；不导出 __schema_migrations；
 * - 不导出也不隐式写回旧表 plans/tasks/templates/reviews（旧数据必须走 legacyArchive JSON）；
 * - 固定导入顺序（FK/逻辑依赖）：projects→todos→其余保留表→flow_*（父表先行）；
 * - 载荷/列名/每行校验全部在 transaction 前完成；导入失败整体回滚；
 * - 旧备份（tables 含任意旧表键）→ LEGACY_BACKUP_UNSUPPORTED。
 * - 阶段6修复批次2 · T1：表清单与全部 SQL 在 repositories/dataTransferRepo，本层只做校验与编排。
 */
// 已清理旧表：只读拒绝键，绝不进入白名单
const LEGACY_TABLES = ['plans', 'tasks', 'templates', 'reviews'] as const

const COLUMN_RE = /^[a-zA-Z][a-zA-Z0-9_]*$/

export async function exportAll(): Promise<{ ok: boolean; path?: string; message?: string }> {
  const result = await dialog.showSaveDialog({
    defaultPath: `workbuddy-backup-${new Date().toISOString().slice(0, 10)}.json`,
    filters: [{ name: 'JSON', extensions: ['json'] }],
  })

  if (result.canceled || !result.filePath) {
    return { ok: false, message: 'cancelled' }
  }

  try {
    const tables = dataTransferRepo.exportTables()

    const payload = {
      version: 1,
      exportedAt: new Date().toISOString(),
      tables,
    }

    fs.writeFileSync(result.filePath, JSON.stringify(payload, null, 2), 'utf-8')
    // 阶段6修复批次 · F4：不记录完整文件路径，只记各表行数（规格 §5.4 只记 counts/错误码）
    const counts = Object.fromEntries(IMPORT_ORDER.map(t => [t, tables[t].length]))
    logger.info('Export done', counts)
    return { ok: true, path: result.filePath }
  } catch (e: unknown) {
    logger.error('Export failed:', e)
    return { ok: false, message: `导出失败：${(e as Error).message}` }
  }
}

/** 载荷预校验（transaction 前）：表名白名单、旧表键拒绝、16 键完整性、列名白名单、每行对象 */
export function validatePayload(data: unknown): { ok: true; tables: Record<string, unknown[]> } | { ok: false; code: string; message: string } {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return { ok: false, code: 'IMPORT_FAILED', message: '格式无效：请选择合法的 WorkBuddy 备份文件' }
  }
  const d = data as Record<string, unknown>
  // 阶段6修复批次 · F1：tables 必须是非数组普通对象——数组会通过 typeof 检查并清空全部业务表。
  // JSON.parse 产物原型恒为 Object.prototype；同时防御 Object.create(null) 等异常原型（防止未来的读取方式变化）。
  if (
    typeof d.version !== 'number' ||
    !d.tables ||
    typeof d.tables !== 'object' ||
    Array.isArray(d.tables) ||
    Object.getPrototypeOf(d.tables) !== Object.prototype
  ) {
    return { ok: false, code: 'IMPORT_FAILED', message: '格式无效：请选择合法的 WorkBuddy 备份文件' }
  }
  const tables = d.tables as Record<string, unknown>

  // 旧备份（含已清理表键）→ 拒绝，引导走归档 JSON
  for (const t of LEGACY_TABLES) {
    if (t in tables) {
      return { ok: false, code: 'LEGACY_BACKUP_UNSUPPORTED', message: '该备份包含已清理的旧规划表（plans/tasks/templates/reviews），请使用「归档并清理旧规划数据」生成的归档文件' }
    }
  }

  // 阶段6修复批次2 · F1：16 张白名单表键必须完整出现——空 {} / 缺键载荷在 transaction 前拒绝，杜绝清库。
  // 根因（复审）：{"version":1,"tables":{}} 满足"非数组普通对象"校验 → 通过预校验后清空全部业务表。
  for (const t of IMPORT_ORDER) {
    if (!(t in tables)) {
      return { ok: false, code: 'IMPORT_FAILED', message: `备份缺少表：${t}` }
    }
  }

  // 表名白名单 + 每行对象 + 列名白名单
  for (const key of Object.keys(tables)) {
    if (!(IMPORT_ORDER as readonly string[]).includes(key)) {
      return { ok: false, code: 'IMPORT_FAILED', message: `未知表名：${key}` }
    }
    if (!Array.isArray(tables[key])) {
      return { ok: false, code: 'IMPORT_FAILED', message: `表 ${key} 格式无效` }
    }
    for (const row of tables[key] as unknown[]) {
      if (!row || typeof row !== 'object' || Array.isArray(row)) {
        return { ok: false, code: 'IMPORT_FAILED', message: `表 ${key} 含非对象行` }
      }
      for (const c of Object.keys(row)) {
        if (!COLUMN_RE.test(c)) {
          return { ok: false, code: 'IMPORT_FAILED', message: `非法列名："${c}"` }
        }
      }
    }
  }
  return { ok: true, tables: tables as Record<string, unknown[]> }
}

export async function importAll(): Promise<{ ok: boolean; counts?: Record<string, number>; message?: string; code?: string }> {
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
    const validated = validatePayload(data)
    if (!validated.ok) {
      return { ok: false, code: validated.code, message: validated.message }
    }

    // 阶段6修复批次2 · T1：事务（DELETE_ORDER 子先父 + INSERT 固定顺序）下沉 dataTransferRepo，
    // service 不再直接触碰 DB API（技术栈规范 §2/§7/§10）
    const counts = dataTransferRepo.replaceAll(validated.tables)

    logger.info('Import done', counts)
    return { ok: true, counts }
  } catch (e: unknown) {
    logger.error('Import failed:', e)
    return { ok: false, message: `导入失败：${(e as Error).message}` }
  }
}
