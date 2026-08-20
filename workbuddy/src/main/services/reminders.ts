import { getWeekRange, getMonthRange } from '@shared/period'
import { projectTaskRepo, expectedReminderContent } from '../db/repositories/projectTaskRepo'
import { addEntry } from './flowActions'
import { logger } from '../lib/logger'

// 子阶段5：周期性提醒（固定规则：周日→做周统筹；月末→做月指导）
// 阶段4：同日同步种入 flow 今日投影行（今日页/日规划页同实体双视图）
// 阶段6：提醒 todo 只经 projectTaskRepo.ensureReminderTask（规格 §5.3，确定性 id rem:{key}:{date}）

export function weeklyReminderContent(today: string): string {
  return expectedReminderContent('weekly', today)
}

export function monthlyReminderContent(today: string): string {
  return expectedReminderContent('monthly', today)
}

/** 幂等种入（确定性 id；存量随机 UUID 精确兼容定位，不回填不迁移——projectTaskRepo 内部保证） */
function ensureTodo(key: 'weekly' | 'monthly', content: string, today: string): void {
  projectTaskRepo.ensureReminderTask({ date: today, key, content })
}

/**
 * 阶段4：种入 flow 今日投影行（source='reminder'，稳定键 weekly/monthly）。
 * - 已有 active 行 → addEntry 幂等返回，不重复插
 * - 当日已移出（墓碑存在）→ 跳过，不违背用户意图拉回
 * - 其它失败 → 记日志，不阻断启动（今日页照常渲染其它渠道）
 */
function ensureFlowProjection(today: string, key: 'weekly' | 'monthly', content: string): void {
  const r = addEntry({ date: today, title: content, source: 'reminder', reminderKey: key })
  if (r.ok) return
  if (r.error.code === 'SKIPPED_REMOVED') {
    logger.info(`reminder projection skipped (removed today): ${key} ${today}`)
    return
  }
  logger.warn(`reminder projection seed failed (${key} ${today}): ${r.error.message}`)
}

/** app 启动调用：今日=周日 → 「做周统筹」待办+投影；今日=月末 → 「做月指导」待办+投影。幂等。 */
export function ensurePeriodicReminders(today: string): void {
  const [, weekEnd] = getWeekRange(today)
  if (weekEnd === today) {
    const content = weeklyReminderContent(today)
    ensureTodo('weekly', content, today)
    ensureFlowProjection(today, 'weekly', content)
  }
  const [, monthEnd] = getMonthRange(today)
  if (monthEnd === today) {
    const content = monthlyReminderContent(today)
    ensureTodo('monthly', content, today)
    ensureFlowProjection(today, 'monthly', content)
  }
}
