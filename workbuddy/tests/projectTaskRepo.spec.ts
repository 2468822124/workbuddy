import { describe, test, expect, beforeEach } from 'vitest'
import { mockConnectionDb, resetDb, MONDAY, NEXT_MONDAY } from './flowTestDb'
import { projectTaskRepo, reminderIdFor, expectedReminderContent } from '../src/main/db/repositories/projectTaskRepo'
import { getDb } from '../src/main/db/connection'

mockConnectionDb()

/** 直接插入 projects 行（避免依赖 projectRepo，测试旧表无关）。 */
function insertProject(id: string, name = 'P'): void {
  const now = new Date().toISOString()
  getDb().prepare(`
    INSERT INTO projects (id, name, status, description, color, isDeleted, deletedAt, createdAt, updatedAt)
    VALUES (?, ?, 'active', NULL, NULL, 0, NULL, ?, ?)
  `).run(id, name, now, now)
}

/** 直接插入 todos 行（含旧规划字段；模拟阶段6前存量）。 */
function insertRawTodo(row: Record<string, unknown>): void {
  getDb().prepare(`
    INSERT INTO todos (id, content, status, planDate, projectId, sourcePlanId, parentTaskRef, sourceInvalid, sourceTaskTid, isDeleted, deletedAt, completedAt, createdAt, updatedAt)
    VALUES (@id, @content, @status, @planDate, @projectId, @sourcePlanId, @parentTaskRef, @sourceInvalid, @sourceTaskTid, @isDeleted, @deletedAt, @completedAt, @createdAt, @updatedAt)
  `).run(row)
}

const now = () => new Date().toISOString()

beforeEach(() => {
  resetDb()
})

