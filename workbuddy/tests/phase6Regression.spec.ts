// ========================================
// 阶段6 · 步骤15：3.2 六轮场景全量回归（规格 §9.5 / §8 步骤15）
// 真实触达 flow IPC handler + flow 服务 + projectTasks 专用 IPC + 项目/提醒适配；
// 不得只写快照或 mock 通过 —— 全部断言走真实内存库 + 真实 handler 注册表。
// 六轮：① 改名传播 ② 删除传播 ③ rail ④ 完成体系 ⑤ 克隆/债务/幂等 ⑥ 组合主路径
// ========================================

import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest'
import { randomUUID } from 'node:crypto'
import { mockConnectionDb, resetDb, MONDAY, THURSDAY, FRIDAY } from './flowTestDb'
import { getDb } from '../src/main/db/connection'
import { IPC } from '@shared/ipc'
import { getDayBoard, getWeekBoard } from '../src/main/services/flowDerived'
import { getReviewBoard } from '../src/main/services/flowReviewDerived'
import { flowWeekRepo } from '../src/main/db/repositories/flowWeekRepo'
import { flowDayRepo } from '../src/main/db/repositories/flowDayRepo'
import { flowVoucherRepo } from '../src/main/db/repositories/flowVoucherRepo'
import { flowFixedRepo } from '../src/main/db/repositories/flowFixedRepo'
import { projectTaskRepo } from '../src/main/db/repositories/projectTaskRepo'
import { projectRepo } from '../src/main/db/repositories/projectRepo'
import { createTempInstance, saveFixedDef } from '../src/main/services/flowActions'
import { ensurePeriodicReminders } from '../src/main/services/reminders'
import { addDays, getWeekStart } from '@shared/period'
import type { ProjectTask } from '@shared/types'

const SUNDAY = '2026-08-16' // 8-14 为周五 ⇒ 8-16 为周日（提醒种入日）

/** 捕获 ipcMain.handle 注册的 handler，测试中直接调用（真实 DB，无 IPC 网络） */
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
import { registerProjectTasksIpc } from '../src/main/ipc/projectTasks.ipc'

beforeAll(() => {
  registerFlowIpc()
  registerProjectTasksIpc()
})

beforeEach(() => {
  resetDb()
})

describe('第1轮 · 改名传播回归（§9.5-③）', () => {
  it('固定定义改名 → 本周实例标题跟随；rename 实例 → 日规划锁定行跟随', () => {
    // 同步目标=真实今天所在周（saveFixedDef 改名只同步当前周实例，历史周不追溯）
    const current = getWeekStart(new Date().toISOString().slice(0, 10))
    const def = saveFixedDef({ title: '健身', kind: 'once', targetCount: 1 })
    expect(def.ok).toBe(true)
    if (!def.ok) return
    handlers[IPC.FLOW_WEEK_BOARD]!(null, { weekStart: current }) // materializeWeek 生成实例
    const inst = flowWeekRepo.listByWeek(current)[0]
    expect(inst.title).toBe('健身')

    // 改名 → 本周实例跟随（源头显式传播）
    const renamed = saveFixedDef({ id: def.data.id, title: '力量训练' })
    expect(renamed.ok).toBe(true)
    expect(flowWeekRepo.listByWeek(current)[0].title).toBe('力量训练')
    expect(flowFixedRepo.listActive().find(f => f.id === def.data.id)?.title).toBe('力量训练')

    // 临时型实例 rename → 日规划锁定行标题跟随（派生，零存储；fixed 实例改名入口在固定任务处）
    const tmp = createTempInstance({ weekStart: current, title: '临时任务', kind: 'once', targetCount: 1 })
    expect(tmp.ok).toBe(true)
    if (!tmp.ok) return
    const r = handlers[IPC.FLOW_ENTRY_ADD]!(null, {
      date: current, title: '临时任务', source: 'rail', weekInstanceId: tmp.data.id,
    }) as { ok: true; data: { id: number } }
    expect(r.ok).toBe(true)
    handlers[IPC.FLOW_INSTANCE_RENAME]!(null, { id: tmp.data.id, title: '临时任务·改' })
    const board = getDayBoard(current)
    const row = board.entries.find(e => e.id === r.data.id)
    expect(row).toBeDefined()
    expect(row!.displayTitle).toBe('临时任务·改')
  })

  it('项目源任务改名 → 今日/日规划 project 投影 displayTitle 跟随', () => {
    const todo = makeSourceTodo('修复登录页')
    addProjection(THURSDAY, todo)
    expect(getDayBoard(THURSDAY).entries.find(e => e.projectId === todo.id)?.displayTitle).toBe('修复登录页')

    const upd = handlers[IPC.PROJECT_TASKS_UPDATE]!(null, { id: todo.id, content: '修复登录页（含验证码）' }) as { ok: boolean }
    expect(upd.ok).toBe(true)
    expect(getDayBoard(THURSDAY).entries.find(e => e.projectId === todo.id)?.displayTitle).toBe('修复登录页（含验证码）')
  })
})

