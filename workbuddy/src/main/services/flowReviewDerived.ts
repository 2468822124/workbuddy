import { flowWeekRepo } from '../db/repositories/flowWeekRepo'
import { flowDayRepo } from '../db/repositories/flowDayRepo'
import { flowVoucherRepo } from '../db/repositories/flowVoucherRepo'
import { completionOf, InstanceAggregate } from './flowDerived'
import { getWeekStart, getWeekRange, addDays, isValidDate } from '@shared/period'
import {
  FlowDayEntry,
  FlowReviewBoard,
  FlowReviewDay,
  FlowReviewDeferredEntry,
  FlowReviewSummary,
  FlowReviewTask,
  FlowReviewTaskStatus,
  FlowReviewTrendPoint,
  FlowWeekInstance,
} from '@shared/flowTypes'

// ========================================
// 阶段5 复盘/趋势只读派生（唯一真相出口=凭据池实时计算）：
// 本文件禁止任何写操作（无 INSERT/UPDATE/DELETE），
// 完成态复用 flowDerived.completionOf，与周统筹/日规划同一口径。
// ========================================

const TREND_WEEKS = 8
const DAY_MS = 24 * 60 * 60 * 1000

function diffDays(later: string, earlier: string): number {
  const [ly, lm, ld] = later.split('-').map(Number)
  const [ey, em, ed] = earlier.split('-').map(Number)
  return Math.round((Date.UTC(ly, lm - 1, ld) - Date.UTC(ey, em - 1, ed)) / DAY_MS)
}

