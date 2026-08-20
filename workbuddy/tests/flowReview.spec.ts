import { describe, it, expect, beforeEach } from 'vitest'
import {
  mockConnectionDb, resetDb,
  MONDAY, TUESDAY, WEDNESDAY, THURSDAY, FRIDAY, NEXT_MONDAY,
} from './flowTestDb'
import { flowWeekRepo } from '../src/main/db/repositories/flowWeekRepo'
import { flowDayRepo } from '../src/main/db/repositories/flowDayRepo'
import { flowVoucherRepo } from '../src/main/db/repositories/flowVoucherRepo'
import { getReviewBoard } from '../src/main/services/flowReviewDerived'
import {
  createTempInstance, addEntry, toggleCheckEntry, skipInstance,
  manualCompleteInstance, addSession, carryInstance,
} from '../src/main/services/flowActions'
import { FlowWeekInstance } from '@shared/flowTypes'
import { addDays, getWeekStart } from '@shared/period'

mockConnectionDb()

// 今天基准 = 周五（复盘 asOf 基准，可注入 getReviewBoard）
const TODAY = FRIDAY // 2026-08-14
const LAST_WEEK = '2026-08-03' // 历史周（上周一）
// carryInstance 用真实今天（不可注入，flowActions 内 todayStr 走本地 getter），
// carry 相关周必须相对真实本地今天动态计算（教训：硬编码周会随真实时间推移失效）：
// 当前周 = 本地今天所在周；上周 = 当前周-7 天
function localTodayStr(): string {
  const now = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}
const CURRENT_WEEK = getWeekStart(localTodayStr())
const SRC_WEEK = addDays(CURRENT_WEEK, -7) // 上周（历史周）
const CARRY_TARGET = CURRENT_WEEK // R1（复审2）：目标=当前周，应放行
const FUTURE_TARGET = addDays(CURRENT_WEEK, 7) // 目标=未来周，应拒绝

function makeTempInst(weekStart: string, title: string, kind: FlowWeekInstance['kind'] = 'once', targetCount = 1): FlowWeekInstance {
  const r = createTempInstance({ weekStart, title, kind, targetCount })
  if (!r.ok) throw new Error(r.error.message)
  return r.data
}

function addEntryOk(weekStart: string, title: string, overrides: Partial<Parameters<typeof addEntry>[0]> = {}) {
  const r = addEntry({
    date: weekStart,
    title,
    source: 'manual', // 默认自由行；挂周任务实例的测试用 overrides 覆盖 source:'rail'+weekInstanceId
    weekInstanceId: null,
    ...overrides,
  })
  if (!r.ok) throw new Error(r.error.message)
  return r.data
}

/** 直接种子 check 凭据（控制 occurredAt；toggle 用真实今天，测历史须直种） */
function seedCheck(entryId: number, occurredAt: string) {
  return flowVoucherRepo.create({ targetType: 'day_entry', targetId: entryId, kind: 'check', occurredAt, note: null })
}

describe('仓储 helper（阶段5）', () => {
  beforeEach(resetDb)

  it('listByDateRange：按日期范围过滤 active 行', () => {
    const e1 = addEntryOk(MONDAY, '一')
    const e2 = addEntryOk(TUESDAY, '二')
    const e3 = addEntryOk(FRIDAY, '三')
    flowDayRepo.softDelete(e2.id)

    expect(flowDayRepo.listByDateRange(TUESDAY, THURSDAY).map(r => r.title)).toEqual([]) // 唯一含行已软删
    expect(flowDayRepo.listByDateRange(MONDAY, FRIDAY).map(r => r.title)).toEqual(['一', '三'])
    expect(flowDayRepo.listByDateRange(MONDAY, TUESDAY).map(r => r.title)).toEqual(['一'])
  })

  it('listDeferredCandidatesForReview：自由行/非提醒/未锁/未跳过，date ≤ 上限', () => {
    const free = addEntryOk(MONDAY, '自由行')
    const inst = makeTempInst(MONDAY, '周任务')
    addEntryOk(MONDAY, '周安排', { weekInstanceId: inst.id })
    addEntryOk(MONDAY, '锁定行', { locked: true })
    addEntryOk(MONDAY, '提醒行', { source: 'reminder', reminderKey: 'weekly' })
    const after = addEntryOk('2026-08-15', '晚于上限')

    flowDayRepo.update(free.id, { skippedAt: '2026-08-12' })
    flowDayRepo.update(after.id, { skippedAt: null })

    const rows = flowDayRepo.listDeferredCandidatesForReview(THURSDAY)
    expect(rows.map(r => r.title)).toEqual([]) // 唯一自由行被跳过 → 空
    expect(flowDayRepo.listDeferredCandidatesForReview('2026-08-16').map(r => r.title))
      .toEqual(['晚于上限'])
  })

  it('findActiveByCarry：同源同目标周查 active 承接实例；异周/未知源查不到', () => {
    const src = makeTempInst(SRC_WEEK, '债')
    const created = carryInstance(src.id, CARRY_TARGET)
    expect(created.ok).toBe(true)
    if (!created.ok) return

    const found = flowWeekRepo.findActiveByCarry(src.id, CARRY_TARGET)
    expect(found?.id).toBe(created.data.id)
    expect(found?.carriedFrom).toBe(src.id)
    expect(flowWeekRepo.findActiveByCarry(src.id, MONDAY)).toBeUndefined()
    expect(flowWeekRepo.findActiveByCarry(9999, CARRY_TARGET)).toBeUndefined()
  })
})

