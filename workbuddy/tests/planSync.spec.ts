import { describe, it, expect, beforeEach, vi } from 'vitest'
import { randomUUID } from 'node:crypto'
import { runMigrations } from '../src/main/db/migrate'
import { planRepo } from '../src/main/db/repositories/planRepo'
import { todoRepo } from '../src/main/db/repositories/todoRepo'
import { taskRepo } from '../src/main/db/repositories/taskRepo'
import { projectRepo } from '../src/main/db/repositories/projectRepo'
import { getDb } from '../src/main/db/connection'
import { getWeekRange } from '../src/shared/period'
import { parseTasksWithState, collectChildRefs } from '../src/main/services/planParser'

// F3.2-1 方案B 回归测试：in-memory SQLite 跑真实 repo SQL。
// vi.mock connection 模块（hoisting 约束：工厂内 require）→ runMigrations() 构建
// 完整 schema（0001-0004）→ 真实 repo 针对 in-memory DB 操作。
// 用 node:sqlite（node 22 内置）而非 better-sqlite3：后者本机 ABI 为 Electron 130，
// 与 node CLI (127) 不兼容；DatabaseSync 补齐 better-sqlite3 的 pragma/transaction API。
vi.mock('../src/main/db/connection', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { DatabaseSync } = require('node:sqlite')
  const db = new DatabaseSync(':memory:')
  db.pragma = (sql: string) => db.prepare(sql.startsWith('PRAGMA') ? sql : `PRAGMA ${sql}`).all()
  db.transaction = (fn: () => void) => () => fn() // better-sqlite3 语义：返回可调用事务函数

  // 对齐 better-sqlite3 的宽松绑定：named 参数仅传 SQL 中出现的 @param 字段
  // （node:sqlite 对多余参数严格报错，真实 better-sqlite3 静默忽略）；
  // 位置参数数组 spread 展开（node:sqlite 不自动展开数组）。
  const rawPrepare = db.prepare.bind(db)
  db.prepare = (sql: string) => {
    const stmt = rawPrepare(sql)
    const names = [...sql.matchAll(/@(\w+)/g)].map(m => m[1])
    const bindNamed = (a: unknown): unknown => {
      if (!names.length || typeof a !== 'object' || a === null) return a
      const out: Record<string, unknown> = {}
      for (const n of names) out[n] = (a as Record<string, unknown>)[n]
      return out
    }
    const bindArgs = (...args: unknown[]): unknown[] => {
      // 单对象参数 → named 过滤（宽松对齐 better-sqlite3）；数组/多位置参数原样 spread
      if (args.length === 1 && typeof args[0] === 'object' && args[0] !== null && !Array.isArray(args[0])) {
        return [bindNamed(args[0])]
      }
      return args
    }
    const origGet = stmt.get.bind(stmt)
    const origAll = stmt.all.bind(stmt)
    const origRun = stmt.run.bind(stmt)
    stmt.get = (...args: unknown[]) => origGet(...bindArgs(...args))
    stmt.all = (...args: unknown[]) => origAll(...bindArgs(...args))
    stmt.run = (...args: unknown[]) => origRun(...bindArgs(...args))
    return stmt
  }
  return { getDb: () => db }
})

function makePlan(content: string, date = '2026-08-09'): { id: string } {
  return planRepo.create({
    id: randomUUID(),
    date,
    type: 'daily_plan',
    content,
    generatedTodoIds: [],
    templateId: null,
  })
}

function findTodo(content: string, planDate = '2026-08-09') {
  return todoRepo.findByPlanDate(planDate).find(t => t.content === content)
}

