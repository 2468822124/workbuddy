// ========================================
// R1 Fix1 回归测试（用户实测 R1-2）
// U-2 / R1-2-T05-C03：复盘统计口径与周任务完成态不一致（统计 0%/0，任务 3/3 已完成）
// U-3 / R1-2-T05-C05：转下周成功后历史项未收敛（仍「未完成」且保留转周入口）
// 只读派生层回归；不放宽 IPC 校验，不改动数据库写入语义。
// ========================================

import { describe, it, expect, beforeEach } from 'vitest'
import { mockConnectionDb, resetDb, MONDAY, TUESDAY, WEDNESDAY, FRIDAY } from './flowTestDb'
import { flowWeekRepo } from '../src/main/db/repositories/flowWeekRepo'
import { flowVoucherRepo } from '../src/main/db/repositories/flowVoucherRepo'
import { getReviewBoard } from '../src/main/services/flowReviewDerived'
import { createTempInstance, addEntry, carryInstance } from '../src/main/services/flowActions'
import { FlowWeekInstance } from '@shared/flowTypes'
import { addDays, getWeekStart } from '@shared/period'

mockConnectionDb()

const TODAY = FRIDAY // 2026-08-14，与 flowReview.spec.ts 同一 asOf 基准

/** carryInstance 内部走真实本地今天（不可注入）→ 转周相关周必须相对真实今天动态计算 */
function localTodayStr(): string {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}
const CURRENT_WEEK = getWeekStart(localTodayStr())
const SRC_WEEK = addDays(CURRENT_WEEK, -7) // 用户 W-1
const CARRY_TARGET = CURRENT_WEEK // 用户 W0

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

/** 直接种子凭据（控制 occurredAt；addSession/manualComplete 走真实今天，历史周须直种） */
function seedVoucher(
  targetType: 'week_instance' | 'day_entry',
  targetId: number,
  kind: 'check' | 'manual' | 'extra',
  occurredAt: string,
) {
  return flowVoucherRepo.create({ targetType, targetId, kind, occurredAt, note: null })
}

// ===== U-2：复盘统计口径 =====

describe('U-2 / R1-2-T05-C03：复盘统计与周任务完成态同口径', () => {
  beforeEach(resetDb)

  it('场次型仅由 extra 凭据完成 → 统计分子跟随完成事实，不再 0%（原始失败场景）', () => {
    // 用户原始场景：I2 = multi(3)，1 条日安排行未勾选，3 条 week_instance/extra 凭据。
    // 修复前：任务状态 3/3「已完成」，而计划完成率 0%、完成分子 0。
    const i2 = makeTempInst(MONDAY, 'I2', 'multi', 3)
    addEntryOk(MONDAY, 'I2-一', i2.id)
    seedVoucher('week_instance', i2.id, 'extra', MONDAY)
    seedVoucher('week_instance', i2.id, 'extra', TUESDAY)
    seedVoucher('week_instance', i2.id, 'extra', WEDNESDAY)

    const board = getReviewBoard(MONDAY, TODAY)
    const t = board.tasks.find(x => x.title === 'I2')
    expect(t).toMatchObject({ status: 'done' })
    expect(t?.completion.doneCount).toBe(3)

    expect(board.summary.plannedCount).toBe(1)
    expect(board.summary.completedPlannedCount).toBe(1)
    expect(board.summary.completionRate).toBe(1)

    // 日明细与趋势末点必须与摘要同源
    const mon = board.days.find(d => d.date === MONDAY)
    expect(mon).toMatchObject({ plannedCount: 1, completedPlannedCount: 1, completionRate: 1 })
    expect(board.trend[7]).toMatchObject({ plannedCount: 1, completedPlannedCount: 1 })
  })

  it('once 型 manual 凭据同样回填其计划场次', () => {
    const m = makeTempInst(MONDAY, 'M', 'once')
    addEntryOk(MONDAY, 'M-一', m.id)
    seedVoucher('week_instance', m.id, 'manual', MONDAY)

    const board = getReviewBoard(MONDAY, TODAY)
    expect(board.tasks.find(t => t.title === 'M')).toMatchObject({ status: 'done' })
    expect(board.summary).toMatchObject({ plannedCount: 1, completedPlannedCount: 1, completionRate: 1 })
  })

  it('系统外凭据回填上限=该实例计划场次数（分子不得超过分母）', () => {
    const x = makeTempInst(MONDAY, 'X', 'multi', 5)
    addEntryOk(MONDAY, 'X-一', x.id)
    for (const d of [MONDAY, TUESDAY, WEDNESDAY]) seedVoucher('week_instance', x.id, 'extra', d)

    const board = getReviewBoard(MONDAY, TODAY)
    expect(board.summary.plannedCount).toBe(1)
    expect(board.summary.completedPlannedCount).toBe(1)
    expect(board.summary.completedPlannedCount).toBeLessThanOrEqual(board.summary.plannedCount)
  })

  it('凭据按 occurredAt 同日优先归属计划场次（日明细可解释）', () => {
    const n = makeTempInst(MONDAY, 'N', 'multi', 2)
    addEntryOk(MONDAY, 'N-一', n.id)
    addEntryOk(WEDNESDAY, 'N-三', n.id)
    seedVoucher('week_instance', n.id, 'extra', WEDNESDAY) // 只完成周三那次

    const board = getReviewBoard(MONDAY, TODAY)
    const byDate = Object.fromEntries(board.days.map(d => [d.date, d]))
    expect(byDate[WEDNESDAY]).toMatchObject({ plannedCount: 1, completedPlannedCount: 1 })
    expect(byDate[MONDAY]).toMatchObject({ plannedCount: 1, completedPlannedCount: 0 })
    expect(board.summary).toMatchObject({ plannedCount: 2, completedPlannedCount: 1, completionRate: 0.5 })
  })

  it('日明细完成分子之和 = 摘要完成分子（同一口径，不再各算各的）', () => {
    const a = makeTempInst(MONDAY, 'A', 'multi', 2)
    addEntryOk(MONDAY, 'A-一', a.id)
    addEntryOk(TUESDAY, 'A-二', a.id)
    seedVoucher('week_instance', a.id, 'extra', TUESDAY)
    const b = makeTempInst(MONDAY, 'B', 'once')
    const eb = addEntryOk(WEDNESDAY, 'B-三', b.id)
    seedVoucher('day_entry', eb.id, 'check', WEDNESDAY)

    const board = getReviewBoard(MONDAY, TODAY)
    const sumDays = board.days.reduce((n, d) => n + d.completedPlannedCount, 0)
    const plannedDays = board.days.reduce((n, d) => n + d.plannedCount, 0)
    expect(sumDays).toBe(board.summary.completedPlannedCount)
    expect(plannedDays).toBe(board.summary.plannedCount)
  })

  it('未完成实例的凭据不足时统计不虚高（1 条凭据只填 1 个场次）', () => {
    const u = makeTempInst(MONDAY, 'U', 'multi', 3)
    addEntryOk(MONDAY, 'U-一', u.id)
    addEntryOk(TUESDAY, 'U-二', u.id)
    seedVoucher('week_instance', u.id, 'extra', FRIDAY) // 与任何计划日都不同 → 按日期升序回填

    const board = getReviewBoard(MONDAY, TODAY)
    expect(board.tasks.find(t => t.title === 'U')).toMatchObject({ status: 'unfinished' })
    expect(board.summary).toMatchObject({ plannedCount: 2, completedPlannedCount: 1, completionRate: 0.5 })
  })
})

