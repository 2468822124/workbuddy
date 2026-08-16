import { ipcMain } from 'electron'
import { IPC, ok, err } from '@shared/ipc'
import { Todo, TodoWithSource, TaskChainItem } from '@shared/types'
import { todoRepo } from '../db/repositories/todoRepo'
import { planRepo } from '../db/repositories/planRepo'
import { projectRepo } from '../db/repositories/projectRepo'
import { taskRepo } from '../db/repositories/taskRepo'
import { logger } from '../lib/logger'
import { periodStartFor, getWeekRange, getMonthRange } from '@shared/period'
import { labelTodoSource } from '../services/todoSource'
import { parseParentTaskRef } from '../services/parentRef'
import { setTaskConsumedByTid } from '../services/planParser'

/** plan.type → PlanningLevel（来源链路由跳转用）。 */
function levelOf(type: string | null): 'daily' | 'weekly' | 'monthly' {
  if (type === 'weekly_plan') return 'weekly'
  if (type === 'monthly_plan') return 'monthly'
  return 'daily'
}

export function registerTodosIpc(): void {
  ipcMain.handle(IPC.TODOS_TODAY, (_e, date?: string) => {
    try {
      const d = date ?? new Date().toISOString().slice(0, 10)
      return ok(todoRepo.findToday(d))
    } catch (e: unknown) {
      logger.error('todos:today error', e)
      return err('INTERNAL', (e as Error).message)
    }
  })

  ipcMain.handle(IPC.TODOS_OVERDUE, (_e, date?: string) => {
    try {
      const d = date ?? new Date().toISOString().slice(0, 10)
      return ok(todoRepo.findOverdue(d))
    } catch (e: unknown) {
      logger.error('todos:overdue error', e)
      return err('INTERNAL', (e as Error).message)
    }
  })

  ipcMain.handle(IPC.TODOS_TOGGLE, (_e, id: string) => {
    try {
      const todo = todoRepo.toggleDone(id)
      if (!todo) return err('NOT_FOUND', 'Todo not found')

      // v0.2修复计划·§3.4：双向同步主路径按 parentTaskRef.parentTaskId（tid，改名存活）
      const ref = parseParentTaskRef(todo.parentTaskRef)
      if (ref) {
        const parentTask = taskRepo.findByTid(ref.parentTaskId)
        const parentPlan = parentTask ? planRepo.findById(parentTask.planId) : undefined
        if (parentTask && !parentTask.isDeleted && parentPlan) {
          if (todo.status === 'done') {
            // todo 勾选完成 → 上级 `[ ]→[x]`（按 tid）
            const content = setTaskConsumedByTid(parentPlan.content ?? '', ref.parentTaskId, true)
            if (content !== parentPlan.content) {
              planRepo.update(parentPlan.id, { content })
              taskRepo.updateConsumed(ref.parentTaskId, true)
            }
          } else {
            // todo 取消勾选 → 查该计划期内是否还有同名已完成 todo；无则上级 `[x]→[ ]`
            const range =
              parentPlan.type === 'monthly_plan' ? getMonthRange(parentPlan.date ?? '')
              : parentPlan.type === 'weekly_plan' ? getWeekRange(parentPlan.date ?? '')
              : [parentPlan.date ?? '', parentPlan.date ?? '']
            const [rs, re] = range
            const others = todoRepo.findByContentInRange(todo.content, rs, re, todo.id)
            if (others.length === 0) {
              const content = setTaskConsumedByTid(parentPlan.content ?? '', ref.parentTaskId, false)
              if (content !== parentPlan.content) {
                planRepo.update(parentPlan.id, { content })
                taskRepo.updateConsumed(ref.parentTaskId, false)
              }
            }
          }
        }
        // 来源 task 已删/缺失 → 不回写（§8 降级不崩）
      } else {
        // legacy 回退：存量 todo（parentTaskRef=null）→ 文本匹配 weekly（原方案 C 逻辑保留）
        const weekStart = periodStartFor('weekly', todo.planDate ?? '')
        if (weekStart) {
          const plan = planRepo.getByPeriod('weekly_plan', weekStart)
          if (plan) {
            if (todo.status === 'done') {
              const lines = (plan.content ?? '').split(/\r?\n/)
              let marked = false
              for (let i = 0; i < lines.length; i++) {
                const m = lines[i].match(/^(\s*)[-*]\s+\[\s\]\s+(.+?)\s*$/)
                if (m && m[2].trim() === todo.content.trim()) {
                  lines[i] = lines[i].replace(/\[ \]/, '[x]')
                  marked = true
                  break
                }
              }
              if (marked) planRepo.update(plan.id, { content: lines.join('\n') })
            } else {
              const [ws, we] = getWeekRange(weekStart)
              const others = todoRepo.findByContentInRange(todo.content, ws, we, todo.id)
              if (others.length === 0) {
                const lines = (plan.content ?? '').split(/\r?\n/)
                let unmarked = false
                for (let i = 0; i < lines.length; i++) {
                  const m = lines[i].match(/^(\s*)[-*]\s+\[x\]\s+(.+?)\s*$/i)
                  if (m && m[2].trim() === todo.content.trim()) {
                    lines[i] = lines[i].replace(/\[x\]/i, '[ ]')
                    unmarked = true
                    break
                  }
                }
                if (unmarked) planRepo.update(plan.id, { content: lines.join('\n') })
              }
            }
          }
        }
      }

      return ok(todo)
    } catch (e: unknown) {
      logger.error('todos:toggle error', e)
      return err('INTERNAL', (e as Error).message)
    }
  })

  ipcMain.handle(IPC.TODOS_RESCHEDULE_TODAY, (_e, id: string) => {
    try {
      const today = new Date().toISOString().slice(0, 10)
      const todo = todoRepo.rescheduleToday(id, today)
      if (!todo) return err('NOT_FOUND', 'Todo not found')
      return ok(todo)
    } catch (e: unknown) {
      logger.error('todos:rescheduleToday error', e)
      return err('INTERNAL', (e as Error).message)
    }
  })

  ipcMain.handle(IPC.TODOS_QUICK_CREATE, (_e, content: string) => {
    try {
      if (!content?.trim()) return err('INVALID', 'Content cannot be empty')
      const today = new Date().toISOString().slice(0, 10)
      const todo = todoRepo.quickCreate(content.trim(), today)
      return ok(todo)
    } catch (e: unknown) {
      logger.error('todos:quickCreate error', e)
      return err('INTERNAL', (e as Error).message)
    }
  })

  // 子阶段5：planDate 范围查询（含 todo+done，算 total；月图表确定性数据源）
  ipcMain.handle(IPC.TODOS_FIND_IN_RANGE, (_e, arg: { from: string; to: string }) => {
    try {
      if (!arg?.from || !arg?.to) return err('INVALID', 'from and to are required')
      return ok(todoRepo.findAllInRange(arg.from, arg.to))
    } catch (e: unknown) {
      logger.error('todos:findInRange error', e)
      return err('INTERNAL', (e as Error).message)
    }
  })

  // F3.2-2 + v0.2修复计划·§3.5：今日+逾期聚合返回，附带 sourceLabel + parentTask（来源链）。
  // batch 解析 projectId→name、sourcePlanId→date、parentTaskRef→上级 task（tasks 表一次查）
  // + 上级 plan（plans 表一次查），避免 renderer N 次 IPC。
  // 上级 task 已删/查无 → parentTask.invalid=true（「来源已删」标注，审查LOW-2）；项目/计划已删 → 规则自动降级。
  ipcMain.handle(IPC.TODOS_WITH_SOURCE, (_e, date?: string) => {
    try {
      const d = date ?? new Date().toISOString().slice(0, 10)
      const today = todoRepo.findToday(d)
      const overdue = todoRepo.findOverdue(d)
      const all = [...today, ...overdue]

      const projectIds = [...new Set(all.map(t => t.projectId).filter((x): x is string => !!x))]
      const planIds = [...new Set(all.map(t => t.sourcePlanId).filter((x): x is string => !!x))]
      const taskIds = [...new Set(
        all.map(t => parseParentTaskRef(t.parentTaskRef)?.parentTaskId).filter((x): x is string => !!x)
      )]
      const projectNames = new Map<string, string>()
      for (const pid of projectIds) {
        const p = projectRepo.findById(pid)
        if (p) projectNames.set(pid, p.name)
      }
      const planDates = new Map<string, string>()
      for (const pid of planIds) {
        const p = planRepo.findById(pid)
        if (p?.date) planDates.set(pid, p.date)
      }
      const tasks = taskRepo.findByTids(taskIds)
      const taskMap = new Map(tasks.map(t => [t.tid, t]))
      const taskPlanIds = [...new Set(tasks.map(t => t.planId))]
      const taskPlans = new Map(taskPlanIds.map(pid => [pid, planRepo.findById(pid)]))
      const taskPlanDate = (planId: string | undefined): string | null => {
        const p = planId ? taskPlans.get(planId) : undefined
        return p?.date ?? null
      }

      const annotate = (t: Todo): TodoWithSource => {
        const ref = parseParentTaskRef(t.parentTaskRef)
        const task = ref ? taskMap.get(ref.parentTaskId) : undefined
        // 审查LOW-2：ref 非空但 tasks 表查无该 tid（脏数据/roundtrip 残留）→ 归为「来源已删」失效
        // （invalid:true，不可点击），不再降级到规则1-5 —— 与规格 §8「ref 指向已删 task 标失效」语义一致。
        const parentTask = ref
          ? task
            ? {
                level: levelOf(taskPlans.get(task.planId)?.type ?? null),
                planId: task.planId,
                planDate: taskPlanDate(task.planId),
                tid: task.tid,
                content: task.content,
                invalid: task.isDeleted,
              }
            : {
                level: levelOf(null),
                planId: '',
                planDate: null,
                tid: ref.parentTaskId,
                content: '',
                invalid: true,
              }
          : null
        return {
          ...t,
          sourceLabel: labelTodoSource(t, {
            today: d,
            projectName: t.projectId ? projectNames.get(t.projectId) : null,
            sourcePlanDate: t.sourcePlanId ? planDates.get(t.sourcePlanId) : null,
            parentTask,
          }),
          parentTask,
        }
      }
      return ok({ today: today.map(annotate), overdue: overdue.map(annotate) })
    } catch (e: unknown) {
      logger.error('todos:withSource error', e)
      return err('INTERNAL', (e as Error).message)
    }
  })

  // v0.2修复计划·§3.5：来源链逐级解析（task tid → 其上级 task → … → 源头）。
  // 含已删行（来源失效仍可展示链路）；链中断（行缺失）即止。todo 侧只需传
  // withSource 返回的 parentTask.tid（首跳已知），无需 todoId 再查。
  ipcMain.handle(IPC.TASK_RESOLVE_CHAIN, (_e, arg: { tid: string }) => {
    try {
      if (!arg?.tid) return err('INVALID', 'tid is required')
      const chain: TaskChainItem[] = []
      let tid: string | null = arg.tid
      let guard = 0
      while (tid && guard++ < 20) {
        const task = taskRepo.findByTid(tid)
        if (!task) break
        const plan = planRepo.findById(task.planId)
        chain.push({
          level: levelOf(plan?.type ?? null),
          planId: task.planId,
          planDate: plan?.date ?? null,
          tid: task.tid,
          content: task.content,
        })
        tid = task.parentTaskId ?? null
      }
      return ok(chain)
    } catch (e: unknown) {
      logger.error('task:resolveChain error', e)
      return err('INTERNAL', (e as Error).message)
    }
  })
}