describe('projectTaskRepo 项目 CRUD', () => {
  test('createProjectTask 全字段映射：trim、legacy 字段置空、状态 todo', () => {
    insertProject('p1')
    const t = projectTaskRepo.createProjectTask({
      content: '  写周报  ',
      planDate: MONDAY,
      projectId: 'p1',
    })
    expect(t.id).toBeTruthy()
    expect(t.content).toBe('写周报')
    expect(t.status).toBe('todo')
    expect(t.planDate).toBe(MONDAY)
    expect(t.projectId).toBe('p1')
    expect(t.isDeleted).toBe(false)
    expect(t.deletedAt).toBeNull()
    expect(t.completedAt).toBeNull()
    const raw = getDb().prepare('SELECT * FROM todos WHERE id = ?').get(t.id) as Record<string, unknown>
    expect(raw.sourcePlanId).toBeNull()
    expect(raw.parentTaskRef).toBeNull()
    expect(raw.sourceTaskTid).toBeNull()
    expect(raw.sourceInvalid).toBe(0)
  })

  test('createProjectTask 输入边界：空内容/超200/缺 projectId/非法日期 抛错', () => {
    insertProject('p1')
    expect(() => projectTaskRepo.createProjectTask({ content: '  ', planDate: null, projectId: 'p1' })).toThrow()
    expect(() => projectTaskRepo.createProjectTask({ content: 'x'.repeat(201), planDate: null, projectId: 'p1' })).toThrow()
    expect(() => projectTaskRepo.createProjectTask({ content: 'ok', planDate: null, projectId: '  ' })).toThrow()
    expect(() => projectTaskRepo.createProjectTask({ content: 'ok', planDate: '2026-02-31', projectId: 'p1' })).toThrow()
  })

  test('createProjectTask 项目不存在：FK 抛错（源缺失不产生孤儿行）', () => {
    expect(() => projectTaskRepo.createProjectTask({ content: 'x', planDate: null, projectId: 'ghost' })).toThrow()
  })

  test('listByProject 只返回该项目未软删任务，createdAt DESC', async () => {
    insertProject('p1')
    insertProject('p2')
    projectTaskRepo.createProjectTask({ content: 'a', planDate: null, projectId: 'p1' })
    await new Promise(r => setTimeout(r, 3))
    projectTaskRepo.createProjectTask({ content: 'b', planDate: null, projectId: 'p1' })
    projectTaskRepo.createProjectTask({ content: 'other', planDate: null, projectId: 'p2' })
    const list = projectTaskRepo.listByProject('p1')
    expect(list.map(t => t.content)).toEqual(['b', 'a'])
    expect(list.every(t => t.projectId === 'p1')).toBe(true)
  })

  test('updateProjectTask 只允许 content/planDate；status/projectId/isDeleted 不被改动', () => {
    insertProject('p1')
    const t = projectTaskRepo.createProjectTask({ content: 'old', planDate: MONDAY, projectId: 'p1' })
    projectTaskRepo.toggleDone(t.id)
    const updated = projectTaskRepo.updateProjectTask(t.id, { content: 'new', planDate: NEXT_MONDAY })!
    expect(updated.content).toBe('new')
    expect(updated.planDate).toBe(NEXT_MONDAY)
    const raw = getDb().prepare('SELECT * FROM todos WHERE id = ?').get(t.id) as Record<string, unknown>
    expect(raw.status).toBe('done') // 完成态保持，不被 update 复位
    expect(raw.projectId).toBe('p1')
    expect(raw.isDeleted).toBe(0)
  })

  test('updateProjectTask 不存在返回 undefined；空内容抛错', () => {
    expect(projectTaskRepo.updateProjectTask('nope', { content: 'x' })).toBeUndefined()
    insertProject('p1')
    const t = projectTaskRepo.createProjectTask({ content: 'a', planDate: null, projectId: 'p1' })
    expect(() => projectTaskRepo.updateProjectTask(t.id, { content: '  ' })).toThrow()
  })

  test('toggleDone：done 置 completedAt，取消置 null；不存在 undefined', () => {
    insertProject('p1')
    const t = projectTaskRepo.createProjectTask({ content: 'a', planDate: null, projectId: 'p1' })
    const done = projectTaskRepo.toggleDone(t.id)!
    expect(done.status).toBe('done')
    expect(done.completedAt).toBeTruthy()
    const undone = projectTaskRepo.toggleDone(t.id)!
    expect(undone.status).toBe('todo')
    expect(undone.completedAt).toBeNull()
    expect(projectTaskRepo.toggleDone('nope')).toBeUndefined()
  })

  test('softDelete：置 isDeleted，列表/批量读取排除；重复删 false', () => {
    insertProject('p1')
    const t = projectTaskRepo.createProjectTask({ content: 'a', planDate: null, projectId: 'p1' })
    expect(projectTaskRepo.softDelete(t.id)).toBe(true)
    expect(projectTaskRepo.softDelete(t.id)).toBe(false)
    expect(projectTaskRepo.listByProject('p1')).toHaveLength(0)
    expect(projectTaskRepo.findByIds([t.id])).toHaveLength(0)
  })

  test('findByIds 批量查询且空数组短路', () => {
    insertProject('p1')
    const a = projectTaskRepo.createProjectTask({ content: 'a', planDate: null, projectId: 'p1' })
    const b = projectTaskRepo.createProjectTask({ content: 'b', planDate: null, projectId: 'p1' })
    const byId = projectTaskRepo.findByIds([a.id, b.id, 'ghost'])
    expect(byId.map(t => t.id).sort()).toEqual([a.id, b.id].sort())
    expect(projectTaskRepo.findByIds([])).toHaveLength(0)
  })

  test('findByDate 按日期过滤未软删行', () => {
    insertProject('p1')
    projectTaskRepo.createProjectTask({ content: 'a', planDate: MONDAY, projectId: 'p1' })
    projectTaskRepo.createProjectTask({ content: 'b', planDate: NEXT_MONDAY, projectId: 'p1' })
    expect(projectTaskRepo.findByDate(MONDAY).map(t => t.content)).toEqual(['a'])
  })
})