/** 本地今天 YYYY-MM-DD（asOf 基准；测试可注入） */
function todayStr(): string {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** 历史周封账判定（只读展示字段，不落库） */
function isClosedWeek(weekStart: string, currentWeekStart: string): boolean {
  return weekStart < currentWeekStart
}

/**
 * R1 Fix1（U-2）：单实例「计划场次完成归属」。
 * 修复前统计分子只认安排行上的 active check 凭据，而任务完成态（completionOf）同时认
 * 实例级 manual/extra「系统外完成」凭据 —— 场次型仅靠 extra 完成时，任务显示 3/3 已完成
 * 而计划完成率为 0%（用户 R1-2-T05-C03）。这里让两者回到同一凭据池：
 * 1) 安排行自身有 active check → 该场次完成；
 * 2) 其余未勾选场次由该实例的 manual/extra 凭据回填：先按 occurredAt 同日匹配（日明细可解释），
 *    剩余凭据再按计划日升序回填；
 * 3) 回填上限=该实例计划场次数，分子恒 ≤ 分母。
 */
function completedPlannedEntryIds(
  plannedOfInst: FlowDayEntry[],
  checkDates: ReadonlyMap<number, string>,
  offBookDates: readonly string[],
): Set<number> {
  const done = new Set<number>()
  const pending: FlowDayEntry[] = []
  for (const e of plannedOfInst) {
    if (checkDates.has(e.id)) done.add(e.id)
    else pending.push(e)
  }
  if (pending.length === 0 || offBookDates.length === 0) return done

  pending.sort((a, b) => a.date.localeCompare(b.date) || a.id - b.id)
  const rest = [...offBookDates]
  const unmatched: FlowDayEntry[] = []
  for (const e of pending) {
    const i = rest.indexOf(e.date)
    if (i === -1) unmatched.push(e)
    else {
      rest.splice(i, 1)
      done.add(e.id)
    }
  }
  for (const e of unmatched) {
    if (rest.length === 0) break
    rest.pop()
    done.add(e.id)
  }
  return done
}

/**
 * 一周的复盘口径（纯计算，唯一统计真相出口）：
 * - plannedCount：目标周内、date ≤ asOf、active、未跳过实例、未跳过安排行的周实例 occurrence
 * - completedPlannedCount：上述行按 completedPlannedEntryIds 判定完成的数量（与 completionOf 同一凭据池）
 * - completedEntryIds：完成场次行 id 集合，供 7 日明细复用，保证摘要/明细/趋势同源
 * - tasks：全周实例完成态/状态/已安排/已转下周/可转下周标注
 * - deferred：顺延清单（完成以 active check occurredAt 为完成日；未完成以 asOf 为观察日）
 */
function computeWeekReview(
  weekStart: string,
  weekInstances: FlowWeekInstance[],
  todayBase: string,
  instById: ReadonlyMap<number, FlowWeekInstance>,
  entries: FlowDayEntry[],
  checkDates: ReadonlyMap<number, string>,
  manualCounts: ReadonlyMap<number, number>,
  extraCounts: ReadonlyMap<number, number>,
  offBookDates: ReadonlyMap<number, string[]>,
  carriedSourceIds: ReadonlySet<number>,
  candidates: FlowDayEntry[],
): {
  tasks: FlowReviewTask[]
  plannedCount: number
  completedPlannedCount: number
  completedEntryIds: Set<number>
  skippedCount: number
  unarrangedCount: number
  deferred: FlowReviewDeferredEntry[]
} {
  const [, weekEnd] = getWeekRange(weekStart)
  const currentWeekStart = getWeekStart(todayBase)
  const asOf = isClosedWeek(weekStart, currentWeekStart) ? weekEnd : todayBase

  const weekEntries = entries.filter(e => e.date >= weekStart && e.date <= weekEnd)
  const plannedEntries = weekEntries.filter(e =>
    e.date <= asOf && e.skippedAt === null &&
    e.weekInstanceId !== null && instById.has(e.weekInstanceId) &&
    instById.get(e.weekInstanceId as number)?.skippedAt === null,
  )
  // 完成态口径与 getWeekBoard 完全一致：doneEntryIds=窗口内全部已勾选行（未来行无凭据，等价）
  const doneEntryIds = new Set(entries.filter(e => checkDates.has(e.id)).map(e => e.id))

  const tasks: FlowReviewTask[] = []
  const completedEntryIds = new Set<number>()
  let plannedCount = 0
  let completedPlannedCount = 0
  let skippedCount = 0
  let unarrangedCount = 0

  for (const inst of weekInstances) {
    const instEntries = weekEntries.filter(e => e.weekInstanceId === inst.id)
    const completion = completionOf({
      inst,
      entries: instEntries,
      manualCount: manualCounts.get(inst.id) ?? 0,
      extraCount: extraCounts.get(inst.id) ?? 0,
      doneEntryIds,
    } as InstanceAggregate)

    // planned 计数：跳过实例的安排行整体出分母；occurrence 跳过出分母
    if (inst.skippedAt === null) {
      const planned = plannedEntries.filter(e => e.weekInstanceId === inst.id)
      const instDoneIds = completedPlannedEntryIds(planned, checkDates, offBookDates.get(inst.id) ?? [])
      plannedCount += planned.length
      completedPlannedCount += instDoneIds.size
      for (const id of instDoneIds) completedEntryIds.add(id)
      skippedCount += instEntries.filter(e => e.skippedAt !== null).length
    } else {
      skippedCount += 1
    }

    const status: FlowReviewTaskStatus = completion.skipped ? 'skipped' : (completion.done ? 'done' : 'unfinished')
    const arranged = instEntries.some(e => e.skippedAt === null)
    const unarranged = status === 'unfinished' && !arranged
    if (unarranged) unarrangedCount += 1

    // R1 Fix1（U-3）：已存在 active 承接实例 → 历史项收敛为「已转下周」，不再提供转周入口
    const carried = carriedSourceIds.has(inst.id)

    tasks.push({
      ...inst,
      completion,
      status,
      arranged,
      unarranged,
      carried,
      carryable: status === 'unfinished' && !carried && isClosedWeek(weekStart, currentWeekStart),
    })
  }

  return {
    tasks,
    plannedCount,
    completedPlannedCount,
    completedEntryIds,
    skippedCount,
    unarrangedCount,
    deferred: computeDeferred(candidates, weekStart, asOf, checkDates),
  }
}

/** 顺延清单（纯计算）：open=无 active check 且原日早于观察日；done=本周内以凭据日完成 */
function computeDeferred(
  candidates: FlowDayEntry[],
  weekStart: string,
  asOf: string,
  checkDates: ReadonlyMap<number, string>,
): FlowReviewDeferredEntry[] {
  const out: FlowReviewDeferredEntry[] = []
  for (const e of candidates) {
    const resolved = checkDates.get(e.id)
    if (resolved !== undefined) {
      if (resolved >= weekStart && resolved <= asOf && e.date < resolved) {
        out.push({
          entryId: e.id,
          title: e.title,
          source: e.source,
          originalDate: e.date,
          deferredDays: diffDays(resolved, e.date),
          status: 'done',
          resolvedAt: resolved,
          note: e.note,
        })
      }
    } else if (e.date < asOf) {
      out.push({
        entryId: e.id,
        title: e.title,
        source: e.source,
        originalDate: e.date,
        deferredDays: diffDays(asOf, e.date),
        status: 'open',
        resolvedAt: null,
        note: e.note,
      })
    }
  }
  out.sort((a, b) =>
    b.deferredDays - a.deferredDays ||
    a.originalDate.localeCompare(b.originalDate) ||
    a.entryId - b.entryId,
  )
  return out
}

function summaryOf(w: Awaited<ReturnType<typeof computeWeekReview>>): FlowReviewSummary {
  return {
    plannedCount: w.plannedCount,
    completedPlannedCount: w.completedPlannedCount,
    completionRate: w.plannedCount === 0 ? null : w.completedPlannedCount / w.plannedCount,
    deferredCount: w.deferred.length,
    unfinishedCount: w.tasks.filter(t => t.status === 'unfinished').length,
    unarrangedCount: w.unarrangedCount,
    skippedCount: w.skippedCount,
  }
}

/**
 * 7 天明细（纯计算）：只计目标周实例、date ≤ asOf、未跳过的 occurrence。
 * R1 Fix1（U-2）：完成判定复用选定周的 completedEntryIds，保证 Σ日明细 = 周摘要。
 */
function computeDays(
  weekStart: string,
  todayBase: string,
  instById: ReadonlyMap<number, FlowWeekInstance>,
  entries: FlowDayEntry[],
  completedEntryIds: ReadonlySet<number>,
): FlowReviewDay[] {
  const [, weekEnd] = getWeekRange(weekStart)
  const currentWeekStart = getWeekStart(todayBase)
  const asOf = isClosedWeek(weekStart, currentWeekStart) ? weekEnd : todayBase
  const days: FlowReviewDay[] = []
  for (let i = 0; i < 7; i++) {
    const date = addDays(weekStart, i)
    const planned = entries.filter(e =>
      e.date === date && e.date <= asOf && e.skippedAt === null &&
      e.weekInstanceId !== null && instById.has(e.weekInstanceId) &&
      instById.get(e.weekInstanceId as number)?.skippedAt === null,
    )
    const completed = planned.filter(e => completedEntryIds.has(e.id)).length
    days.push({
      date,
      plannedCount: planned.length,
      completedPlannedCount: completed,
      completionRate: planned.length === 0 ? null : completed / planned.length,
    })
  }
  return days
}

/**
 * 复盘面板（只读）：
 * - 选定周（本周/历史周）摘要、7 日明细、任务状态、顺延清单
 * - 以选定周为末点的最近 8 周趋势（同一口径重复计算，末点与选定周一致）
 * - isClosed 只是展示字段；不写封账状态、不写统计快照
 */
export function getReviewBoard(weekStart: string, today?: string): FlowReviewBoard {
  // 服务层第二道真实日历校验（F4）：'2026-02-31' 若放行会被 getWeekStart 静默归一，违反 INVALID_INPUT 契约
  if (!isValidDate(weekStart)) throw new Error('weekStart 非法日期')
  const todayBase = today ?? todayStr()
  const currentWeekStart = getWeekStart(todayBase)
  if (weekStart > currentWeekStart) throw new Error('复盘仅支持本周及历史周')

  const selectedAsOf = isClosedWeek(weekStart, currentWeekStart)
    ? getWeekRange(weekStart)[1]
    : todayBase
  const windowStart = addDays(weekStart, -(7 * (TREND_WEEKS - 1)))
  const windowEnd = getWeekRange(weekStart)[1]

  // 一次性读取趋势窗口数据（按 id 建 Map，不在循环内按标题查询）
  const weekStarts = Array.from({ length: TREND_WEEKS }, (_, i) => addDays(windowStart, i * 7))
  const instances = weekStarts.flatMap(w => flowWeekRepo.listByWeek(w))
  const instById = new Map(instances.map(i => [i.id, i]))
  const entries = flowDayRepo.listByDateRange(windowStart, windowEnd)
  const entryIds = entries.map(e => e.id)
  const instVouchers = flowVoucherRepo.listActiveByTargets('week_instance', instances.map(i => i.id))
  const entryChecks = flowVoucherRepo.listActiveByTargets('day_entry', entryIds)

  const checkDates = new Map<number, string>()
  for (const v of entryChecks) {
    if (v.kind !== 'check') continue
    const prev = checkDates.get(v.targetId)
    if (prev === undefined || v.occurredAt < prev) checkDates.set(v.targetId, v.occurredAt)
  }
  const manualCounts = new Map<number, number>()
  const extraCounts = new Map<number, number>()
  // R1 Fix1（U-2）：系统外完成凭据的 occurredAt 清单，供计划场次归属（同日优先）
  const offBookDates = new Map<number, string[]>()
  for (const v of instVouchers) {
    const target = v.targetId
    if (v.kind === 'manual') manualCounts.set(target, (manualCounts.get(target) ?? 0) + 1)
    else if (v.kind === 'extra') extraCounts.set(target, (extraCounts.get(target) ?? 0) + 1)
    else continue
    const dates = offBookDates.get(target)
    if (dates) dates.push(v.occurredAt)
    else offBookDates.set(target, [v.occurredAt])
  }

  // R1 Fix1（U-3）：已有 active 承接实例的源实例 id（承接周落在窗口外，须单独查）
  const carriedSourceIds = new Set<number>()
  for (const c of flowWeekRepo.listActiveByCarriedFrom(instances.map(i => i.id))) {
    const src = c.carriedFrom === null ? undefined : instById.get(c.carriedFrom)
    if (src && c.weekStart === addDays(src.weekStart, 7)) carriedSourceIds.add(src.id)
  }

  const candidates = flowDayRepo.listDeferredCandidatesForReview(selectedAsOf)

  // 逐周同一口径计算（趋势顺序从最早到最晚，末点为选定周）
  const weekResults = weekStarts.map(ws =>
    computeWeekReview(ws, instances.filter(i => i.weekStart === ws), todayBase, instById, entries, checkDates, manualCounts, extraCounts, offBookDates, carriedSourceIds, candidates),
  )

  const selected = weekResults[TREND_WEEKS - 1]

  const trend: FlowReviewTrendPoint[] = weekResults.map((w, i) => ({
    weekStart: weekStarts[i],
    weekEnd: getWeekRange(weekStarts[i])[1],
    asOf: isClosedWeek(weekStarts[i], currentWeekStart) ? getWeekRange(weekStarts[i])[1] : todayBase,
    plannedCount: w.plannedCount,
    completedPlannedCount: w.completedPlannedCount,
    completionRate: w.plannedCount === 0 ? null : w.completedPlannedCount / w.plannedCount,
    deferredCount: w.deferred.length,
    unarrangedCount: w.unarrangedCount,
  }))

  return {
    weekStart,
    weekEnd: getWeekRange(weekStart)[1],
    asOf: selectedAsOf,
    isClosed: isClosedWeek(weekStart, currentWeekStart),
    summary: summaryOf(selected),
    days: computeDays(weekStart, todayBase, instById, entries, selected.completedEntryIds),
    tasks: selected.tasks,
    deferred: selected.deferred,
    trend,
  }
}
