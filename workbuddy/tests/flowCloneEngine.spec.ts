import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mockConnectionDb, resetDb, MONDAY, WEDNESDAY, NEXT_MONDAY } from './flowTestDb'
import { flowFixedRepo } from '../src/main/db/repositories/flowFixedRepo'
import { flowWeekRepo } from '../src/main/db/repositories/flowWeekRepo'
import { flowDayRepo } from '../src/main/db/repositories/flowDayRepo'
import { materializeWeek, weekdayBits } from '../src/main/services/flowCloneEngine'

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

describe('weekdayBits', () => {
  it('bitmask → 周内偏移', () => {
    expect(weekdayBits(0)).toEqual([])
    expect(weekdayBits(0b1)).toEqual([0]) // 周一
    expect(weekdayBits(0b100)).toEqual([2]) // 周三
    expect(weekdayBits(0b101)).toEqual([0, 2]) // 周一+周三
  })
})

describe('materializeWeek 惰性克隆', () => {
  beforeEach(resetDb)
  afterEach(() => vi.restoreAllMocks())

  it('首访克隆：固定任务 → 周实例（标题快照）', () => {
    makeDef()
    const r = materializeWeek(MONDAY)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.data).toEqual({ createdInstances: 1, createdEntries: 0 })
    const insts = flowWeekRepo.listByWeek(MONDAY)
    expect(insts).toHaveLength(1)
    expect(insts[0].origin).toBe('fixed')
    expect(insts[0].title).toBe('写周报')
  })

  it('幂等：同周重复调用零新增', () => {
    makeDef()
    materializeWeek(MONDAY)
    const r2 = materializeWeek(MONDAY)
    expect(r2.ok && r2.data.createdInstances).toBe(0)
    expect(flowWeekRepo.listByWeek(MONDAY)).toHaveLength(1)
    expect(flowDayRepo.findByInstance(1)).toHaveLength(0)
  })

  it('惯常日自动安排（🔒行）', () => {
    makeDef({ weekdayMask: 0b100 }) // 周三
    const r = materializeWeek(MONDAY)
    expect(r.ok && r.data.createdEntries).toBe(1)
    const inst = flowWeekRepo.listByWeek(MONDAY)[0]
    const entries = flowDayRepo.findByInstance(inst.id)
    expect(entries).toHaveLength(1)
    expect(entries[0].date).toBe(WEDNESDAY)
    expect(entries[0].source).toBe('habit')
    expect(entries[0].locked).toBe(true)
  })

  it('多惯常日多行；无惯常日不安排', () => {
    makeDef({ title: '跑步', kind: 'multi', targetCount: 3, weekdayMask: 0b101 }) // 周一+周三
    makeDef({ title: '复盘', weekdayMask: 0 })
    const r = materializeWeek(MONDAY)
    expect(r.ok && r.data.createdEntries).toBe(2)
    const insts = flowWeekRepo.listByWeek(MONDAY)
    const run = insts.find(i => i.title === '跑步') as NonNullable<typeof insts[number]>
    const review = insts.find(i => i.title === '复盘') as NonNullable<typeof insts[number]>
    expect(flowDayRepo.findByInstance(run.id).map(e => e.date)).toEqual([MONDAY, WEDNESDAY])
    expect(flowDayRepo.findByInstance(review.id)).toHaveLength(0)
  })

  it('固定任务软删后不再克隆；存量实例保留', () => {
    const def = makeDef()
    materializeWeek(MONDAY)
    flowFixedRepo.softDelete(def.id)
    const r = materializeWeek(NEXT_MONDAY)
    expect(r.ok && r.data.createdInstances).toBe(0)
    expect(flowWeekRepo.listByWeek(NEXT_MONDAY)).toHaveLength(0)
    expect(flowWeekRepo.listByWeek(MONDAY)).toHaveLength(1) // 存量保留
  })

  it('跨周隔离：各周独立实例', () => {
    makeDef()
    materializeWeek(MONDAY)
    materializeWeek(NEXT_MONDAY)
    expect(flowWeekRepo.listByWeek(MONDAY)).toHaveLength(1)
    expect(flowWeekRepo.listByWeek(NEXT_MONDAY)).toHaveLength(1)
    expect(flowWeekRepo.listByWeek(MONDAY)[0].id).not.toBe(flowWeekRepo.listByWeek(NEXT_MONDAY)[0].id)
  })

  it('非周一起始归一化为周一', () => {
    makeDef({ weekdayMask: 0b1 })
    const r = materializeWeek('2026-08-12') // 周三输入
    expect(r.ok).toBe(true)
    const inst = flowWeekRepo.listByWeek(MONDAY)[0]
    expect(flowDayRepo.findByInstance(inst.id)[0].date).toBe(MONDAY) // 按归一化后周一安排
  })

  it('事务原子性：写库中途失败回滚，不留半克隆脏数据', () => {
    makeDef()
    vi.spyOn(flowWeekRepo, 'create').mockImplementationOnce(() => {
      throw new Error('simulated failure')
    })
    const r = materializeWeek(MONDAY)
    expect(r.ok).toBe(false)
    expect(flowWeekRepo.listByWeek(MONDAY)).toHaveLength(0) // 实例零残留
    expect(flowDayRepo.findByInstance(1)).toHaveLength(0) // 行零残留
  })
})
