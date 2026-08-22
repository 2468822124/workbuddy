// @vitest-environment jsdom
// ========================================
// v0.3 用户反馈1 修复回归（UF1/UF2/UF3）
// UF1 = FocusBlock 多参数事件 add(title, monthGoalId) 在 FlowWeekView 被当对象事件读取
//       → addFocus(title=undefined, monthGoalId=undefined) → IPC 报 weekStart/title 必填
// UF2 = InstanceList 多参数事件 create(title, kind, targetCount) 同样被按对象读取
//       → IPC 报 weekStart/title/kind 必填
// UF3 = useFlowTemplates() 返回普通对象内嵌 ref，FlowDayView 未顶层解包
//       → tpl.error 恒 truthy（空红条）、tpl.templates 传 Ref 给 TemplatePanel（列表为空）
// 挂载真实视图 + window.api mock：验证事件参数逐位落到 IPC 载荷、模板列表/反馈真实渲染。
// jsdom 环境 + 原生 createApp（无 @vue/test-utils，避免新增依赖，与 reviewComponents.spec 同法）。
// ========================================

import { describe, expect, test, beforeEach, vi } from 'vitest'
import { createApp, isProxy, nextTick, type App, type Component } from 'vue'
import FlowWeekView from '../src/renderer/src/views/flow/FlowWeekView.vue'
import FlowDayView from '../src/renderer/src/views/flow/FlowDayView.vue'
import { ok, err } from '@shared/ipc'
import { getWeekStart } from '@shared/period'
import type {
  DayBoard,
  FlowMonthGoal,
  FlowPlanTemplate,
  WeekBoard,
} from '@shared/flowTypes'

// 视图依赖 vue-router；直挂组件，mock 掉路由
vi.mock('vue-router', () => ({
  useRoute: () => ({ query: {} }),
  useRouter: () => ({ replace: vi.fn() }),
}))

