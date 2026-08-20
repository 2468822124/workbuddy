// ========================================
// 阶段5 复审批次2 · F5：IPC handler 集成测试（GPT 复审要求）
// 直调 registerFlowIpc 注册的 handler（mock electron ipcMain 捕获注册表），
// 验证首行校验链：非法日期 → INVALID_INPUT，且不触达服务层；
// 合法路径走通 服务→仓库（真实内存库）。
// ========================================

import { describe, expect, test, beforeAll, beforeEach, vi } from 'vitest'
import { mockConnectionDb, resetDb } from './flowTestDb'
import { IPC } from '@shared/ipc'
import { addDays, getWeekStart } from '@shared/period'
import { flowWeekRepo } from '../src/main/db/repositories/flowWeekRepo'
import { createTempInstance } from '../src/main/services/flowActions'

/** 捕获 ipcMain.handle 注册的 handler，测试中直接调用 */
const { handlers } = vi.hoisted(() => ({
  handlers: {} as Record<string, (e: unknown, input: unknown) => unknown>,
}))

vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, fn: (e: unknown, input: unknown) => unknown) => {
      handlers[channel] = fn
    },
  },
}))

mockConnectionDb()

import { registerFlowIpc } from '../src/main/ipc/flow.ipc'

beforeAll(() => {
  resetDb()
  registerFlowIpc()
})

// carry 用例须独立起步（同源同周幂等断言依赖表内行数）
beforeEach(resetDb)

/** 调 handler 并断言返回 Result err 且 code 匹配 */
function expectErr(channel: string, input: unknown, code: string): void {
  const res = handlers[channel]!(null, input) as { ok: false; error: { code: string } }
  expect(res.ok).toBe(false)
  expect(res.error.code).toBe(code)
}

describe('flow:reviewBoard handler（F4 双层校验的 IPC 层）', () => {
  test('非法日期（2026-02-31 真实日历不存在）→ INVALID_INPUT', () => {
    expectErr(IPC.FLOW_REVIEW_BOARD, { weekStart: '2026-02-31' }, 'INVALID_INPUT')
  })

  test('缺 input / 缺 weekStart → INVALID_INPUT', () => {
    expectErr(IPC.FLOW_REVIEW_BOARD, null, 'INVALID_INPUT')
    expectErr(IPC.FLOW_REVIEW_BOARD, {}, 'INVALID_INPUT')
  })

  test('合法历史周 → ok 走通服务层（空库 → 零值 board）', () => {
    const res = handlers[IPC.FLOW_REVIEW_BOARD]!(null, { weekStart: '2026-08-03' }) as {
      ok: true; data: { weekStart: string; summary: { plannedCount: number } }
    }
    expect(res.ok).toBe(true)
    expect(res.data.weekStart).toBe('2026-08-03')
    expect(res.data.summary.plannedCount).toBe(0)
  })
})

describe('flow:instance:carryNext handler（转下周非法目标周）', () => {
  test('nextWeekStart 为真实日历非法日 → INVALID_INPUT', () => {
    expectErr(IPC.FLOW_INSTANCE_CARRY_NEXT, { id: 1, nextWeekStart: '2026-02-31' }, 'INVALID_INPUT')
  })
})

describe('flow:instance:carryNext handler（R1：上周转当前周成功 + 幂等）', () => {
  // carryInstance 用真实今天（不可注入）→ 周须相对真实本地今天动态计算
  function currentWeek(): string {
    const now = new Date()
    const pad = (n: number) => String(n).padStart(2, '0')
    return getWeekStart(`${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`)
  }

  test('上周未完成 → 转当前周成功；重复调用幂等（同一 id，仅 1 行）', () => {
    const current = currentWeek()
    const srcWeek = addDays(current, -7)
    const created = createTempInstance({ weekStart: srcWeek, title: 'IPC 债', kind: 'once', targetCount: 1 })
    expect(created.ok).toBe(true)
    if (!created.ok) return

    const r1 = handlers[IPC.FLOW_INSTANCE_CARRY_NEXT]!(null, { id: created.data.id, nextWeekStart: current }) as {
      ok: true; data: { id: number; weekStart: string }
    }
    expect(r1.ok).toBe(true)
    expect(r1.data.weekStart).toBe(current)

    const r2 = handlers[IPC.FLOW_INSTANCE_CARRY_NEXT]!(null, { id: created.data.id, nextWeekStart: current }) as {
      ok: true; data: { id: number }
    }
    expect(r2.ok).toBe(true)
    expect(r2.data.id).toBe(r1.data.id)

    const rows = flowWeekRepo.listByWeek(current)
    expect(rows).toHaveLength(1)
    expect(rows[0].carriedFrom).toBe(created.data.id)
  })

  test('目标=未来周 → INVALID_ACTION（与当前周放行区分）', () => {
    const current = currentWeek()
    const created = createTempInstance({ weekStart: current, title: '本周债', kind: 'once', targetCount: 1 })
    expect(created.ok).toBe(true)
    if (!created.ok) return
    expectErr(IPC.FLOW_INSTANCE_CARRY_NEXT, { id: created.data.id, nextWeekStart: addDays(current, 7) }, 'INVALID_ACTION')
  })
})

describe('flow:journal get/save handler（感想通道）', () => {
  test('scope 非法 → INVALID_INPUT', () => {
    expectErr(IPC.FLOW_JOURNAL_GET, { scope: 'year', periodKey: '2026-08-03' }, 'INVALID_INPUT')
    expectErr(IPC.FLOW_JOURNAL_SAVE, { scope: 'bad', periodKey: '2026-08-03', content: 'x' }, 'INVALID_INPUT')
  })

  test('合法保存 → ok 落库；再读回内容一致', () => {
    const saved = handlers[IPC.FLOW_JOURNAL_SAVE]!(null, {
      scope: 'week', periodKey: '2026-08-03', content: 'IPC 集成测试感想',
    }) as { ok: true; data: { scope: string; periodKey: string; content: string } }
    expect(saved.ok).toBe(true)
    expect(saved.data.content).toBe('IPC 集成测试感想')

    const got = handlers[IPC.FLOW_JOURNAL_GET]!(null, {
      scope: 'week', periodKey: '2026-08-03',
    }) as { ok: true; data: { content: string } | null }
    expect(got.ok).toBe(true)
    expect(got.data?.content).toBe('IPC 集成测试感想')
  })
})