describe('planRepo.syncPlanTodos F3.2-1 方案B', () => {
  beforeEach(() => {
    const db = getDb()
    // 每测干净库：全量 drop 后重建（IF EXISTS 容错；0001-0003 建表用 IF NOT EXISTS）
    db.exec(`
      DROP TABLE IF EXISTS __schema_migrations;
      DROP TABLE IF EXISTS tasks;
      DROP TABLE IF EXISTS todos;
      DROP TABLE IF EXISTS plans;
      DROP TABLE IF EXISTS projects;
      DROP TABLE IF EXISTS reviews;
      DROP TABLE IF EXISTS settings;
      DROP TABLE IF EXISTS templates;
      DROP TABLE IF EXISTS news_items;
    `)
    runMigrations()
  })

  it('① 删除 open 任务行 → orphan 软删，今日列表消失', () => {
    const plan = makePlan('- [ ] 任务A\n- [ ] 任务B')
    const r1 = planRepo.syncPlanTodos(plan.id)
    expect(r1.generatedCount).toBe(2)
    // F3.2-2：新建 todo 写入 sourcePlanId
    const a = findTodo('任务A')
    expect(a?.sourcePlanId).toBe(plan.id)

    // 用户删掉任务B行，再保存
    planRepo.update(plan.id, { content: '- [ ] 任务A' })
    const r = planRepo.syncPlanTodos(plan.id)
    expect(r.removedOpenCount).toBe(1)
    expect(r.keptDoneCount).toBe(0)
    expect(r.orphanTodoIds.length).toBe(1)
    const orphan = todoRepo.findById(r.orphanTodoIds[0])
    expect(orphan?.content).toBe('任务B')
    expect(orphan?.isDeleted).toBe(1)
    expect(findTodo('任务B')).toBeUndefined() // 今日列表不再含 B
    expect(findTodo('任务A')).toBeDefined()
  })

  it('② 删除 done 任务行 → 保留为历史（keptDoneCount=1），未软删', () => {
    const plan = makePlan('- [ ] 任务A\n- [ ] 任务B')
    planRepo.syncPlanTodos(plan.id)
    const b = findTodo('任务B')
    expect(b).toBeDefined()
    todoRepo.toggleDone(b!.id)

    planRepo.update(plan.id, { content: '- [ ] 任务A' })
    const r = planRepo.syncPlanTodos(plan.id)
    expect(r.removedOpenCount).toBe(0)
    expect(r.keptDoneCount).toBe(1)
    const kept = todoRepo.findById(b!.id)
    expect(kept?.isDeleted).toBe(0)
    expect(kept?.status).toBe('done')
    // 第二轮实测·问题②：done orphan 保留 → 标 sourceInvalid（labelTodoSource → 来源已删）
    expect(kept?.sourceInvalid).toBe(1)
  })

  it('③ 删 done 后重新加回同文本行 → 复用保留完成态（不新建）', () => {
    const plan = makePlan('- [ ] 任务A\n- [ ] 任务B')
    planRepo.syncPlanTodos(plan.id)
    const b = findTodo('任务B')
    todoRepo.toggleDone(b!.id)

    planRepo.update(plan.id, { content: '- [ ] 任务A' })
    let r = planRepo.syncPlanTodos(plan.id)
    expect(r.keptDoneCount).toBe(1)

    // 任务B 行重新出现 → 复用池含该 done todo → 复用，保留完成态
    planRepo.update(plan.id, { content: '- [ ] 任务A\n- [ ] 任务B' })
    r = planRepo.syncPlanTodos(plan.id)
    expect(r.generatedCount).toBe(0)
    const reuse = todoRepo.findById(b!.id)
    expect(reuse?.isDeleted).toBe(0)
    expect(reuse?.status).toBe('done')
    // 第二轮实测·问题②：同文本行重新加回 → 复用并清失效标志
    expect(reuse?.sourceInvalid).toBe(0)
  })

  it('④ 删 open（已软删）后加回 → 新建 todo=status todo（不复用软删记录）', () => {
    const plan = makePlan('- [ ] 任务A\n- [ ] 任务B')
    planRepo.syncPlanTodos(plan.id)
    const b = findTodo('任务B')
    expect(b).toBeDefined()

    planRepo.update(plan.id, { content: '- [ ] 任务A' })
    let r = planRepo.syncPlanTodos(plan.id)
    expect(r.removedOpenCount).toBe(1)
    expect(todoRepo.findById(b!.id)?.isDeleted).toBe(1)

    planRepo.update(plan.id, { content: '- [ ] 任务A\n- [ ] 任务B' })
    r = planRepo.syncPlanTodos(plan.id)
    expect(r.generatedCount).toBe(1)
    const created = findTodo('任务B')
    expect(created?.id).not.toBe(b!.id) // 新 id，非软删残留
    expect(created?.status).toBe('todo')
    expect(created?.sourcePlanId).toBe(plan.id) // F3.2-2
  })
})

