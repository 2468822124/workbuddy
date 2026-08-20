import { describe, it, expect, beforeEach } from 'vitest'
import { randomUUID } from 'node:crypto'
import {
  mockConnectionDb, resetDb,
  MONDAY, THURSDAY, FRIDAY,
} from './flowTestDb'
import { getDb } from '../src/main/db/connection'
import { flowDayRepo } from '../src/main/db/repositories/flowDayRepo'
import { projectTaskRepo } from '../src/main/db/repositories/projectTaskRepo'
import { projectRepo } from '../src/main/db/repositories/projectRepo'
import { getDayBoard } from '../src/main/services/flowDerived'
import {
  addEntry, toggleCheckEntry, removeEntry, moveEntry, skipEntry, updateEntry,
} from '../src/main/services/flowActions'
import { ensurePeriodicReminders, weeklyReminderContent } from '../src/main/services/reminders'
import { createTempInstance } from '../src/main/services/flowActions'
import type { ProjectTask } from '@shared/types'

mockConnectionDb()

const SUNDAY = '2026-08-16' // 8-14 为周五 ⇒ 8-16 为周日
const MONTH_END = '2026-08-31'

/** todos.projectId 有 FK → projects(id)，须先建真实项目行（node:sqlite 默认 foreign_keys=ON） */
function makeProject(): string {
  const id = randomUUID()
  projectRepo.create({
    id,
    name: '测试项目',
    status: 'active',
    description: null,
    color: null,
    isDeleted: false,
    deletedAt: null,
  })
  return id
}

/** 阶段6：项目任务只经 projectTaskRepo 创建（todos 表唯一入口） */
function makeSourceTodo(content: string, projectId?: string): ProjectTask {
  return projectTaskRepo.createProjectTask({
    content,
    planDate: null,
    projectId: projectId ?? makeProject(),
  })
}

function addProjection(date: string, todo: ProjectTask) {
  const r = addEntry({ date, title: todo.content, source: 'project', projectId: todo.id })
  if (!r.ok) throw new Error(`projection failed: ${r.error.message}`)
  return r.data
}

function activeReminderRows(date: string) {
  return flowDayRepo.listByDate(date).filter(e => e.source === 'reminder' && !e.isDeleted)
}