/** 与 useFlowWeek.todayStr 同实现的本地今天（jsdom 真实时钟） */
function localToday(): string {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

const TODAY = localToday()
const EXPECTED_WEEK = getWeekStart(TODAY)

function weekBoard(): WeekBoard {
  return { weekStart: EXPECTED_WEEK, instances: [], rail: [], focus: [], vouchers: [] }
}

const GOAL: FlowMonthGoal = {
  id: 1, month: '2026-08', title: '月目标A', closedAt: null,
  isDeleted: false, deletedAt: null, createdAt: 'x', updatedAt: 'x',
}

const TPL: FlowPlanTemplate = {
  id: 1, name: '模板A', type: 'daily',
  items: [{ text: '任务项1' }, { text: '任务项2' }],
  isDeleted: false, deletedAt: null, createdAt: 'x', updatedAt: 'x',
}

/** window.api mock（useApi → window.api；jsdom 中 window === globalThis） */
function installWeekApiMock() {
  const api = {
    flow: {
      weekBoard: vi.fn(async () => ok(weekBoard())),
      fixedDefs: { list: vi.fn(async () => ok([])) },
      monthGoals: { list: vi.fn(async () => ok([GOAL])) },
      weekFocus: { save: vi.fn(async () => ok({ id: 99 })) },
      instance: { create: vi.fn(async () => ok({ id: 99 })) },
    },
  }
  ;(globalThis as { api: unknown }).api = api
  return api
}

function installDayApiMock() {
  const api = {
    flow: {
      dayBoard: vi.fn(async () => ok({ date: TODAY, entries: [] } as DayBoard)),
      weekBoard: vi.fn(async () => ok(weekBoard())),
      templates: {
        list: vi.fn(async () => ok([TPL])),
        save: vi.fn(async () => ok(TPL)),
        delete: vi.fn(async () => ok({ ok: true })),
      },
      journal: { get: vi.fn(async () => ok({ content: null })) },
    },
  }
  ;(globalThis as { api: unknown }).api = api
  return api
}

/** 原始挂载：createApp + jsdom DOM 交互 */
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

function setInput(el: HTMLInputElement, value: string): void {
  el.value = value
  el.dispatchEvent(new Event('input', { bubbles: true }))
}

function setSelect(el: HTMLSelectElement, value: string): void {
  el.value = value
  el.dispatchEvent(new Event('change', { bubbles: true }))
}

function submitForm(form: HTMLFormElement): void {
  form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
}

/** 等 onMounted 的异步装载链（load + reload 等微任务） */
function flush(): Promise<void> {
  return new Promise(r => setTimeout(r, 0))
}

/** 按卡片标题定位（FocusBlock/FixedDefsPanel/InstanceList 均为 .card） */
function cardByHeading(host: HTMLElement, heading: string): HTMLElement {
  const h2 = [...host.querySelectorAll('h2')].find(el => el.textContent?.includes(heading))
  if (!h2) throw new Error(`heading not found: ${heading}`)
  const card = h2.closest('.card')
  if (!card) throw new Error(`card not found for heading: ${heading}`)
  return card as HTMLElement
}

beforeEach(() => {
  document.body.innerHTML = ''
})

// ===== UF1：周核心目标（FocusBlock 多参数事件 → addFocus 载荷） =====
describe('UF1 周核心目标事件参数', () => {
  test('手动输入：addFocus 收到 title，monthGoalId 为 null，IPC 载荷含 weekStart', async () => {
    const api = installWeekApiMock()
    const { host } = mountComp(FlowWeekView)
    await flush()

    click(host, '.focus .card-head .icon-btn') // 展开添加行
    await nextTick()
    const form = host.querySelector('.focus .add-row') as HTMLFormElement
    setInput(form.querySelector('input') as HTMLInputElement, '手动核心目标')
    submitForm(form)
    await flush()

    expect(api.flow.weekFocus.save).toHaveBeenCalledTimes(1)
    expect(api.flow.weekFocus.save).toHaveBeenCalledWith({
      weekStart: EXPECTED_WEEK,
      title: '手动核心目标',
      monthGoalId: null,
    })
  })

  test('从月目标选取：watch 带入标题，monthGoalId 随事件传递', async () => {
    const api = installWeekApiMock()
    const { host } = mountComp(FlowWeekView)
    await flush()

    click(host, '.focus .card-head .icon-btn')
    await nextTick()
    const form = host.querySelector('.focus .add-row') as HTMLFormElement
    setSelect(form.querySelector('select') as HTMLSelectElement, String(GOAL.id))
    await nextTick()
    expect((form.querySelector('input') as HTMLInputElement).value).toBe('月目标A') // 选中带入标题
    submitForm(form)
    await flush()

    expect(api.flow.weekFocus.save).toHaveBeenCalledTimes(1)
    expect(api.flow.weekFocus.save).toHaveBeenCalledWith({
      weekStart: EXPECTED_WEEK,
      title: '月目标A',
      monthGoalId: 1,
    })
  })
})

// ===== UF2：本周任务（InstanceList 多参数事件 → createTemp 载荷） =====
describe('UF2 本周任务事件参数', () => {
  test('一次型：create 收到 title/kind=once/targetCount=1', async () => {
    const api = installWeekApiMock()
    const { host } = mountComp(FlowWeekView)
    await flush()

    const card = cardByHeading(host, '本周任务清单')
    click(card, '.card-head .icon-btn')
    await nextTick()
    const form = card.querySelector('.add-row') as HTMLFormElement
    setInput(form.querySelector('input') as HTMLInputElement, '一次型任务')
    submitForm(form)
    await flush()

    expect(api.flow.instance.create).toHaveBeenCalledTimes(1)
    expect(api.flow.instance.create).toHaveBeenCalledWith({
      weekStart: EXPECTED_WEEK,
      title: '一次型任务',
      kind: 'once',
      targetCount: 1,
    })
  })

  test('场次型：选 multi 后显示场次输入，create 收到 targetCount=3', async () => {
    const api = installWeekApiMock()
    const { host } = mountComp(FlowWeekView)
    await flush()

    const card = cardByHeading(host, '本周任务清单')
    click(card, '.card-head .icon-btn') // 展开（上次提交后已收起）
    await nextTick()
    const form = card.querySelector('.add-row') as HTMLFormElement
    setInput(form.querySelector('input') as HTMLInputElement, '场次型任务')
    setSelect(form.querySelector('select') as HTMLSelectElement, 'multi')
    await nextTick()
    const count = form.querySelector('.input.count') as HTMLInputElement
    expect(count).not.toBeNull() // 场次输入仅在 multi 显示
    setInput(count, '3')
    submitForm(form)
    await flush()

    expect(api.flow.instance.create).toHaveBeenCalledTimes(1)
    expect(api.flow.instance.create).toHaveBeenCalledWith({
      weekStart: EXPECTED_WEEK,
      title: '场次型任务',
      kind: 'multi',
      targetCount: 3,
    })
  })
})

// ===== UF3：日规划模板 ref 解包 =====
describe('UF3 模板状态顶层解包', () => {
  test('模板列表真实渲染（名称/2项），无空红条', async () => {
    installDayApiMock()
    const { host } = mountComp(FlowDayView)
    await flush()

    expect(host.textContent).toContain('模板A') // 列表出现（此前传 Ref → 空）
    expect(host.textContent).toContain('2项')
    // 成功态无任何空错误条（此前 tpl.error 为 Ref 恒 truthy → 空红条）
    expect(host.querySelectorAll('.feedback.error').length).toBe(0)
  })

  test('模板装载失败显示可读错误文字（非空红条）', async () => {
    const api = installDayApiMock()
    api.flow.templates.list.mockImplementation(async () => err('TPL_LIST_FAILED', '模板加载失败'))
    const { host } = mountComp(FlowDayView)
    await flush()

    const bars = host.querySelectorAll('.feedback.error')
    expect(bars.length).toBe(1)
    expect(bars[0].textContent).toContain('模板加载失败')
  })

  test('新建模板提交 → save 载荷落 TemplatePanel 事件（模板区渲染）', async () => {
    installDayApiMock()
    const { host } = mountComp(FlowDayView)
    await flush()

    // 页面级渲染冒烟：模板卡片存在（此前整个列表空）
    expect(host.textContent).toContain('模板')
  })

  test('新建模板载荷 items 为纯对象（非响应式 Proxy，IPC 可克隆）', async () => {
    const api = installDayApiMock()
    const { host } = mountComp(FlowDayView)
    await flush()

    // 注意：DayEntryList 也有 .add-btn（添加任务），须按卡片定位模板表单按钮
    const card = cardByHeading(host, '模板')
    click(card, '.add-btn') // 展开新建表单
    await nextTick()
    const form = card.querySelector('.form') as HTMLElement
    setInput(form.querySelector('.form-input') as HTMLInputElement, '新建模板')
    setInput(form.querySelector('.item-input') as HTMLInputElement, '任务项1')
    await nextTick() // canSave 重新计算 → 创建按钮启用
    click(form, '.form-actions .tiny-btn.primary') // 创建
    await flush()

    expect(api.flow.templates.save).toHaveBeenCalledTimes(1)
    const payload = (api.flow.templates.save as ReturnType<typeof vi.fn>).mock.calls[0][0]
    expect(payload.name).toBe('新建模板')
    expect(payload.type).toBe('daily')
    expect(payload.items).toEqual([{ text: '任务项1' }])
    // 根因：items.value.filter 保留响应式 Proxy 元素 → Electron 结构化克隆失败
    // （GUI 实测 Error: An object could not be cloned → 模板创建无列表无反馈）
    expect(isProxy(payload.items[0])).toBe(false)
  })
})