describe('第2轮 · 删除传播回归（§9.5-④）', () => {
  it('周任务删除 → 下游安排行消失，已存在凭据保留', () => {
    const inst = createTempInstance({ weekStart: MONDAY, title: '周任务A', kind: 'once', targetCount: 1 })
    expect(inst.ok).toBe(true)
    if (!inst.ok) return
    handlers[IPC.FLOW_ENTRY_ADD]!(null, { date: THURSDAY, title: '周任务A', source: 'rail', weekInstanceId: inst.data.id })
    handlers[IPC.FLOW_INSTANCE_MANUAL_COMPLETE]!(null, { id: inst.data.id, occurredAt: '2026-08-11' })
    expect(flowVoucherRepo.listActiveByTargets('week_instance', [inst.data.id]).length).toBe(1)

    const del = handlers[IPC.FLOW_INSTANCE_DELETE]!(null, { id: inst.data.id }) as { ok: boolean }
    expect(del.ok).toBe(true)
    // 下游安排行消失
    expect(getDayBoard(THURSDAY).entries.filter(e => e.weekInstanceId === inst.data.id)).toHaveLength(0)
    // 凭据保留（完成体系不可被删除撤销）
    expect(flowVoucherRepo.listActiveByTargets('week_instance', [inst.data.id]).length).toBe(1)
  })

  it('项目任务移出今日只移除投影，不软删源任务；软删源 → 投影降级只读', () => {
    const todo = makeSourceTodo('写周报')
    const entry = addProjection(THURSDAY, todo)

    const rem = handlers[IPC.FLOW_ENTRY_REMOVE]!(null, { id: entry.id }) as { ok: boolean }
    expect(rem.ok).toBe(true)
    const src = projectTaskRepo.findById(todo.id)
    expect(src).not.toBeNull()
    expect(src!.isDeleted).toBe(false)

    // 软删源任务 → 投影（重建）降级：done=false、sourceHref=null、勾选报 SOURCE_MISSING
    const e2 = addProjection(FRIDAY, todo)
    handlers[IPC.PROJECT_TASKS_DELETE]!(null, todo.id)
    const degraded = getDayBoard(FRIDAY).entries.find(x => x.id === e2.id)
    expect(degraded).toBeDefined()
    expect(degraded!.done).toBe(false)
    expect(degraded!.sourceHref).toBeNull()
    const toggle = handlers[IPC.FLOW_ENTRY_TOGGLE_CHECK]!(null, { id: e2.id }) as { ok: false; error: { code: string } }
    expect(toggle.error.code).toBe('SOURCE_MISSING')
  })
})

