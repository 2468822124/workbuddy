import { ipcMain } from 'electron'
import { IPC, ok, err } from '@shared/ipc'
import { exportAll, importAll } from '../services/data'
import { logger } from '../lib/logger'

export function registerDataIpc(): void {
  ipcMain.handle(IPC.DATA_EXPORT, async () => {
    try {
      const result = await exportAll()
      if (!result.ok) return err('EXPORT_FAILED', result.message ?? '导出失败')
      return ok({ path: result.path! })
    } catch (e: unknown) {
      logger.error('data:export error', e)
      return err('INTERNAL', (e as Error).message)
    }
  })

  ipcMain.handle(IPC.DATA_IMPORT, async () => {
    try {
      const result = await importAll()
      // 阶段6：LEGACY_BACKUP_UNSUPPORTED 等校验码透传（规格 §5.5 旧备份拒绝）
      if (!result.ok) return err((result as { code?: string }).code ?? 'IMPORT_FAILED', result.message ?? '导入失败')
      return ok(result)
    } catch (e: unknown) {
      logger.error('data:import error', e)
      return err('INTERNAL', (e as Error).message)
    }
  })
}
