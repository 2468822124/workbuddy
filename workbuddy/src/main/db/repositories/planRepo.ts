import { getDb } from '../connection'
import { Plan, TemplateType, Todo } from '@shared/types'
import { todoRepo } from './todoRepo'
import { taskRepo } from './taskRepo'
import { parseTasksWithState, setTaskConsumedByTid } from '../../services/planParser'
import { makeParentTaskRef, parseParentTaskRef } from '../../services/parentRef'
import { getWeekRange, getMonthRange } from '@shared/period'
import { randomUUID } from 'node:crypto'
import { logger } from '../../lib/logger'

function parseIds(raw: string | null | undefined): string[] {
  if (!raw) return []
  try {
    const v = JSON.parse(raw)
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []
  } catch {
    return []
  }
}

function rowToPlan(r: Record<string, unknown>): Plan {
  return {
    id: r.id as string,
    date: (r.date as string | null) ?? null,
    type: (r.type as string | null) ?? null,
    content: (r.content as string | null) ?? null,
    generatedTodoIds: parseIds(r.generatedTodoIds as string | null),
    templateId: (r.templateId as string | null) ?? null,
    isDeleted: !!r.isDeleted,
    deletedAt: (r.deletedAt as string | null) ?? null,
    createdAt: r.createdAt as string,
    updatedAt: r.updatedAt as string,
  }
}

export type PlanCreateInput = Omit<Plan, 'createdAt' | 'updatedAt' | 'isDeleted' | 'deletedAt'>

export interface SyncResult {
  plan: Plan
  orphanTodoIds: string[]
  generatedCount: number
  synced: boolean
  // F3.2-1 方案B：orphan 按状态分流 —— 未完成软删移除 / 已完成保留为历史
  removedOpenCount: number
  keptDoneCount: number
  // v0.2修复计划·§3.6：跨级删除分流（上级 task 被删 → 下游 todo）
  cascadeRemovedOpenCount: number   // open → 软删（今日总览消失）
  cascadeInvalidatedDoneCount: number // done → 保留，来源失效标注
  error?: string
}

