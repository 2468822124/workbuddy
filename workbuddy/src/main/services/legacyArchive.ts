import { logger } from '../lib/logger'
import * as fs from 'fs'
import { LEGACY_TABLES, legacyArchiveRepo } from '../db/repositories/legacyArchiveRepo'

/**
 * 阶段6 · 步骤11：旧表归档与物理清理（规格 §5.4）
 *
 * - 用户触发（archive:legacy IPC 传入保存路径），先本地 JSON 备份、再事务性 DROP；
 * - 备份 payload 为原始 DB 行，不解析 Markdown、不改写内容、不上传网络；
 * - 临时文件写入 + 原子 rename 成功后才执行 DROP；任一 DROP 失败整体回滚，备份文件保留；
 * - DROP 只能出现在本文件的用户触发事务中（规格 §5.4）；四张旧表均不存在 → NO_LEGACY_TABLES；
 * - 阶段6修复批次2 · T1：全部 SQL（探测/快照/DROP）下沉 legacyArchiveRepo，本层只做编排与文件操作。
 *
 * 表名固定白名单常量，不做任何运行时拼接（无注入面）。
 * 日志只记录结果与各表计数，不记录正文、API Key 或用户文件路径。
 */

const ARCHIVE_VERSION = 1
const ARCHIVE_KIND = 'workbuddy-legacy-archive'

export interface ArchiveResult {
  ok: boolean
  code?: 'NO_LEGACY_TABLES' | 'ARCHIVE_FAILED' | 'ARCHIVE_ROLLBACK' | 'INTERNAL'
  path?: string
  counts?: Record<string, number>
  message?: string
}

/** 归档 payload（规格 §5.4）：只含现存旧表；缺失表不出现、counts 记 0 */
function buildPayload(tables: Record<string, unknown[]>): {
  version: number
  kind: string
  exportedAt: string
  tables: Record<string, unknown[]>
  counts: Record<string, number>
} {
  const counts: Record<string, number> = {}
  for (const t of LEGACY_TABLES) counts[t] = (tables[t] ?? []).length
  return {
    version: ARCHIVE_VERSION,
    kind: ARCHIVE_KIND,
    exportedAt: new Date().toISOString(),
    tables,
    counts,
  }
}

export function archiveLegacy(filePath: string): ArchiveResult {
  // 1. 存在性检查：四张旧表均不存在 → NO_LEGACY_TABLES（不建文件、不 DROP）
  const existing = legacyArchiveRepo.listExisting()
  if (existing.length === 0) {
    return { ok: false, code: 'NO_LEGACY_TABLES', message: '没有旧规划数据需要归档' }
  }

  // 2. 读快照（raw DB 行，不解析内容）；失败 → 不建文件、不 DROP
  let tables: Record<string, unknown[]>
  try {
    tables = legacyArchiveRepo.snapshot(existing)
  } catch (e: unknown) {
    logger.error('legacy archive snapshot read failed')
    return { ok: false, code: 'ARCHIVE_FAILED', message: '读取旧数据失败，未生成归档文件' }
  }

  // 3. 写临时文件 + 原子 rename；失败 → 清理临时文件、不 DROP
  const tmpPath = `${filePath}.tmp`
  try {
    fs.writeFileSync(tmpPath, JSON.stringify(buildPayload(tables), null, 2), 'utf-8')
    fs.renameSync(tmpPath, filePath)
  } catch {
    try {
      fs.unlinkSync(tmpPath)
    } catch {
      /* 临时文件已不存在则忽略 */
    }
    logger.error('legacy archive file write failed')
    return { ok: false, code: 'ARCHIVE_FAILED', message: '归档文件写入失败：请检查目标路径是否可写' }
  }

  // 4. 事务性 DROP（FK 子先父后：tasks.planId → plans(id)，故 tasks 在前；
  //    规格 §5.4 的固定顺序意图为保证可复现，实际执行以 FK 合法顺序为准）
  const counts = buildPayload(tables).counts
  try {
    legacyArchiveRepo.dropAll()
  } catch (e: unknown) {
    logger.error('legacy archive DROP failed (backup file kept)')
    return {
      ok: false,
      code: 'ARCHIVE_ROLLBACK',
      message: '备份已生成，但旧表未清理',
      path: filePath,
      counts,
    }
  }

  logger.info('legacy archive done', { counts })
  return { ok: true, path: filePath, counts }
}