describe('阶段4 · 项目投影链路', () => {
  beforeEach(resetDb)

  it('加入今日生成投影：locked、projectId=源 todo id、标题/状态/来源跳转随源', () => {
    const todo = makeSourceTodo('修复登录页')
    const entry = addProjection(THURSDAY, todo)
    expect(entry.locked).toBe(true)
    expect(entry.projectId).toBe(todo.id)

    const be = getDayBoard(THURSDAY).entries.find(e => e.id === entry.id)
    expect(be).toBeDefined()
    expect(be!.displayTitle).toBe('修复登录页')
    expect(be!.done).toBe(false)
    expect(be!.sourceHref).toBe(`/projects/${todo.projectId}`)
  })

  it('重复加入幂等：同源同日只一个 active 行且返回同一 id', () => {
    const todo = makeSourceTodo('写周报')
    const r1 = addProjection(THURSDAY, todo)
    const r2 = addProjection(THURSDAY, todo)
    expect(r2.id).toBe(r1.id)
    const rows = flowDayRepo.listByDate(THURSDAY).filter(e => e.source === 'project')
    expect(rows.length).toBe(1)
  })

  it('移出今日后再加入 → 复用墓碑行（同 id 复活，行身份稳定）', () => {
    const todo = makeSourceTodo('回写测试')
    const r1 = addProjection(THURSDAY, todo)
    expect(removeEntry(r1.id).ok).toBe(true)
    const r2 = addProjection(THURSDAY, todo)
    expect(r2.id).toBe(r1.id)
    expect(r2.isDeleted).toBe(false)
    const rows = flowDayRepo.listByDate(THURSDAY).filter(e => e.source === 'project')
    expect(rows.length).toBe(1)
  })

  it('项目页改名 → 今日投影 displayTitle 实时跟随', () => {
    const todo = makeSourceTodo('旧标题')
    const entry = addProjection(THURSDAY, todo)
    projectTaskRepo.updateProjectTask(todo.id, { content: '新标题' })
    const be = getDayBoard(THURSDAY).entries.find(e => e.id === entry.id)
    expect(be!.displayTitle).toBe('新标题')
  })

  it('勾选回写源 todo；源侧勾选在今日投影可见（同源零双态）', () => {
    const todo = makeSourceTodo('双向同步')
    const entry = addProjection(THURSDAY, todo)

    const t1 = toggleCheckEntry(entry.id)
    expect(t1.ok && t1.data.done).toBe(true)
    expect(projectTaskRepo.findById(todo.id)!.status).toBe('done')
    expect(getDayBoard(THURSDAY).entries.find(e => e.id === entry.id)!.done).toBe(true)

    projectTaskRepo.toggleDone(todo.id) // 项目页收勾
    expect(getDayBoard(THURSDAY).entries.find(e => e.id === entry.id)!.done).toBe(false)
  })

  it('源 todo 已删 → 投影降级只读：done=false、sourceHref=null、标题回落快照；勾选报 SOURCE_MISSING', () => {
    const todo = makeSourceTodo('被删的源')
    const entry = addProjection(THURSDAY, todo)
    projectTaskRepo.softDelete(todo.id)

    const be = getDayBoard(THURSDAY).entries.find(e => e.id === entry.id)
    expect(be).toBeDefined()
    expect(be!.done).toBe(false)
    expect(be!.sourceHref).toBeNull()
    expect(be!.displayTitle).toBe('被删的源')

    const t = toggleCheckEntry(entry.id)
    expect(!t.ok && t.error.code).toBe('SOURCE_MISSING')
  })

  it('投影行动作矩阵：挪动/跳过被拒，改标题被拒（locked），备注可编辑', () => {
    const todo = makeSourceTodo('矩阵测试')
    const entry = addProjection(THURSDAY, todo)

    const mv = moveEntry(entry.id, FRIDAY)
    expect(!mv.ok && mv.error.code).toBe('INVALID_ACTION')
    const sk = skipEntry(entry.id)
    expect(!sk.ok && sk.error.code).toBe('INVALID_ACTION')
    const rt = updateEntry(entry.id, { title: '改名' })
    expect(!rt.ok && rt.error.code).toBe('LOCKED_ENTRY')
    const rn = updateEntry(entry.id, { note: '私有备注' })
    expect(rn.ok).toBe(true)
    expect((rn.ok && rn.data.note) || null).toBe('私有备注')
  })

  it('project 行不顺延滚入后日（locked 行只留原日）', () => {
    const todo = makeSourceTodo('昨天的事')
    addProjection(THURSDAY, todo)
    const fridayBoard = getDayBoard(FRIDAY)
    expect(fridayBoard.entries.find(e => e.source === 'project')).toBeUndefined()
  })

  it('F1 回归：调用方传 locked:false 也被服务端硬锁（不可绕过锁定语义）', () => {
    const todo = makeSourceTodo('硬锁测试')
    const r = addEntry({ date: THURSDAY, title: todo.content, source: 'project', projectId: todo.id, locked: false })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.data.locked).toBe(true)
    const rt = updateEntry(r.data.id, { title: '绕过改名' })
    expect(!rt.ok && rt.error.code).toBe('LOCKED_ENTRY')
  })
})