// ── v0.2修复计划·参照完整性（L2 半规范化）──
describe('plan:listTasksByPeriod scheduledInPeriod 第二轮实测·问题① 全期隐藏', () => {
  // 复刻 plans.ipc PLANS_LIST_TASKS_BY_PERIOD handler 核心扫描逻辑（in-memory DB 直跑）
  beforeEach(() => {
    const db = getDb()
    db.exec(`
      DROP TABLE IF EXISTS __schema_migrations;
      DROP TABLE IF EXISTS tasks;
      DROP TABLE IF EXISTS todos;
      DROP TABLE IF EXISTS plans;
      DROP TABLE IF EXISTS projects;
      DROP TABLE IF EXISTS reviews;
      DROP TABLE IF EXISTS settings;
      DROP TABLE IF EXISTS templates;
      DROP TABLE IF EXISTS news_items;
    `)
    runMigrations()
  })

  function weeklyWithTask(date: string, content: string) {
    const p = planRepo.create({
      id: randomUUID(),
      date,
      type: 'weekly_plan',
      content,
      generatedTodoIds: [],
      templateId: null,
    })
    planRepo.syncPlanTodos(p.id) // §3.3 tasks 双向同步：行 tid → tasks 行
    return p
  }

  function scheduledTasks(weeklyContent: string, weekStart: string) {
    const [from, to] = getWeekRange(weekStart)
    const children = planRepo.findAll({ type: 'daily_plan', from, to })
    const refs = collectChildRefs(children.map(c => c.content ?? ''))
    return parseTasksWithState(weeklyContent).map(p => ({
      text: p.text,
      tid: p.tid,
      scheduledInPeriod: p.tid ? refs.has(p.tid) : false,
    }))
  }

  it('本周某天日计划有 parent:{tid} 行 → scheduledInPeriod=true（全周隐藏）', () => {
    const weekly = weeklyWithTask('2026-08-10', '- [ ] 做周报 <!-- tid:abc123 -->')
    planRepo.create({
      id: randomUUID(),
      date: '2026-08-11',
      type: 'daily_plan',
      content: '- [ ] 做周报 <!-- tid:c41d1 parent:abc123 -->',
      generatedTodoIds: [],
      templateId: null,
    })
    const tasks = scheduledTasks(weekly.content ?? '', '2026-08-10')
    expect(tasks[0]?.scheduledInPeriod).toBe(true)
  })

  it('子行改名 → parent tid 不变，仍隐藏（改名不失效）', () => {
    const weekly = weeklyWithTask('2026-08-10', '- [ ] 做周报 <!-- tid:abc123 -->')
    const daily = planRepo.create({
      id: randomUUID(),
      date: '2026-08-12',
      type: 'daily_plan',
      content: '- [ ] 做本周周报 <!-- tid:c41d1 parent:abc123 -->', // 改名，parent tid 保留
      generatedTodoIds: [],
      templateId: null,
    })
    expect(scheduledTasks(weekly.content ?? '', '2026-08-10')[0]?.scheduledInPeriod).toBe(true)
    // 删除子行 → 重现（scheduled=false）
    planRepo.update(daily.id, { content: '' })
    expect(scheduledTasks(weekly.content ?? '', '2026-08-10')[0]?.scheduledInPeriod).toBe(false)
  })

  it('跨周隔离：上周的 parent 引用不影响本周', () => {
    weeklyWithTask('2026-08-10', '- [ ] 做周报 <!-- tid:abc123 -->')
    planRepo.create({
      id: randomUUID(),
      date: '2026-08-07', // 上周五
      type: 'daily_plan',
      content: '- [ ] 做周报 <!-- tid:c41d1 parent:abc123 -->',
      generatedTodoIds: [],
      templateId: null,
    })
    expect(scheduledTasks('- [ ] 做周报 <!-- tid:abc123 -->', '2026-08-10')[0]?.scheduledInPeriod).toBe(false)
  })
})

