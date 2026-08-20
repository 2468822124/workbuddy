import { getDb } from '../connection'
import {
  ProjectTask,
  CreateProjectTaskInput,
  UpdateProjectTaskInput,
  ReminderTaskInput,
} from '@shared/types'
import { isValidDate, isoWeekOf, periodLabel, getMonthStart } from '@shared/period'
import { randomUUID } from 'node:crypto'

/**
 * 阶段6：todos 表唯一项目/提醒兼容读写入口（项目计划 §4 仓库层约束）。
 * - 只做 SQL 与行映射；行映射显式忽略 sourcePlanId/parentTaskRef/sourceInvalid/sourceTaskTid
 *   等旧规划字段（规格 §6.2），不把旧字段传播到 flow 域。
 * - 项目任务完成态是 projects/todos 旧模块既有状态，不复制到 flow 表，不写 flow_vouchers。
 * - 提醒兼容定位规则（规格 §5.3）集中在此文件 findReminderTask / ensureReminderTask 内，
 *   其它服务不得按任意正文重新匹配。
 */

/** 确定性提醒 id：由 date + key 计算，重复调用幂等。前缀 rem: 与随机 UUID 无碰撞。 */
export function reminderIdFor(key: 'weekly' | 'monthly', date: string): string {
  return `rem:${key}:${date}`
}

/** 唯一预期提醒文案（规格 §5.3：由 date + key 计算；与阶段4 reminders 文案一致）。 */
export function expectedReminderContent(key: 'weekly' | 'monthly', date: string): string {
  return key === 'weekly'
    ? `📌 做周统筹 · 第 ${isoWeekOf(date)} 周`
    : `📌 做月指导 · ${periodLabel('monthly', getMonthStart(date))}`
}

function rowToProjectTask(r: Record<string, unknown>): ProjectTask {
  return {
    id: String(r.id),
    content: String(r.content),
    status: r.status === 'done' ? 'done' : 'todo',
    planDate: r.planDate == null ? null : String(r.planDate),
    projectId: r.projectId == null ? null : String(r.projectId),
    isDeleted: r.isDeleted === 1 || r.isDeleted === true,
    deletedAt: r.deletedAt == null ? null : String(r.deletedAt),
    completedAt: r.completedAt == null ? null : String(r.completedAt),
    createdAt: String(r.createdAt),
    updatedAt: String(r.updatedAt),
  }
}

function assertValidDate(date: string): void {
  if (!isValidDate(date)) throw new Error('Invalid date')
}

/** 输入边界：非空、≤200 字符、必填 projectId（沿用 TODOS_CREATE 既有规则，规格 §5.3）。 */
function assertValidCreate(input: CreateProjectTaskInput): void {
  const content = input.content?.trim()
  if (!content) throw new Error('Content cannot be empty')
  if (content.length > 200) throw new Error('Content exceeds 200 characters')
  if (!input.projectId?.trim()) throw new Error('projectId is required')
  if (input.planDate != null) assertValidDate(input.planDate)
}