describe('阶段4 · 提醒投影链路', () => {
  beforeEach(resetDb)

  it('周日启动种入：提醒 todo + flow 投影同源生成；重复种入幂等', () => {
    ensurePeriodicReminders(SUNDAY)
    const old = projectTaskRepo.findByDate(SUNDAY)
    expect(old.length).toBe(1)
    expect(old[0].content).toBe(weeklyReminderContent(SUNDAY))

    const rows = activeReminderRows(SUNDAY)
    expect(rows.length).toBe(1)
    expect(rows[0].locked).toBe(true)
    expect(rows[0].reminderKey).toBe('weekly')
    expect(rows[0].title).toBe(weeklyReminderContent(SUNDAY))

    ensurePeriodicReminders(SUNDAY) // 幂等：不重复插
    expect(activeReminderRows(SUNDAY).length).toBe(1)
    expect(projectTaskRepo.findByDate(SUNDAY).length).toBe(1)
  })

  it('月末种入 monthly；非周日/月末不种入', () => {
    ensurePeriodicReminders(MONTH_END)
    const rows = activeReminderRows(MONTH_END)
    expect(rows.length).toBe(1)
    expect(rows[0].reminderKey).toBe('monthly')

    ensurePeriodicReminders(THURSDAY)
    expect(activeReminderRows(THURSDAY).length).toBe(0)
  })

  it('移出今日后重复种入不再拉回（尊重用户移出意图）', () => {
    ensurePeriodicReminders(SUNDAY)
    const row = activeReminderRows(SUNDAY)[0]
    expect(removeEntry(row.id).ok).toBe(true)
    ensurePeriodicReminders(SUNDAY)
    expect(activeReminderRows(SUNDAY).length).toBe(0)
    // 墓碑保留（listByDate 只回 active；墓碑经 helper 可查）
    expect(flowDayRepo.findTombstoneBySourceRef(SUNDAY, 'reminder', { reminderKey: 'weekly' })).toBeDefined()
  })

  it('提醒行勾选回写提醒源 todo；board done 跟随源；来源跳转 /flow/week', () => {
    ensurePeriodicReminders(SUNDAY)
    const row = activeReminderRows(SUNDAY)[0]
    const be = getDayBoard(SUNDAY).entries.find(e => e.id === row.id)
    expect(be!.sourceHref).toBe('/flow/week')
    expect(be!.done).toBe(false)

    const t = toggleCheckEntry(row.id)
    expect(t.ok && t.data.done).toBe(true)
    expect(projectTaskRepo.findByDate(SUNDAY)[0].status).toBe('done')
    expect(getDayBoard(SUNDAY).entries.find(e => e.id === row.id)!.done).toBe(true)
  })

  it('提醒源 todo 被删 → 投影降级 done=false，勾选报 SOURCE_MISSING', () => {
    ensurePeriodicReminders(SUNDAY)
    const row = activeReminderRows(SUNDAY)[0]
    projectTaskRepo.softDelete(projectTaskRepo.findByDate(SUNDAY)[0].id)

    const be = getDayBoard(SUNDAY).entries.find(e => e.id === row.id)
    expect(be!.done).toBe(false)
    const t = toggleCheckEntry(row.id)
    expect(!t.ok && t.error.code).toBe('SOURCE_MISSING')
  })
})

describe('阶段4 · 今日 board 四渠道同显（同实体双视图）', () => {
  beforeEach(resetDb)

  it('manual / project / reminder / rail 同日共现于同一 dayBoard', () => {
    const todo = makeSourceTodo('项目渠道')
    addProjection(SUNDAY, todo)
    addEntry({ date: SUNDAY, title: '手动渠道', source: 'manual' })

    const inst = createTempInstance({ weekStart: MONDAY, title: '周任务渠道', kind: 'once' })
    if (!inst.ok) throw new Error(inst.error.message)
    addEntry({ date: SUNDAY, title: '周任务渠道', source: 'rail', weekInstanceId: inst.data.id })

    ensurePeriodicReminders(SUNDAY)

    const board = getDayBoard(SUNDAY)
    const sources = new Set(board.entries.map(e => e.source))
    expect(sources.has('manual')).toBe(true)
    expect(sources.has('project')).toBe(true)
    expect(sources.has('reminder')).toBe(true)
    expect(sources.has('rail')).toBe(true)
  })

  it('唯一索引兜底：同源同日第二个 active 行无法落库（UNIQUE 约束）', () => {
    const todo = makeSourceTodo('索引兜底')
    addProjection(THURSDAY, todo)
    // 绕过 service 直接写第二行 → 撞部分唯一索引
    const now = new Date().toISOString()
    expect(() => getDb().prepare(`
      INSERT INTO flow_day_entries (date, title, source, locked, weekInstanceId, projectId, reminderKey, templateId, note, skippedAt, isDeleted, deletedAt, createdAt, updatedAt)
      VALUES (?, ?, 'project', 1, NULL, ?, NULL, NULL, NULL, NULL, 0, NULL, ?, ?)
    `).run(THURSDAY, '重复行', todo.id, now, now)).toThrow()
  })
})