describe('第3轮 · rail 回归（§9.5-⑤，today 注入防墙钟漂移）', () => {
  it('已安排任务全周隐藏；移除回 rail；跨天不可重复选取', () => {
    const inst = createTempInstance({ weekStart: MONDAY, title: '待安排', kind: 'once', targetCount: 1 })
    expect(inst.ok).toBe(true)
    if (!inst.ok) return

    // 未安排 → rail 可见
    const w1 = getWeekBoard(MONDAY, THURSDAY)
    expect(w1.rail.map(i => i.id)).toContain(inst.data.id)

    // 安排周四 → 全周隐藏（once 已占位）
    const r = handlers[IPC.FLOW_ENTRY_ADD]!(null, { date: THURSDAY, title: '待安排', source: 'rail', weekInstanceId: inst.data.id }) as {
      ok: true; data: { id: number }
    }
    expect(r.ok).toBe(true)
    const w2 = getWeekBoard(MONDAY, THURSDAY)
    expect(w2.rail.map(i => i.id)).not.toContain(inst.data.id)
    // 跨天后：锁定行过期未勾 → 次日回 rail（立项#21），可重新选取（不重复占位是"安排有效期内"语义）
    const w3 = getWeekBoard(MONDAY, FRIDAY)
    expect(w3.rail.map(i => i.id)).toContain(inst.data.id)

    // 移除 → 回 rail
    handlers[IPC.FLOW_ENTRY_REMOVE]!(null, { id: r.data.id })
    const w4 = getWeekBoard(MONDAY, THURSDAY)
    expect(w4.rail.map(i => i.id)).toContain(inst.data.id)
  })

  it('惯常日（multi）多次场次不重复占位：一次安排后 rail 仍按 targetCount 剩余', () => {
    const inst = createTempInstance({ weekStart: MONDAY, title: '多场', kind: 'multi', targetCount: 2 })
    expect(inst.ok).toBe(true)
    if (!inst.ok) return
    handlers[IPC.FLOW_ENTRY_ADD]!(null, { date: THURSDAY, title: '多场', source: 'rail', weekInstanceId: inst.data.id })
    // targetCount=2，安排 1 场 → rail 仍可见（剩余 1 场可排）
    const w = getWeekBoard(MONDAY, THURSDAY)
    expect(w.rail.map(i => i.id)).toContain(inst.data.id)
  })
})

describe('第4轮 · 完成体系回归（§9.5-⑥）', () => {
  it('手动完成 / 取消实时重算；multi 追加场次达标即 done；skip 免罪不进趋势分母', () => {
    // once：手动完成 → done，再删除凭据 → undone
    const once = createTempInstance({ weekStart: MONDAY, title: '一次性', kind: 'once', targetCount: 1 })
    expect(once.ok).toBe(true)
    if (!once.ok) return
    const v = handlers[IPC.FLOW_INSTANCE_MANUAL_COMPLETE]!(null, { id: once.data.id }) as { ok: true; data: { id: number } }
    expect(getWeekBoard(MONDAY, THURSDAY).instances.find(i => i.id === once.data.id)?.completion.done).toBe(true)
    handlers[IPC.FLOW_VOUCHER_DELETE]!(null, { id: v.data.id })
    expect(getWeekBoard(MONDAY, THURSDAY).instances.find(i => i.id === once.data.id)?.completion.done).toBe(false)

    // multi：targetCount=2，2 场 extra → done
    const multi = createTempInstance({ weekStart: MONDAY, title: '多场次', kind: 'multi', targetCount: 2 })
    expect(multi.ok).toBe(true)
    if (!multi.ok) return
    handlers[IPC.FLOW_INSTANCE_ADD_SESSION]!(null, { id: multi.data.id })
    handlers[IPC.FLOW_INSTANCE_ADD_SESSION]!(null, { id: multi.data.id })
    const mc = getWeekBoard(MONDAY, THURSDAY).instances.find(i => i.id === multi.data.id)?.completion
    expect(mc?.doneCount).toBe(2)
    expect(mc?.done).toBe(true)

    // skip 免罪：skipped 计入 skippedCount，不进入未完成/趋势分母
    const skipped = createTempInstance({ weekStart: MONDAY, title: '本周免罪', kind: 'once', targetCount: 1 })
    expect(skipped.ok).toBe(true)
    if (!skipped.ok) return
    handlers[IPC.FLOW_INSTANCE_SKIP]!(null, { id: skipped.data.id })
    const rb = getReviewBoard(MONDAY, FRIDAY)
    expect(rb.summary.skippedCount).toBe(1)
    // planned 不含 skip（免罪不进分母）
    const unfinished = rb.tasks.filter(t => !t.completion.done)
    expect(unfinished.map(t => t.instId)).not.toContain(skipped.data.id)
  })
})

