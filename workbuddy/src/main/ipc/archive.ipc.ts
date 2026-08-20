import { dialog, ipcMain } from 'electron'
import { IPC, err, ok } from '@shared/ipc'
import { archiveLegacy } from '../services/legacyArchive'
import { logger } from '../lib/logger'

/**
 * 阶段6 · 步骤12：旧表归档入口（规格 §5.4）
 * - 用户在设置页触发 archive:legacy；
 * - handler 打开系统保存对话框，取消 → CANCELLED；
 * - 路径交给 legacyArchive 服务（备份文件 + 事务 DROP）；结果映射为 Result<T>。
 */
export function registerArchiveIpc(): void {
  ipcMain.handle(IPC.ARCHIVE_LEGACY, async () => {
    try {
      const result = await dialog.showSaveDialog({
        title: '归档并清理旧规划数据',
        defaultPath: `workbuddy-legacy-archive-${new Date().toISOString().slice(0, 10)}.json`,
        filters: [{ name: 'JSON', extensions: ['json'] }],
      })
      if (result.canceled || !result.filePath) {
        return err('CANCELLED', '已取消归档')
      }

      const r = archiveLegacy(result.filePath)
      if (r.ok) {
        return ok({ path: r.path, counts: r.counts })
      }
      return err(r.code ?? 'ARCHIVE_FAILED', r.message ?? '归档失败')
    } catch (e: unknown) {
      logger.error('archive:legacy error', e)
      return err('INTERNAL', '内部错误，归档未执行')
    }
  })
}