describe('planRepo.syncPlanTodos 第三轮实测·问题乙 按 tid 复用（改名保完成态）', () => {
  beforeEach(() => {
    const db = getDb()
    db.exec(`
      DROP TABLE IF EXISTS __schema_migrations;
      DROP TABLE IF EXISTS tasks;
      DROP TABLE IF EXISTS todos;
      DROP TABLE IF EXISTS plans;
      DROP TABLE IF EXISTS projects;
      DROP TABLE IF EXISTS reviews;
      DROP TABLE IF EXISTS settings;
      DROP TABLE IF EXISTS templates;
      DROP TABLE IF EXISTS news_items;
    `)
    runMigrations()
  })

  it('改名 done 任务行 → 单一 todo 复用，内容更新 + 完成态保留', () => {
    const plan = makePlan('- [ ] 任务A <!-- tid:abc123 -->\n- [ ] 任务B <!-- tid:def456 -->')
    planRepo.syncPlanTodos(plan.id)
    const b = todoRepo.findByPlanDate('2026-08-09').find(t => t.content === '任务B')
    expect(b).toBeDefined()
    expect(b?.sourceTaskTid).toBe('def456')
    todoRepo.toggleDone(b!.id)

    // 改名 B 行（tid 不变）
    planRepo.update(plan.id, { content: '- [ ] 任务A <!-- tid:abc123 -->\n- [ ] 任务B改名 <!-- tid:def456 -->' })
    const r = planRepo.syncPlanTodos(plan.id)
    expect(r.generatedCount).toBe(0)
    expect(r.orphanTodoIds.length).toBe(0) // 无 orphan → 不产生第二条
    const reused = todoRepo.findById(b!.id)
    expect(reused?.content).toBe('任务B改名')
    expect(reused?.status).toBe('done') // 完成态保留
    expect(reused?.isDeleted).toBe(0)
    const all = todoRepo.findByPlanDate('2026-08-09')
    expect(all.length).toBe(2) // 仅 A + 改名后的 B，无重复
  })

  it('改名 open 任务行 → 单一 todo 复用（不新建）', () => {
    const plan = makePlan('- [ ] 任务A <!-- tid:abc123 -->\n- [ ] 任务B <!-- tid:def456 -->')
    planRepo.syncPlanTodos(plan.id)
    const b = todoRepo.findByPlanDate('2026-08-09').find(t => t.content === '任务B')

    planRepo.update(plan.id, { content: '- [ ] 任务A <!-- tid:abc123 -->\n- [ ] 任务B改名 <!-- tid:def456 -->' })
    const r = planRepo.syncPlanTodos(plan.id)
    expect(r.generatedCount).toBe(0)
    const reused = todoRepo.findById(b!.id)
    expect(reused?.content).toBe('任务B改名')
    expect(reused?.status).toBe('todo')
    expect(todoRepo.findByPlanDate('2026-08-09').length).toBe(2)
  })

  it('无 tid 行 → 文本 fallback 复用（存量路径不破）', () => {
    const plan = makePlan('- [ ] 任务A\n- [ ] 任务B')
    planRepo.syncPlanTodos(plan.id)
    const b = todoRepo.findByPlanDate('2026-08-09').find(t => t.content === '任务B')
    todoRepo.toggleDone(b!.id)

    planRepo.update(plan.id, { content: '- [ ] 任务A\n- [ ] 任务B改名' })
    const r = planRepo.syncPlanTodos(plan.id)
    // 无 tid：文本不匹配 → 旧 done orphan 保留失效 + 新 todo 新建（存量无 tid 边界，行为同修复前）
    expect(r.keptDoneCount).toBe(1)
    expect(r.generatedCount).toBe(1)
  })
})

