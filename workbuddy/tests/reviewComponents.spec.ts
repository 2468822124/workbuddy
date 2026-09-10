// @vitest-environment jsdom
// ========================================
// 阶段5 复审批次2 · F5：页面组件运行测试（GPT 复审要求）
// 覆盖 F1/F2/F3 的组件级回归 —— 未绑定 defineProps/defineEmits 的
// setup 崩溃（白屏）此前无法被纯函数单测捕获，这里直接挂载组件验证。
// jsdom 环境：vitest.config plugins: [vue()] + '@' 别名（无新增依赖）。
// ========================================

import { describe, expect, test, beforeEach, vi } from 'vitest'
import { createApp, h, nextTick, reactive, type App, type Component } from 'vue'
import ReviewJournal from '../src/renderer/src/components/flow/review/ReviewJournal.vue'
import ReviewTaskList from '../src/renderer/src/components/flow/review/ReviewTaskList.vue'
import FlowReviewView from '../src/renderer/src/views/flow/FlowReviewView.vue'
import { ok } from '@shared/ipc'
import type { FlowReviewBoard, FlowReviewTask } from '@shared/flowTypes'

// FlowReviewView 依赖 vue-router；单测直挂组件，mock 掉路由
vi.mock('vue-router', () => ({
  useRoute: () => ({ query: {} }),
  useRouter: () => ({ replace: vi.fn() }),
}))

/** 空复盘面板 fixture（7 日明细/任务/顺延/趋势全空；isClosed=true 历史周） */
const EMPTY_BOARD: FlowReviewBoard = {
  weekStart: '2026-08-03',
  weekEnd: '2026-08-09',
  asOf: '2026-08-09',
  isClosed: true,
  summary: {
    plannedCount: 0, completedPlannedCount: 0, completionRate: null,
    deferredCount: 0, unfinishedCount: 0, unarrangedCount: 0, skippedCount: 0,
  },
  days: [],
  tasks: [],
  deferred: [],
  trend: [],
}

/** window.api mock（useFlowReview → useApi → window.api；jsdom 中 window === globalThis） */
function installApiMock(overrides: Partial<Record<'reviewBoard' | 'journalGet' | 'journalSave' | 'carryNext', () => unknown>> = {}): void {
  const api = {
    flow: {
      reviewBoard: overrides.reviewBoard ?? (async () => ok(EMPTY_BOARD)),
      journal: {
        get: overrides.journalGet ?? (async () => ok({ content: '周感想内容' })),
        save: overrides.journalSave ?? (async () => ok({ content: 'x' })),
      },
      instance: {
        carryNext: overrides.carryNext ?? (async () => ok({ id: 1 })),
      },
    },
  }
  ;(globalThis as { api: unknown }).api = api
}

/** 原始挂载（无 @vue/test-utils，避免新增依赖）：createApp + jsdom DOM 交互 */
function mountComp(comp: Component, props: Record<string, unknown> = {}): { host: HTMLDivElement; app: App } {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const app = createApp(comp, props)
  app.mount(host)
  return { host, app }
}

function click(host: HTMLElement, selector: string): void {
  const el = host.querySelector(selector)
  if (!el) throw new Error(`click: ${selector} not found`)
  ;(el as HTMLButtonElement).click()
}

beforeEach(() => {
  document.body.innerHTML = ''
})