describe('复盘派生 getReviewBoard：本周', () => {
  beforeEach(resetDb)

  it('计划/完成/未完成/跳过/未安排统计与 7 日明细、asOf=今天', () => {
    const a = makeTempInst(MONDAY, 'A', 'once')
    const b = makeTempInst(MONDAY, 'B', 'once')
    const c = makeTempInst(MONDAY, 'C', 'multi', 2)
    const ea1 = addEntryOk(MONDAY, 'A-一', { weekInstanceId: a.id })
    const ea2 = addEntryOk(TUESDAY, 'A-二', { weekInstanceId: a.id })
    const eb1 = addEntryOk(WEDNESDAY, 'B-三', { weekInstanceId: b.id })
    const ec1 = addEntryOk(MONDAY, 'C-一', { weekInstanceId: c.id })
    seedCheck(eb1.id, WEDNESDAY)
    addSession(c.id) // extra ×1
    seedCheck(ec1.id, MONDAY) // doneCount = extra1 + check1 = 2 ≥ 2 → done
    skipInstance(makeTempInst(MONDAY, 'S', 'once').id)
    // 未安排：D 无任何安排行
    makeTempInst(MONDAY, 'D', 'once')
    // 明日安排（> asOf）：E 的 08-15 行不计计划但算已安排
    const e = makeTempInst(MONDAY, 'E', 'once')
    addEntryOk('2026-08-15', 'E-六', { weekInstanceId: e.id })

    const board = getReviewBoard(MONDAY, TODAY)
    expect(board.weekStart).toBe(MONDAY)
    expect(board.isClosed).toBe(false)
    expect(board.asOf).toBe(TODAY)
    // planned：A×2 + B×1 + C×1（E 明日在 asOf 后） = 4；completed = B 1 + C 1 = 2
    expect(board.summary.plannedCount).toBe(4)
    expect(board.summary.completedPlannedCount).toBe(2)
    expect(board.summary.completionRate).toBe(0.5)
    expect(board.summary.skippedCount).toBe(1)
    expect(board.summary.unfinishedCount).toBe(3) // A、D、E（B、C done，S skipped）
    expect(board.summary.unarrangedCount).toBe(1) // D

    const tA = board.tasks.find(t => t.title === 'A')
    expect(tA).toMatchObject({ status: 'unfinished', arranged: true, unarranged: false, carryable: false })
    const tB = board.tasks.find(t => t.title === 'B')
    expect(tB).toMatchObject({ status: 'done' })
    const tC = board.tasks.find(t => t.title === 'C')
    expect(tC?.completion.doneCount).toBe(2)
    const tS = board.tasks.find(t => t.title === 'S')
    expect(tS).toMatchObject({ status: 'skipped', arranged: false })
    const tD = board.tasks.find(t => t.title === 'D')
    expect(tD).toMatchObject({ status: 'unfinished', arranged: false, unarranged: true })
    const tE = board.tasks.find(t => t.title === 'E')
    expect(tE).toMatchObject({ status: 'unfinished', arranged: true }) // 未来安排也算已安排

    // 7 日明细：周一 A1(未勾)+C1(已勾)=2/1，周二 A2=1/0，周三 B1=1/1，周四 0，周五 0，周六 1/0，周日 0
    const byDate = Object.fromEntries(board.days.map(d => [d.date, d]))
    expect(byDate[MONDAY]).toMatchObject({ plannedCount: 2, completedPlannedCount: 1 })
    expect(byDate[TUESDAY]).toMatchObject({ plannedCount: 1, completedPlannedCount: 0 })
    expect(byDate[WEDNESDAY]).toMatchObject({ plannedCount: 1, completedPlannedCount: 1 })
    expect(byDate[THURSDAY]).toMatchObject({ plannedCount: 0, completionRate: null })
    expect(byDate['2026-08-15']).toMatchObject({ plannedCount: 0 }) // 明日不计计划
    expect(board.days).toHaveLength(7)
  })

  it('顺延清单（本周视图）：open 项 + done 项（凭据日在周内且晚于原日）', () => {
    // open：周一自由行未勾，观察日=今天
    const o1 = addEntryOk(MONDAY, '顺延中', { source: 'manual' })
    // done：周一自由行周三勾 → 凭据日在 [周起, asOf] 且晚于原日
    const d1 = addEntryOk(MONDAY, '周内已补', { source: 'manual' })
    seedCheck(d1.id, WEDNESDAY)
    // 同天勾：不构成顺延（originalDate < occurredAt 不成立）
    const same = addEntryOk(MONDAY, '当日完成', { source: 'manual' })
    seedCheck(same.id, MONDAY)
    // 周实例归属行不进顺延
    const inst = makeTempInst(MONDAY, '周任务')
    addEntryOk(MONDAY, '周安排', { weekInstanceId: inst.id })

    const board = getReviewBoard(MONDAY, TODAY)
    expect(board.deferred.map(d => d.title)).toEqual(['顺延中', '周内已补'])
    const open = board.deferred.find(d => d.title === '顺延中')
    expect(open).toMatchObject({ status: 'open', deferredDays: 4, resolvedAt: null }) // 08-14 - 08-10
    const done = board.deferred.find(d => d.title === '周内已补')
    expect(done).toMatchObject({ status: 'done', resolvedAt: WEDNESDAY, deferredDays: 2 })
    expect(board.summary.deferredCount).toBe(2)
  })

  it('趋势：恰好 8 点升序，末点=选定周，空周完成率 null', () => {
    makeTempInst(MONDAY, 'A', 'once')
    const e = addEntryOk(MONDAY, 'A-一', { weekInstanceId: makeTempInst(MONDAY, 'B', 'once').id })
    seedCheck(e.id, MONDAY)

    const board = getReviewBoard(MONDAY, TODAY)
    expect(board.trend).toHaveLength(8)
    expect(board.trend[0].weekStart).toBe('2026-06-22') // 08-10 - 49 天
    expect(board.trend[7]).toMatchObject({
      weekStart: MONDAY,
      plannedCount: 1,
      completedPlannedCount: 1,
      completionRate: 1,
    })
    expect(board.trend[0]).toMatchObject({ plannedCount: 0, completionRate: null })
    for (let i = 1; i < 8; i++) {
      expect(board.trend[i].weekStart).toBe(addDaysOf(board.trend[i - 1].weekStart, 7))
    }
    // 末点与选定周摘要同口径
    expect(board.summary.plannedCount).toBe(board.trend[7].plannedCount)
    expect(board.summary.completedPlannedCount).toBe(board.trend[7].completedPlannedCount)
  })
})

