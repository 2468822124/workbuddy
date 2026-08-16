import { Todo, TodoParentTask } from '@shared/types'

/**
 * 用户反馈3.2 F3.2-2 + v0.2修复计划·§3.5 出处标注：纯函数，判定 todo 的来源标签（优先级高→低）。
 *
 * 规则（定稿 §3 + §3.5）：
 * 0. parentTaskRef 非空 → 直接上级标签（主进程已解析注入）
 *    - 上级 task 存在 → `← {周任务|月任务|日任务}·{content}`（可点击出处）
 *    - 上级 task 已删 → `来源已删`（置灰，done 历史失效标注）
 * 1. content 以 📌 开头 → `周期提醒`（无日期）
 * 2. projectId 非空且有项目名 → `项目·{name}`
 * 3. sourcePlanId 非空且有对应日计划 → `日规划·{date}`
 * 4. planDate 早于今天且未完成 → `顺延·{planDate}`
 * 5. 其余 → `手动·{planDate}`
 *
 * projectName/sourcePlanDate/parentTask 由调用方（IPC handler）预解析注入，
 * 本函数不碰 DB、可单测；项目/计划已删除（解析为 null）时自动降级到后续规则。
 */
export interface TodoSourceCtx {
  today: string
  projectName?: string | null
  sourcePlanDate?: string | null
  parentTask?: TodoParentTask | null
}

const LEVEL_LABEL: Record<TodoParentTask['level'], string> = {
  daily: '日任务',
  weekly: '周任务',
  monthly: '月任务',
}

export function labelTodoSource(todo: Todo, ctx: TodoSourceCtx): string {
  if (ctx.parentTask) {
    if (ctx.parentTask.invalid) return '来源已删'
    return `← ${LEVEL_LABEL[ctx.parentTask.level]}·${ctx.parentTask.content}`
  }
  if (todo.content.trim().startsWith('📌')) return '周期提醒'
  if (todo.projectId && ctx.projectName) return `项目·${ctx.projectName}`
  // 第二轮实测·问题②：同级日规划 done orphan —— 来源任务行已删（syncPlanTodos 置 1），
  // 规则3 会因 sourcePlanId 仍指向存在的 plan 而误显「日规划·日期」，须先判失效。
  if (todo.sourceInvalid) return '来源已删'
  if (todo.sourcePlanId && ctx.sourcePlanDate) return `日规划·${ctx.sourcePlanDate}`
  if (todo.planDate && todo.planDate < ctx.today && todo.status === 'todo') return `顺延·${todo.planDate}`
  return `手动·${todo.planDate ?? '无日期'}`
}