// ===== F1/F2：ReviewJournal（props 绑定 + watch 同步 + save emit + 错误/保存中态） =====
describe('ReviewJournal 组件运行', () => {
  test('F1 回归：挂载不抛错（watch getter 走 props 绑定）；props 变更 → textarea 同步', async () => {
    // 父级容器：reactive props + h() 渲染（模拟父级 loadJournals 成功后 content null→值）
    const p = reactive({
      weekContent: null as string | null,
      monthContent: null as string | null,
      savingWeek: false, savingMonth: false,
      weekError: null as string | null, monthError: null as string | null,
    })
    const host = document.createElement('div')
    document.body.appendChild(host)
    createApp({ render: () => h(ReviewJournal, p) }).mount(host)
    await nextTick()
    const tas = host.querySelectorAll('textarea')
    expect(tas.length).toBe(2)
    expect((tas[0] as HTMLTextAreaElement).value).toBe('') // 初始 null → 空

    p.weekContent = '本周回顾' // 装载成功后父级更新 → watch 触发
    await nextTick()
    expect((tas[0] as HTMLTextAreaElement).value).toBe('本周回顾')

    p.weekContent = null // 切周失败读 → 清空
    await nextTick()
    expect((tas[0] as HTMLTextAreaElement).value).toBe('')
  })

  test('点击周保存 → emit save(week, 当前草稿)', async () => {
    const onSave = vi.fn()
    const { host } = mountComp(ReviewJournal, {
      weekContent: '旧内容', monthContent: null,
      savingWeek: false, savingMonth: false,
      weekError: null, monthError: null,
      onSave,
    })
    await nextTick()
    const ta = host.querySelectorAll('textarea')[0] as HTMLTextAreaElement
    ta.value = '新内容'
    ta.dispatchEvent(new Event('input'))
    await nextTick()
    click(host, '.save-btn')
    expect(onSave).toHaveBeenCalledTimes(1)
    expect(onSave).toHaveBeenCalledWith('week', '新内容')
  })

  test('保存中禁用按钮 + 错误条显示', async () => {
    const { host } = mountComp(ReviewJournal, {
      weekContent: null, monthContent: null,
      savingWeek: true, savingMonth: false,
      weekError: '保存失败：写入被拒', monthError: null,
    })
    await nextTick()
    const btn = host.querySelectorAll('.save-btn')[0] as HTMLButtonElement
    expect(btn.disabled).toBe(true)
    expect(host.textContent).toContain('保存失败：写入被拒')
  })
})

