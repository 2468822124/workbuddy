// @vitest-environment jsdom
// ========================================
// R1 Fix2 回归测试（用户实测 R1 统一修复批次 Fix2）
// U-7 / R1-2-T06-C06：周统筹「转下周」成功后，复盘页转周的历史任务在周面板
//   （W-1 周 /flow/week）仍显示普通未完成且保留「转下周」入口 —— 周面板与复盘
//   页的转出标记不同步。修复：getWeekBoard 按复盘同一口径（存在 active 承接实例，
//   carriedFrom=本实例、目标周=本周+7）派生逐行 carried 展示字段；行内收敛 +
//   转周入口随生命周期消失（已转出/已完成/已跳过均不可再转）。
// U-8 / R1-3&R2-1（B1 选择角色 bat）：跨自然日重跑实测必须复用已注册日期副本
//   —— 属于 E:\workbuddy-test 基础设施（tool scope 外），此处无代码单测；
//   沙箱证据见 U8-Fix2-selector-sandbox-evidence.txt（04 用户决策 2026-09-02）。
// 只读派生层回归；不改动数据库写入语义，不触碰 %APPDATA%。
// ========================================

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createApp, h, nextTick, type App, type Component } from 'vue'
import { mockConnectionDb, resetDb } from './flowTestDb'
import { flowWeekRepo } from '../src/main/db/repositories/flowWeekRepo'
import { getWeekBoard } from '../src/main/services/flowDerived'
import { createTempInstance, addEntry, carryInstance } from '../src/main/services/flowActions'
import InstanceRow from '../src/renderer/src/components/flow/InstanceRow.vue'
import InstanceList from '../src/renderer/src/components/flow/InstanceList.vue'
import type { FlowWeekInstance, InstanceCompletion } from '@shared/flowTypes'
import { addDays, getWeekStart } from '@shared/period'

// 组件树含 @/composables/useFlowWeek（vue-router 依赖）→ mock 路由
vi.mock('vue-router', () => ({
  useRoute: () => ({ query: {} }),
  useRouter: () => ({ replace: vi.fn() }),
}))

mockConnectionDb()

/** carryInstance 内部走真实本地今天（不可注入）→ 转周相关周必须相对真实今天动态计算 */
function localTodayStr(): string {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}
const CURRENT_WEEK = getWeekStart(localTodayStr())
const SRC_WEEK = addDays(CURRENT_WEEK, -7) // 用户 W-1（历史周）
const CARRY_TARGET = CURRENT_WEEK // 用户 W0（转出目标周）

function makeTempInst(
  weekStart: string,
  title: string,
  kind: FlowWeekInstance['kind'] = 'once',
  targetCount = 1,
): FlowWeekInstance {
  const r = createTempInstance({ weekStart, title, kind, targetCount })
  if (!r.ok) throw new Error(r.error.message)
  return r.data
}

function addEntryOk(date: string, title: string, weekInstanceId: number) {
  const r = addEntry({ date, title, source: 'rail', weekInstanceId })
  if (!r.ok) throw new Error(r.error.message)
  return r.data
}

/** 直建承接实例（越权 +14 孤儿承接 / 其它源承接场景：绕过 carryInstance 的 +7 守卫） */
function makeCarry(
  weekStart: string,
  title: string,
  carriedFrom: number,
  kind: FlowWeekInstance['kind'] = 'once',
): FlowWeekInstance {
  return flowWeekRepo.create({
    weekStart, title, kind, targetCount: 1, sortOrder: 0,
    origin: 'temp', fixedDefId: null, carriedFrom, skippedAt: null,
  })
}

/** 读 SRC_WEEK 面板的 carried（缺失按 false 读，断言语义稳定） */
function carriedOf(board: ReturnType<typeof getWeekBoard>, title: string): boolean {
  const row = board.instances.find(i => i.title === title)
  return row ? row.carried : false
}

// ===== U-7：周统筹面板 carried 与复盘同步（getWeekBoard） =====