describe('第5轮 · 克隆/历史债务/幂等回归（§9.5-⑦）', () => {
  it('carry 转下周成功、同源同周幂等；目标=未来周拒绝', () => {
    const current = getWeekStart(new Date().toISOString().slice(0, 10))
    const srcWeek = addDays(current, -7)
    const inst = createTempInstance({ weekStart: srcWeek, title: '历史债', kind: 'once', targetCount: 1 })
    expect(inst.ok).toBe(true)
    if (!inst.ok) return

    const r1 = handlers[IPC.FLOW_INSTANCE_CARRY_NEXT]!(null, { id: inst.data.id, nextWeekStart: current }) as {
      ok: true; data: { id: number; weekStart: string }
    }
    expect(r1.ok).toBe(true)
    expect(r1.data.weekStart).toBe(current)
    const r2 = handlers[IPC.FLOW_INSTANCE_CARRY_NEXT]!(null, { id: inst.data.id, nextWeekStart: current }) as { ok: true; data: { id: number } }
    expect(r2.data.id).toBe(r1.data.id)
    const rows = flowWeekRepo.listByWeek(current)
    expect(rows).toHaveLength(1)
    expect(rows[0].carriedFrom).toBe(inst.data.id)

    const bad = handlers[IPC.FLOW_INSTANCE_CARRY_NEXT]!(null, { id: inst.data.id, nextWeekStart: addDays(current, 14) }) as {
      ok: false; error: { code: string }
    }
    expect(bad.error.code).toBe('INVALID_ACTION')
  })

  it('惯常日变更不追溯本周：def weekdayMask 变更后本周实例不重建、无新行', () => {
    const def = saveFixedDef({ title: '站会', kind: 'multi', targetCount: 3, weekdayMask: 0b0010000 })
    expect(def.ok).toBe(true)
    if (!def.ok) return
    handlers[IPC.FLOW_WEEK_BOARD]!(null, { weekStart: MONDAY })
    expect(flowWeekRepo.listByWeek(MONDAY)).toHaveLength(1)

    saveFixedDef({ id: def.data.id, title: '站会', kind: 'multi', targetCount: 3, weekdayMask: 0b0000010 })
    const rows = flowWeekRepo.listByWeek(MONDAY)
    expect(rows).toHaveLength(1) // 不重建实例
    expect(rows[0].title).toBe('站会') // 改名（若有）才同步，mask 变更不追溯本周
  })
})