// ===== F3：ReviewTaskList（行内确认 emit carry + 取消恢复 + carryingId 防双击） =====
describe('ReviewTaskList 组件运行', () => {
  function makeTask(overrides: Partial<FlowReviewTask> = {}): FlowReviewTask {
    return {
      id: 1, weekStart: '2026-08-03', origin: 'temp', fixedDefId: null,
      title: '未完成任务A', kind: 'once', targetCount: 1, sortOrder: 0,
      skippedAt: null, carriedFrom: null, isDeleted: false, deletedAt: null,
      createdAt: '2026-08-01', updatedAt: '2026-08-01',
      completion: { instanceId: 1, done: false, doneCount: 0, targetCount: 1, arrangedCount: 0, skipped: false },
      status: 'unfinished', arranged: false, unarranged: true, carried: false, carryable: true,
      ...overrides,
    }
  }

  // ===== R1 Fix1 / U-3：转下周成功后历史项收敛（R1-2-T05-C05） =====

  test('U-3 回归：carried=true → 状态「已转下周」、行划线变灰、无转下周/确认入口', async () => {
    const { host } = mountComp(ReviewTaskList, {
      tasks: [makeTask({ carried: true, carryable: false })], isClosed: true, carryingId: null,
    })
    await nextTick()
    expect(host.textContent).toContain('已转下周')
    expect(host.textContent).not.toContain('未安排')
    expect(host.querySelector('.row.carried')).not.toBeNull() // 划线变灰由 .row.carried 承载
    expect(host.querySelector('.carry-btn')).toBeNull()
    expect(host.querySelector('.confirm-btn')).toBeNull()
    expect(host.textContent).not.toContain('确认转为下周一次性任务？')
  })

  test('U-3 回归：确认后列表刷新为 carried → 确认条消失，无法继续确认', async () => {
    const onCarry = vi.fn()
    const p = reactive({
      tasks: [makeTask()] as FlowReviewTask[],
      isClosed: true,
      carryingId: null as number | null,
      onCarry,
    })
    const host = document.createElement('div')
    document.body.appendChild(host)
    createApp({ render: () => h(ReviewTaskList, p) }).mount(host)
    await nextTick()

    click(host, '.carry-btn')
    await nextTick()
    expect(host.textContent).toContain('确认转为下周一次性任务？')
    click(host, '.confirm-btn')
    expect(onCarry).toHaveBeenCalledTimes(1)

    // 父级动作完成 → reload 后该行 carried=true / carryable=false
    p.carryingId = 1
    await nextTick()
    p.carryingId = null
    p.tasks = [makeTask({ carried: true, carryable: false })]
    await nextTick()

    expect(host.textContent).toContain('已转下周')
    expect(host.textContent).not.toContain('确认转为下周一次性任务？')
    expect(host.querySelector('.confirm-btn')).toBeNull()
    expect(host.querySelector('.carry-btn')).toBeNull()
    expect(onCarry).toHaveBeenCalledTimes(1) // 无法继续确认
  })

  test('U-3 前端防重复：同一 tick 连点「确认」只 emit 一次', async () => {
    const onCarry = vi.fn()
    const { host } = mountComp(ReviewTaskList, {
      tasks: [makeTask()], isClosed: true, carryingId: null, onCarry,
    })
    await nextTick()
    click(host, '.carry-btn')
    await nextTick()
    click(host, '.confirm-btn')
    click(host, '.confirm-btn')
    click(host, '.confirm-btn')
    expect(onCarry).toHaveBeenCalledTimes(1)
  })

  test('U-3 失败可重试：动作结束（carryingId 归零）后确认仍可再次提交', async () => {
    const onCarry = vi.fn()
    const p = reactive({
      tasks: [makeTask()] as FlowReviewTask[],
      isClosed: true,
      carryingId: null as number | null,
      onCarry,
    })
    const host = document.createElement('div')
    document.body.appendChild(host)
    createApp({ render: () => h(ReviewTaskList, p) }).mount(host)
    await nextTick()

    click(host, '.carry-btn')
    await nextTick()
    click(host, '.confirm-btn')
    p.carryingId = 1
    await nextTick()
    p.carryingId = null // 失败返回：tasks 不变，确认条保留
    await nextTick()

    expect(host.querySelector('.confirm-btn')).not.toBeNull()
    click(host, '.confirm-btn')
    expect(onCarry).toHaveBeenCalledTimes(2)
  })

  test('F3 回归：转下周 → 确认 → emit carry(id)', async () => {
    const onCarry = vi.fn()
    const { host } = mountComp(ReviewTaskList, {
      tasks: [makeTask()], isClosed: true, carryingId: null, onCarry,
    })
    await nextTick()
    click(host, '.carry-btn') // 展开行内确认条
    await nextTick()
    expect(host.textContent).toContain('确认转为下周一次性任务？')
    click(host, '.confirm-btn') // 确认
    expect(onCarry).toHaveBeenCalledTimes(1)
    expect(onCarry).toHaveBeenCalledWith(1)
  })

  test('取消恢复原样，不 emit', async () => {
    const onCarry = vi.fn()
    const { host } = mountComp(ReviewTaskList, {
      tasks: [makeTask()], isClosed: true, carryingId: null, onCarry,
    })
    await nextTick()
    click(host, '.carry-btn')
    await nextTick()
    click(host, '.cancel-btn')
    await nextTick()
    expect(onCarry).not.toHaveBeenCalled()
    expect(host.querySelector('.carry-btn')).not.toBeNull() // 确认条已收起
  })

  test('carryingId 动作中禁用确认/取消并显示转出中', async () => {
    const { host } = mountComp(ReviewTaskList, {
      tasks: [makeTask()], isClosed: true, carryingId: 1,
    })
    await nextTick()
    click(host, '.carry-btn')
    await nextTick()
    expect(host.textContent).toContain('转出中…')
    expect((host.querySelector('.confirm-btn') as HTMLButtonElement).disabled).toBe(true)
    expect((host.querySelector('.cancel-btn') as HTMLButtonElement).disabled).toBe(true)
  })

  test('非历史周（isClosed=false）无转下周入口', async () => {
    const { host } = mountComp(ReviewTaskList, {
      tasks: [makeTask()], isClosed: false, carryingId: null,
    })
    await nextTick()
    expect(host.querySelector('.carry-btn')).toBeNull()
  })
})

// ===== F1/F2 页面级回归：FlowReviewView 整页挂载不白屏 =====
describe('FlowReviewView 页面运行', () => {
  test('挂载成功：感想/任务区渲染，无 setup 崩溃（F1/F2 回归）', async () => {
    installApiMock()
    const { host } = mountComp(FlowReviewView)
    // load → reviewBoard + loadJournals（Promise 链）→ 等下一轮微任务
    await new Promise(r => setTimeout(r, 0))
    await nextTick()
    expect(host.textContent).toContain('感想') // ReviewJournal 渲染（曾 setup 崩溃白屏）
    expect(host.textContent).toContain('周任务状态') // ReviewTaskList 渲染
    expect(host.textContent).toContain('顺延清单') // ReviewDeferred 渲染
  })
})
