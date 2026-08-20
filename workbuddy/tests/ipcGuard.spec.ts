// ========================================
// 阶段6修复批次 · F5：registerAllIpc 按 DB 模式守卫 IPC handler
// - normal：全部通道保留原 handler（写通道可写）
// - readonly：写通道统一返回 READ_ONLY；读通道保留原 handler（可读降级）
// - unavailable：全部通道统一返回 DB_UNAVAILABLE（不留未注册 handler）
// ========================================

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { IPC } from '../src/shared/ipc'

// ipcMain 捕获：handle/removeHandler 记录到 hoisted map
const handlers = vi.hoisted(() => ({ map: {} as Record<string, (e: unknown, ...a: unknown[]) => unknown> }))

vi.mock('electron', () => ({
  ipcMain: {
    handle: (ch: string, fn: (e: unknown, ...a: unknown[]) => unknown) => { handlers.map[ch] = fn },
    removeHandler: (ch: string) => { delete handlers.map[ch] },
  },
}))

// 8 个模块注册器 → no-op（守卫逻辑单测不关心各模块内部）
vi.mock('../src/main/ipc/settings.ipc', () => ({ registerSettingsIpc: vi.fn() }))
vi.mock('../src/main/ipc/news.ipc', () => ({ registerNewsIpc: vi.fn() }))
vi.mock('../src/main/ipc/projects.ipc', () => ({ registerProjectsIpc: vi.fn() }))
vi.mock('../src/main/ipc/projectTasks.ipc', () => ({ registerProjectTasksIpc: vi.fn() }))
vi.mock('../src/main/ipc/llm.ipc', () => ({ registerLlmIpc: vi.fn() }))
vi.mock('../src/main/ipc/data.ipc', () => ({ registerDataIpc: vi.fn() }))
vi.mock('../src/main/ipc/archive.ipc', () => ({ registerArchiveIpc: vi.fn() }))
vi.mock('../src/main/ipc/flow.ipc', () => ({ registerFlowIpc: vi.fn() }))

// connection/settingsRepo → 可切换模式的假实现
const modeMock = vi.hoisted(() => ({ mode: 'normal' as 'normal' | 'readonly' | 'unavailable' }))
vi.mock('../src/main/db/connection', () => ({
  getDb: () => ({
    prepare: () => ({ get: () => ({ v: 9 }) }),
  }),
  isReadonlyMode: () => modeMock.mode === 'readonly',
  getDbMode: () => modeMock.mode,
}))
vi.mock('../src/main/db/repositories/settingsRepo', () => ({
  settingsRepo: { get: () => null },
}))
vi.mock('../src/main/db/repositories/migrationRepo', () => ({
  getMaxSchemaVersion: () => 9,
}))

import { registerAllIpc } from '../src/main/ipc/index'

describe('registerAllIpc DB 模式守卫（F5）', () => {
  beforeEach(() => {
    handlers.map = {}
  })

  it('normal：读通道原 handler 工作；写通道未被 READ_ONLY 守卫替换', () => {
    modeMock.mode = 'normal'
    registerAllIpc()
    // DB_HEALTH 原 handler（读）：返回 ok 且非 READ_ONLY/DB_UNAVAILABLE
    const dbHealth = handlers.map[IPC.DB_HEALTH]
    expect(dbHealth).toBeDefined()
    const r1 = dbHealth(null) as { ok: boolean }
    expect(r1.ok).toBe(true)
    // 写通道：不应用任何 READ_ONLY 守卫（模块注册器在本测试为 no-op，handler 缺席即证明未被 guard）
    const h = handlers.map[IPC.DATA_IMPORT]
    if (h) {
      const r2 = h(null) as { code?: string }
      expect(r2.code).not.toBe('READ_ONLY')
    }
  })

  it('readonly：写通道统一 READ_ONLY；读通道保留原 handler（可读降级）', () => {
    modeMock.mode = 'readonly'
    registerAllIpc()

    // 写通道 → READ_ONLY 守卫（采样代表性通道，含 DB_HEALTH 之外的各模块）
    for (const ch of [IPC.DATA_IMPORT, IPC.PROJECTS_CREATE, IPC.FLOW_ENTRY_ADD, IPC.SETTINGS_SET, IPC.ARCHIVE_LEGACY]) {
      const res = handlers.map[ch](null) as { ok: boolean; error: { code: string } }
      expect(res.ok).toBe(false)
      expect(res.error.code).toBe('READ_ONLY')
    }
    // 读通道 → 原 handler 仍在（ok 正常）
    const dbHealth = handlers.map[IPC.DB_HEALTH](null) as { ok: boolean; error?: { code: string } }
    expect(dbHealth.ok).toBe(true)
    expect(dbHealth.error).toBeUndefined()
  })

  it('unavailable：全部通道统一 DB_UNAVAILABLE（无未注册/无 handler 泄漏）', () => {
    modeMock.mode = 'unavailable'
    registerAllIpc()

    for (const ch of [IPC.DB_HEALTH, IPC.DATA_IMPORT, IPC.SETTINGS_GET, IPC.APP_FIRST_LAUNCH, IPC.FLOW_REVIEW_BOARD]) {
      const res = handlers.map[ch](null) as { ok: boolean; error: { code: string } }
      expect(res.ok).toBe(false)
      expect(res.error.code).toBe('DB_UNAVAILABLE')
    }
  })
})
