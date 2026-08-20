// ========================================
// 阶段6 · 步骤5：projectTasks IPC handler 首行校验测试（规格 §8 步骤5）
// 直调 registerProjectTasksIpc 注册的 handler（mock electron ipcMain 捕获注册表），
// 验证首行校验链：空/超长内容、缺 projectId、非法日期 → INVALID_INPUT；
// 只读模式 → READ_ONLY；不存在 id → NOT_FOUND；合法路径走通 仓库（真实内存库）。
// ========================================

import { describe, expect, test, beforeAll, beforeEach, afterEach, vi } from 'vitest'
import { mockConnectionDb, resetDb, setReadonlyMode } from './flowTestDb'
import { IPC } from '@shared/ipc'

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

import { registerProjectTasksIpc } from '../src/main/ipc/projectTasks.ipc'
import { getDb } from '../src/main/db/connection'

beforeAll(() => {
  resetDb()
  registerProjectTasksIpc()
})

beforeEach(() => {
  resetDb()
  setReadonlyMode(false)
})

afterEach(() => setReadonlyMode(false))

/** 调 handler 并断言返回 Result err 且 code 匹配 */
function expectErr(channel: string, input: unknown, code: string): void {
  const res = handlers[channel]!(null, input) as { ok: false; error: { code: string } }
  expect(res.ok).toBe(false)
  expect(res.error.code).toBe(code)
}

/** 插入一个项目（todos.projectId FK 目标），返回项目 id */
function insertProject(name = '项目A'): string {
  const id = `proj-${Math.random().toString(36).slice(2, 8)}`
  getDb().prepare(
    'INSERT INTO projects (id, name, description, status, color, isDeleted, deletedAt, createdAt, updatedAt) VALUES (?, ?, NULL, ?, NULL, 0, NULL, ?, ?)'
  ).run(id, name, 'active', '2026-08-01T00:00:00.000Z', '2026-08-01T00:00:00.000Z')
  return id
}

const LONG = 'x'.repeat(201)

describe('projectTasks:listByProject', () => {
  test('缺 id / 空 id → INVALID_INPUT', () => {
    expectErr(IPC.PROJECT_TASKS_LIST_BY_PROJECT, null, 'INVALID_INPUT')
    expectErr(IPC.PROJECT_TASKS_LIST_BY_PROJECT, '', 'INVALID_INPUT')
    expectErr(IPC.PROJECT_TASKS_LIST_BY_PROJECT, '   ', 'INVALID_INPUT')
  })

  test('合法项目 → ok 返回其任务（不含软删）', () => {
    const pid = insertProject()
    const c = handlers[IPC.PROJECT_TASKS_CREATE]!(null, { content: '任务一', planDate: null, projectId: pid }) as {
      ok: true; data: { id: string }
    }
    expect(c.ok).toBe(true)

    const r = handlers[IPC.PROJECT_TASKS_LIST_BY_PROJECT]!(null, pid) as {
      ok: true; data: Array<{ content: string; isDeleted: boolean }>
    }
    expect(r.ok).toBe(true)
    expect(r.data).toHaveLength(1)
    expect(r.data[0].content).toBe('任务一')
  })
})

describe('projectTasks:create', () => {
  test('内容为空 / 全空白 → INVALID_INPUT', () => {
    const pid = insertProject()
    expectErr(IPC.PROJECT_TASKS_CREATE, { content: '', planDate: null, projectId: pid }, 'INVALID_INPUT')
    expectErr(IPC.PROJECT_TASKS_CREATE, { content: '   ', planDate: null, projectId: pid }, 'INVALID_INPUT')
  })

  test('内容超 200 字符 → INVALID_INPUT', () => {
    const pid = insertProject()
    expectErr(IPC.PROJECT_TASKS_CREATE, { content: LONG, planDate: null, projectId: pid }, 'INVALID_INPUT')
  })

  test('缺 projectId / 空 projectId → INVALID_INPUT', () => {
    expectErr(IPC.PROJECT_TASKS_CREATE, { content: '任务', planDate: null }, 'INVALID_INPUT')
    expectErr(IPC.PROJECT_TASKS_CREATE, { content: '任务', planDate: null, projectId: '' }, 'INVALID_INPUT')
  })

  test('非法 planDate（2026-02-31 真实日历不存在）→ INVALID_INPUT', () => {
    const pid = insertProject()
    expectErr(IPC.PROJECT_TASKS_CREATE, { content: '任务', planDate: '2026-02-31', projectId: pid }, 'INVALID_INPUT')
  })

  test('不存在的 projectId（FK 违约）→ INTERNAL（首行校验不拦截，落到仓库层）', () => {
    const r = handlers[IPC.PROJECT_TASKS_CREATE]!(null, { content: '任务', planDate: null, projectId: 'missing' }) as {
      ok: false; error: { code: string }
    }
    expect(r.ok).toBe(false)
    expect(r.error.code).toBe('INTERNAL')
  })

  test('合法输入 → ok 返回 ProjectTask（内容修剪、默认 todo 状态）', () => {
    const pid = insertProject()
    const r = handlers[IPC.PROJECT_TASKS_CREATE]!(null, {
      content: '  任务一  ', planDate: '2026-08-20', projectId: pid,
    }) as { ok: true; data: { content: string; status: string; planDate: string; projectId: string } }
    expect(r.ok).toBe(true)
    expect(r.data.content).toBe('任务一')
    expect(r.data.status).toBe('todo')
    expect(r.data.planDate).toBe('2026-08-20')
    expect(r.data.projectId).toBe(pid)
    expect(r.data.isDeleted).toBe(false)
  })
})

