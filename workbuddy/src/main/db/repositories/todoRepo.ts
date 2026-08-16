import { getDb } from '../connection'
import { Todo } from '@shared/types'
import { nextPeriodStart } from '@shared/period'
import { randomUUID } from 'node:crypto' // 审查LOW-1：静态 import（src 内原唯一 require 已消除）

export const todoRepo = {
  findAll(includeDeleted = false): Todo[] {
    const db = getDb()
    const where = includeDeleted ? '' : 'WHERE isDeleted = 0'
    return db.prepare(`SELECT * FROM todos ${where} ORDER BY createdAt DESC`).all() as Todo[]
  },

  findByPlanDate(date: string): Todo[] {
    return getDb().prepare(
      'SELECT * FROM todos WHERE planDate = ? AND isDeleted = 0 ORDER BY createdAt ASC'
    ).all(date) as Todo[]
  },

  findOverdue(today: string): Todo[] {
    return getDb().prepare(`
      SELECT * FROM todos WHERE planDate < ? AND status = 'todo' AND isDeleted = 0 ORDER BY planDate ASC
    `).all(today) as Todo[]
  },

  // 子阶段4：LLM 增强只读上下文（不写不改）
  findOpenToday(date: string): Todo[] {
    return getDb().prepare(`
      SELECT * FROM todos WHERE status = 'todo' AND isDeleted = 0 AND planDate <= ? ORDER BY planDate ASC, createdAt ASC
    `).all(date) as Todo[]
  },

  findCompletedOn(date: string): Todo[] {
    return getDb().prepare(`
      SELECT * FROM todos WHERE status = 'done' AND isDeleted = 0 AND completedAt LIKE ? ORDER BY completedAt ASC
    `).all(date + '%') as Todo[]
  },

  // 子阶段5：期范围只读（完成率/图表聚合；to 为含端点，completedAt 按 ISO 字面量比对上界取 (to+1天)）
  findCompletedInRange(from: string, to: string): Todo[] {
    const toExclusive = nextPeriodStart('daily', to)
    return getDb().prepare(`
      SELECT * FROM todos WHERE status = 'done' AND isDeleted = 0
        AND completedAt >= ? AND completedAt < ?
      ORDER BY completedAt ASC
    `).all(from, toExclusive) as Todo[]
  },

  findAllInRange(from: string, to: string): Todo[] {
    return getDb().prepare(`
      SELECT * FROM todos WHERE isDeleted = 0 AND planDate >= ? AND planDate <= ?
      ORDER BY planDate ASC, createdAt ASC
    `).all(from, to) as Todo[]
  },

  findByProject(projectId: string): Todo[] {
    return getDb().prepare(
      'SELECT * FROM todos WHERE projectId = ? AND isDeleted = 0 ORDER BY createdAt DESC'
    ).all(projectId) as Todo[]
  },

  findById(id: string): Todo | undefined {
    return getDb().prepare('SELECT * FROM todos WHERE id = ?').get(id) as Todo | undefined
  },

  create(data: Omit<Todo, 'createdAt' | 'updatedAt'>): Todo {
    const now = new Date().toISOString()
    return getDb().prepare(`
      INSERT INTO todos (id, content, status, planDate, projectId, sourcePlanId, parentTaskRef, sourceInvalid, sourceTaskTid, isDeleted, deletedAt, completedAt, createdAt, updatedAt)
      VALUES (@id, @content, @status, @planDate, @projectId, @sourcePlanId, @parentTaskRef, @sourceInvalid, @sourceTaskTid, @isDeleted, @deletedAt, @completedAt, @createdAt, @updatedAt)
      RETURNING *
    `).get({
      ...data,
      isDeleted: data.isDeleted ? 1 : 0,
      deletedAt: data.deletedAt ?? null,
      completedAt: data.completedAt ?? null,
      planDate: data.planDate ?? null,
      projectId: data.projectId ?? null,
      sourcePlanId: data.sourcePlanId ?? null,
      // v0.2修复计划：parentTaskRef 必填（调用点显式传；缺失兜底 null）
      parentTaskRef: data.parentTaskRef ?? null,
      sourceInvalid: data.sourceInvalid ? 1 : 0,
      sourceTaskTid: data.sourceTaskTid ?? null,
      createdAt: now,
      updatedAt: now,
    }) as Todo
  },

  update(id: string, data: Partial<Todo>): Todo | undefined {
    const now = new Date().toISOString()
    const existing = this.findById(id)
    if (!existing) return undefined
    const merged = { ...existing, ...data, updatedAt: now }
    getDb().prepare(`
      UPDATE todos SET content=@content, status=@status, planDate=@planDate, projectId=@projectId,
        sourcePlanId=@sourcePlanId, parentTaskRef=@parentTaskRef, sourceInvalid=@sourceInvalid,
        sourceTaskTid=@sourceTaskTid, isDeleted=@isDeleted, deletedAt=@deletedAt,
        completedAt=@completedAt, updatedAt=@updatedAt
      WHERE id=@id
    `).run({ ...merged, isDeleted: merged.isDeleted ? 1 : 0, sourceInvalid: merged.sourceInvalid ? 1 : 0 })
    return merged as Todo
  },

  /** v0.2修复计划：直接改写 parentTaskRef（复用池补关联用）。 */
  setParentTaskRef(id: string, ref: string | null): Todo | undefined {
    return this.update(id, { parentTaskRef: ref } as Partial<Todo>)
  },

  /**
   * v0.2修复计划·§3.6：按 parentTaskRef.parentTaskId 查下游 todo（精确 JSON 解析过滤，
   * LIKE 仅粗筛防前缀误命中：'"parentTaskId":"abc"' 不匹配 '"parentTaskId":"abcdef"'）。
   */
  findByParentTaskId(tid: string): Todo[] {
    const candidates = getDb().prepare(
      "SELECT * FROM todos WHERE parentTaskRef LIKE '%\"parentTaskId\":\"' || ? || '\"%' AND isDeleted = 0"
    ).all(tid) as Todo[]
    return candidates.filter(t => {
      try {
        const v = JSON.parse(t.parentTaskRef ?? '') as { parentTaskId?: unknown }
        return v.parentTaskId === tid
      } catch {
        return false
      }
    })
  },

  /**
   * v0.2修复计划·§3.7：找可复用的项目 todo —— 同 content + projectId 非空 + 未安排
   * （planDate 为 NULL 或早于给定日期；已排到当天的项目 todo 不抢）。
   * §3.7 复用判据按规格原文（content/projectId/未安排），不依赖行内 parent 字段：
   * 行 parent=项目 todo id 与 tasks.parentTaskId FK（REFERENCES tasks(tid)）冲突
   * （见当前状态.md §19 偏差）。
   */
  findByContentWithProject(content: string, planDate: string): Todo | undefined {
    return getDb().prepare(
      "SELECT * FROM todos WHERE content = ? AND projectId IS NOT NULL AND isDeleted = 0 AND (planDate IS NULL OR planDate < ?) ORDER BY createdAt ASC LIMIT 1"
    ).get(content, planDate) as Todo | undefined
  },

  toggleDone(id: string): Todo | undefined {
    const todo = this.findById(id)
    if (!todo) return undefined
    const now = new Date().toISOString()
    const newStatus: Todo['status'] = todo.status === 'done' ? 'todo' : 'done'
    const completedAt = newStatus === 'done' ? now : null
    return this.update(id, { status: newStatus, completedAt } as Partial<Todo>)
  },

  findToday(date: string): Todo[] {
    return getDb().prepare(
      'SELECT * FROM todos WHERE planDate = ? AND isDeleted = 0 ORDER BY createdAt ASC'
    ).all(date) as Todo[]
  },

  rescheduleToday(id: string, today: string): Todo | undefined {
    const todo = this.findById(id)
    if (!todo) return undefined
    return this.update(id, { planDate: today } as Partial<Todo>)
  },

  quickCreate(content: string, today: string): Todo {
    return this.create({
      id: randomUUID(),
      content,
      status: 'todo',
      planDate: today,
      projectId: null,
      sourcePlanId: null, // F3.2-2 复审#3：手动 quickCreate 非日规划生成，sourcePlanId 显式 null（GLM 未列，同源遗漏）
      parentTaskRef: null, // v0.2修复计划：手动待办无上级任务链
      sourceInvalid: false, // 第二轮实测·问题②：非日规划生成，无失效来源
      sourceTaskTid: null, // 第三轮实测·问题乙：手动待办无任务级来源
      isDeleted: false,
      deletedAt: null,
      completedAt: null,
    })
  },

  softDelete(id: string): boolean {
    const now = new Date().toISOString()
    const r = getDb().prepare(
      'UPDATE todos SET isDeleted=1, deletedAt=?, updatedAt=? WHERE id=? AND isDeleted=0'
    ).run(now, now, id)
    return r.changes > 0
  },

  /**
   * 按 content + planDate 范围查已完成 todo（F3-1.2 方案 C：todo 取消勾选时反查本周是否还有
   * 同名已完成 todo；有→保持 weekly [x]，无→回 [ ]。excludeId 排当前 todo 自身）。 */
  findByContentInRange(content: string, from: string, to: string, excludeId?: string): Todo[] {
    const sql = excludeId
      ? `SELECT * FROM todos WHERE content = ? AND status = 'done' AND isDeleted = 0 AND planDate >= ? AND planDate <= ? AND id != ? ORDER BY planDate ASC`
      : `SELECT * FROM todos WHERE content = ? AND status = 'done' AND isDeleted = 0 AND planDate >= ? AND planDate <= ? ORDER BY planDate ASC`
    const args: (string | number)[] = [content, from, to]
    if (excludeId) args.push(excludeId)
    return getDb().prepare(sql).all(...args) as Todo[]
  },
}
