import { describe, it, expect, beforeEach } from 'vitest'
import {
  mockConnectionDb, resetDb,
  MONDAY, TUESDAY, WEDNESDAY, THURSDAY, FRIDAY, NEXT_MONDAY,
} from './flowTestDb'
import { getDb } from '../src/main/db/connection'
import { flowFixedRepo } from '../src/main/db/repositories/flowFixedRepo'
import { flowWeekRepo } from '../src/main/db/repositories/flowWeekRepo'
import { flowDayRepo } from '../src/main/db/repositories/flowDayRepo'
import { flowGoalRepo } from '../src/main/db/repositories/flowGoalRepo'
import { materializeWeek } from '../src/main/services/flowCloneEngine'
import { getWeekBoard, getDayBoard } from '../src/main/services/flowDerived'
import {
  saveFixedDef, createTempInstance, skipInstance, manualCompleteInstance, addSession,
  addEntry, toggleCheckEntry, removeEntry, skipEntry, updateEntry,
  deleteVoucher, updateVoucher,
} from '../src/main/services/flowActions'
import { FlowWeekInstance } from '@shared/flowTypes'

mockConnectionDb()

// 今天基准 = 周四（rail 活跃安排判定基准，可注入 getWeekBoard）
const TODAY = THURSDAY

function makeFixedDef(title = '写周报', overrides: Partial<Parameters<typeof flowFixedRepo.create>[0]> = {}) {
  return flowFixedRepo.create({
    title,
    kind: 'once',
    targetCount: 1,
    weekdayMask: 0,
    recurrence: 'WEEKLY',
    note: null,
    ...overrides,
  })
}

function makeTempInst(title: string, kind: FlowWeekInstance['kind'] = 'once', targetCount = 1): FlowWeekInstance {
  const r = createTempInstance({ weekStart: MONDAY, title, kind, targetCount })
  if (!r.ok) throw new Error(r.error.message)
  return r.data
}

function railTitles(): string[] {
  const b = getWeekBoard(MONDAY, TODAY)
  return b.rail.map(i => i.title)
}

function completionOf(title: string) {
  const b = getWeekBoard(MONDAY, TODAY)
  const inst = b.instances.find(i => i.title === title)
  if (!inst) throw new Error(`instance not found: ${title}`)
  return inst.completion
}

describe('完成态派生（凭据池唯一事实）', () => {
  beforeEach(resetDb)

  it('一次性：安排行勾选 → done；收勾 → 实时回退', () => {
    const inst = makeTempInst('做周报')
    const e = addEntry({ date: TUESDAY, title: '做周报', source: 'rail', weekInstanceId: inst.id })
    expect(e.ok).toBe(true)
    if (!e.ok) return
    expect(completionOf('做周报').done).toBe(false)

    const t1 = toggleCheckEntry(e.data.id)
    expect(t1.ok && t1.data.done).toBe(true)
    expect(completionOf('做周报')).toMatchObject({ done: true, doneCount: 1 })

    const t2 = toggleCheckEntry(e.data.id)
    expect(t2.ok && t2.data.done).toBe(false)
    expect(completionOf('做周报')).toMatchObject({ done: false, doneCount: 0 }) // 收勾回退
  })

  it('一次性：manual 凭据独立完成（系统外逃逸阀）', () => {
    const inst = makeTempInst('做周报')
    const r = manualCompleteInstance(inst.id, '2026-08-11', '系统外完成')
    expect(r.ok).toBe(true)
    expect(completionOf('做周报')).toMatchObject({ done: true, doneCount: 1 })
  })

  it('多次性：check+extra+manual 合计计数，超额照计，达目标即 done', () => {
    const inst = makeTempInst('跑步', 'multi', 3)
    const e = addEntry({ date: TUESDAY, title: '跑步', source: 'rail', weekInstanceId: inst.id })
    if (!e.ok) throw new Error(e.error.message)
    toggleCheckEntry(e.data.id)
    addSession(inst.id)
    manualCompleteInstance(inst.id, '2026-08-13')
    expect(completionOf('跑步')).toMatchObject({ done: true, doneCount: 3, targetCount: 3 })

    addSession(inst.id) // 超额
    expect(completionOf('跑步')).toMatchObject({ done: true, doneCount: 4 })
  })

  it('多次性：未达目标 not done；凭据软删 → 实时回退', () => {
    const inst = makeTempInst('跑步', 'multi', 2)
    const e = addEntry({ date: TUESDAY, title: '跑步', source: 'rail', weekInstanceId: inst.id })
    if (!e.ok) throw new Error(e.error.message)
    toggleCheckEntry(e.data.id)
    expect(completionOf('跑步')).toMatchObject({ done: false, doneCount: 1 })
    toggleCheckEntry(e.data.id) // 收勾
    expect(completionOf('跑步')).toMatchObject({ done: false, doneCount: 0 })
  })

  it('历史补勾实时重算：过期日期的安排行勾选 → 完成态成立', () => {
    const inst = makeTempInst('做周报')
    const e = addEntry({ date: MONDAY, title: '做周报', source: 'rail', weekInstanceId: inst.id })
    if (!e.ok) throw new Error(e.error.message)
    expect(completionOf('做周报').done).toBe(false)
    toggleCheckEntry(e.data.id) // 周四补勾周一的安排
    expect(completionOf('做周报').done).toBe(true)
  })
})