describe('复盘派生 getReviewBoard：历史周', () => {
  beforeEach(resetDb)

  it('asOf=周日、isClosed=true、未完成可转下周', () => {
    const a = makeTempInst(LAST_WEEK, 'A', 'once')
    const ea1 = addEntryOk(LAST_WEEK, 'A-一', { weekInstanceId: a.id })
    const ea2 = addEntryOk('2026-08-04', 'A-二', { weekInstanceId: a.id })
    const done = makeTempInst(LAST_WEEK, 'B', 'once')
    const eb = addEntryOk('2026-08-06', 'B-三', { weekInstanceId: done.id })
    seedCheck(eb.id, '2026-08-07')
    // 周后行（08-10）不算计划（周界外）
    addEntryOk(MONDAY, 'A-次周', { weekInstanceId: a.id })

    const board = getReviewBoard(LAST_WEEK, TODAY)
    expect(board.isClosed).toBe(true)
    expect(board.asOf).toBe('2026-08-09')
    expect(board.summary.plannedCount).toBe(3) // A×2 + B×1（周后行出局）
    expect(board.summary.completedPlannedCount).toBe(1)
    const tA = board.tasks.find(t => t.title === 'A')
    expect(tA).toMatchObject({ status: 'unfinished', carryable: true })
    const tB = board.tasks.find(t => t.title === 'B')
    expect(tB).toMatchObject({ status: 'done', carryable: false })
  })

  it('顺延 done：历史周内以凭据日完成（原日早于完成日）', () => {
    const d1 = addEntryOk(LAST_WEEK, '周内补完', { source: 'manual' })
    seedCheck(d1.id, '2026-08-08')
    const o1 = addEntryOk('2026-08-05', '未完成', { source: 'manual' })

    const board = getReviewBoard(LAST_WEEK, TODAY)
    const done = board.deferred.find(d => d.title === '周内补完')
    expect(done).toMatchObject({ status: 'done', resolvedAt: '2026-08-08', deferredDays: 5 })
    const open = board.deferred.find(d => d.title === '未完成')
    expect(open).toMatchObject({ status: 'open', deferredDays: 4 }) // 08-09 - 08-05
  })

  it('未来周拒绝（服务双保险）', () => {
    expect(() => getReviewBoard(NEXT_MONDAY, TODAY)).toThrow('复盘仅支持本周及历史周')
  })
})