export const projectTaskRepo = {
  /** 读取未软删项目任务（规格 §7 projectTasks:listByProject）。 */
  listByProject(projectId: string): ProjectTask[] {
    return getDb().prepare(
      'SELECT * FROM todos WHERE projectId = ? AND isDeleted = 0 ORDER BY createdAt DESC'
    ).all(projectId).map((r) => rowToProjectTask(r as Record<string, unknown>))
  },

  findById(id: string): ProjectTask | undefined {
    const r = getDb().prepare('SELECT * FROM todos WHERE id = ?').get(id)
    return r ? rowToProjectTask(r as Record<string, unknown>) : undefined
  },

  /** 批量读取（防 N+1，规格 §5.3：flowDerived 不得恢复 N 次 IPC/SQL）。 */
  findByIds(ids: string[]): ProjectTask[] {
    if (ids.length === 0) return []
    const placeholders = ids.map(() => '?').join(',')
    return getDb().prepare(
      `SELECT * FROM todos WHERE id IN (${placeholders}) AND isDeleted = 0`
    ).all(...ids).map((r) => rowToProjectTask(r as Record<string, unknown>))
  },

  findByDate(date: string): ProjectTask[] {
    return getDb().prepare(
      'SELECT * FROM todos WHERE planDate = ? AND isDeleted = 0 ORDER BY createdAt ASC'
    ).all(date).map((r) => rowToProjectTask(r as Record<string, unknown>))
  },

  /**
   * 提醒源兼容定位（规格 §5.3 唯一入口）：
   * 1) 优先读阶段6新建的确定性 id（rem:{key}:{date}）；
   * 2) 未命中时对阶段6前的随机 UUID 存量执行精确 date + 预期文案 + 非项目归属 +
   *    非旧规划来源约束查询，按 createdAt、id 稳定排序取一行；
   * 3) 仍未命中返回 undefined（flowActions 层据此判定 SOURCE_MISSING）。
   * 只接受合法日期与 weekly/monthly；非法输入视为不存在。
   */
  findReminderTask(date: string, key: 'weekly' | 'monthly'): ProjectTask | undefined {
    if (!isValidDate(date) || (key !== 'weekly' && key !== 'monthly')) return undefined
    const deterministic = this.findById(reminderIdFor(key, date))
    if (deterministic) return deterministic
    const expected = expectedReminderContent(key, date)
    const r = getDb().prepare(`
      SELECT * FROM todos WHERE planDate = ? AND content = ?
        AND projectId IS NULL AND sourcePlanId IS NULL AND sourceTaskTid IS NULL AND isDeleted = 0
      ORDER BY createdAt ASC, id ASC LIMIT 1
    `).get(date, expected)
    return r ? rowToProjectTask(r as Record<string, unknown>) : undefined
  },

  /** 只能由 projectTasks IPC 使用；强制项目归属、内容非空与 200 字符限制（规格 §5.3）。 */
  createProjectTask(input: CreateProjectTaskInput): ProjectTask {
    assertValidCreate(input)
    const now = new Date().toISOString()
    const r = getDb().prepare(`
      INSERT INTO todos (id, content, status, planDate, projectId, sourcePlanId, parentTaskRef, sourceInvalid, sourceTaskTid, isDeleted, deletedAt, completedAt, createdAt, updatedAt)
      VALUES (@id, @content, @status, @planDate, @projectId, NULL, NULL, 0, NULL, 0, NULL, NULL, @createdAt, @updatedAt)
      RETURNING *
    `).get({
      id: randomUUID(),
      content: input.content.trim(),
      status: 'todo',
      planDate: input.planDate ?? null,
      projectId: input.projectId.trim(),
      createdAt: now,
      updatedAt: now,
    })
    return rowToProjectTask(r as Record<string, unknown>)
  },

  /**
   * 周期提醒幂等种入（规格 §5.3）：同一 date/key 只允许一条。
   * 1) 确定性 id 已存在 → 返回既有行；
   * 2) 存量随机 UUID 提醒（精确兼容定位）已存在 → 返回既有行，不回填、不迁移旧数据；
   * 3) 都不存在 → 用确定性 id 新建。
   * 不得由 renderer 直接触达；content 应使用 expectedReminderContent 生成。
   */
  ensureReminderTask(input: ReminderTaskInput): ProjectTask {
    assertValidDate(input.date)
    if (input.key !== 'weekly' && input.key !== 'monthly') throw new Error('Invalid reminder key')
    const existing =
      this.findById(reminderIdFor(input.key, input.date)) ??
      this.findReminderTask(input.date, input.key)
    if (existing) return existing
    const now = new Date().toISOString()
    const r = getDb().prepare(`
      INSERT INTO todos (id, content, status, planDate, projectId, sourcePlanId, parentTaskRef, sourceInvalid, sourceTaskTid, isDeleted, deletedAt, completedAt, createdAt, updatedAt)
      VALUES (@id, @content, @status, @planDate, NULL, NULL, NULL, 0, NULL, 0, NULL, NULL, @createdAt, @updatedAt)
      RETURNING *
    `).get({
      id: reminderIdFor(input.key, input.date),
      content: input.content,
      status: 'todo',
      planDate: input.date,
      createdAt: now,
      updatedAt: now,
    })
    return rowToProjectTask(r as Record<string, unknown>)
  },

  /** 只允许 content、planDate；禁止修改 projectId、来源字段或删除标志（规格 §5.3）。 */
  updateProjectTask(id: string, patch: UpdateProjectTaskInput): ProjectTask | undefined {
    const existing = this.findById(id)
    if (!existing) return undefined
    if (patch.content !== undefined) {
      const content = patch.content.trim()
      if (!content) throw new Error('Content cannot be empty')
      if (content.length > 200) throw new Error('Content exceeds 200 characters')
    }
    if (patch.planDate != null) assertValidDate(patch.planDate)
    const now = new Date().toISOString()
    const merged = {
      ...existing,
      content: patch.content?.trim() ?? existing.content,
      planDate: patch.planDate !== undefined ? patch.planDate : existing.planDate,
      updatedAt: now,
    }
    getDb().prepare(`
      UPDATE todos SET content=@content, planDate=@planDate, updatedAt=@updatedAt WHERE id=@id
    `).run({ id, content: merged.content, planDate: merged.planDate, updatedAt: now })
    return this.findById(id)
  },

  /** 切换项目/提醒源任务完成态；不存在返回 undefined（flowActions 据此判 SOURCE_MISSING）。 */
  toggleDone(id: string): ProjectTask | undefined {
    const todo = this.findById(id)
    if (!todo) return undefined
    const now = new Date().toISOString()
    const newStatus: ProjectTask['status'] = todo.status === 'done' ? 'todo' : 'done'
    const completedAt = newStatus === 'done' ? now : null
    getDb().prepare(`
      UPDATE todos SET status=@status, completedAt=@completedAt, updatedAt=@updatedAt WHERE id=@id
    `).run({ id, status: newStatus, completedAt, updatedAt: now })
    return this.findById(id)
  },

  softDelete(id: string): boolean {
    const now = new Date().toISOString()
    const r = getDb().prepare(
      'UPDATE todos SET isDeleted=1, deletedAt=?, updatedAt=? WHERE id=? AND isDeleted=0'
    ).run(now, now, id)
    return r.changes > 0
  },
}