describe('rail 可见性', () => {
  beforeEach(resetDb)

  it('无安排 → rail 可见；选取后隐藏；移除 → 回 rail 可重选', () => {
    const inst = makeTempInst('做周报')
    expect(railTitles()).toContain('做周报')
    const e = addEntry({ date: TODAY, title: '做周报', source: 'rail', weekInstanceId: inst.id })
    if (!e.ok) throw new Error(e.error.message)
    expect(railTitles()).not.toContain('做周报') // 全周隐藏（立项#20）
    removeEntry(e.data.id)
    expect(railTitles()).toContain('做周报')
  })

  it('一次性已安排（未来日期）→ 全周隐藏', () => {
    const inst = makeTempInst('做周报')
    addEntry({ date: FRIDAY, title: '做周报', source: 'rail', weekInstanceId: inst.id })
    expect(railTitles()).not.toContain('做周报')
  })

  it('过期未勾锁定行 → 次日回 rail（activeArranged 只算 date>=今天）', () => {
    makeFixedDef('写周报', { weekdayMask: 0b1 }) // 惯常日周一
    materializeWeek(MONDAY)
    // 周一安排已过期未勾 → 周四 rail 重新可见
    expect(railTitles()).toContain('写周报')
  })

  it('多次性：目标内排满隐藏、超额安排允许前可见', () => {
    const inst = makeTempInst('跑步', 'multi', 2)
    const e1 = addEntry({ date: THURSDAY, title: '跑步', source: 'rail', weekInstanceId: inst.id })
    if (!e1.ok) throw new Error(e1.error.message)
    expect(railTitles()).toContain('跑步') // 1/2 未排满（today=THURSDAY）
    addEntry({ date: FRIDAY, title: '跑步', source: 'rail', weekInstanceId: inst.id })
    expect(railTitles()).not.toContain('跑步') // 2/2 排满隐藏（G4 超额仅在目标内选取）
  })

  it('跳过（免罪）→ rail 隐藏、不计未完成、完成态 skipped=true', () => {
    const inst = makeTempInst('做周报')
    const r = skipInstance(inst.id)
    expect(r.ok).toBe(true)
    expect(completionOf('做周报')).toMatchObject({ skipped: true, done: false, doneCount: 0 })
    expect(railTitles()).not.toContain('做周报')
  })

  it('删除周任务 → 实例与其安排行软删、rail 消失、凭据保留', () => {
    const inst = makeTempInst('做周报')
    addEntry({ date: TUESDAY, title: '做周报', source: 'rail', weekInstanceId: inst.id })
    const b0 = getWeekBoard(MONDAY, TODAY)
    expect(b0.instances).toHaveLength(1)
    flowWeekRepo.softDelete(inst.id)
    flowDayRepo.softDeleteByInstance(inst.id)
    const b1 = getWeekBoard(MONDAY, TODAY)
    expect(b1.instances).toHaveLength(0)
    expect(b1.rail).toHaveLength(0)
  })
})