describe('转下周 carryInstance 守卫与幂等', () => {
  beforeEach(resetDb)

  it('R1 回归：上周未完成 → 转当前周成功（建承接实例，carriedFrom 回链）；重复调用幂等返回同一实例', () => {
    const src = makeTempInst(SRC_WEEK, '债')
    addEntryOk(SRC_WEEK, '债-一', { weekInstanceId: src.id })

    const r1 = carryInstance(src.id, CARRY_TARGET) // CARRY_TARGET = 当前周
    expect(r1.ok).toBe(true)
    if (!r1.ok) return
    expect(r1.data).toMatchObject({ weekStart: CURRENT_WEEK, origin: 'temp', kind: 'once', carriedFrom: src.id })

    const r2 = carryInstance(src.id, CARRY_TARGET)
    expect(r2.ok).toBe(true)
    if (!r2.ok) return
    expect(r2.data.id).toBe(r1.data.id) // 幂等：不重复建

    const rows = flowWeekRepo.listByWeek(CARRY_TARGET)
    expect(rows).toHaveLength(1)
    expect(rows[0].carriedFrom).toBe(src.id)
  })

  it('守卫：不存在 / 非法日期 / 非下周 / 未来周 / 已完成 / 已跳过', () => {
    const a = makeTempInst(SRC_WEEK, 'A')
    const ea = addEntryOk(SRC_WEEK, 'A-一', { weekInstanceId: a.id })
    seedCheck(ea.id, SRC_WEEK) // 完成凭据（源周周一）
    const s = makeTempInst(SRC_WEEK, 'S')
    skipInstance(s.id)

    expect(carryInstance(9999, CARRY_TARGET).ok).toBe(false) // NOT_FOUND
    const badDate = carryInstance(a.id, '2026-13-99')
    expect(badDate.ok).toBe(false)
    if (!badDate.ok) expect(badDate.error.code).toBe('INVALID_INPUT')
    const notNext = carryInstance(a.id, addDays(SRC_WEEK, -7)) // 目标=源周前一周 ≠ 源周+7
    expect(notNext.ok).toBe(false)
    if (!notNext.ok) expect(notNext.error.code).toBe('INVALID_ACTION')
    // R1：源周=当前周 → 目标=源周+7=未来周 → 拒绝（与「上周转本周」放行区分）
    const cw = makeTempInst(CURRENT_WEEK, '本周债')
    const future = carryInstance(cw.id, FUTURE_TARGET)
    expect(future.ok).toBe(false)
    if (!future.ok) expect(future.error.code).toBe('INVALID_ACTION')
    expect(carryInstance(a.id, CARRY_TARGET).ok).toBe(false) // 已完成（凭据日=源周）
    if (!carryInstance(a.id, CARRY_TARGET).ok) expect(carryInstance(a.id, CARRY_TARGET).error?.code).toBe('INVALID_ACTION')
    expect(carryInstance(s.id, CARRY_TARGET).ok).toBe(false) // 已跳过
    if (!carryInstance(s.id, CARRY_TARGET).ok) expect(carryInstance(s.id, CARRY_TARGET).error?.code).toBe('INVALID_ACTION')
  })

  it('未完成任务转下周后，源实例保留（历史不丢）', () => {
    const src = makeTempInst(SRC_WEEK, '债')
    const r = carryInstance(src.id, CARRY_TARGET)
    expect(r.ok).toBe(true)
    expect(flowWeekRepo.findById(src.id)).toBeDefined()
  })
})

