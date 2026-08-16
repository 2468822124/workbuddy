import { randomUUID } from 'node:crypto'
import { getWeekRange, getMonthRange, getMonthStart, periodLabel, isoWeekOf } from '@shared/period'
import { todoRepo } from '../db/repositories/todoRepo'

// 子阶段5：周期性提醒（固定规则：周日→做周统筹；月末→做月指导）

export function weeklyReminderContent(today: string): string {
  return `📌 做周统筹 · 第 ${isoWeekOf(today)} 周`
}

export function monthlyReminderContent(today: string): string {
  return `📌 做月指导 · ${periodLabel('monthly', getMonthStart(today))}`
}

function ensureTodo(content: string, today: string): void {
  const exists = todoRepo.findByPlanDate(today).some(t => t.content === content)
  if (exists) return // 幂等：已存在不重复插
  todoRepo.create({
    id: randomUUID(),
    content,
    status: 'todo',
    planDate: today,
    projectId: null,
    sourcePlanId: null, // F3.2-2 复审#2：周期提醒非日规划生成，sourcePlanId 显式 null
    parentTaskRef: null, // v0.2修复计划：周期提醒非任务下沉生成，无上级任务链
    sourceInvalid: false, // 第二轮实测·问题②：非日规划生成，无失效来源
    sourceTaskTid: null, // 第三轮实测·问题乙：周期提醒无任务级来源
    isDeleted: false,
    deletedAt: null,
    completedAt: null,
  })
}

/** app 启动调用：今日=周日 → 「做周统筹」待办；今日=月末 → 「做月指导」待办。幂等。 */
export function ensurePeriodicReminders(today: string): void {
  const [, weekEnd] = getWeekRange(today)
  if (weekEnd === today) {
    ensureTodo(weeklyReminderContent(today), today)
  }
  const [, monthEnd] = getMonthRange(today)
  if (monthEnd === today) {
    ensureTodo(monthlyReminderContent(today), today)
  }
}