describe('projectTasks:update', () => {
  test('缺 id → INVALID_INPUT', () => {
    expectErr(IPC.PROJECT_TASKS_UPDATE, { content: '新内容' }, 'INVALID_INPUT')
  })

  test('非法 content / 非法 planDate → INVALID_INPUT', () => {
    const pid = insertProject()
    const c = handlers[IPC.PROJECT_TASKS_CREATE]!(null, { content: '任务', planDate: null, projectId: pid }) as {
      ok: true; data: { id: string }
    }
    expectErr(IPC.PROJECT_TASKS_UPDATE, { id: c.data.id, content: '' }, 'INVALID_INPUT')
    expectErr(IPC.PROJECT_TASKS_UPDATE, { id: c.data.id, content: LONG }, 'INVALID_INPUT')
    expectErr(IPC.PROJECT_TASKS_UPDATE, { id: c.data.id, planDate: '2026-13-01' }, 'INVALID_INPUT')
  })

  test('不存在 id → NOT_FOUND', () => {
    expectErr(IPC.PROJECT_TASKS_UPDATE, { id: 'no-such-id', content: '新内容' }, 'NOT_FOUND')
  })

  test('合法更新 → ok 返回更新后行，未改动字段保持', () => {
    const pid = insertProject()
    const c = handlers[IPC.PROJECT_TASKS_CREATE]!(null, { content: '任务', planDate: null, projectId: pid }) as {
      ok: true; data: { id: string; content: string; projectId: string; status: string }
    }
    const r = handlers[IPC.PROJECT_TASKS_UPDATE]!(null, { id: c.data.id, content: ' 改后 ', planDate: '2026-08-21' }) as {
      ok: true; data: { content: string; planDate: string; projectId: string; status: string }
    }
    expect(r.ok).toBe(true)
    expect(r.data.content).toBe('改后')
    expect(r.data.planDate).toBe('2026-08-21')
    expect(r.data.projectId).toBe(pid)
    expect(r.data.status).toBe('todo')
  })
})

describe('projectTasks:delete', () => {
  test('缺 id / 空 id → INVALID_INPUT', () => {
    expectErr(IPC.PROJECT_TASKS_DELETE, null, 'INVALID_INPUT')
    expectErr(IPC.PROJECT_TASKS_DELETE, '', 'INVALID_INPUT')
  })

  test('不存在 id → ok({ ok: false })（软删未命中，不报错）', () => {
    const r = handlers[IPC.PROJECT_TASKS_DELETE]!(null, 'no-such-id') as { ok: true; data: { ok: boolean } }
    expect(r.ok).toBe(true)
    expect(r.data.ok).toBe(false)
  })

  test('合法删除 → ok({ ok: true }) 且 listByProject 不再返回（软删）', () => {
    const pid = insertProject()
    const c = handlers[IPC.PROJECT_TASKS_CREATE]!(null, { content: '任务', planDate: null, projectId: pid }) as {
      ok: true; data: { id: string }
    }
    const d = handlers[IPC.PROJECT_TASKS_DELETE]!(null, c.data.id) as { ok: true; data: { ok: boolean } }
    expect(d.ok).toBe(true)
    expect(d.data.ok).toBe(true)
    const list = handlers[IPC.PROJECT_TASKS_LIST_BY_PROJECT]!(null, pid) as { ok: true; data: unknown[] }
    expect(list.data).toHaveLength(0)
  })
})

describe('projectTasks:toggle', () => {
  test('缺 id → INVALID_INPUT', () => {
    expectErr(IPC.PROJECT_TASKS_TOGGLE, null, 'INVALID_INPUT')
  })

  test('不存在 id → NOT_FOUND', () => {
    expectErr(IPC.PROJECT_TASKS_TOGGLE, 'no-such-id', 'NOT_FOUND')
  })

  test('切换完成态 → ok 且再次切换恢复 todo（completedAt 随动）', () => {
    const pid = insertProject()
    const c = handlers[IPC.PROJECT_TASKS_CREATE]!(null, { content: '任务', planDate: null, projectId: pid }) as {
      ok: true; data: { id: string }
    }
    const t1 = handlers[IPC.PROJECT_TASKS_TOGGLE]!(null, c.data.id) as {
      ok: true; data: { status: string; completedAt: string | null }
    }
    expect(t1.ok).toBe(true)
    expect(t1.data.status).toBe('done')
    expect(t1.data.completedAt).not.toBeNull()
    const t2 = handlers[IPC.PROJECT_TASKS_TOGGLE]!(null, c.data.id) as {
      ok: true; data: { status: string; completedAt: string | null }
    }
    expect(t2.data.status).toBe('todo')
    expect(t2.data.completedAt).toBeNull()
  })
})

describe('projectTasks 写路径（只读模式）', () => {
  test('readonly 模式下 create/update/delete/toggle → READ_ONLY，不触达仓库', () => {
    setReadonlyMode(true)
    expectErr(IPC.PROJECT_TASKS_CREATE, { content: '任务', planDate: null, projectId: 'p' }, 'READ_ONLY')
    expectErr(IPC.PROJECT_TASKS_UPDATE, { id: 'x', content: 'y' }, 'READ_ONLY')
    expectErr(IPC.PROJECT_TASKS_DELETE, 'x', 'READ_ONLY')
    expectErr(IPC.PROJECT_TASKS_TOGGLE, 'x', 'READ_ONLY')
  })

  test('readonly 模式关闭后写路径恢复', () => {
    setReadonlyMode(true)
    expectErr(IPC.PROJECT_TASKS_TOGGLE, 'x', 'READ_ONLY')
    setReadonlyMode(false)
    expectErr(IPC.PROJECT_TASKS_TOGGLE, 'x', 'NOT_FOUND')
  })
})