describe('planRepo.syncPlanTodos 第四轮实测·问题2b consumed 回退', () => {
  beforeEach(() => {
    const db = getDb()
    db.exec(`
      DROP TABLE IF EXISTS __schema_migrations;
      DROP TABLE IF EXISTS tasks;
      DROP TABLE IF EXISTS todos;
      DROP TABLE IF EXISTS plans;
      DROP TABLE IF EXISTS projects;
      DROP TABLE IF EXISTS reviews;
      DROP TABLE IF EXISTS settings;
      DROP TABLE IF EXISTS templates;
      DROP TABLE IF EXISTS news_items;
    `)
    runMigrations()
  })

  function makeWeekly() {
    const p = planRepo.create({
      id: randomUUID(),
      date: '2026-08-10',
      type: 'weekly_plan',
      content: '- [x] 做周报 <!-- tid:aaa111bbb222 -->', // 已被完成过（consumed）
      generatedTodoIds: [],
      templateId: null,
    })
    planRepo.syncPlanTodos(p.id)
    return p
  }

  function makeDaily(parentTid: string) {
    return planRepo.create({
      id: randomUUID(),
      date: '2026-08-11',
      type: 'daily_plan',
      content: `- [ ] 做周报 <!-- tid:c41d1 parent:${parentTid} -->`,
      generatedTodoIds: [],
      templateId: null,
    })
  }

  it('删 done 子任务行 → 无其它有效 done → 周任务 consumed 回退 [x]→[ ]', () => {
    const weekly = makeWeekly()
    const daily = makeDaily('aaa111bbb222')
    planRepo.syncPlanTodos(daily.id)
    const todo = todoRepo.findByPlanDate('2026-08-11')[0]
    todoRepo.toggleDone(todo.id) // 完成

    planRepo.update(daily.id, { content: '' }) // 删子任务行
    const r = planRepo.syncPlanTodos(daily.id)
    expect(r.keptDoneCount).toBe(1)
    const wp = planRepo.findById(weekly.id)
    expect(wp?.content).toContain('[ ] 做周报') // 回退
    expect(taskRepo.findByTid('aaa111bbb222')?.consumed).toBe(false)
  })

  it('另一日仍有有效 done → 不回退（多日完成同名）', () => {
    const weekly = makeWeekly()
    const d1 = makeDaily('aaa111bbb222')
    const d2 = planRepo.create({
      id: randomUUID(),
      date: '2026-08-12',
      type: 'daily_plan',
      content: '- [ ] 做周报 <!-- tid:c41d2 parent:aaa111bbb222 -->',
      generatedTodoIds: [],
      templateId: null,
    })
    planRepo.syncPlanTodos(d1.id)
    planRepo.syncPlanTodos(d2.id)
    for (const t of todoRepo.findByPlanDate('2026-08-11')) todoRepo.toggleDone(t.id)
    for (const t of todoRepo.findByPlanDate('2026-08-12')) todoRepo.toggleDone(t.id)

    planRepo.update(d1.id, { content: '' }) // 删一日子任务行，另一日仍有 done
    planRepo.syncPlanTodos(d1.id)
    const wp = planRepo.findById(weekly.id)
    expect(wp?.content).toContain('[x] 做周报') // 不回退
    expect(taskRepo.findByTid('aaa111bbb222')?.consumed).toBe(true)
  })
})