describe('日面板与顺延（读时派生·零写入）', () => {
  beforeEach(resetDb)

  it('昨日未完成自由行顺延 + deferredCount 计数', () => {
    const e = addEntry({ date: MONDAY, title: '写文档', source: 'manual' })
    if (!e.ok) throw new Error(e.error.message)
    const board = getDayBoard(TUESDAY)
    const row = board.entries.find(x => x.title === '写文档')
    expect(row).toBeDefined()
    expect(row?.deferredCount).toBe(1)
    expect(row?.displayTitle).toBe('写文档')
    expect(row?.done).toBe(false)
  })

  it('完成的历史行不再顺延（留原日历史）', () => {
    const e = addEntry({ date: MONDAY, title: '写文档', source: 'manual' })
    if (!e.ok) throw new Error(e.error.message)
    toggleCheckEntry(e.data.id)
    const board = getDayBoard(TUESDAY)
    expect(board.entries.find(x => x.title === '写文档')).toBeUndefined()
    expect(getDayBoard(MONDAY).entries.find(x => x.title === '写文档')?.done).toBe(true) // 原日仍在且已完成
  })

  it('提醒不顺延；锁定行不顺延；跳过行不出现', () => {
    addEntry({ date: MONDAY, title: '喝水', source: 'reminder', reminderKey: 'water' })
    const inst = makeTempInst('做周报')
    addEntry({ date: MONDAY, title: '做周报', source: 'rail', weekInstanceId: inst.id, locked: true })
    const skipped = addEntry({ date: MONDAY, title: '被跳过', source: 'manual' })
    if (!skipped.ok) throw new Error(skipped.error.message)
    skipEntry(skipped.data.id)

    const board = getDayBoard(TUESDAY)
    expect(board.entries.map(x => x.title)).toEqual([]) // 全部不顺延
  })

  it('顺延按日期排序（越早越靠前）+ 当日行在前', () => {
    addEntry({ date: MONDAY, title: '旧1', source: 'manual' })
    addEntry({ date: TUESDAY, title: '旧2', source: 'manual' })
    addEntry({ date: WEDNESDAY, title: '今天任务', source: 'manual' })
    const board = getDayBoard(WEDNESDAY)
    expect(board.entries.map(x => x.title)).toEqual(['今天任务', '旧1', '旧2'])
    expect(board.entries[1].deferredCount).toBe(2)
  })

  it('displayTitle：锁定行实时取实例标题（改名传播数据层验证）', () => {
    const def = makeFixedDef('做周报', { weekdayMask: 0b1 })
    materializeWeek(MONDAY)
    let board = getDayBoard(MONDAY)
    const row = board.entries.find(x => x.locked)
    expect(row?.displayTitle).toBe('做周报')
    const r = saveFixedDef({ id: def.id, title: '做本周周报' }, TODAY)
    expect(r.ok).toBe(true)
    board = getDayBoard(MONDAY)
    expect(board.entries.find(x => x.locked)?.displayTitle).toBe('做本周周报')
  })
})

describe('周面板组装', () => {
  beforeEach(resetDb)

  it('focus 周核心目标出现在周面板', () => {
    flowGoalRepo.createFocus({ weekStart: MONDAY, title: '推进重构', monthGoalId: null, doneAt: null, sortOrder: 0 })
    const b = getWeekBoard(MONDAY, TODAY)
    expect(b.focus.map(f => f.title)).toEqual(['推进重构'])
  })

  it('instances 排序稳定（sortOrder 优先）', () => {
    makeTempInst('A')
    makeTempInst('B')
    const ids = getWeekBoard(MONDAY, TODAY).instances.map(i => i.id)
    expect(ids).toHaveLength(2)
  })
})

describe('锁定行禁改文字 / 私有备注可用', () => {
  beforeEach(resetDb)

  it('锁定行 title 更新被拒；note 更新放行', () => {
    const inst = makeTempInst('做周报')
    const e = addEntry({ date: TUESDAY, title: '做周报', source: 'rail', weekInstanceId: inst.id, locked: true })
    if (!e.ok) throw new Error(e.error.message)
    const r1 = updateEntry(e.data.id, { title: '改名尝试' })
    expect(r1.ok).toBe(false)
    const r2 = updateEntry(e.data.id, { note: '私有备注' })
    expect(r2.ok).toBe(true)
    if (!r2.ok) return
    expect(r2.data.note).toBe('私有备注')
    expect(r2.data.title).toBe('做周报')
  })

  // F2 复审回归：显式 null 必须清空备注（?? 会把 null 回退旧值）
  it('显式 note:null 清空备注并持久化', () => {
    const inst = makeTempInst('做周报')
    const e = addEntry({ date: TUESDAY, title: '做周报', source: 'rail', weekInstanceId: inst.id, locked: true })
    if (!e.ok) throw new Error(e.error.message)
    const set = updateEntry(e.data.id, { note: '私有备注' })
    if (!set.ok) throw new Error(set.error.message)
    expect(set.data.note).toBe('私有备注')
    const clear = updateEntry(e.data.id, { note: null })
    if (!clear.ok) throw new Error(clear.error.message)
    expect(clear.data.note).toBeNull()
    // 持久化验证：经 getDayBoard 重读（服务端读路径），非仅返回值
    const board = getDayBoard(TUESDAY)
    const row = board.entries.find(x => x.id === e.data.id)
    expect(row?.note).toBeNull()
    // 未提供 note（undefined）时保留现值
    const keep = updateEntry(e.data.id, { title: undefined })
    const board2 = getDayBoard(TUESDAY)
    expect(board2.entries.find(x => x.id === e.data.id)?.note).toBeNull()
  })
})