describe('U-7 / R1-2-T06-C06：周统筹面板 carried 与复盘同步（getWeekBoard）', () => {
  beforeEach(resetDb)

  it('转周前 carried=false；转下周成功后 carried=true（原始失败场景）', () => {
    const h1 = makeTempInst(SRC_WEEK, 'H1', 'once')
    addEntryOk(SRC_WEEK, 'H1-一', h1.id)

    // 修复前：周面板行无 carried 概念 → 仍普通未完成 + 保留转周入口
    expect(carriedOf(getWeekBoard(SRC_WEEK), 'H1')).toBe(false)

    const r = carryInstance(h1.id, CARRY_TARGET)
    expect(r.ok).toBe(true)

    const board = getWeekBoard(SRC_WEEK)
    expect(carriedOf(board, 'H1')).toBe(true)
    // 转出标记只读派生：源实例本身仍 open（可补录凭据），状态不改
    expect(board.instances.find(i => i.title === 'H1')).toMatchObject({
      completion: { done: false, skipped: false },
    })
  })

  it('目标周 W0 承接行：carriedFrom 回链源实例、自身 carried=false', () => {
    const h1 = makeTempInst(SRC_WEEK, 'H1', 'once')
    addEntryOk(SRC_WEEK, 'H1-一', h1.id)
    expect(carryInstance(h1.id, CARRY_TARGET).ok).toBe(true)

    const w0 = getWeekBoard(CARRY_TARGET)
    const t = w0.instances.find(i => i.title === 'H1')
    expect(t).toBeDefined()
    expect(t).toMatchObject({ carriedFrom: h1.id, carried: false })
    expect(carriedOf(getWeekBoard(SRC_WEEK), 'H1')).toBe(true)
  })

  it('重复确认幂等：承接实例始终唯一，carried 保持 true', () => {
    const h1 = makeTempInst(SRC_WEEK, 'H1', 'once')
    addEntryOk(SRC_WEEK, 'H1-一', h1.id)
    expect(carryInstance(h1.id, CARRY_TARGET).ok).toBe(true)
    expect(carryInstance(h1.id, CARRY_TARGET).ok).toBe(true)

    const carried = flowWeekRepo.listActiveByCarriedFrom([h1.id])
    expect(carried).toHaveLength(1)
    expect(carried[0].weekStart).toBe(CARRY_TARGET)
    expect(carriedOf(getWeekBoard(SRC_WEEK), 'H1')).toBe(true)
  })

  it('承接实例被软删 → carried 回落 false（转周入口恢复，不留死状态）', () => {
    const h1 = makeTempInst(SRC_WEEK, 'H1', 'once')
    addEntryOk(SRC_WEEK, 'H1-一', h1.id)
    const r = carryInstance(h1.id, CARRY_TARGET)
    if (!r.ok) throw new Error(r.error.message)
    expect(carriedOf(getWeekBoard(SRC_WEEK), 'H1')).toBe(true)

    flowWeekRepo.softDelete(r.data.id)
    expect(flowWeekRepo.listActiveByCarriedFrom([h1.id])).toHaveLength(0)
    expect(carriedOf(getWeekBoard(SRC_WEEK), 'H1')).toBe(false)
  })

  it('越距承接（目标周 ≠ 本周+7）不误标源实例（口径与复盘一致）', () => {
    const h1 = makeTempInst(SRC_WEEK, 'H1', 'once')
    addEntryOk(SRC_WEEK, 'H1-一', h1.id)
    // 目标周 = +14（非 carryInstance 生成；绕守卫直建）→ 不算「已转下周」
    makeCarry(addDays(SRC_WEEK, 14), 'O', h1.id)
    expect(flowWeekRepo.listActiveByCarriedFrom([h1.id])).toHaveLength(1)

    const board = getWeekBoard(SRC_WEEK)
    expect(carriedOf(board, 'H1')).toBe(false)
    // 同表其它实例不受影响
    expect(board.instances.find(i => i.title === 'O')).toBeUndefined()
  })

  it('同周其它实例不误标：仅被承接的实例 carried=true', () => {
    const h1 = makeTempInst(SRC_WEEK, 'H1', 'once')
    addEntryOk(SRC_WEEK, 'H1-一', h1.id)
    const h2 = makeTempInst(SRC_WEEK, 'H2', 'once')
    addEntryOk(SRC_WEEK, 'H2-一', h2.id)
    expect(carryInstance(h1.id, CARRY_TARGET).ok).toBe(true)

    const board = getWeekBoard(SRC_WEEK)
    expect(carriedOf(board, 'H1')).toBe(true)
    expect(carriedOf(board, 'H2')).toBe(false)
  })
})