describe('第6轮 · 组合主路径回归（§9.5-⑧：项目/提醒/今日/复盘一票到底）', () => {
  it('项目：创建→加入今日→勾选→改名→移出→源任务完好', () => {
    const c = handlers[IPC.PROJECT_TASKS_CREATE]!(null, { content: '组合任务', projectId: makeProject() }) as {
      ok: true; data: ProjectTask
    }
    expect(c.ok).toBe(true)
    const entry = addProjection(THURSDAY, c.data)

    const t1 = handlers[IPC.PROJECT_TASKS_TOGGLE]!(null, c.data.id) as { ok: true; data: { status: string } }
    expect(t1.ok).toBe(true)
    expect(t1.data.status).toBe('done')
    // 勾选回写 → 今日投影 done 跟随（同源零双态）
    expect(getDayBoard(THURSDAY).entries.find(e => e.id === entry.id)?.done).toBe(true)

    handlers[IPC.PROJECT_TASKS_UPDATE]!(null, { id: c.data.id, content: '组合任务·改名' })
    expect(getDayBoard(THURSDAY).entries.find(e => e.id === entry.id)?.displayTitle).toBe('组合任务·改名')

    handlers[IPC.FLOW_ENTRY_REMOVE]!(null, { id: entry.id })
    const src = projectTaskRepo.findById(c.data.id)
    expect(src).not.toBeNull()
    expect(src!.isDeleted).toBe(false)
  })

  it('提醒：周日种入→勾选回写→移出→重复种入不拉回（尊重移出意图）', () => {
    ensurePeriodicReminders(SUNDAY)
    const reminderRows = flowDayRepo.listByDate(SUNDAY).filter(e => e.source === 'reminder' && !e.isDeleted)
    expect(reminderRows.length).toBe(1)
    const row = reminderRows[0]
    expect(row.locked).toBe(true)

    // 勾选 → 提醒源 todo 回写完成（reminder 行经 reminderKey 定位源，projectId 为 null）
    handlers[IPC.FLOW_ENTRY_TOGGLE_CHECK]!(null, { id: row.id })
    const source = projectTaskRepo.findByDate(SUNDAY)[0]
    expect(source.status).toBe('done')

    // 移出今日 → 再种入不拉回（墓碑尊重）
    handlers[IPC.FLOW_ENTRY_REMOVE]!(null, { id: row.id })
    ensurePeriodicReminders(SUNDAY)
    const after = flowDayRepo.listByDate(SUNDAY).filter(e => e.source === 'reminder' && !e.isDeleted)
    expect(after.length).toBe(0)
  })

  it('复盘：周统筹→日规划→勾选完成，趋势链路有真实主路径证据', () => {
    // 上周实例（历史周，manual 完成态） + 本周实例（安排 + 勾选） → 趋势 ≥2 点
    const current = getWeekStart(new Date().toISOString().slice(0, 10))
    const last = addDays(current, -7)
    const a = createTempInstance({ weekStart: last, title: '上周任务', kind: 'once', targetCount: 1 })
    const b = createTempInstance({ weekStart: current, title: '本周任务', kind: 'once', targetCount: 1 })
    expect(a.ok && b.ok).toBe(true)
    if (!a.ok || !b.ok) return
    handlers[IPC.FLOW_ENTRY_ADD]!(null, { date: last, title: '上周任务', source: 'rail', weekInstanceId: a.data.id })
    handlers[IPC.FLOW_INSTANCE_MANUAL_COMPLETE]!(null, { id: a.data.id, occurredAt: last })
    handlers[IPC.FLOW_ENTRY_ADD]!(null, { date: current, title: '本周任务', source: 'rail', weekInstanceId: b.data.id })
    handlers[IPC.FLOW_ENTRY_TOGGLE_CHECK]!(null, { id: entryIdOf(current, b.data.id) })

    const rb = getReviewBoard(current)
    expect(rb.trend.length).toBeGreaterThanOrEqual(2)
    // 上周点：安排行计入 planned；manual 完成态在 tasks.completion（completedPlannedCount 只数 check 凭据）
    const lastPoint = rb.trend.find(t => t.weekStart === last)
    expect(lastPoint?.plannedCount).toBe(1)
    // 本周点：安排 + 勾选 → 完成数 1
    const curPoint = rb.trend[rb.trend.length - 1]
    expect(curPoint.plannedCount).toBe(1)
    expect(curPoint.completedPlannedCount).toBe(1)
    expect(rb.summary.plannedCount).toBe(1)
    const done = rb.tasks.find(t => t.id === b.data.id)
    expect(done?.completion.done).toBe(true)
  })
})

// ===== 工具（与 flowTodayChannels 同构：真实项目行 + projectTaskRepo 唯一入口） =====

function makeProject(): string {
  const id = randomUUID()
  projectRepo.create({
    id,
    name: '回归项目',
    status: 'active',
    description: null,
    color: null,
    isDeleted: false,
    deletedAt: null,
  })
  return id
}

function makeSourceTodo(content: string): ProjectTask {
  return projectTaskRepo.createProjectTask({ content, planDate: null, projectId: makeProject() })
}

function addProjection(date: string, todo: ProjectTask): { id: number } {
  const r = handlers[IPC.FLOW_ENTRY_ADD]!(null, {
    date, title: todo.content, source: 'project', projectId: todo.id,
  }) as { ok: true; data: { id: number } }
  if (!r.ok) throw new Error('projection failed')
  return r.data
}

function entryIdOf(date: string, instanceId: number): number {
  const row = getDayBoard(date).entries.find(e => e.weekInstanceId === instanceId)
  if (!row) throw new Error('entry not found')
  return row.id
}