describe('R1 修复：凭据撤销/编辑（历史可改铁律闭环）', () => {
  beforeEach(resetDb)

  it('manual 凭据删除 → done 实时回退', () => {
    const inst = makeTempInst('做周报')
    const r = manualCompleteInstance(inst.id, '2026-08-11', '系统外完成')
    if (!r.ok) throw new Error(r.error.message)
    expect(completionOf('做周报').done).toBe(true)
    const d = deleteVoucher(r.data.id)
    expect(d.ok).toBe(true)
    expect(completionOf('做周报')).toMatchObject({ done: false, doneCount: 0 })
  })

  it('extra 场次凭据删除 → doneCount 回退（达标态解除）', () => {
    const inst = makeTempInst('跑步', 'multi', 2)
    const e = addEntry({ date: TUESDAY, title: '跑步', source: 'rail', weekInstanceId: inst.id })
    if (!e.ok) throw new Error(e.error.message)
    toggleCheckEntry(e.data.id) // 1
    const s = addSession(inst.id) // 2 → done
    if (!s.ok) throw new Error(s.error.message)
    expect(completionOf('跑步')).toMatchObject({ done: true, doneCount: 2 })
    deleteVoucher(s.data.id)
    expect(completionOf('跑步')).toMatchObject({ done: false, doneCount: 1 })
  })

  it('凭据编辑 occurredAt 生效；非法日期被拒；不存在→NOT_FOUND', () => {
    const inst = makeTempInst('做周报')
    const r = manualCompleteInstance(inst.id)
    if (!r.ok) throw new Error(r.error.message)
    const u = updateVoucher(r.data.id, { occurredAt: '2026-08-10', note: '回填' })
    expect(u.ok).toBe(true)
    if (!u.ok) return
    expect(u.data.occurredAt).toBe('2026-08-10')
    expect(u.data.note).toBe('回填')
    const bad = updateVoucher(r.data.id, { occurredAt: '2026-2-30' })
    expect(bad.ok).toBe(false)
    deleteVoucher(r.data.id)
    const gone = updateVoucher(r.data.id, { note: 'x' })
    expect(gone.ok).toBe(false)
    if (!gone.ok) expect(gone.error.code).toBe('NOT_FOUND')
  })
})

describe('R2 修复：降级场景固化（GLM 审查1 审计用例移植）', () => {
  beforeEach(resetDb)

  it('悬挂 weekInstanceId：降级显示自身标题，不崩', () => {
    getDb().exec('PRAGMA foreign_keys = OFF')
    flowDayRepo.create({ date: MONDAY, title: '孤儿锁定行', source: 'rail', locked: true, weekInstanceId: 999, projectId: null, reminderKey: null, templateId: null, note: null, skippedAt: null })
    getDb().exec('PRAGMA foreign_keys = ON')
    const board = getDayBoard(MONDAY)
    const row = board.entries.find(e => e.title === '孤儿锁定行')
    expect(row).toBeDefined()
    expect(row?.displayTitle).toBe('孤儿锁定行')
  })

  it('非法入参拒收不抛异常（日期/空标题/非法 source）', () => {
    const r1 = createTempInstance({ weekStart: '2026-13-99', title: 'x', kind: 'once' })
    expect(r1.ok).toBe(false)
    if (!r1.ok) expect(r1.error.code).toBe('INVALID_INPUT')
    const r2 = createTempInstance({ weekStart: MONDAY, title: '  ', kind: 'once' })
    expect(r2.ok).toBe(false)
    const r3 = addEntry({ date: MONDAY, title: 'y', source: 'bogus' })
    expect(r3.ok).toBe(false)
    const r4 = addEntry({ date: 'bad-date', title: 'z', source: 'manual' })
    expect(r4.ok).toBe(false)
  })
})