// ===== U-3：转下周成功后历史项收敛 =====

describe('U-3 / R1-2-T05-C05：转下周成功后历史项状态收敛', () => {
  beforeEach(resetDb)

  it('转周前 carried=false、carryable=true；转周后 carried=true、carryable=false（原始失败场景）', () => {
    const h1 = makeTempInst(SRC_WEEK, 'H1', 'once')
    addEntryOk(SRC_WEEK, 'H1-一', h1.id)

    const before = getReviewBoard(SRC_WEEK, localTodayStr())
    expect(before.tasks.find(t => t.title === 'H1'))
      .toMatchObject({ status: 'unfinished', carried: false, carryable: true })

    const r = carryInstance(h1.id, CARRY_TARGET)
    expect(r.ok).toBe(true)

    // 修复前：源实例未变 → status 仍 unfinished、carryable 仍 true → 行保留「转下周」确认入口
    const after = getReviewBoard(SRC_WEEK, localTodayStr())
    expect(after.tasks.find(t => t.title === 'H1'))
      .toMatchObject({ status: 'unfinished', carried: true, carryable: false })
  })

  it('重复确认幂等：承接实例始终唯一，carried 保持 true', () => {
    const h1 = makeTempInst(SRC_WEEK, 'H1', 'once')
    addEntryOk(SRC_WEEK, 'H1-一', h1.id)

    expect(carryInstance(h1.id, CARRY_TARGET).ok).toBe(true)
    expect(carryInstance(h1.id, CARRY_TARGET).ok).toBe(true)

    const carried = flowWeekRepo.listActiveByCarriedFrom([h1.id])
    expect(carried).toHaveLength(1)
    expect(carried[0].weekStart).toBe(CARRY_TARGET)
    expect(getReviewBoard(SRC_WEEK, localTodayStr()).tasks.find(t => t.title === 'H1'))
      .toMatchObject({ carried: true, carryable: false })
  })

  it('承接实例被软删 → carried 回落 false、carryable 恢复（不留死状态）', () => {
    const h1 = makeTempInst(SRC_WEEK, 'H1', 'once')
    addEntryOk(SRC_WEEK, 'H1-一', h1.id)
    const r = carryInstance(h1.id, CARRY_TARGET)
    if (!r.ok) throw new Error(r.error.message)

    flowWeekRepo.softDelete(r.data.id)
    expect(flowWeekRepo.listActiveByCarriedFrom([h1.id])).toHaveLength(0)
    expect(getReviewBoard(SRC_WEEK, localTodayStr()).tasks.find(t => t.title === 'H1'))
      .toMatchObject({ carried: false, carryable: true })
  })

  it('未转周的历史周任务不受影响；其它源的承接不误标', () => {
    const h1 = makeTempInst(SRC_WEEK, 'H1', 'once')
    addEntryOk(SRC_WEEK, 'H1-一', h1.id)
    const h2 = makeTempInst(SRC_WEEK, 'H2', 'once')
    addEntryOk(SRC_WEEK, 'H2-一', h2.id)
    expect(carryInstance(h1.id, CARRY_TARGET).ok).toBe(true)

    const board = getReviewBoard(SRC_WEEK, localTodayStr())
    expect(board.tasks.find(t => t.title === 'H1')).toMatchObject({ carried: true, carryable: false })
    expect(board.tasks.find(t => t.title === 'H2')).toMatchObject({ carried: false, carryable: true })
  })

  it('listActiveByCarriedFrom：空入参返回空，不触发全表匹配', () => {
    const h1 = makeTempInst(SRC_WEEK, 'H1', 'once')
    addEntryOk(SRC_WEEK, 'H1-一', h1.id)
    expect(carryInstance(h1.id, CARRY_TARGET).ok).toBe(true)
    expect(flowWeekRepo.listActiveByCarriedFrom([])).toEqual([])
  })
})
