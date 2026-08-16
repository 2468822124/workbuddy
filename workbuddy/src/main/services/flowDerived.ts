import { flowWeekRepo } from '../db/repositories/flowWeekRepo'
import { flowDayRepo } from '../db/repositories/flowDayRepo'
import { flowVoucherRepo } from '../db/repositories/flowVoucherRepo'
import { flowGoalRepo } from '../db/repositories/flowGoalRepo'
import {
  FlowWeekInstance,
  FlowDayEntry,
  InstanceCompletion,
  WeekBoard,
  DayBoard,
  DayBoardEntry,
  FlowVoucherView,
} from '@shared/flowTypes'

// ========================================
// 派生查询（只读唯一真相出口）：完成态/rail/顺延全部实时计算，
// 本文件禁止任何写操作（无 INSERT/UPDATE/DELETE）。
// ========================================

const DAY_MS = 24 * 60 * 60 * 1000

function diffDays(later: string, earlier: string): number {
  const [ly, lm, ld] = later.split('-').map(Number)
  const [ey, em, ed] = earlier.split('-').map(Number)
  return Math.round((Date.UTC(ly, lm - 1, ld) - Date.UTC(ey, em - 1, ed)) / DAY_MS)
}

/** 本地今天 YYYY-MM-DD（rail 活跃判定基准；测试可注入） */
function todayStr(): string {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

interface InstanceAggregate {
  inst: FlowWeekInstance
  entries: FlowDayEntry[]
  manualCount: number
  extraCount: number
  doneEntryIds: Set<number>
}

/**
 * 完成态（唯一事实=凭据池，纯派生）：
 * - once：manual 凭据 ≥1 或任一安排行勾选
 * - multi：doneCount = manual + extra + 勾选安排行；doneCount ≥ targetCount
 * arrangedCount = 全周有效安排行数（不含跳过）；rail 活跃度另按"未过期安排"判。
 */
function completionOf(a: InstanceAggregate): InstanceCompletion {
  const { inst, entries, manualCount, extraCount, doneEntryIds } = a
  const doneEntries = entries.filter(e => doneEntryIds.has(e.id))
  const arrangedCount = entries.filter(e => e.skippedAt === null).length
  const doneCount = manualCount + extraCount + doneEntries.length
  const done = inst.kind === 'once'
    ? manualCount > 0 || doneEntries.length > 0
    : doneCount >= inst.targetCount
  return {
    instanceId: inst.id,
    done,
    doneCount,
    targetCount: inst.targetCount,
    arrangedCount,
    skipped: inst.skippedAt !== null,
  }
}

/**
 * 周面板：实例+完成态、rail（今日可选取清单）、周核心目标。
 * rail 活跃安排 = date >= 今天 的有效安排行：过期未勾（锁定行次日回 rail，立项#21）
 * 不再占位；今日/未来的安排全周隐藏（立项#20 跨天不可重复选取）。
 */
export function getWeekBoard(weekStart: string, today?: string): WeekBoard {
  const todayBase = today ?? todayStr()
  const instances = flowWeekRepo.listByWeek(weekStart)
  const instIds = instances.map(i => i.id)
  const entries = flowDayRepo.findByInstanceIds(instIds)
  const entryIds = entries.map(e => e.id)
  const instVouchers = flowVoucherRepo.listActiveByTargets('week_instance', instIds)
  const entryChecks = flowVoucherRepo.listActiveByTargets('day_entry', entryIds)
  const checkTargets = new Set(entryChecks.filter(v => v.kind === 'check').map(v => v.targetId))

  const aggregates: InstanceAggregate[] = instances.map(inst => ({
    inst,
    entries: entries.filter(e => e.weekInstanceId === inst.id),
    manualCount: instVouchers.filter(v => v.targetId === inst.id && v.kind === 'manual').length,
    extraCount: instVouchers.filter(v => v.targetId === inst.id && v.kind === 'extra').length,
    doneEntryIds: checkTargets,
  }))

  const completionMap = new Map<number, InstanceCompletion>()
  const rail: FlowWeekInstance[] = []

  // 凭据视图（阶段2 凭据弹层数据源）：manual/extra 挂实例；check 挂安排行 → 归到所在实例标题
  const instTitleMap = new Map(instances.map(i => [i.id, i.title]))
  const entryInstMap = new Map(entries.filter(e => e.weekInstanceId !== null).map(e => [e.id, e.weekInstanceId as number]))
  const vouchers: FlowVoucherView[] = [...instVouchers, ...entryChecks].map(v => ({
    ...v,
    targetTitle: v.targetType === 'week_instance'
      ? (instTitleMap.get(v.targetId) ?? '')
      : (instTitleMap.get(entryInstMap.get(v.targetId) ?? -1) ?? ''),
    instanceId: v.targetType === 'week_instance'
      ? v.targetId
      : (entryInstMap.get(v.targetId) ?? null),
  }))

  for (const agg of aggregates) {
    const c = completionOf(agg)
    completionMap.set(agg.inst.id, c)
    const activeArranged = agg.entries.filter(e => e.skippedAt === null && e.date >= todayBase).length
    const visible = !c.skipped && !c.done &&
      (agg.inst.kind === 'once' ? activeArranged === 0 : activeArranged < agg.inst.targetCount)
    if (visible) rail.push(agg.inst)
  }

  return {
    weekStart,
    instances: instances.map(inst => ({ ...inst, completion: completionMap.get(inst.id) as InstanceCompletion })),
    rail,
    focus: flowGoalRepo.listFocusByWeek(weekStart),
    vouchers,
  }
}

/** 日面板：当日行 + 读时派生顺延（零写入；锁定行不顺延） */
export function getDayBoard(date: string): DayBoard {
  const todayEntries = flowDayRepo.listByDate(date)
  const candidates = flowDayRepo.listDeferredCandidates(date)

  const all = [...todayEntries, ...candidates]
  const ids = all.map(e => e.id)
  const checks = flowVoucherRepo.listActiveByTargets('day_entry', ids)
  const doneIds = new Set(checks.filter(v => v.kind === 'check').map(v => v.targetId))

  // 顺延候选排除已完成（完成留原日历史；仅未完成继续顺延）
  const deferredOpen = candidates.filter(e => !doneIds.has(e.id))

  const instIds = [...new Set(
    [...todayEntries, ...deferredOpen]
      .filter(e => e.weekInstanceId !== null)
      .map(e => e.weekInstanceId as number)
  )]
  const instMap = new Map<number, string>()
  for (const id of instIds) {
    const inst = flowWeekRepo.findById(id)
    if (inst) instMap.set(id, inst.title)
  }

  const toBoardEntry = (e: FlowDayEntry, isDeferred: boolean): DayBoardEntry => ({
    ...e,
    done: doneIds.has(e.id),
    deferredCount: isDeferred ? diffDays(date, e.date) : 0,
    displayTitle: e.locked && e.weekInstanceId !== null
      ? (instMap.get(e.weekInstanceId) ?? e.title)
      : e.title,
  })

  const entries: DayBoardEntry[] = [
    ...todayEntries
      .filter(e => e.skippedAt === null)
      .map(e => toBoardEntry(e, false)),
    ...deferredOpen.map(e => toBoardEntry(e, true)),
  ]

  return { date, entries }
}

/**
 * 预留位（阶段5 实现）：跨周趋势统计（完成率曲线/顺延重灾区）。
 * 阶段1 不实现，保持接口位稳定供上层预留。
 */
export function getStats(): null {
  return null
}