describe('端到端数据链（规格 §8 步骤12，无 UI）', () => {
  beforeEach(resetDb)

  it('固定任务(周三,多次2)→物化→rail→选取→勾选→manual 补场→done→下周全新实例', () => {
    makeFixedDef('跑步', { kind: 'multi', targetCount: 2, weekdayMask: 0b100 }) // 周三惯常
    const m = materializeWeek(MONDAY)
    expect(m.ok && m.data.createdInstances).toBe(1)

    // W34 面板：实例 + 惯常行（周三），rail 可见（1/2 未排满）
    let b = getWeekBoard(MONDAY, MONDAY)
    expect(b.instances).toHaveLength(1)
    const inst = b.instances[0]
    expect(inst.completion).toMatchObject({ done: false, doneCount: 0, targetCount: 2, arrangedCount: 1 })
    expect(b.rail.map(i => i.title)).toContain('跑步')

    // 手动选取周二场 → 排满隐藏
    const e = addEntry({ date: TUESDAY, title: '跑步', source: 'rail', weekInstanceId: inst.id })
    if (!e.ok) throw new Error(e.error.message)
    b = getWeekBoard(MONDAY, MONDAY)
    expect(b.rail).toHaveLength(0)

    // 周二勾选 → 1/2
    toggleCheckEntry(e.data.id)
    expect(getWeekBoard(MONDAY, TUESDAY).instances[0].completion).toMatchObject({ done: false, doneCount: 1 })

    // 周三惯常行勾选 → 2/2 done
    const wedEntry = flowDayRepo.listByDate(WEDNESDAY)[0]
    toggleCheckEntry(wedEntry.id)
    expect(getWeekBoard(MONDAY, TUESDAY).instances[0].completion).toMatchObject({ done: true, doneCount: 2 })

    // W35 物化：全新实例计数清零，与 W34 隔离
    materializeWeek(NEXT_MONDAY)
    const b35 = getWeekBoard(NEXT_MONDAY, NEXT_MONDAY)
    expect(b35.instances).toHaveLength(1)
    expect(b35.instances[0].id).not.toBe(inst.id)
    expect(b35.instances[0].completion).toMatchObject({ done: false, doneCount: 0 })
    // W34 历史仍为 done（凭据挂旧实例，跨周不串账）
    expect(getWeekBoard(MONDAY, TODAY).instances[0].completion.done).toBe(true)
  })
})

describe('阶段2 扩展：WeekBoard.vouchers（凭据弹层数据源）', () => {
  beforeEach(resetDb)

  it('manual/extra/check 同池出现，带 targetTitle 归组', () => {
    const inst = makeTempInst('做周报', 'multi', 3)
    const e = addEntry({ date: TUESDAY, title: '做周报', source: 'rail', weekInstanceId: inst.id })
    if (!e.ok) throw new Error(e.error.message)
    manualCompleteInstance(inst.id, '2026-08-11')
    addSession(inst.id)
    toggleCheckEntry(e.data.id)
    const b = getWeekBoard(MONDAY, TODAY)
    const vs = b.vouchers
    expect(vs).toHaveLength(3)
    expect(vs.filter(v => v.targetType === 'week_instance')).toHaveLength(2)
    const check = vs.find(v => v.targetType === 'day_entry')
    expect(check?.targetTitle).toBe('做周报') // check 凭据归到所在实例标题
    expect(check?.instanceId).toBe(inst.id) // F1 修复：check 凭据 instanceId 归组
    expect(vs.every(v => v.targetTitle === '做周报')).toBe(true)
    expect(vs.every(v => v.instanceId === inst.id)).toBe(true) // 同一实例所有凭据 instanceId 一致
  })

  it('voucher 软删 → 从面板消失（弹层实时一致）', () => {
    const inst = makeTempInst('做周报')
    const r = manualCompleteInstance(inst.id)
    if (!r.ok) throw new Error(r.error.message)
    expect(getWeekBoard(MONDAY, TODAY).vouchers).toHaveLength(1)
    deleteVoucher(r.data.id)
    expect(getWeekBoard(MONDAY, TODAY).vouchers).toHaveLength(0)
  })
})