describe('projectTaskRepo 提醒定位与幂等', () => {
  test('expectedReminderContent 与阶段4 文案一致', () => {
    expect(expectedReminderContent('weekly', MONDAY)).toBe('📌 做周统筹 · 第 33 周')
    expect(expectedReminderContent('monthly', '2026-08-31')).toBe('📌 做月指导 · 2026 年 8 月')
  })

  test('findReminderTask 优先确定性 id', () => {
    insertProject('p1') // FK 不涉及；仅保证其它测试语义一致
    projectTaskRepo.ensureReminderTask({ date: MONDAY, key: 'weekly', content: expectedReminderContent('weekly', MONDAY) })
    // 另插一条同日期同内容旧 UUID 行，确定性 id 必须胜出
    insertRawTodo({
      id: 'legacy-uuid-1', content: expectedReminderContent('weekly', MONDAY), status: 'todo',
      planDate: MONDAY, projectId: null, sourcePlanId: null, parentTaskRef: null,
      sourceInvalid: 0, sourceTaskTid: null, isDeleted: 0, deletedAt: null, completedAt: null,
      createdAt: now(), updatedAt: now(),
    })
    const t = projectTaskRepo.findReminderTask(MONDAY, 'weekly')!
    expect(t.id).toBe(reminderIdFor('weekly', MONDAY))
  })

  test('findReminderTask 存量随机 UUID 兜底：精确 date+文案+非项目+非旧规划来源', () => {
    const content = expectedReminderContent('weekly', MONDAY)
    insertRawTodo({
      id: 'legacy-uuid-2', content, status: 'todo', planDate: MONDAY, projectId: null,
      sourcePlanId: null, parentTaskRef: null, sourceInvalid: 0, sourceTaskTid: null,
      isDeleted: 0, deletedAt: null, completedAt: null, createdAt: '2026-08-01T00:00:00.000Z', updatedAt: now(),
    })
    // 项目任务同文案：排除
    insertProject('p1')
    projectTaskRepo.createProjectTask({ content, planDate: MONDAY, projectId: 'p1' })
    // 旧规划来源同文案：排除
    insertRawTodo({
      id: 'legacy-uuid-3', content, status: 'todo', planDate: MONDAY, projectId: null,
      sourcePlanId: 'plan-1', parentTaskRef: null, sourceInvalid: 0, sourceTaskTid: 'tid-1',
      isDeleted: 0, deletedAt: null, completedAt: null, createdAt: '2026-07-01T00:00:00.000Z', updatedAt: now(),
    })
    // 不同日期同文案：排除
    insertRawTodo({
      id: 'legacy-uuid-4', content, status: 'todo', planDate: NEXT_MONDAY, projectId: null,
      sourcePlanId: null, parentTaskRef: null, sourceInvalid: 0, sourceTaskTid: null,
      isDeleted: 0, deletedAt: null, completedAt: null, createdAt: '2026-07-02T00:00:00.000Z', updatedAt: now(),
    })
    const t = projectTaskRepo.findReminderTask(MONDAY, 'weekly')
    expect(t?.id).toBe('legacy-uuid-2')
  })

  test('findReminderTask 非法日期/非法 key 返回 undefined', () => {
    expect(projectTaskRepo.findReminderTask('2026-02-31', 'weekly')).toBeUndefined()
    expect(projectTaskRepo.findReminderTask(MONDAY, 'daily' as 'weekly')).toBeUndefined()
  })

  test('findReminderTask 软删的提醒行不命中', () => {
    const content = expectedReminderContent('weekly', MONDAY)
    insertRawTodo({
      id: 'legacy-uuid-5', content, status: 'todo', planDate: MONDAY, projectId: null,
      sourcePlanId: null, parentTaskRef: null, sourceInvalid: 0, sourceTaskTid: null,
      isDeleted: 1, deletedAt: now(), completedAt: null, createdAt: now(), updatedAt: now(),
    })
    expect(projectTaskRepo.findReminderTask(MONDAY, 'weekly')).toBeUndefined()
  })

  test('ensureReminderTask 新建用确定性 id，重复调用幂等', () => {
    const a = projectTaskRepo.ensureReminderTask({ date: MONDAY, key: 'weekly', content: expectedReminderContent('weekly', MONDAY) })
    const b = projectTaskRepo.ensureReminderTask({ date: MONDAY, key: 'weekly', content: expectedReminderContent('weekly', MONDAY) })
    expect(a.id).toBe(b.id)
    expect(a.id).toBe(reminderIdFor('weekly', MONDAY))
    const rows = getDb().prepare('SELECT * FROM todos').all() as Record<string, unknown>[]
    expect(rows).toHaveLength(1)
  })

  test('ensureReminderTask 存量提醒存在时不回填、不新建（行数不变）', () => {
    const content = expectedReminderContent('monthly', '2026-08-31')
    insertRawTodo({
      id: 'legacy-month-1', content, status: 'todo', planDate: '2026-08-31', projectId: null,
      sourcePlanId: null, parentTaskRef: null, sourceInvalid: 0, sourceTaskTid: null,
      isDeleted: 0, deletedAt: null, completedAt: null, createdAt: now(), updatedAt: now(),
    })
    const t = projectTaskRepo.ensureReminderTask({ date: '2026-08-31', key: 'monthly', content })
    expect(t.id).toBe('legacy-month-1')
    expect(getDb().prepare('SELECT * FROM todos').all()).toHaveLength(1)
  })

  test('ensureReminderTask 非法日期/非法 key 抛错，不落库', () => {
    expect(() => projectTaskRepo.ensureReminderTask({ date: 'bad', key: 'weekly', content: 'x' })).toThrow()
    expect(() => projectTaskRepo.ensureReminderTask({ date: MONDAY, key: 'daily' as 'weekly', content: 'x' })).toThrow()
    expect(getDb().prepare('SELECT * FROM todos').all()).toHaveLength(0)
  })
})
