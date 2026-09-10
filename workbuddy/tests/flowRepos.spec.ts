import { describe, it, expect, beforeEach } from 'vitest'
import { mockConnectionDb, resetDb, MONDAY, TUESDAY } from './flowTestDb'
import { flowFixedRepo } from '../src/main/db/repositories/flowFixedRepo'
import { flowWeekRepo } from '../src/main/db/repositories/flowWeekRepo'
import { flowDayRepo } from '../src/main/db/repositories/flowDayRepo'
import { flowVoucherRepo } from '../src/main/db/repositories/flowVoucherRepo'
import { flowGoalRepo } from '../src/main/db/repositories/flowGoalRepo'
import { flowTemplateRepo } from '../src/main/db/repositories/flowTemplateRepo'
import { flowJournalRepo } from '../src/main/db/repositories/flowJournalRepo'

mockConnectionDb()

function makeDef(overrides: Partial<Parameters<typeof flowFixedRepo.create>[0]> = {}) {
  return flowFixedRepo.create({
    title: '写周报',
    kind: 'once',
    targetCount: 1,
    weekdayMask: 0,
    recurrence: 'WEEKLY',
    note: null,
    ...overrides,
  })
}

describe('flowFixedRepo', () => {
  beforeEach(resetDb)

  it('create/listActive/findById/softDelete 软删过滤', () => {
    const a = makeDef()
    const b = makeDef({ title: '跑步' })
    expect(flowFixedRepo.listActive().map(d => d.id)).toEqual([a.id, b.id])
    expect(flowFixedRepo.findById(a.id)?.title).toBe('写周报')
    expect(flowFixedRepo.findById(a.id)?.isDeleted).toBe(false)
    flowFixedRepo.softDelete(a.id)
    expect(flowFixedRepo.listActive().map(d => d.id)).toEqual([b.id])
    expect(flowFixedRepo.softDelete(a.id)).toBe(false) // 已软删，二次删除无效
  })

  it('update 改名生效且不可变更新', () => {
    const a = makeDef()
    const u = flowFixedRepo.update(a.id, { title: '写月报', weekdayMask: 0b10 })
    expect(u?.title).toBe('写月报')
    expect(u?.weekdayMask).toBe(0b10)
  })
})

describe('flowWeekRepo', () => {
  beforeEach(resetDb)

  it('existsByDef 幂等判重 + listByWeek 排序', () => {
    const def = makeDef()
    expect(flowWeekRepo.existsByDef(MONDAY, def.id)).toBe(false)
    flowWeekRepo.create({ weekStart: MONDAY, origin: 'fixed', fixedDefId: def.id, title: def.title, kind: 'once', targetCount: 1, sortOrder: 0, skippedAt: null, carriedFrom: null })
    expect(flowWeekRepo.existsByDef(MONDAY, def.id)).toBe(true)
    expect(flowWeekRepo.listByWeek(MONDAY)).toHaveLength(1)
  })

  it('syncTitlesFromDef 只同步本周实例', () => {
    const def = makeDef()
    flowWeekRepo.create({ weekStart: MONDAY, origin: 'fixed', fixedDefId: def.id, title: '旧名', kind: 'once', targetCount: 1, sortOrder: 0, skippedAt: null, carriedFrom: null })
    flowWeekRepo.create({ weekStart: '2026-07-27', origin: 'fixed', fixedDefId: def.id, title: '旧名', kind: 'once', targetCount: 1, sortOrder: 0, skippedAt: null, carriedFrom: null })
    const n = flowWeekRepo.syncTitlesFromDef(def.id, MONDAY, '新名')
    expect(n).toBe(1)
    expect(flowWeekRepo.listByWeek(MONDAY)[0].title).toBe('新名')
    expect(flowWeekRepo.listByWeek('2026-07-27')[0].title).toBe('旧名') // 历史周不追溯
  })
})

