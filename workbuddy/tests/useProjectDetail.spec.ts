// ========================================
// 阶段6 · 步骤6：项目详情页 composable API 失败反馈测试（规格 §8 步骤6 / §5.7）
// 纯逻辑测试：mock window.api（useApi 读取全局 window.api），
// 验证所有项目任务 API 失败时 error 被设置、函数不崩溃、返回值语义保持。
// ========================================

import { describe, expect, test, beforeEach, afterEach, vi } from 'vitest'
import { ok, err } from '@shared/ipc'
import type { Project, ProjectTask } from '@shared/types'
import { useProjectDetail } from '../src/renderer/src/composables/useProjectDetail'

const PID = 'proj-1'

function makeProject(): Project {
  return {
    id: PID,
    name: '项目A',
    status: 'active',
    description: null,
    color: null,
    isDeleted: false,
    deletedAt: null,
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-01T00:00:00.000Z',
  }
}

function makeTask(overrides: Partial<ProjectTask> = {}): ProjectTask {
  return {
    id: 't-1',
    content: '任务一',
    status: 'todo',
    planDate: null,
    projectId: PID,
    isDeleted: false,
    deletedAt: null,
    completedAt: null,
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-01T00:00:00.000Z',
    ...overrides,
  }
}

type MockApi = Record<string, Record<string, ReturnType<typeof vi.fn>>>

function buildApi(): MockApi {
  return {
    projects: {
      get: vi.fn(async () => ok(makeProject())),
      update: vi.fn(async () => ok({ ...makeProject(), name: '新名' })),
      delete: vi.fn(async () => ok(true)),
    },
    projectTasks: {
      listByProject: vi.fn(async () => ok([makeTask()])),
      create: vi.fn(async () => ok(makeTask())),
      update: vi.fn(async () => ok(makeTask({ content: '改后' }))),
      delete: vi.fn(async () => ok({ ok: true })),
      toggle: vi.fn(async () => ok(makeTask({ status: 'done' }))),
    },
    flow: {
      entry: {
        add: vi.fn(async () => ok({} as never)),
      },
    },
  }
}

let api: MockApi

beforeEach(() => {
  api = buildApi()
  vi.stubGlobal('window', { api })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('load（项目读取失败路径）', () => {
  test('projects.get 失败 → notFound=true、project=null、不崩溃', async () => {
    api.projects.get.mockResolvedValue(err('NOT_FOUND', '项目不存在'))
    const vm = useProjectDetail(PID)
    await vm.load()
    expect(vm.notFound.value).toBe(true)
    expect(vm.project.value).toBeNull()
    expect(vm.error.value).toBeNull() // 404 走 notFound 分支，不设 error
  })

  test('projects.get 成功但 listByProject 失败 → project 已载入 + error 可见', async () => {
    api.projectTasks.listByProject.mockResolvedValue(err('INTERNAL', '数据库错误'))
    const vm = useProjectDetail(PID)
    await vm.load()
    expect(vm.project.value?.id).toBe(PID)
    expect(vm.todos.value).toEqual([])
    expect(vm.error.value).toBe('数据库错误')
  })
})

describe('项目任务写操作失败反馈（规格 §5.7：失败可见于 banner）', () => {
  test('updateProject 失败 → 返回 false + error 设置', async () => {
    api.projects.update.mockResolvedValue(err('INVALID', '名称非法'))
    const vm = useProjectDetail(PID)
    expect(await vm.updateProject({ name: '坏名' })).toBe(false)
    expect(vm.error.value).toBe('名称非法')
  })

  test('removeProject 失败 → 返回 false + error 设置', async () => {
    api.projects.delete.mockResolvedValue(err('INTERNAL', '删除失败'))
    const vm = useProjectDetail(PID)
    expect(await vm.removeProject()).toBe(false)
    expect(vm.error.value).toBe('删除失败')
  })

  test('createTodo 失败 → 返回 null + error 设置 + todos 不变', async () => {
    await (async () => {
      const vm = useProjectDetail(PID)
      await vm.load()
      const before = vm.todos.value.length
      api.projectTasks.create.mockResolvedValue(err('INVALID_INPUT', '内容必填'))
      expect(await vm.createTodo('任务二', null)).toBeNull()
      expect(vm.error.value).toBe('内容必填')
      expect(vm.todos.value).toHaveLength(before)
    })()
  })

  test('updateTodo 失败 → 返回 false + error 设置 + 原行不变', async () => {
    const vm = useProjectDetail(PID)
    await vm.load()
    const t = vm.todos.value[0]
    api.projectTasks.update.mockResolvedValue(err('NOT_FOUND', '任务不存在'))
    expect(await vm.updateTodo(t.id, { content: '新' })).toBe(false)
    expect(vm.error.value).toBe('任务不存在')
    expect(vm.todos.value[0].content).toBe('任务一')
  })

  test('deleteTodo 失败 → 返回 false + error 设置 + 行保留', async () => {
    const vm = useProjectDetail(PID)
    await vm.load()
    const t = vm.todos.value[0]
    api.projectTasks.delete.mockResolvedValue(err('INTERNAL', '删除失败'))
    expect(await vm.deleteTodo(t.id)).toBe(false)
    expect(vm.error.value).toBe('删除失败')
    expect(vm.todos.value).toHaveLength(1)
  })

  test('toggleTodo 失败 → 返回 false + error 设置 + 状态不变', async () => {
    const vm = useProjectDetail(PID)
    await vm.load()
    const t = vm.todos.value[0]
    api.projectTasks.toggle.mockResolvedValue(err('INTERNAL', '切换失败'))
    expect(await vm.toggleTodo(t.id)).toBe(false)
    expect(vm.error.value).toBe('切换失败')
    expect(vm.todos.value[0].status).toBe('todo')
  })

  test('addToday flow 投影失败 → 返回 false + error 设置（不设 info）', async () => {
    const vm = useProjectDetail(PID)
    await vm.load()
    const t = vm.todos.value[0]
    api.flow.entry.add.mockResolvedValue(err('INTERNAL', '投影失败'))
    expect(await vm.addToday(t.id)).toBe(false)
    expect(vm.error.value).toBe('投影失败')
    expect(vm.info.value).toBeNull()
  })
})

describe('成功路径语义保持（迁移不改变行为）', () => {
  test('load 成功 → project + todos 载入', async () => {
    const vm = useProjectDetail(PID)
    await vm.load()
    expect(vm.notFound.value).toBe(false)
    expect(vm.project.value?.id).toBe(PID)
    expect(vm.todos.value).toHaveLength(1)
  })

  test('createTodo 成功 → 新行置顶', async () => {
    api.projectTasks.create.mockResolvedValue(ok(makeTask({ id: 't-2', content: '任务二', planDate: '2026-08-20' })))
    const vm = useProjectDetail(PID)
    await vm.load()
    await vm.createTodo('任务二', '2026-08-20')
    expect(vm.todos.value[0].content).toBe('任务二')
  })

  test('toggleTodo 成功 → 列表行替换为返回行（不可变替换）', async () => {
    const vm = useProjectDetail(PID)
    await vm.load()
    const t = vm.todos.value[0]
    await vm.toggleTodo(t.id)
    expect(vm.todos.value[0].status).toBe('done')
    expect(vm.error.value).toBeNull()
  })

  test('addToday 成功 → info 可见「已加入今日」', async () => {
    const vm = useProjectDetail(PID)
    await vm.load()
    const t = vm.todos.value[0]
    expect(await vm.addToday(t.id)).toBe(true)
    expect(vm.info.value).toBe('已加入今日')
    expect(vm.error.value).toBeNull()
  })
})
