import { getDb } from '../connection'

/**
 * 任务数据流通重构 · 阶段4：今日渠道同步唯一约束（只增索引，不改表）。
 * - project 投影：同一日同一源 todo（projectId=旧 todos 字符串 UUID）只允许一个 active 行
 * - reminder 投影：同一日同一 reminderKey（weekly/monthly）只允许一个 active 行
 * 部分索引（WHERE isDeleted=0）→ 墓碑行不参与约束：移出今日后可再次加入 / 复活不冲突。
 */
export function init009(): void {
  const db = getDb()

  db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_fde_project_today_unique
    ON flow_day_entries(date, projectId)
    WHERE isDeleted = 0 AND source = 'project' AND projectId IS NOT NULL;

    CREATE UNIQUE INDEX IF NOT EXISTS idx_fde_reminder_today_unique
    ON flow_day_entries(date, reminderKey)
    WHERE isDeleted = 0 AND source = 'reminder' AND reminderKey IS NOT NULL;
  `)
}
