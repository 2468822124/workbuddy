import { ipcMain } from 'electron'
import { IPC, ok, err, Result } from '@shared/ipc'
import { Plan, TemplateType } from '@shared/types'
import { planRepo } from '../db/repositories/planRepo'
import { taskRepo } from '../db/repositories/taskRepo'
import { randomUUID } from 'node:crypto'
import { logger } from '../lib/logger'
import { ChatError, guidePlan } from '../services/llm'
import {
  parseTasksWithState,
  findLineByTid,
  findOpenLineByText,
  setTaskConsumedByTid,
  newTid,
  resolveStableTid,
  collectChildRefs,
} from '../services/planParser'
import { getWeekRange, getMonthRange } from '@shared/period'

/** 替换 content 第 index 行（prepareTaskLink 写回 tid 注释用）。纯函数。 */
function replaceLineAt(content: string, index: number, newLine: string): string {
  const lines = content.split(/\r?\n/)
  if (index < 0 || index >= lines.length) return content
  lines[index] = newLine
  return lines.join('\n')
}

export interface RunSyncResult {
  plan: Plan
  generatedCount: number
  removedOpenCount: number
  keptDoneCount: number
  // v0.2修复计划·§3.6：跨级删除分流计数（PlanningView 提示）
  cascadeRemovedOpenCount: number
  cascadeInvalidatedDoneCount: number
}

/**
 * 保存顺序（规格 §5.3）：先写 plan（content 保原文，不丢）→ 再 syncPlanTodos。
 * 同步失败 → plan 已持久化，返回 err('PARSE_FAILED')，前端显示降级提示。
 * logger 禁记 plan.content 明文——仅记异常/计数。
 *
 * v0.2修复计划·§3.3/3.6：runSync 门控放宽 —— 所有 plan 类型都跑 syncPlanTodos
 * （内部：todo 生成仍仅 daily_plan；周/月只做 tasks 双向 sync → 触发跨级删除分流，修④）。
 */
// F3.2-1 方案B：runSync 透传 removedOpenCount/keptDoneCount（orphan 分流计数；前端文案展示）
function runSync(planId: string): Result<RunSyncResult> {
  const plan = planRepo.findById(planId)
  if (!plan) return err('NOT_FOUND', 'Plan not found')
  const r = planRepo.syncPlanTodos(planId)
  if (!r.synced) {
    return err('PARSE_FAILED', r.error ?? 'sync failed')
  }
  return ok({
    plan: r.plan,
    generatedCount: r.generatedCount,
    removedOpenCount: r.removedOpenCount,
    keptDoneCount: r.keptDoneCount,
    cascadeRemovedOpenCount: r.cascadeRemovedOpenCount,
    cascadeInvalidatedDoneCount: r.cascadeInvalidatedDoneCount,
  })
}