describe('flowDayRepo', () => {
  beforeEach(resetDb)

  function makeEntry(overrides: Partial<Parameters<typeof flowDayRepo.create>[0]> = {}) {
    return flowDayRepo.create({
      date: MONDAY,
      title: '自由任务',
      source: 'manual',
      locked: false,
      weekInstanceId: null,
      projectId: null,
      reminderKey: null,
      templateId: null,
      note: null,
      skippedAt: null,
      ...overrides,
    })
  }

  it('listDeferredCandidates：排除提醒/锁定/跳过/软删', () => {
    const inst = flowWeekRepo.create({ weekStart: MONDAY, origin: 'temp', fixedDefId: null, title: '做周报', kind: 'once', targetCount: 1, sortOrder: 0, skippedAt: null, carriedFrom: null })
    const open = makeEntry({ title: '顺延我' }) // 昨天开放自由行
    makeEntry({ title: '提醒', source: 'reminder' })
    makeEntry({ title: '锁定', locked: true, weekInstanceId: inst.id })
    const skipped = makeEntry({ title: '跳过', skippedAt: '2026-08-10' })
    const removed = makeEntry({ title: '已删' })
    flowDayRepo.softDelete(removed.id)
    void skipped
    const candidates = flowDayRepo.listDeferredCandidates(TUESDAY)
    expect(candidates.map(e => e.title)).toEqual(['顺延我'])
    expect(open.locked).toBe(false)
  })

  it('softDeleteByInstance 级联软删安排行', () => {
    const inst = flowWeekRepo.create({ weekStart: MONDAY, origin: 'temp', fixedDefId: null, title: '做周报', kind: 'once', targetCount: 1, sortOrder: 0, skippedAt: null, carriedFrom: null })
    flowDayRepo.create({ date: MONDAY, title: 'A', source: 'rail', locked: true, weekInstanceId: inst.id, projectId: null, reminderKey: null, templateId: null, note: null, skippedAt: null })
    flowDayRepo.create({ date: TUESDAY, title: 'B', source: 'rail', locked: true, weekInstanceId: inst.id, projectId: null, reminderKey: null, templateId: null, note: null, skippedAt: null })
    const n = flowDayRepo.softDeleteByInstance(inst.id)
    expect(n).toBe(2)
    expect(flowDayRepo.findByInstance(inst.id)).toHaveLength(0)
  })
})

describe('flowVoucherRepo', () => {
  beforeEach(resetDb)

  function makeVoucher(kind: 'check' | 'manual' | 'extra', targetType: 'day_entry' | 'week_instance' = 'week_instance', targetId = 1) {
    return flowVoucherRepo.create({ targetType, targetId, kind, occurredAt: '2026-08-12', note: null })
  }

  it('listActiveByTargets 批量取 + 软删后消失', () => {
    const v1 = makeVoucher('manual')
    const v2 = makeVoucher('extra')
    expect(flowVoucherRepo.listActiveByTargets('week_instance', [1])).toHaveLength(2)
    flowVoucherRepo.softDelete(v1.id)
    const rest = flowVoucherRepo.listActiveByTargets('week_instance', [1])
    expect(rest.map(v => v.id)).toEqual([v2.id])
    expect(flowVoucherRepo.findById(v2.id)?.isDeleted).toBe(false)
  })

  it('findActiveCheck 只返回未删勾选凭据', () => {
    const c = makeVoucher('check', 'day_entry', 5)
    expect(flowVoucherRepo.findActiveCheck(5)?.id).toBe(c.id)
    flowVoucherRepo.softDelete(c.id)
    expect(flowVoucherRepo.findActiveCheck(5)).toBeUndefined()
  })

  it('listActiveByTargets 空 ids 返回空数组', () => {
    expect(flowVoucherRepo.listActiveByTargets('day_entry', [])).toEqual([])
  })
})

