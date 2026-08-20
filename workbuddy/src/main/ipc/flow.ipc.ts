import { ipcMain } from 'electron'
import { IPC, ok, err, Result } from '@shared/ipc'
import { logger } from '../lib/logger'
import { flowFixedRepo } from '../db/repositories/flowFixedRepo'
import { flowGoalRepo } from '../db/repositories/flowGoalRepo'
import { flowTemplateRepo } from '../db/repositories/flowTemplateRepo'
import { flowJournalRepo } from '../db/repositories/flowJournalRepo'
import { materializeWeek } from '../services/flowCloneEngine'
import { getWeekBoard, getDayBoard } from '../services/flowDerived'
import { getReviewBoard } from '../services/flowReviewDerived'
import {
  saveFixedDef, deleteFixedDef, createTempInstance, renameInstance, deleteInstance,
  skipInstance, carryInstance, manualCompleteInstance, addSession,
  addEntry, toggleCheckEntry, removeEntry, moveEntry, skipEntry, updateEntry,
  deleteVoucher, updateVoucher,
} from '../services/flowActions'
import { getWeekStart, getMonthStart, isValidDate } from '@shared/period'

const SCOPE_RE = /^(day|week|month)$/
const TYPE_RE = /^(daily|weekly)$/

/** 真实日历校验（F4）：复用 @shared/period.isValidDate，'2026-02-31' 等非法日直接拒绝，
 * 不再依赖正则+Date.UTC 静默进位。 */
function validDate(s: unknown): s is string {
  return typeof s === 'string' && isValidDate(s)
}

function run<T>(label: string, fn: () => T): Result<T> {
  try {
    return ok(fn())
  } catch (e: unknown) {
    logger.error(`${label} error`, e)
    return err('INTERNAL', (e as Error).message)
  }
}

