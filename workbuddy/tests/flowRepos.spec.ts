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