describe('planRepo.syncPlanTodos v0.2修复计划·参照完整性', () => {
  beforeEach(() => {
    const db = getDb()
    db.exec(`
      DROP TABLE IF EXISTS __schema_migrations;
      DROP TABLE IF EXISTS tasks;
      DROP TABLE IF EXISTS todos;
      DROP TABLE IF EXISTS plans;
      DROP TABLE IF EXISTS projects;
      DROP TABLE IF EXISTS reviews;
      DROP TABLE IF EXISTS settings;
      DROP TABLE IF EXISTS templates;
      DROP TABLE IF EXISTS news_items;
    `)
    runMigrations()
  })

  it('⑤ §3.3 改名存活：任务行改名 → tasks 行按 tid 更新，链不断', () => {
    const plan = makePlan('- [ ] 任务A <!-- tid:aaa111bbb222 -->')
    planRepo.syncPlanTodos(plan.id)
    expect(taskRepo.findByTid('aaa111bbb222')?.content).toBe('任务A')

    planRepo.update(plan.id, { content: '- [ ] 任务A改名 <!-- tid:aaa111bbb222 -->' })
    const r = planRepo.syncPlanTodos(plan.id)
    const t = taskRepo.findByTid('aaa111bbb222')
    expect(t?.content).toBe('任务A改名')
    expect(t?.isDeleted).toBe(false) // 未软删：改名 ≠ 删除
    expect(t?.tid).toBe('aaa111bbb222')
    // todo 侧：第三轮实测·问题乙语义变更 —— 改名按 tid 复用同一 todo（不再 orphan+新建）
    expect(r.removedOpenCount).toBe(0)
    expect(r.generatedCount).toBe(0)
    const todos = todoRepo.findByPlanDate('2026-08-09')
    expect(todos.length).toBe(1)
    expect(todos[0]?.content).toBe('任务A改名')
  })

  it('⑥ §3.6 删上级任务行 → tasks 软删 + 下游 open todo 级联软删 / done 保留失效', () => {
    // 父行 aaa111bbb222 + 子行（parent 指向父 tid）；todo 生成时按 line.parentTid 写链
    const plan = makePlan(
      '- [ ] 任务A <!-- tid:aaa111bbb222 -->\n- [ ] 任务A子 <!-- tid:bbb222cccddd parent:aaa111bbb222 -->',
    )
    planRepo.syncPlanTodos(plan.id)
    const child = findTodo('任务A子')
    expect(child?.parentTaskRef).toContain('aaa111bbb222') // 新建 todo 带链
    // 再造一个 done 下游（多日生成场景），指向同一任务
    const doneId = randomUUID()
    todoRepo.create({
      id: doneId, content: '任务A历史', status: 'done', planDate: '2026-08-08',
      projectId: null, sourcePlanId: plan.id,
      parentTaskRef: JSON.stringify({ parentPlanId: plan.id, parentTaskId: 'aaa111bbb222' }),
      isDeleted: false, deletedAt: null, completedAt: '2026-08-08T00:00:00.000Z',
    })

    planRepo.update(plan.id, { content: '' }) // 任务行删除
    const r = planRepo.syncPlanTodos(plan.id)
    expect(taskRepo.findByTid('aaa111bbb222')?.isDeleted).toBe(true) // task 软删
    expect(r.cascadeRemovedOpenCount).toBe(1) // open 下游 → 软删
    expect(r.cascadeInvalidatedDoneCount).toBe(1) // done 下游 → 保留（来源失效标注）
    expect(todoRepo.findById(child!.id)?.isDeleted).toBe(1)
    expect(todoRepo.findById(doneId)?.isDeleted).toBe(0)
    expect(todoRepo.findById(doneId)?.status).toBe('done')
  })

  it('⑦ §3.6 周计划删任务行 → 下游 daily todo 级联分流（修④ 删除不传播）', () => {
    const wplan = planRepo.create({
      id: randomUUID(), date: '2026-08-09', type: 'weekly_plan',
      content: '- [ ] 周任务 <!-- tid:ccc333ddd444 -->', generatedTodoIds: [], templateId: null,
    })
    const dailyId = randomUUID()
    todoRepo.create({
      id: dailyId, content: '周任务', status: 'todo', planDate: '2026-08-10',
      projectId: null, sourcePlanId: null,
      parentTaskRef: JSON.stringify({ parentPlanId: wplan.id, parentTaskId: 'ccc333ddd444' }),
      isDeleted: false, deletedAt: null, completedAt: null,
    })

    // 首次 sync：非 daily 不生成 todo，但 tasks 双向 sync 执行（upsert）
    let r = planRepo.syncPlanTodos(wplan.id)
    expect(r.generatedCount).toBe(0)
    expect(taskRepo.findByTid('ccc333ddd444')?.isDeleted).toBe(false)

    // 周计划删任务行 → 级联到下游 daily todo
    planRepo.update(wplan.id, { content: '' })
    r = planRepo.syncPlanTodos(wplan.id)
    expect(r.cascadeRemovedOpenCount).toBe(1)
    expect(todoRepo.findById(dailyId)?.isDeleted).toBe(1)
  })

  it('⑧ §3.7 项目 todo 复用：同 content + projectId 非空 + 未安排 → 复用同 id（不新建）', () => {
    const pid = randomUUID()
    projectRepo.create({ id: pid, name: '测试项目', status: 'active', description: null, color: null, isDeleted: false, deletedAt: null })
    todoRepo.create({
      id: 'a1b2c3d4e5f678', content: '写周报', status: 'todo', planDate: '2026-08-01',
      projectId: pid, sourcePlanId: null, parentTaskRef: null,
      isDeleted: false, deletedAt: null, completedAt: null,
    })
    // 判据按规格原文（content/projectId/未安排），行不带 parent 字段
    const plan = makePlan('- [ ] 写周报 <!-- tid:ddd555eee666 -->')
    const r = planRepo.syncPlanTodos(plan.id)
    expect(r.generatedCount).toBe(0) // 复用，不新建
    const reused = todoRepo.findById('a1b2c3d4e5f678')
    expect(reused?.planDate).toBe('2026-08-09') // 提到今日
    expect(reused?.projectId).toBe(pid) // 保留项目归属
    expect(reused?.parentTaskRef).toBeNull() // 偏差：不写 ref（FK/规则0 冲突，见 §19）
  })

  it('⑨ 审查MED-2：§3.7 复用的项目 todo 删任务行 → 回退未安排（planDate=null），不软删、不进池', () => {
    const pid = randomUUID()
    projectRepo.create({ id: pid, name: '测试项目', status: 'active', description: null, color: null, isDeleted: false, deletedAt: null })
    todoRepo.create({
      id: 'a1b2c3d4e5f678', content: '写周报', status: 'todo', planDate: '2026-08-01',
      projectId: pid, sourcePlanId: null, parentTaskRef: null,
      isDeleted: false, deletedAt: null, completedAt: null,
    })
    const plan = makePlan('- [ ] 写周报 <!-- tid:ddd555eee666 -->')
    let r = planRepo.syncPlanTodos(plan.id)
    expect(r.generatedCount).toBe(0) // 复用
    expect(planRepo.findById(plan.id)?.generatedTodoIds).toContain('a1b2c3d4e5f678')

    // 用户删任务行 → 复用 todo 回退「未安排」，保留在项目（原 MED-2 行为=软删丢失项目任务）
    planRepo.update(plan.id, { content: '' })
    r = planRepo.syncPlanTodos(plan.id)
    const reverted = todoRepo.findById('a1b2c3d4e5f678')
    expect(reverted?.planDate).toBeNull() // 回退未安排
    expect(reverted?.isDeleted).toBe(0) // 不软删
    expect(reverted?.projectId).toBe(pid) // 保留项目归属
    expect(r.removedOpenCount).toBe(0) // 不算方案B orphan 移除
    expect(planRepo.findById(plan.id)?.generatedTodoIds).not.toContain('a1b2c3d4e5f678') // 离开池

    // 同文本行加回 → findByContentWithProject 重新复用（cycle 完整）
    planRepo.update(plan.id, { content: '- [ ] 写周报 <!-- tid:ddd555eee666 -->' })
    r = planRepo.syncPlanTodos(plan.id)
    expect(r.generatedCount).toBe(0)
    expect(todoRepo.findById('a1b2c3d4e5f678')?.planDate).toBe('2026-08-09')
  })
})