export function registerFlowIpc(): void {
  // ===== 面板（派生视图；weekBoard 先惰性物化） =====
  ipcMain.handle(IPC.FLOW_WEEK_BOARD, (_e, input: { weekStart?: string }) => {
    if (!input || !validDate(input.weekStart)) return err('INVALID_INPUT', 'weekStart 非法日期')
    const weekStart = getWeekStart(input.weekStart as string)
    const m = materializeWeek(weekStart)
    if (!m.ok) return m
    return run('flow:weekBoard', () => getWeekBoard(weekStart))
  })

  ipcMain.handle(IPC.FLOW_DAY_BOARD, (_e, input: { date?: string }) => {
    if (!input || !validDate(input.date)) return err('INVALID_INPUT', 'date 非法日期')
    return run('flow:dayBoard', () => getDayBoard(input.date as string))
  })

  // ===== 阶段5：复盘面板（只读派生；未来周拒绝，本周/历史周可查） =====
  ipcMain.handle(IPC.FLOW_REVIEW_BOARD, (_e, input: { weekStart?: string }) => {
    if (!input || !validDate(input.weekStart)) return err('INVALID_INPUT', 'weekStart 非法日期')
    const weekStart = getWeekStart(input.weekStart as string)
    // 本地今天（toISOString 是 UTC，8 小时窗口会算错周）
    const now = new Date()
    const pad = (n: number) => String(n).padStart(2, '0')
    const localToday = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
    if (weekStart > getWeekStart(localToday)) return err('INVALID_INPUT', '复盘仅支持本周及历史周')
    return run('flow:reviewBoard', () => getReviewBoard(weekStart))
  })

  // ===== 固定任务 =====
  ipcMain.handle(IPC.FLOW_FIXED_DEFS_LIST, () => run('flow:fixedDefs:list', () => flowFixedRepo.listActive()))
  ipcMain.handle(IPC.FLOW_FIXED_DEFS_SAVE, (_e, input: Record<string, unknown>) => {
    if (!input || typeof input.title !== 'string') return err('INVALID_INPUT', 'title 必填')
    return saveFixedDef(input as Parameters<typeof saveFixedDef>[0])
  })
  ipcMain.handle(IPC.FLOW_FIXED_DEFS_DELETE, (_e, input: { id?: number }) => {
    if (!input || typeof input.id !== 'number') return err('INVALID_INPUT', 'id 必填')
    return deleteFixedDef(input.id)
  })

  // ===== 周任务实例 =====
  ipcMain.handle(IPC.FLOW_INSTANCE_CREATE, (_e, input: Record<string, unknown>) => {
    if (!input || typeof input.weekStart !== 'string' || typeof input.title !== 'string' || typeof input.kind !== 'string') {
      return err('INVALID_INPUT', 'weekStart/title/kind 必填')
    }
    return createTempInstance(input as Parameters<typeof createTempInstance>[0])
  })
  ipcMain.handle(IPC.FLOW_INSTANCE_RENAME, (_e, input: { id?: number; title?: string }) => {
    if (!input || typeof input.id !== 'number' || typeof input.title !== 'string') return err('INVALID_INPUT', 'id/title 必填')
    return renameInstance(input.id, input.title)
  })
  ipcMain.handle(IPC.FLOW_INSTANCE_DELETE, (_e, input: { id?: number }) => {
    if (!input || typeof input.id !== 'number') return err('INVALID_INPUT', 'id 必填')
    return deleteInstance(input.id)
  })
  ipcMain.handle(IPC.FLOW_INSTANCE_SKIP, (_e, input: { id?: number }) => {
    if (!input || typeof input.id !== 'number') return err('INVALID_INPUT', 'id 必填')
    return skipInstance(input.id)
  })
  ipcMain.handle(IPC.FLOW_INSTANCE_CARRY_NEXT, (_e, input: { id?: number; nextWeekStart?: string }) => {
    if (!input || typeof input.id !== 'number' || !validDate(input.nextWeekStart)) return err('INVALID_INPUT', 'id/nextWeekStart 必填')
    return carryInstance(input.id, input.nextWeekStart as string)
  })
  ipcMain.handle(IPC.FLOW_INSTANCE_MANUAL_COMPLETE, (_e, input: { id?: number; occurredAt?: string; note?: string }) => {
    if (!input || typeof input.id !== 'number') return err('INVALID_INPUT', 'id 必填')
    return manualCompleteInstance(input.id, input.occurredAt, input.note)
  })
  ipcMain.handle(IPC.FLOW_INSTANCE_ADD_SESSION, (_e, input: { id?: number }) => {
    if (!input || typeof input.id !== 'number') return err('INVALID_INPUT', 'id 必填')
    return addSession(input.id)
  })

  // ===== 完成凭据（R1：撤销/编辑通道） =====
  ipcMain.handle(IPC.FLOW_VOUCHER_DELETE, (_e, input: { id?: number }) => {
    if (!input || typeof input.id !== 'number') return err('INVALID_INPUT', 'id 必填')
    return deleteVoucher(input.id)
  })
  ipcMain.handle(IPC.FLOW_VOUCHER_UPDATE, (_e, input: { id?: number; occurredAt?: string; note?: string | null }) => {
    if (!input || typeof input.id !== 'number') return err('INVALID_INPUT', 'id 必填')
    return updateVoucher(input.id, { occurredAt: input.occurredAt, note: input.note })
  })

  // ===== 日任务行 =====
  ipcMain.handle(IPC.FLOW_ENTRY_ADD, (_e, input: Record<string, unknown>) => {
    if (!input || typeof input.date !== 'string' || typeof input.title !== 'string' || typeof input.source !== 'string') {
      return err('INVALID_INPUT', 'date/title/source 必填')
    }
    // 阶段4：project 投影须携带源 todo id（字符串 UUID）；reminder 投影须携带稳定键
    if (input.source === 'project' && typeof input.projectId !== 'string') {
      return err('INVALID_INPUT', 'project 来源必须携带字符串 projectId（源 todo id）')
    }
    if (input.source === 'reminder' && typeof input.reminderKey !== 'string') {
      return err('INVALID_INPUT', 'reminder 来源必须携带 reminderKey')
    }
    return addEntry(input as Parameters<typeof addEntry>[0])
  })
  ipcMain.handle(IPC.FLOW_ENTRY_TOGGLE_CHECK, (_e, input: { id?: number }) => {
    if (!input || typeof input.id !== 'number') return err('INVALID_INPUT', 'id 必填')
    return toggleCheckEntry(input.id)
  })
  ipcMain.handle(IPC.FLOW_ENTRY_REMOVE, (_e, input: { id?: number }) => {
    if (!input || typeof input.id !== 'number') return err('INVALID_INPUT', 'id 必填')
    return removeEntry(input.id)
  })
  ipcMain.handle(IPC.FLOW_ENTRY_MOVE, (_e, input: { id?: number; newDate?: string }) => {
    if (!input || typeof input.id !== 'number' || !validDate(input.newDate)) return err('INVALID_INPUT', 'id/newDate 必填')
    return moveEntry(input.id, input.newDate as string)
  })
  ipcMain.handle(IPC.FLOW_ENTRY_SKIP, (_e, input: { id?: number }) => {
    if (!input || typeof input.id !== 'number') return err('INVALID_INPUT', 'id 必填')
    return skipEntry(input.id)
  })
  ipcMain.handle(IPC.FLOW_ENTRY_UPDATE, (_e, input: { id?: number; title?: string; note?: string | null }) => {
    if (!input || typeof input.id !== 'number') return err('INVALID_INPUT', 'id 必填')
    return updateEntry(input.id, { title: input.title, note: input.note })
  })

  // ===== 月目标（纯 CRUD） =====
  ipcMain.handle(IPC.FLOW_MONTH_GOALS_LIST, (_e, input: { month?: string }) => {
    if (!input || typeof input.month !== 'string') return err('INVALID_INPUT', 'month 必填（YYYY-MM）')
    return run('flow:monthGoals:list', () => flowGoalRepo.listMonthGoals(getMonthStart(input.month as string).slice(0, 7)))
  })
  ipcMain.handle(IPC.FLOW_MONTH_GOALS_SAVE, (_e, input: Record<string, unknown>) => {
    if (!input || typeof input.title !== 'string' || typeof input.month !== 'string') return err('INVALID_INPUT', 'month/title 必填')
    return run('flow:monthGoals:save', () => {
      const month = getMonthStart(input.month as string).slice(0, 7)
      const title = (input.title as string).trim()
      if (!title) throw new Error('标题不能为空')
      if (typeof input.id === 'number') {
        // closedAt 仅在显式传字符串时更新（省略不清空既有关闭状态）
        const patch: { title: string; closedAt?: string | null } = { title }
        if (typeof input.closedAt === 'string') patch.closedAt = input.closedAt
        const updated = flowGoalRepo.updateGoal(input.id, patch)
        if (!updated) throw new Error('月目标不存在')
        return updated
      }
      return flowGoalRepo.createGoal({ month, title, closedAt: null })
    })
  })
  ipcMain.handle(IPC.FLOW_MONTH_GOALS_DELETE, (_e, input: { id?: number }) => {
    if (!input || typeof input.id !== 'number') return err('INVALID_INPUT', 'id 必填')
    const goalId = input.id as number
    return run('flow:monthGoals:delete', () => ({ ok: flowGoalRepo.softDeleteGoal(goalId) }))
  })

  // ===== 周核心推进目标（纯 CRUD） =====
  ipcMain.handle(IPC.FLOW_WEEK_FOCUS_LIST, (_e, input: { weekStart?: string }) => {
    if (!input || !validDate(input.weekStart)) return err('INVALID_INPUT', 'weekStart 非法日期')
    return run('flow:weekFocus:list', () => flowGoalRepo.listFocusByWeek(getWeekStart(input.weekStart as string)))
  })
  ipcMain.handle(IPC.FLOW_WEEK_FOCUS_SAVE, (_e, input: Record<string, unknown>) => {
    if (!input || typeof input.title !== 'string' || typeof input.weekStart !== 'string') return err('INVALID_INPUT', 'weekStart/title 必填')
    return run('flow:weekFocus:save', () => {
      const weekStart = getWeekStart(input.weekStart as string)
      const title = (input.title as string).trim()
      if (!title) throw new Error('标题不能为空')
      const doneAt = typeof input.doneAt === 'string' ? input.doneAt : null
      if (typeof input.id === 'number') {
        // 仅显式传 sortOrder 时更新（防 undefined 覆写现有值）
        const patch: { title: string; doneAt: string | null; sortOrder?: number } = { title, doneAt }
        if (typeof input.sortOrder === 'number') patch.sortOrder = input.sortOrder
        const updated = flowGoalRepo.updateFocus(input.id, patch)
        if (!updated) throw new Error('周核心目标不存在')
        return updated
      }
      return flowGoalRepo.createFocus({
        weekStart,
        title,
        monthGoalId: typeof input.monthGoalId === 'number' ? input.monthGoalId : null,
        doneAt,
        sortOrder: typeof input.sortOrder === 'number' ? input.sortOrder : 0,
      })
    })
  })
  ipcMain.handle(IPC.FLOW_WEEK_FOCUS_DELETE, (_e, input: { id?: number }) => {
    if (!input || typeof input.id !== 'number') return err('INVALID_INPUT', 'id 必填')
    const focusId = input.id as number
    return run('flow:weekFocus:delete', () => ({ ok: flowGoalRepo.softDeleteFocus(focusId) }))
  })

  // ===== 模板（纯 CRUD；套用时复制断链，模板与任务行无联动） =====
  ipcMain.handle(IPC.FLOW_TEMPLATES_LIST, (_e, input?: { type?: string }) => {
    const type = input?.type
    if (type !== undefined && !TYPE_RE.test(type)) return err('INVALID_INPUT', 'type 非法')
    return run('flow:templates:list', () => flowTemplateRepo.list(type as 'daily' | 'weekly' | undefined))
  })
  ipcMain.handle(IPC.FLOW_TEMPLATES_SAVE, (_e, input: Record<string, unknown>) => {
    if (!input || typeof input.name !== 'string' || typeof input.type !== 'string') return err('INVALID_INPUT', 'name/type 必填')
    if (!TYPE_RE.test(input.type)) return err('INVALID_INPUT', 'type 非法')
    return run('flow:templates:save', () => {
      const name = (input.name as string).trim()
      if (!name) throw new Error('模板名不能为空')
      const items = Array.isArray(input.items) ? (input.items as { text: string }[]).filter(i => typeof i.text === 'string' && i.text.trim()) : []
      if (typeof input.id === 'number') {
        const updated = flowTemplateRepo.update(input.id, { name, items })
        if (!updated) throw new Error('模板不存在')
        return updated
      }
      return flowTemplateRepo.create({ name, type: input.type as 'daily' | 'weekly', items })
    })
  })
  ipcMain.handle(IPC.FLOW_TEMPLATES_DELETE, (_e, input: { id?: number }) => {
    if (!input || typeof input.id !== 'number') return err('INVALID_INPUT', 'id 必填')
    const tplId = input.id as number
    return run('flow:templates:delete', () => ({ ok: flowTemplateRepo.softDelete(tplId) }))
  })

  // ===== 叙述域感想（day/week/month 单篇） =====
  ipcMain.handle(IPC.FLOW_JOURNAL_GET, (_e, input: { scope?: string; periodKey?: string }) => {
    if (!input || typeof input.scope !== 'string' || typeof input.periodKey !== 'string') return err('INVALID_INPUT', 'scope/periodKey 必填')
    if (!SCOPE_RE.test(input.scope)) return err('INVALID_INPUT', 'scope 非法')
    return run('flow:journal:get', () => flowJournalRepo.findByScope(input.scope as 'day' | 'week' | 'month', input.periodKey as string) ?? null)
  })
  ipcMain.handle(IPC.FLOW_JOURNAL_SAVE, (_e, input: { scope?: string; periodKey?: string; content?: string }) => {
    if (!input || typeof input.scope !== 'string' || typeof input.periodKey !== 'string' || typeof input.content !== 'string') {
      return err('INVALID_INPUT', 'scope/periodKey/content 必填')
    }
    if (!SCOPE_RE.test(input.scope)) return err('INVALID_INPUT', 'scope 非法')
    return run('flow:journal:save', () => flowJournalRepo.upsert(input.scope as 'day' | 'week' | 'month', input.periodKey as string, input.content as string))
  })
}