export function registerPlansIpc(): void {
  ipcMain.handle(IPC.PLAN_GET, (_e, arg: { id: string }) => {
    try {
      const plan = planRepo.findById(arg.id)
      return ok(plan ?? null)
    } catch (e: unknown) {
      logger.error('plan:get error', e)
      return err('INTERNAL', (e as Error).message)
    }
  })

  ipcMain.handle(IPC.PLAN_LIST, (_e, arg?: { from?: string; to?: string; type?: string }) => {
    try {
      return ok(planRepo.findAll(arg))
    } catch (e: unknown) {
      logger.error('plan:list error', e)
      return err('INTERNAL', (e as Error).message)
    }
  })

  ipcMain.handle(IPC.PLAN_BY_DATE, (_e, arg: { date: string }) => {
    try {
      if (!arg?.date) return err('INVALID', 'date is required')
      return ok(planRepo.findByDate(arg.date) ?? null)
    } catch (e: unknown) {
      logger.error('plan:byDate error', e)
      return err('INTERNAL', (e as Error).message)
    }
  })

  ipcMain.handle(IPC.PLAN_CREATE, (_e, arg: { date: string; type?: string; content: string; templateId?: string }) => {
    try {
      if (!arg?.date || typeof arg.content !== 'string') {
        return err('INVALID', 'date and content are required')
      }
      const plan = planRepo.create({
        id: randomUUID(),
        date: arg.date,
        type: arg.type ?? null,
        content: arg.content,
        generatedTodoIds: [],
        templateId: arg.templateId ?? null,
      })
      return runSync(plan.id)
    } catch (e: unknown) {
      logger.error('plan:create error', e)
      return err('INTERNAL', (e as Error).message)
    }
  })

  ipcMain.handle(IPC.PLAN_UPDATE, (_e, arg: { id: string; content: string; date?: string; type?: string }) => {
    try {
      if (!arg?.id || typeof arg.content !== 'string') {
        return err('INVALID', 'id and content are required')
      }
      const existing = planRepo.findById(arg.id)
      if (!existing) return err('NOT_FOUND', 'Plan not found')
      const plan = planRepo.update(arg.id, {
        content: arg.content,
        date: arg.date ?? existing.date,
        type: arg.type ?? existing.type,
      })
      if (!plan) return err('NOT_FOUND', 'Plan not found')
      return runSync(plan.id)
    } catch (e: unknown) {
      logger.error('plan:update error', e)
      return err('INTERNAL', (e as Error).message)
    }
  })

  ipcMain.handle(IPC.PLAN_DELETE, (_e, arg: { id: string }) => {
    try {
      const ok_ = planRepo.softDelete(arg.id)
      return ok({ ok: ok_ })
    } catch (e: unknown) {
      logger.error('plan:delete error', e)
      return err('INTERNAL', (e as Error).message)
    }
  })

  // 子阶段5：type + 期起始查询（date 已是期起始——前端传 periodStartFor 结果，服务端不重算）
  ipcMain.handle(IPC.PLAN_GET_BY_PERIOD, (_e, arg: { type: string; date: string }) => {
    try {
      if (!arg?.type || !arg?.date) return err('INVALID', 'type and date are required')
      const plan = planRepo.getByPeriod(arg.type as TemplateType, arg.date)
      return ok(plan ?? null)
    } catch (e: unknown) {
      logger.error('plan:getByPeriod error', e)
      return err('INTERNAL', (e as Error).message)
    }
  })

  // 子阶段5 + v0.2修复计划：级联任务列表（含消费状态 + tid；plan 不存在 → {planId:null,tasks:[]}）
  ipcMain.handle(IPC.PLAN_LIST_TASKS_BY_PERIOD, (_e, arg: { type: string; date: string }) => {
    try {
      if (!arg?.type || !arg?.date) return err('INVALID', 'type and date are required')
      const plan = planRepo.getByPeriod(arg.type as TemplateType, arg.date)
      if (!plan) return ok({ planId: null, tasks: [] })
      // 第二轮实测·问题①：子级计划已安排引用集 —— weekly_plan → 本周各 daily_plan；
      // monthly_plan → 本月各 weekly_plan。有 parent:{tid} 行 → 该任务本期已安排（rail 全期隐藏）。
      let childRefs = new Set<string>()
      if (arg.type === 'weekly_plan') {
        const [from, to] = getWeekRange(arg.date)
        const children = planRepo.findAll({ type: 'daily_plan', from, to })
        childRefs = collectChildRefs(children.map(c => c.content ?? ''))
      } else if (arg.type === 'monthly_plan') {
        const [from, to] = getMonthRange(arg.date)
        const children = planRepo.findAll({ type: 'weekly_plan', from, to })
        childRefs = collectChildRefs(children.map(c => c.content ?? ''))
      }
      const tasks = parseTasksWithState(plan.content ?? '').map(p => ({
        text: p.text,
        consumed: p.consumed,
        tid: p.tid,
        scheduledInPeriod: p.tid ? childRefs.has(p.tid) : false,
      }))
      return ok({ planId: plan.id, tasks })
    } catch (e: unknown) {
      logger.error('plan:listTasksByPeriod error', e)
      return err('INTERNAL', (e as Error).message)
    }
  })

  // 子阶段5 + v0.2修复计划：点选回写按 tid（§3.4 匹配键 text→tid，改名后仍存活）。
  // 幂等：无匹配（已 [x] / 不存在）→ no-op 返回当前 plan，不报错。
  ipcMain.handle(IPC.PLAN_MARK_TASK_CONSUMED, (_e, arg: { planId: string; tid: string }) => {
    try {
      if (!arg?.planId || typeof arg.tid !== 'string') return err('INVALID', 'planId and tid are required')
      const plan = planRepo.findById(arg.planId)
      if (!plan) return err('INVALID', 'Plan not found')
      const found = findLineByTid(plan.content ?? '', arg.tid)
      if (!found) return ok(plan) // 幂等 no-op（tid 缺失/损坏 → 降级不崩）
      const updated = planRepo.update(plan.id, { content: setTaskConsumedByTid(plan.content ?? '', arg.tid, true) })
      taskRepo.updateConsumed(arg.tid, true)
      return ok(updated ?? plan)
    } catch (e: unknown) {
      logger.error('plan:markTaskConsumed error', e)
      return err('INTERNAL', (e as Error).message)
    }
  })

  // F3-1.2 方案 C + v0.2修复计划：todo 取消勾选回退 `[x]→[ ]`（按 tid，幂等）。
  ipcMain.handle(IPC.PLAN_MARK_TASK_UNCONSUMED, (_e, arg: { planId: string; tid: string }) => {
    try {
      if (!arg?.planId || typeof arg.tid !== 'string') return err('INVALID', 'planId and tid are required')
      const plan = planRepo.findById(arg.planId)
      if (!plan) return err('INVALID', 'Plan not found')
      const found = findLineByTid(plan.content ?? '', arg.tid)
      if (!found) return ok(plan) // 幂等 no-op（tid 缺失/损坏 → 降级不崩）
      const updated = planRepo.update(plan.id, { content: setTaskConsumedByTid(plan.content ?? '', arg.tid, false) })
      taskRepo.updateConsumed(arg.tid, false)
      return ok(updated ?? plan)
    } catch (e: unknown) {
      logger.error('plan:markTaskUnconsumed error', e)
      return err('INTERNAL', (e as Error).message)
    }
  })

  // v0.2修复计划·§3.4：pick 预关联 —— 确保 parent task tid（缺失则分配并写回父计划 content）
  // + 分配 child tid。任务行格式 `- [ ] {text} <!-- tid:{child} parent:{parentTid} -->`。
  // 幂等：同父任务重复 pick → 复用父 tid，仅新 child tid（每个 pick 一个子行）。
  ipcMain.handle(IPC.PLAN_PREPARE_TASK_LINK, (_e, arg: { parentPlanId: string; taskText: string; taskTid?: string }) => {
    try {
      if (!arg?.parentPlanId || typeof arg.taskText !== 'string') {
        return err('INVALID', 'parentPlanId and taskText are required')
      }
      const plan = planRepo.findById(arg.parentPlanId)
      if (!plan) return err('NOT_FOUND', 'Parent plan not found')
      const content = plan.content ?? ''
      // 定位：优先按 tid（改名存活），否则按文本（无 tid 兜底）
      const byTid = arg.taskTid ? findLineByTid(content, arg.taskTid) : undefined
      const target = byTid ?? findOpenLineByText(content, arg.taskText.trim())
      if (!target) return err('NOT_FOUND', '任务行不存在（已勾选或已删除）')
      // P1-② 幂等加固：content 注释 tid 缺失时，查 tasks 表同 planId+text 未删行复用其 tid
      // （content 注释可能因草稿覆盖/历史数据丢失 → 重复 pick 每次新 tid → tid 漂移
      //   → syncPlanTodos 跨层删除分流误判，即实测场景2「今日空白」数据丢失根因）
      const tidMatch = target.line.match(/<!--\s*tid:([0-9a-f]+)/)
      const existing = tidMatch ? undefined : taskRepo.findTaskByText(plan.id, arg.taskText.trim())
      const { tid: parentTid, lineWithTid, attached } = resolveStableTid(target.line, existing?.tid)
      if (attached) {
        // 惰性分配/复用 parent tid 并写回父计划 content（Markdown 真相源）
        planRepo.update(plan.id, { content: replaceLineAt(content, target.index, lineWithTid) })
      }
      // 父任务行 upsert（链完整性：父 tid → 其 parentTaskId 向上）
      const updatedContent = attached ? replaceLineAt(content, target.index, lineWithTid) : content
      const parentLine = findLineByTid(updatedContent, parentTid)
      const ln = parseTasksWithState(parentLine ? parentLine.line : target.line)[0]
      // P2: content 存纯文本（剥 `- [ ]` 标记 + tid 注释）—— tag 出处/复用池比较不受标记干扰
      const parentText = parseTasksWithState(parentLine ? parentLine.line : target.line)[0]?.text ?? ''
      taskRepo.upsert({
        tid: parentTid,
        planId: plan.id,
        content: parentText,
        parentTaskId: parentLine?.parentTid ?? null,
        consumed: ln ? ln.consumed : false,
        sortOrder: target.index,
      })
      const childTid = newTid()
      return ok({
        parentTid,
        childTid,
        // P2: 纯文本返回，pickTask 拼 `- [ ] ${taskText}` 不再双标记
        taskText: parseTasksWithState(target.line)[0]?.text ?? '',
      })
    } catch (e: unknown) {
      logger.error('plan:prepareTaskLink error', e)
      return err('INTERNAL', (e as Error).message)
    }
  })

  // 子阶段4：LLM 引导式提问（前台用户主动触发；仅传 templateId/filled，apiKey 在主进程内取）
  ipcMain.handle(IPC.PLAN_GUIDE, async (_e, arg: { templateId: string; filled: string }) => {
    try {
      if (!arg?.templateId) return err('INVALID', 'templateId is required')
      if (typeof arg.filled !== 'string') return err('INVALID', 'filled must be string')
      const result = await guidePlan({ templateId: arg.templateId, filled: arg.filled.slice(0, 4000) })
      return ok(result)
    } catch (e: unknown) {
      if (e instanceof ChatError) { logger.warn(`plan guide failed: ${e.code}`); return err(e.code, e.message) }
      logger.error('plan:guideQuestion error', e)
      return err('INTERNAL', `内部错误：${(e as Error).message}`)
    }
  })
}
