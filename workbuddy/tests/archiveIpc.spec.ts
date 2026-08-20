// ========================================
// 阶段6 · 步骤12：archive:legacy IPC handler 测试
// - dialog mock：取消 → CANCELLED；保存 → 路径交给 legacyArchive
// - archiveLegacy 结果映射：ok → ok({path,counts})；各错误码透传
// ========================================

import { describe, expect, test, beforeAll, vi } from 'vitest'

/** 捕获 ipcMain.handle 注册的 handler，测试中直接调用 */
const { handlers, dialog, service } = vi.hoisted(() => ({
  handlers: {} as Record<string, (e: unknown, input: unknown) => unknown>,
  dialog: { showSaveDialog: vi.fn() },
  service: { archiveLegacy: vi.fn() },
}))

vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, fn: (e: unknown, input: unknown) => unknown) => {
      handlers[channel] = fn
    },
  },
  dialog: {
    showSaveDialog: async () => dialog.showSaveDialog(),
  },
}))

vi.mock('../src/main/services/legacyArchive', () => ({
  archiveLegacy: (...args: unknown[]) => service.archiveLegacy(...args),
}))

import { registerArchiveIpc } from '../src/main/ipc/archive.ipc'
import { IPC } from '@shared/ipc'

beforeAll(() => {
  registerArchiveIpc()
})

describe('archive:legacy handler', () => {
  test('用户取消保存对话框 → CANCELLED，不调归档服务', async () => {
    dialog.showSaveDialog.mockResolvedValue({ canceled: true, filePath: undefined })
    const res = await handlers[IPC.ARCHIVE_LEGACY]!(null, null) as { ok: false; error: { code: string } }
    expect(res.ok).toBe(false)
    expect(res.error.code).toBe('CANCELLED')
    expect(service.archiveLegacy).not.toHaveBeenCalled()
  })

  test('无 filePath → CANCELLED', async () => {
    dialog.showSaveDialog.mockResolvedValue({ canceled: false, filePath: undefined })
    const res = await handlers[IPC.ARCHIVE_LEGACY]!(null, null) as { ok: false; error: { code: string } }
    expect(res.ok).toBe(false)
    expect(res.error.code).toBe('CANCELLED')
  })

  test('归档成功 → ok({path, counts})', async () => {
    dialog.showSaveDialog.mockResolvedValue({ canceled: false, filePath: 'C:/tmp/archive.json' })
    service.archiveLegacy.mockReturnValue({
      ok: true,
      path: 'C:/tmp/archive.json',
      counts: { plans: 2, tasks: 3, templates: 1, reviews: 1 },
    })
    const res = await handlers[IPC.ARCHIVE_LEGACY]!(null, null) as {
      ok: true; data: { path: string; counts: Record<string, number> }
    }
    expect(res.ok).toBe(true)
    expect(res.data.path).toBe('C:/tmp/archive.json')
    expect(res.data.counts.tasks).toBe(3)
    expect(service.archiveLegacy).toHaveBeenCalledWith('C:/tmp/archive.json')
  })

  test('无旧数据 → NO_LEGACY_TABLES', async () => {
    dialog.showSaveDialog.mockResolvedValue({ canceled: false, filePath: 'C:/tmp/archive.json' })
    service.archiveLegacy.mockReturnValue({ ok: false, code: 'NO_LEGACY_TABLES', message: '没有旧规划数据需要归档' })
    const res = await handlers[IPC.ARCHIVE_LEGACY]!(null, null) as { ok: false; error: { code: string } }
    expect(res.error.code).toBe('NO_LEGACY_TABLES')
  })

  test('写失败 → ARCHIVE_FAILED', async () => {
    dialog.showSaveDialog.mockResolvedValue({ canceled: false, filePath: 'C:/tmp/archive.json' })
    service.archiveLegacy.mockReturnValue({ ok: false, code: 'ARCHIVE_FAILED', message: '归档文件写入失败' })
    const res = await handlers[IPC.ARCHIVE_LEGACY]!(null, null) as { ok: false; error: { code: string } }
    expect(res.error.code).toBe('ARCHIVE_FAILED')
  })

  test('DROP 回滚 → ARCHIVE_ROLLBACK（备份保留）', async () => {
    dialog.showSaveDialog.mockResolvedValue({ canceled: false, filePath: 'C:/tmp/archive.json' })
    service.archiveLegacy.mockReturnValue({ ok: false, code: 'ARCHIVE_ROLLBACK', message: '备份已生成，但旧表未清理' })
    const res = await handlers[IPC.ARCHIVE_LEGACY]!(null, null) as { ok: false; error: { code: string } }
    expect(res.error.code).toBe('ARCHIVE_ROLLBACK')
  })
})