describe('taskRepo.findTaskByText P1-② 幂等复用源', () => {
  it('纯文本 content 命中（P2 修复后新行）', () => {
    const plan = makePlan('- [ ] 写周报')
    taskRepo.upsert({ tid: 'abc123', planId: plan.id, content: '写周报', parentTaskId: null, consumed: false, sortOrder: 0 })
    expect(taskRepo.findTaskByText(plan.id, '写周报')?.tid).toBe('abc123')
  })

  it('历史存量 `- [ ] text` 标记形式 content 兼容命中', () => {
    const plan = makePlan('- [ ] 写周报')
    taskRepo.upsert({ tid: 'def456', planId: plan.id, content: '- [ ] 写周报', parentTaskId: null, consumed: false, sortOrder: 0 })
    expect(taskRepo.findTaskByText(plan.id, '写周报')?.tid).toBe('def456')
  })

  it('已软删行不复用（isDeleted=0 限定）；跨 plan 不串扰', () => {
    const p1 = makePlan('- [ ] 写周报')
    const p2 = makePlan('- [ ] 写周报')
    taskRepo.upsert({ tid: 'aaa111', planId: p1.id, content: '写周报', parentTaskId: null, consumed: false, sortOrder: 0 })
    taskRepo.upsert({ tid: 'bbb222', planId: p2.id, content: '写周报', parentTaskId: null, consumed: false, sortOrder: 0 })
    taskRepo.softDeleteByTid('bbb222')
    expect(taskRepo.findTaskByText(p1.id, '写周报')?.tid).toBe('aaa111')
    expect(taskRepo.findTaskByText(p2.id, '写周报')).toBeUndefined()
  })
})