describe('复盘派生 getReviewBoard：边界（F5）', () => {
  beforeEach(resetDb)

  it('空库 → 全零摘要、7 空日、空任务/顺延、8 空趋势点', () => {
    const board = getReviewBoard(MONDAY, TODAY)
    expect(board.summary).toEqual({
      plannedCount: 0,
      completedPlannedCount: 0,
      completionRate: null,
      deferredCount: 0,
      unfinishedCount: 0,
      unarrangedCount: 0,
      skippedCount: 0,
    })
    expect(board.days).toHaveLength(7)
    expect(board.days.every(d => d.plannedCount === 0 && d.completedPlannedCount === 0 && d.completionRate === null)).toBe(true)
    expect(board.tasks).toEqual([])
    expect(board.deferred).toEqual([])
    expect(board.trend).toHaveLength(8)
    expect(board.trend.every(p => p.plannedCount === 0 && p.completionRate === null)).toBe(true)
  })

  it('孤立完成凭据（行软删/不存在）被忽略，不破坏派生', () => {
    const a = makeTempInst(MONDAY, 'A')
    const ea = addEntryOk(MONDAY, 'A-一', { weekInstanceId: a.id })
    seedCheck(ea.id, MONDAY)
    seedCheck(99999, MONDAY) // 孤立 check：目标行不存在
    flowDayRepo.softDelete(ea.id) // 行软删后其凭据成孤儿

    const board = getReviewBoard(MONDAY, TODAY)
    expect(board.summary.plannedCount).toBe(0) // 行已软删 → 不计计划
    expect(board.summary.completedPlannedCount).toBe(0)
    expect(board.summary.deferredCount).toBe(0)
    expect(board.days.every(d => d.plannedCount === 0)).toBe(true)
  })

  it("非法日期 '2026-02-31' 服务层拒绝（F4 真实日历，非静默进位）", () => {
    expect(() => getReviewBoard('2026-02-31', TODAY)).toThrow('weekStart 非法日期')
  })

  it("转下周 '2026-02-31' 非法目标 → INVALID_INPUT（F4 真实日历）", () => {
    const src = makeTempInst(SRC_WEEK, '债')
    const r = carryInstance(src.id, '2026-02-31')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.code).toBe('INVALID_INPUT')
  })

  it('历史编辑实时回读：补种凭据后重载计数变化（无缓存，凭据池即时派生）', () => {
    const a = makeTempInst(LAST_WEEK, 'A')
    addEntryOk(LAST_WEEK, 'A-一', { weekInstanceId: a.id })
    addEntryOk('2026-08-04', 'A-二', { weekInstanceId: a.id })

    const before = getReviewBoard(LAST_WEEK, TODAY)
    expect(before.summary.completedPlannedCount).toBe(0)

    const afterSeed = flowDayRepo.listByDateRange(LAST_WEEK, '2026-08-09')[0]
    seedCheck(afterSeed.id, '2026-08-05') // 历史日补勾（等价历史编辑完成）
    const after = getReviewBoard(LAST_WEEK, TODAY)
    expect(after.summary.completedPlannedCount).toBe(1)
    expect(after.summary.completionRate).toBe(0.5)
    // once 实例任一安排行完成即 done（doneCount ≥ targetCount=1），状态实时翻转
    expect(after.tasks.find(t => t.title === 'A')).toMatchObject({ status: 'done' })
  })
})

/** 工具：周起始 + N 天（纯 UTC 字符串算术，避免日期库依赖） */
function addDaysOf(date: string, n: number): string {
  const [y, m, d] = date.split('-').map(Number)
  const t = new Date(Date.UTC(y, m - 1, d + n))
  return t.toISOString().slice(0, 10)
}
