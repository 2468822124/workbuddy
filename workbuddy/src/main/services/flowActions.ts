import { flowFixedRepo } from '../db/repositories/flowFixedRepo'
import { flowWeekRepo } from '../db/repositories/flowWeekRepo'
import { flowDayRepo } from '../db/repositories/flowDayRepo'
import { flowVoucherRepo } from '../db/repositories/flowVoucherRepo'
import { getWeekStart } from '@shared/period'
import { ok, err, Result } from '../lib/result'
import { logger } from '../lib/logger'
import {
  FlowFixedDef,
  FlowWeekInstance,
  FlowDayEntry,
  FlowVoucher,
  FlowEntrySource,
} from '@shared/flowTypes'

// ========================================
// 写路径编排（业务动作在 service，仓储只做行映射）：
// 实体间组合动作（删除周任务→软删安排行、勾选→凭据池增删、转下周）全在此处。
// 纯 CRUD（月目标/周核心/模板/感想）无编排，直接经仓储走 IPC（既有 settings 模式）。
// ========================================

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

function todayStr(): string {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function isValidDate(s: string): boolean {
  if (!DATE_RE.test(s)) return false
  const [y, m, d] = s.split('-').map(Number)
  const t = new Date(Date.UTC(y, m - 1, d))
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d
}

// ===== 固定任务 =====

export function saveFixedDef(input: {
  id?: number
  title: string
  kind?: FlowFixedDef['kind']
  targetCount?: number
  weekdayMask?: number
  note?: string | null
}, today?: string): Result<FlowFixedDef> {
  try {
    const title = (input.title ?? '').trim()
    if (!title) return err('INVALID_INPUT', '固定任务标题不能为空')
    const existing = input.id !== undefined ? flowFixedRepo.findById(input.id) : undefined
    if (input.id !== undefined && !existing) return err('NOT_FOUND', '固定任务不存在')

    // 部分更新容缺省：kind/目标/惯常日省略时沿用现值（note 显式传 null 才清空）
    const kind = input.kind ?? existing?.kind ?? 'once'
    if (kind !== 'once' && kind !== 'multi') return err('INVALID_INPUT', 'kind 非法')
    const targetCount = kind === 'multi' ? Math.max(1, input.targetCount ?? existing?.targetCount ?? 1) : 1
    const weekdayMask = input.weekdayMask ?? existing?.weekdayMask ?? 0
    if (weekdayMask < 0 || weekdayMask > 0b1111111) return err('INVALID_INPUT', 'weekdayMask 非法')
    const note = input.note !== undefined ? input.note : (existing?.note ?? null)

    if (input.id !== undefined) {
      const updated = flowFixedRepo.update(input.id, { title, kind, targetCount, weekdayMask, note })
      // 改名 → 同步本周未删实例标题（源头显式传播；未来克隆自然继承，历史周不追溯）
      // today 可注入（测试防墙钟漂移；生产走真实今天）
      if (updated && title !== (existing as FlowFixedDef).title) {
        flowWeekRepo.syncTitlesFromDef(input.id, getWeekStart(today ?? todayStr()), title)
      }
      return ok(updated as FlowFixedDef)
    }

    const created = flowFixedRepo.create({
      title,
      kind,
      targetCount,
      weekdayMask,
      recurrence: 'WEEKLY',
      note,
    })
    return ok(created)
  } catch (e: unknown) {
    logger.error('flowActions.saveFixedDef failed', e)
    return err('INTERNAL', (e as Error).message)
  }
}

export function deleteFixedDef(id: number): Result<{ ok: boolean }> {
  try {
    return ok({ ok: flowFixedRepo.softDelete(id) })
  } catch (e: unknown) {
    logger.error('flowActions.deleteFixedDef failed', e)
    return err('INTERNAL', (e as Error).message)
  }
}

// ===== 周任务实例 =====

export function createTempInstance(input: {
  weekStart: string
  title: string
  kind: FlowWeekInstance['kind']
  targetCount?: number
}): Result<FlowWeekInstance> {
  try {
    const title = (input.title ?? '').trim()
    if (!title) return err('INVALID_INPUT', '周任务标题不能为空')
    if (!isValidDate(input.weekStart)) return err('INVALID_INPUT', 'weekStart 非法日期')
    if (input.kind !== 'once' && input.kind !== 'multi') return err('INVALID_INPUT', 'kind 非法')
    const inst = flowWeekRepo.create({
      weekStart: getWeekStart(input.weekStart),
      origin: 'temp',
      fixedDefId: null,
      title,
      kind: input.kind,
      targetCount: input.kind === 'multi' ? Math.max(1, input.targetCount ?? 1) : 1,
      sortOrder: 0,
      skippedAt: null,
      carriedFrom: null,
    })
    return ok(inst)
  } catch (e: unknown) {
    logger.error('flowActions.createTempInstance failed', e)
    return err('INTERNAL', (e as Error).message)
  }
}

export function renameInstance(id: number, title: string): Result<FlowWeekInstance> {
  try {
    const t = (title ?? '').trim()
    if (!t) return err('INVALID_INPUT', '标题不能为空')
    const inst = flowWeekRepo.findById(id)
    if (!inst) return err('NOT_FOUND', '周任务不存在')
    // 固定型实例的改名入口在固定任务处（改名传播）；此处仅临时型
    if (inst.origin === 'fixed') return err('FIXED_INSTANCE', '固定型周任务请在固定任务处改名')
    const updated = flowWeekRepo.update(id, { title: t })
    return ok(updated as FlowWeekInstance)
  } catch (e: unknown) {
    logger.error('flowActions.renameInstance failed', e)
    return err('INTERNAL', (e as Error).message)
  }
}

/** 删除周任务 = 软删实例 + 软删其未删安排行（rail 回可选取由派生自然实现；凭据保留作历史） */
export function deleteInstance(id: number): Result<{ ok: boolean }> {
  try {
    if (!flowWeekRepo.findById(id)) return err('NOT_FOUND', '周任务不存在')
    const deletedInst = flowWeekRepo.softDelete(id)
    flowDayRepo.softDeleteByInstance(id)
    return ok({ ok: deletedInst })
  } catch (e: unknown) {
    logger.error('flowActions.deleteInstance failed', e)
    return err('INTERNAL', (e as Error).message)
  }
}

/** 本周跳过（免罪语义：不计未完成、不进未完成清单、不产生债） */
export function skipInstance(id: number): Result<FlowWeekInstance> {
  try {
    const inst = flowWeekRepo.findById(id)
    if (!inst) return err('NOT_FOUND', '周任务不存在')
    const updated = flowWeekRepo.update(id, { skippedAt: todayStr() })
    return ok(updated as FlowWeekInstance)
  } catch (e: unknown) {
    logger.error('flowActions.skipInstance failed', e)
    return err('INTERNAL', (e as Error).message)
  }
}

/** 复盘「转下周」：生成下周一次性周任务（显式清债），原实例保留作历史 */
export function carryInstance(id: number, nextWeekStart: string): Result<FlowWeekInstance> {
  try {
    const inst = flowWeekRepo.findById(id)
    if (!inst) return err('NOT_FOUND', '周任务不存在')
    if (!isValidDate(nextWeekStart)) return err('INVALID_INPUT', 'nextWeekStart 非法日期')
    const created = flowWeekRepo.create({
      weekStart: getWeekStart(nextWeekStart),
      origin: 'temp',
      fixedDefId: null,
      title: inst.title,
      kind: 'once',
      targetCount: 1,
      sortOrder: 0,
      skippedAt: null,
      carriedFrom: inst.id,
    })
    return ok(created)
  } catch (e: unknown) {
    logger.error('flowActions.carryInstance failed', e)
    return err('INTERNAL', (e as Error).message)
  }
}

/** 手动完成凭据（系统外完成逃逸阀，可回填日期） */
export function manualCompleteInstance(id: number, occurredAt?: string, note?: string): Result<FlowVoucher> {
  try {
    const inst = flowWeekRepo.findById(id)
    if (!inst) return err('NOT_FOUND', '周任务不存在')
    const date = occurredAt ?? todayStr()
    if (!isValidDate(date)) return err('INVALID_INPUT', 'occurredAt 非法日期')
    const v = flowVoucherRepo.create({
      targetType: 'week_instance',
      targetId: id,
      kind: 'manual',
      occurredAt: date,
      note: note ?? null,
    })
    return ok(v)
  } catch (e: unknown) {
    logger.error('flowActions.manualCompleteInstance failed', e)
    return err('INTERNAL', (e as Error).message)
  }
}

/** +1 场次凭据（多次性任务） */
export function addSession(id: number): Result<FlowVoucher> {
  try {
    const inst = flowWeekRepo.findById(id)
    if (!inst) return err('NOT_FOUND', '周任务不存在')
    if (inst.kind !== 'multi') return err('INVALID_ACTION', '仅多次性任务支持场次')
    const v = flowVoucherRepo.create({
      targetType: 'week_instance',
      targetId: id,
      kind: 'extra',
      occurredAt: todayStr(),
      note: null,
    })
    return ok(v)
  } catch (e: unknown) {
    logger.error('flowActions.addSession failed', e)
    return err('INTERNAL', (e as Error).message)
  }
}

// ===== 完成凭据（R1 修复：撤销/编辑入口，历史可改铁律完整闭环） =====

/** 删除凭据（软删）→ 派生完成态实时回退（manual/extra 误点可撤销） */
export function deleteVoucher(voucherId: number): Result<{ ok: boolean }> {
  try {
    const v = flowVoucherRepo.findById(voucherId)
    if (!v || v.isDeleted) return err('NOT_FOUND', '凭据不存在')
    return ok({ ok: flowVoucherRepo.softDelete(voucherId) })
  } catch (e: unknown) {
    logger.error('flowActions.deleteVoucher failed', e)
    return err('INTERNAL', (e as Error).message)
  }
}

/** 编辑凭据（回填日期/备注）→ 派生按新 occurredAt 重算；已软删凭据不可编辑 */
export function updateVoucher(voucherId: number, data: { occurredAt?: string; note?: string | null }): Result<FlowVoucher> {
  try {
    const v = flowVoucherRepo.findById(voucherId)
    if (!v || v.isDeleted) return err('NOT_FOUND', '凭据不存在')
    if (data.occurredAt !== undefined && !isValidDate(data.occurredAt)) {
      return err('INVALID_INPUT', 'occurredAt 非法日期')
    }
    const updated = flowVoucherRepo.update(voucherId, {
      occurredAt: data.occurredAt ?? v.occurredAt,
      note: data.note !== undefined ? data.note : v.note,
    })
    return ok(updated as FlowVoucher)
  } catch (e: unknown) {
    logger.error('flowActions.updateVoucher failed', e)
    return err('INTERNAL', (e as Error).message)
  }
}

// ===== 日任务行 =====

const INSTANCE_SOURCES: FlowEntrySource[] = ['rail', 'habit']

export function addEntry(input: {
  date: string
  title: string
  source: FlowEntrySource
  locked?: boolean
  weekInstanceId?: number | null
  projectId?: number | null
  reminderKey?: string | null
  templateId?: number | null
  note?: string | null
}): Result<FlowDayEntry> {
  try {
    const title = (input.title ?? '').trim()
    if (!title) return err('INVALID_INPUT', '任务标题不能为空')
    if (!isValidDate(input.date)) return err('INVALID_INPUT', 'date 非法日期')
    const source = input.source
    if (!['manual', 'rail', 'template', 'deferred', 'habit', 'project', 'reminder'].includes(source)) {
      return err('INVALID_INPUT', 'source 非法')
    }
    let weekInstanceId = input.weekInstanceId ?? null
    if (INSTANCE_SOURCES.includes(source)) {
      if (weekInstanceId === null) return err('INVALID_INPUT', `${source} 来源必须挂周任务实例`)
      const inst = flowWeekRepo.findById(weekInstanceId)
      if (!inst) return err('NOT_FOUND', '周任务实例不存在')
    } else if (weekInstanceId === undefined) {
      weekInstanceId = null
    }
    const entry = flowDayRepo.create({
      date: input.date,
      title,
      source,
      locked: input.locked ?? INSTANCE_SOURCES.includes(source),
      weekInstanceId,
      projectId: input.projectId ?? null,
      reminderKey: input.reminderKey ?? null,
      templateId: input.templateId ?? null,
      note: input.note ?? null,
      skippedAt: null,
    })
    return ok(entry)
  } catch (e: unknown) {
    logger.error('flowActions.addEntry failed', e)
    return err('INTERNAL', (e as Error).message)
  }
}

/** 勾选/收勾：check 凭据建/软删；完成态由派生实时重算（历史可改铁律） */
export function toggleCheckEntry(id: number): Result<{ done: boolean }> {
  try {
    const entry = flowDayRepo.findById(id)
    if (!entry) return err('NOT_FOUND', '任务行不存在')
    const active = flowVoucherRepo.findActiveCheck(id)
    if (active) {
      flowVoucherRepo.softDelete(active.id)
      return ok({ done: false })
    }
    flowVoucherRepo.create({
      targetType: 'day_entry',
      targetId: id,
      kind: 'check',
      occurredAt: todayStr(),
      note: null,
    })
    return ok({ done: true })
  } catch (e: unknown) {
    logger.error('flowActions.toggleCheckEntry failed', e)
    return err('INTERNAL', (e as Error).message)
  }
}

/** 移除任务行：软删本行（锁定行回 rail 由派生自然实现） */
export function removeEntry(id: number): Result<{ ok: boolean }> {
  try {
    return ok({ ok: flowDayRepo.softDelete(id) })
  } catch (e: unknown) {
    logger.error('flowActions.removeEntry failed', e)
    return err('INTERNAL', (e as Error).message)
  }
}

/** 挪日（自由行直接改 date；锁定行=移除+目标日再选取的一步封装，同样落为改 date） */
export function moveEntry(id: number, newDate: string): Result<FlowDayEntry> {
  try {
    if (!isValidDate(newDate)) return err('INVALID_INPUT', 'newDate 非法日期')
    const entry = flowDayRepo.findById(id)
    if (!entry) return err('NOT_FOUND', '任务行不存在')
    const updated = flowDayRepo.update(id, { date: newDate })
    return ok(updated as FlowDayEntry)
  } catch (e: unknown) {
    logger.error('flowActions.moveEntry failed', e)
    return err('INTERNAL', (e as Error).message)
  }
}

/** 跳过本场（免罪；多次性释放本场占位） */
export function skipEntry(id: number): Result<FlowDayEntry> {
  try {
    const entry = flowDayRepo.findById(id)
    if (!entry) return err('NOT_FOUND', '任务行不存在')
    const updated = flowDayRepo.update(id, { skippedAt: todayStr() })
    return ok(updated as FlowDayEntry)
  } catch (e: unknown) {
    logger.error('flowActions.skipEntry failed', e)
    return err('INTERNAL', (e as Error).message)
  }
}

/** 自由行改名/私有备注；🔒锁定行禁改文字（水流不可断，立项#3） */
export function updateEntry(id: number, data: { title?: string; note?: string | null }): Result<FlowDayEntry> {
  try {
    const entry = flowDayRepo.findById(id)
    if (!entry) return err('NOT_FOUND', '任务行不存在')
    if (data.title !== undefined) {
      const t = data.title.trim()
      if (!t) return err('INVALID_INPUT', '标题不能为空')
      if (entry.locked) return err('LOCKED_ENTRY', '锁定行不可改文字（请在源头周任务处改名）')
      // 区分「未提供」（保留现值）与「显式 null」（清空备注）——?? 会把 null 回退旧值（F2 复审）
      const updated = flowDayRepo.update(id, { title: t, note: data.note !== undefined ? data.note : entry.note })
      return ok(updated as FlowDayEntry)
    }
    const updated = flowDayRepo.update(id, { note: data.note !== undefined ? data.note : entry.note })
    return ok(updated as FlowDayEntry)
  } catch (e: unknown) {
    logger.error('flowActions.updateEntry failed', e)
    return err('INTERNAL', (e as Error).message)
  }
}