// ===== U-7 UI：InstanceRow 已转出行收敛 + 转周入口生命周期 =====

/** jsdom 原始挂载（无 @vue/test-utils） */
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

function makeInst(overrides: Partial<FlowWeekInstance> = {}): FlowWeekInstance {
  return {
    id: 1, weekStart: SRC_WEEK, origin: 'temp', fixedDefId: null,
    title: '未完成A', kind: 'once', targetCount: 1, sortOrder: 0,
    skippedAt: null, carriedFrom: null, isDeleted: false, deletedAt: null,
    createdAt: '2026-08-24', updatedAt: '2026-08-24',
    ...overrides,
  }
}

function completionOf(overrides: Partial<InstanceCompletion> = {}): InstanceCompletion {
  return {
    instanceId: 1, done: false, doneCount: 0, targetCount: 1,
    arrangedCount: 0, skipped: false,
    ...overrides,
  }
}

function mountRow(
  overrides: { inst?: Partial<FlowWeekInstance>; completion?: Partial<InstanceCompletion>; carried?: boolean; onCarryNext?: () => void } = {},
): { host: HTMLDivElement; app: App } {
  return mountComp(InstanceRow, {
    inst: makeInst(overrides.inst),
    completion: completionOf(overrides.completion),
    badge: null,
    isHistory: true,
    carried: overrides.carried ?? false,
    vouchers: [],
    ...(overrides.onCarryNext ? { onCarryNext: overrides.onCarryNext } : {}),
  })
}

describe('InstanceRow 已转出行收敛（U-7 前端）', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  it('carried=true → 显示「已转下周」标记 + .row.carried 划线灰显 + 转周入口消失', async () => {
    const { host } = mountRow({ carried: true })
    await nextTick()
    expect(host.textContent).toContain('已转下周')
    expect(host.querySelector('.row.carried')).not.toBeNull()
    expect(host.querySelector('button[title="转下周（清债）"]')).toBeNull()
  })

  it('carried=false 未完成历史行 → 无标记，保留转周入口（可正常转出）', async () => {
    const { host } = mountRow({ carried: false })
    await nextTick()
    expect(host.textContent).not.toContain('已转下周')
    expect(host.querySelector('.row.carried')).toBeNull()
    expect(host.querySelector('button[title="转下周（清债）"]')).not.toBeNull()
  })

  it('已完成 / 已跳过行不再显示转周入口（生命周期收敛，与服务端守卫同源）', async () => {
    const done = mountRow({ completion: { done: true } })
    await nextTick()
    expect(done.host.querySelector('button[title="转下周（清债）"]')).toBeNull()

    const skipped = mountRow({ completion: { skipped: true } })
    await nextTick()
    expect(skipped.host.querySelector('button[title="转下周（清债）"]')).toBeNull()
  })

  it('历史周行点击转下周 → emit carryNext(id)', async () => {
    const onCarryNext = vi.fn()
    const { host } = mountRow({ carried: false, onCarryNext })
    await nextTick()
    click(host, 'button[title="转下周（清债）"]')
    expect(onCarryNext).toHaveBeenCalledTimes(1)
    expect(onCarryNext).toHaveBeenCalledWith(1)
  })
})

// ===== U-7 UI：InstanceList 逐行透传 carried =====

function mountList(carried: boolean): { host: HTMLDivElement; app: App } {
  const inst = makeInst()
  return mountComp(InstanceList, {
    instances: [inst],
    completions: { [inst.id]: completionOf() },
    badgeOf: () => null,
    vouchersOf: () => [],
    carriedOf: () => carried,
    isHistory: true,
  })
}

describe('InstanceList 逐行透传 carried（U-7 前端）', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  it('carriedOf → true：行显示「已转下周」且无转周入口', async () => {
    const { host } = mountList(true)
    await nextTick()
    expect(host.textContent).toContain('已转下周')
    expect(host.querySelector('.row.carried')).not.toBeNull()
    expect(host.querySelector('button[title="转下周（清债）"]')).toBeNull()
  })

  it('carriedOf → false：行无标记，转周入口保留', async () => {
    const { host } = mountList(false)
    await nextTick()
    expect(host.textContent).not.toContain('已转下周')
    expect(host.querySelector('button[title="转下周（清债）"]')).not.toBeNull()
  })
})