describe('flowGoalRepo', () => {
  beforeEach(resetDb)

  it('月目标 CRUD + 关闭语义', () => {
    const g = flowGoalRepo.createGoal({ month: '2026-08', title: '发布 v0.3', closedAt: null })
    expect(flowGoalRepo.listMonthGoals('2026-08').map(x => x.id)).toEqual([g.id])
    const u = flowGoalRepo.updateGoal(g.id, { closedAt: '2026-08-31' })
    expect(u?.closedAt).toBe('2026-08-31')
    flowGoalRepo.softDeleteGoal(g.id)
    expect(flowGoalRepo.listMonthGoals('2026-08')).toHaveLength(0)
  })

  it('周核心目标 CRUD', () => {
    const f = flowGoalRepo.createFocus({ weekStart: MONDAY, title: '推进重构', monthGoalId: null, doneAt: null, sortOrder: 0 })
    expect(flowGoalRepo.listFocusByWeek(MONDAY)).toHaveLength(1)
    const u = flowGoalRepo.updateFocus(f.id, { doneAt: '2026-08-12' })
    expect(u?.doneAt).toBe('2026-08-12')
    flowGoalRepo.softDeleteFocus(f.id)
    expect(flowGoalRepo.listFocusByWeek(MONDAY)).toHaveLength(0)
  })

  // R2 Fix1（U-4）：同一月目标在同一周重复选取幂等——只产生一条 active 周核心目标
  function makeGoal(title: string): number {
    return flowGoalRepo.createGoal({ month: '2026-08', title, closedAt: null }).id
  }

  it('U-4 同一周同一月目标重复选取不新增 active 行', () => {
    const goalId = makeGoal('[R2]-M1 月目标')
    const first = flowGoalRepo.createFocus({ weekStart: MONDAY, title: '[R2]-M1 月目标', monthGoalId: goalId, doneAt: null, sortOrder: 0 })
    const again = flowGoalRepo.createFocus({ weekStart: MONDAY, title: '[R2]-M1 月目标', monthGoalId: goalId, doneAt: null, sortOrder: 0 })
    expect(again.id).toBe(first.id) // 幂等：返回既有 active 行
    expect(flowGoalRepo.listFocusByWeek(MONDAY)).toHaveLength(1)
  })

  it('U-4 连续重复提交（3 次）后仍只有一条 active', () => {
    const goalId = makeGoal('M1')
    const first = flowGoalRepo.createFocus({ weekStart: MONDAY, title: 'M1', monthGoalId: goalId, doneAt: null, sortOrder: 0 })
    flowGoalRepo.createFocus({ weekStart: MONDAY, title: 'M1', monthGoalId: goalId, doneAt: null, sortOrder: 0 })
    const third = flowGoalRepo.createFocus({ weekStart: MONDAY, title: 'M1', monthGoalId: goalId, doneAt: null, sortOrder: 0 })
    expect(third.id).toBe(first.id)
    const rows = flowGoalRepo.listFocusByWeek(MONDAY)
    expect(rows).toHaveLength(1)
    expect(rows[0].monthGoalId).toBe(goalId)
  })

  it('U-4 不同周同一月目标各允许一条（互不影响）', () => {
    const goalId = makeGoal('M1')
    const w1 = flowGoalRepo.createFocus({ weekStart: MONDAY, title: 'M1', monthGoalId: goalId, doneAt: null, sortOrder: 0 })
    const w2 = flowGoalRepo.createFocus({ weekStart: TUESDAY, title: 'M1', monthGoalId: goalId, doneAt: null, sortOrder: 0 })
    expect(w1.id).not.toBe(w2.id)
    expect(flowGoalRepo.listFocusByWeek(MONDAY)).toHaveLength(1)
    expect(flowGoalRepo.listFocusByWeek(TUESDAY)).toHaveLength(1)
  })

  it('U-4 软删后重新选取可新建 active 行（删除不被幂等守卫阻塞）', () => {
    const goalId = makeGoal('M1')
    const old = flowGoalRepo.createFocus({ weekStart: MONDAY, title: 'M1', monthGoalId: goalId, doneAt: null, sortOrder: 0 })
    flowGoalRepo.softDeleteFocus(old.id)
    expect(flowGoalRepo.listFocusByWeek(MONDAY)).toHaveLength(0)
    const fresh = flowGoalRepo.createFocus({ weekStart: MONDAY, title: 'M1', monthGoalId: goalId, doneAt: null, sortOrder: 0 })
    expect(fresh.id).not.toBe(old.id)
    expect(flowGoalRepo.listFocusByWeek(MONDAY)).toHaveLength(1)
  })

  it('U-4 手写目标（无月目标）同标题仍可多条，不受幂等守卫影响', () => {
    const a = flowGoalRepo.createFocus({ weekStart: MONDAY, title: '临时事项', monthGoalId: null, doneAt: null, sortOrder: 0 })
    const b = flowGoalRepo.createFocus({ weekStart: MONDAY, title: '临时事项', monthGoalId: null, doneAt: null, sortOrder: 0 })
    expect(a.id).not.toBe(b.id)
    expect(flowGoalRepo.listFocusByWeek(MONDAY)).toHaveLength(2)
  })
})

describe('flowTemplateRepo', () => {
  beforeEach(resetDb)

  it('items JSON 往返 + type 过滤 + 软删', () => {
    const t = flowTemplateRepo.create({ name: '工作日', type: 'daily', items: [{ text: '写日报' }, { text: '站会' }] })
    expect(flowTemplateRepo.list('daily')[0].items).toEqual([{ text: '写日报' }, { text: '站会' }])
    expect(flowTemplateRepo.list('weekly')).toHaveLength(0)
    const u = flowTemplateRepo.update(t.id, { name: '工作日v2' })
    expect(u?.name).toBe('工作日v2')
    expect(u?.items).toHaveLength(2) // 未传 items 保留原值
    flowTemplateRepo.softDelete(t.id)
    expect(flowTemplateRepo.list()).toHaveLength(0)
  })
})

describe('flowJournalRepo', () => {
  beforeEach(resetDb)

  it('upsert 同 (scope, periodKey) 单篇幂等', () => {
    const j1 = flowJournalRepo.upsert('day', '2026-08-14', '感想一')
    const j2 = flowJournalRepo.upsert('day', '2026-08-14', '感想二')
    expect(j2.id).toBe(j1.id)
    expect(flowJournalRepo.findByScope('day', '2026-08-14')?.content).toBe('感想二')
    expect(flowJournalRepo.findByScope('day', '2026-08-15')).toBeUndefined()
    const j3 = flowJournalRepo.upsert('week', '2026-08-10', '周感想')
    expect(j3.id).not.toBe(j1.id)
  })
})