export const planRepo = {
  findAll(opts?: { from?: string; to?: string; type?: string }): Plan[] {
    const db = getDb()
    const conds: string[] = ['isDeleted = 0']
    const args: string[] = []
    if (opts?.from) { conds.push('date >= ?'); args.push(opts.from) }
    if (opts?.to) { conds.push('date <= ?'); args.push(opts.to) }
    if (opts?.type) { conds.push('type = ?'); args.push(opts.type) }
    return (db
      .prepare(`SELECT * FROM plans WHERE ${conds.join(' AND ')} ORDER BY date DESC, createdAt DESC`)
      .all(...args) as Record<string, unknown>[]).map(rowToPlan)
  },

  findById(id: string): Plan | undefined {
    const r = getDb().prepare('SELECT * FROM plans WHERE id = ?').get(id) as Record<string, unknown> | undefined
    if (!r || r.isDeleted) return undefined
    return rowToPlan(r)
  },

  findByDate(date: string): Plan | undefined {
    const r = getDb()
      .prepare('SELECT * FROM plans WHERE date = ? AND isDeleted = 0 ORDER BY createdAt DESC LIMIT 1')
      .get(date) as Record<string, unknown> | undefined
    if (!r) return undefined
    return rowToPlan(r)
  },

  /**
   * 子阶段5：type + 期起始查询（date 已是期起始：日=当天/周=周一/月=1号）。
   * 只读；多条取最新（createdAt DESC，同 findByDate 现状）。
   */
  getByPeriod(type: TemplateType, start: string): Plan | undefined {
    const r = getDb()
      .prepare('SELECT * FROM plans WHERE type = ? AND date = ? AND isDeleted = 0 ORDER BY createdAt DESC LIMIT 1')
      .get(type, start) as Record<string, unknown> | undefined
    if (!r) return undefined
    return rowToPlan(r)
  },

  create(data: PlanCreateInput): Plan {
    const now = new Date().toISOString()
    const id = data.id || randomUUID()
    getDb().prepare(`
      INSERT INTO plans (id, date, type, content, generatedTodoIds, templateId, isDeleted, deletedAt, createdAt, updatedAt)
      VALUES (@id, @date, @type, @content, @generatedTodoIds, @templateId, 0, NULL, @createdAt, @updatedAt)
    `).run({
      id,
      date: data.date ?? null,
      type: data.type ?? null,
      content: data.content ?? null,
      generatedTodoIds: JSON.stringify(data.generatedTodoIds ?? []),
      templateId: data.templateId ?? null,
      createdAt: now,
      updatedAt: now,
    })
    return this.findById(id) as Plan
  },

  update(id: string, data: Partial<Plan>): Plan | undefined {
    const now = new Date().toISOString()
    const existing = this.findById(id)
    if (!existing) return undefined
    const merged: Plan = {
      ...existing,
      ...data,
      generatedTodoIds: data.generatedTodoIds ?? existing.generatedTodoIds,
      updatedAt: now,
    }
    getDb().prepare(`
      UPDATE plans
      SET date = @date, type = @type, content = @content, generatedTodoIds = @generatedTodoIds,
          templateId = @templateId, isDeleted = @isDeleted, deletedAt = @deletedAt, updatedAt = @updatedAt
      WHERE id = @id
    `).run({
      id: merged.id,
      date: merged.date ?? null,
      type: merged.type ?? null,
      content: merged.content ?? null,
      generatedTodoIds: JSON.stringify(merged.generatedTodoIds),
      templateId: merged.templateId ?? null,
      isDeleted: merged.isDeleted ? 1 : 0,
      deletedAt: merged.deletedAt ?? null,
      updatedAt: now,
    })
    return this.findById(id) as Plan
  },

  softDelete(id: string): boolean {
    const now = new Date().toISOString()
    const r = getDb()
      .prepare('UPDATE plans SET isDeleted = 1, deletedAt = ?, updatedAt = ? WHERE id = ? AND isDeleted = 0')
      .run(now, now, id)
    return r.changes > 0
  },

  setGeneratedTodoIds(id: string, ids: string[]): void {
    const now = new Date().toISOString()
    getDb()
      .prepare('UPDATE plans SET generatedTodoIds = ?, updatedAt = ? WHERE id = ?')
      .run(JSON.stringify(ids), now, id)
  },

  /**
   * 幂等同步（v0.2修复计划·参照完整性版）：
   * 1. §3.3 tasks 双向同步（所有 plan 类型；周/月仅此步 → 触发 §3.6 跨级分流，修④）
   *    - content 行有 tid → upsert tasks 行（tid 不变，扛改名）
   *    - tasks 行 tid 不在 content → 软删 + §3.6 跨级分流（下游 todo：open 软删/done 保留失效）
   * 2. §3.7 项目 todo 复用：行 parentTid 指向项目 todo 且 content 同 → 复用该 todo（按 id，防②）
   * 3. todo 生成（仅 daily_plan；复用池按剥离注释的 text，保留完成态）
   * 4. F3.2-1 方案B：残留 todo（用户删了任务行）open 软删/done 保留历史；
   *    §3.7 复用的项目 todo 例外 → 回退 planDate=null（审查MED-2，保留在项目）
   * 5. 回填 generatedTodoIds
   * - 解析/同步异常：不抛出（调用方据此降级），返回 synced:false。
   */
  syncPlanTodos(id: string): SyncResult {
    const plan = this.findById(id)
    if (!plan) {
      return { plan: null as unknown as Plan, orphanTodoIds: [], generatedCount: 0, removedOpenCount: 0, keptDoneCount: 0, cascadeRemovedOpenCount: 0, cascadeInvalidatedDoneCount: 0, synced: false, error: 'Plan not found' }
    }
    try {
      const parsed = parseTasksWithState(plan.content ?? '')
      const oldIds = plan.generatedTodoIds
      const isDaily = plan.type === 'daily_plan'
      let cascadeRemovedOpenCount = 0
      let cascadeInvalidatedDoneCount = 0

      // ── §3.3 tasks 双向同步（所有类型）──
      const activeRows = taskRepo.findByPlan(id)
      const parsedTids = new Set(parsed.filter(p => p.tid).map(p => p.tid as string))
      for (const row of activeRows) {
        if (parsedTids.has(row.tid)) continue
        // §3.3「有 tid 但 content 已无该行」→ 被删 → §3.6 跨级分流
        taskRepo.softDeleteByTid(row.tid)
        const downstream = todoRepo.findByParentTaskId(row.tid)
        for (const t of downstream) {
          if (t.status === 'todo') {
            todoRepo.softDelete(t.id)
            cascadeRemovedOpenCount++
          } else {
            cascadeInvalidatedDoneCount++
            // done 保留；来源失效由 withSource 推导（tasks 行缺失 → invalid 标注）
          }
        }
      }
      // content 行（有 tid）→ upsert 行（复活软删行、更新 content/consumed/sortOrder/parentTaskId）
      parsed.forEach((p, i) => {
        if (!p.tid) return
        taskRepo.upsert({
          tid: p.tid,
          planId: id,
          content: p.text,
          parentTaskId: p.parentTid,
          consumed: p.consumed,
          sortOrder: i,
        })
      })

      // ── todo 生成：仅 daily_plan（周/月跳过，门控保留）──
      if (!isDaily) {
        return {
          plan: this.findById(id) as Plan,
          orphanTodoIds: [],
          generatedCount: 0,
          removedOpenCount: 0,
          keptDoneCount: 0,
          cascadeRemovedOpenCount,
          cascadeInvalidatedDoneCount,
          synced: true,
        }
      }

      const openLines = parsed.filter(p => !p.consumed)
      // 按剥离注释的 text 建复用池（每个 todo 只可被复用一次）
      const existing = oldIds
        .map(tid => todoRepo.findById(tid))
        .filter((t): t is Todo => !!t && !t.isDeleted)
      const available = new Map<string, Todo[]>()
      for (const t of existing) {
        const pool = available.get(t.content)
        if (pool) pool.push(t)
        else available.set(t.content, [t])
      }

      const resultIds: string[] = []
      let generatedCount = 0
      // 第三轮实测·问题乙：按任务行 tid 优先复用 —— 改名文本变、行 tid 不变 → 复用同一 todo
      // （更新 content、保留 status/completedAt、清失效）。todo 无 sourceTaskTid（存量）→ 文本 fallback。
      const tidPool = new Map<string, Todo>()
      for (const t of existing) {
        if (t.sourceTaskTid) tidPool.set(t.sourceTaskTid, t)
      }
      for (const line of openLines) {
        // ① tid 优先复用：同任务行（改名存活）
        if (line.tid && tidPool.has(line.tid)) {
          const t = tidPool.get(line.tid) as Todo
          const updates: Partial<Todo> = {}
          if (t.content !== line.text) updates.content = line.text // 改名 → 更新文本，保留完成态
          if (t.sourceInvalid) updates.sourceInvalid = false
          if (line.parentTid && !t.parentTaskRef) {
            const parentPlanId = taskRepo.findByTid(line.parentTid)?.planId ?? null
            updates.parentTaskRef = makeParentTaskRef(parentPlanId, line.parentTid)
          }
          if (Object.keys(updates).length) todoRepo.update(t.id, updates)
          // 移出文本池防重复命中（改名后 t.content 与 line.text 不同，按旧 content 定位池条目）
          const textPool = available.get(t.content)
          if (textPool) {
            const idx = textPool.indexOf(t)
            if (idx !== -1) textPool.splice(idx, 1)
          }
          resultIds.push(t.id)
          continue
        }
        // §3.7 项目 todo 复用（判据按规格原文：同 content + projectId 非空 + 未安排）。
        // 不依赖行内 parent 字段 —— 行 parent=项目 todo id 会撞 tasks.parentTaskId FK
        // （REFERENCES tasks(tid)）；且 ref 指向项目 todo id 会破坏规则0 出处标注
        // （tasks 查无该 tid → 误标「来源已删」）。本期只建复用机制：set planDate +
        // 保留 projectId（偏差记录当前状态.md §19）。
        const projectReuse =
          !available.has(line.text)
            ? todoRepo.findByContentWithProject(line.text, plan.date as string)
            : undefined
        if (projectReuse && !oldIds.includes(projectReuse.id)) {
          const t = todoRepo.update(projectReuse.id, {
            planDate: plan.date,
          } as Partial<Todo>)
          if (t) {
            resultIds.push(t.id)
            continue
          }
        }
        const pool = available.get(line.text)
        if (pool && pool.length) {
          // 复用：保留其 status/completedAt，不重置
          const t = pool.shift() as Todo
          // 第二轮实测·问题②：同文本行重新加回 → 清失效标志（来源行恢复有效）
          if (t.sourceInvalid) {
            todoRepo.update(t.id, { sourceInvalid: false } as Partial<Todo>)
          }
          // 补关联：行有 parentTid 且 todo 缺 ref（存量/旧链接）→ 写入（复用不覆盖既有 ref）
          if (line.parentTid && !t.parentTaskRef) {
            const parentPlanId = taskRepo.findByTid(line.parentTid)?.planId ?? null
            todoRepo.setParentTaskRef(t.id, makeParentTaskRef(parentPlanId, line.parentTid))
          }
          // 第三轮实测·问题乙：文本复用命中时若行有 tid、todo 缺任务级关联 → 补写（存量迁移渐进）
          if (line.tid && !t.sourceTaskTid) {
            todoRepo.update(t.id, { sourceTaskTid: line.tid } as Partial<Todo>)
          }
          resultIds.push(t.id)
        } else {
          const parentPlanId = line.parentTid ? (taskRepo.findByTid(line.parentTid)?.planId ?? null) : null
          const t = todoRepo.create({
            id: randomUUID(),
            content: line.text,
            status: 'todo',
            planDate: plan.date,
            projectId: null,
            sourcePlanId: plan.id, // F3.2-2：标注来源日计划
            parentTaskRef: line.parentTid ? makeParentTaskRef(parentPlanId, line.parentTid) : null,
            sourceInvalid: false,
            sourceTaskTid: line.tid ?? null, // 第三轮实测·问题乙：任务级关联（改名复用键）
            isDeleted: false,
            deletedAt: null,
            completedAt: null,
          })
          resultIds.push(t.id)
          generatedCount++
        }
      }

      const orphanTodoIds = oldIds.filter(x => !resultIds.includes(x))

      // F3.2-1 方案B：orphan 分流 —— 未完成（status='todo'）软删移除；已完成（done）保留为历史。
      // done orphan 保留在 generatedTodoIds（复用池持续命中）：删行后再加回同文本行 →
      // 复用保留完成态（定稿 §3.1 回归③）。已软删的存量 orphan 跳过（不重复计数/软删）。
      let removedOpenCount = 0
      let keptDoneCount = 0
      const keptIds: string[] = []
      for (const oid of orphanTodoIds) {
        const t = todoRepo.findById(oid)
        if (!t || t.isDeleted) continue
        // 审查MED-2：§3.7 复用的项目 todo（projectId 非空）删任务行 → 回退「未安排」
        // （planDate=null，保留在项目），不进 orphan 软删池 —— 软删=项目任务丢失（数据安全）。
        // 同时不进 keptIds（不再由本计划生成；下次同文本行由 findByContentWithProject 重新复用）。
        if (t.projectId) {
          todoRepo.update(oid, { planDate: null })
          continue
        }
        if (t.status === 'todo') {
          todoRepo.softDelete(oid)
          removedOpenCount++
        } else {
          keptDoneCount++
          keptIds.push(oid)
          // 第二轮实测·问题②：done orphan 保留但来源行已删 → 标失效
          // （labelTodoSource 规则输出「来源已删」+ TodayView 置灰；加回同文本行时复用分支清零）
          if (!t.sourceInvalid) {
            todoRepo.update(oid, { sourceInvalid: true } as Partial<Todo>)
          }
          // 第四轮实测·问题2b：done orphan（已失效）不再构成完成凭据 → 重算上级周/月任务 consumed：
          // 该计划期内还有其它**有效**（非 sourceInvalid）done todo 完成该上级任务 → 保持 [x]；
          // 否则回退 [x]→[ ]（rail 轴①放行，周任务重新显示）。
          const ref = parseParentTaskRef(t.parentTaskRef)
          if (ref) {
            const parentTask = taskRepo.findByTid(ref.parentTaskId)
            const parentPlan = parentTask ? this.findById(parentTask.planId) : undefined
            if (parentTask && !parentTask.isDeleted && parentPlan) {
              const range =
                parentPlan.type === 'monthly_plan' ? getMonthRange(parentPlan.date ?? '')
                : parentPlan.type === 'weekly_plan' ? getWeekRange(parentPlan.date ?? '')
                : [parentPlan.date ?? '', parentPlan.date ?? '']
              const others = todoRepo
                .findByContentInRange(t.content, range[0], range[1], oid)
                .filter(o => !o.sourceInvalid && o.status === 'done')
              if (others.length === 0) {
                const content = setTaskConsumedByTid(parentPlan.content ?? '', ref.parentTaskId, false)
                if (content !== parentPlan.content) {
                  this.update(parentPlan.id, { content })
                  taskRepo.updateConsumed(ref.parentTaskId, false)
                }
              }
            }
          }
        }
      }

      this.setGeneratedTodoIds(id, [...resultIds, ...keptIds])
      return {
        plan: this.findById(id) as Plan,
        orphanTodoIds,
        generatedCount,
        removedOpenCount,
        keptDoneCount,
        cascadeRemovedOpenCount,
        cascadeInvalidatedDoneCount,
        synced: true,
      }
    } catch (e: unknown) {
      logger.error('plan:syncPlanTodos error', e)
      return {
        plan: this.findById(id) as Plan,
        orphanTodoIds: [],
        generatedCount: 0,
        removedOpenCount: 0,
        keptDoneCount: 0,
        cascadeRemovedOpenCount: 0,
        cascadeInvalidatedDoneCount: 0,
        synced: false,
        error: (e as Error).message,
      }
    }
  },
}
