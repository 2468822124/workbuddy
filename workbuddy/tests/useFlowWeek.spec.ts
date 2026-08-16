import { describe, it, expect } from 'vitest'
import {
  parseWeekQuery,
  shiftWeek,
  weekLabel,
  weekdayMaskToLabels,
  fixedBadge,
  instanceDisplay,
  isHistoryWeek,
  monthOf,
  focusDisplayTitle,
  hasTransferred,
  vouchersOf,
} from '../src/renderer/src/composables/useFlowWeek'
import type { FlowFixedDef, FlowVoucherView, FlowWeekFocus, FlowWeekInstance, InstanceCompletion } from '../src/shared/flowTypes'

// 阶段2 规格 §8.3：composable 纯逻辑单测（周导航/状态映射/徽标/弱级联）

const WEEK_0810 = '2026-08-10' // 周一（2026-08-10 确实是周一）
const TODAY = '2026-08-14'

function inst(partial: Partial<FlowWeekInstance>): FlowWeekInstance {
  return {
    id: 1,
    weekStart: WEEK_0810,
    origin: 'temp',
    fixedDefId: null,
    title: '写周报',
    kind: 'once',
    targetCount: 1,
    sortOrder: 0,
    skippedAt: null,
    carriedFrom: null,
    isDeleted: false,
    deletedAt: null,
    createdAt: '2026-08-10T00:00:00.000Z',
    updatedAt: '2026-08-10T00:00:00.000Z',
    ...partial,
  }
}

function completion(partial: Partial<InstanceCompletion>): InstanceCompletion {
  return {
    instanceId: 1,
    done: false,
    doneCount: 0,
    targetCount: 1,
    arrangedCount: 0,
    skipped: false,
    ...partial,
  }
}

describe('parseWeekQuery（?week= 解析与归一化）', () => {
  it('合法日期 → 归一化为周一起始', () => {
    expect(parseWeekQuery('2026-08-14', TODAY)).toBe('2026-08-10')
    expect(parseWeekQuery('2026-08-10', TODAY)).toBe('2026-08-10')
  })

  it('非法/空 → 回落本周一', () => {
    expect(parseWeekQuery(undefined, TODAY)).toBe('2026-08-10')
    expect(parseWeekQuery('', TODAY)).toBe('2026-08-10')
    expect(parseWeekQuery('2026-13-99', TODAY)).toBe('2026-08-10')
    expect(parseWeekQuery(42, TODAY)).toBe('2026-08-10')
  })

  it('数组 query（vue-router 形式）取首个', () => {
    expect(parseWeekQuery(['2026-08-16', '2026-08-17'], TODAY)).toBe('2026-08-10')
  })
})

describe('shiftWeek（周导航 ±N 周，纯 UTC）', () => {
  it('+1 周 / -1 周', () => {
    expect(shiftWeek(WEEK_0810, 1)).toBe('2026-08-17')
    expect(shiftWeek(WEEK_0810, -1)).toBe('2026-08-03')
  })

  it('跨年边界', () => {
    expect(shiftWeek('2026-12-28', 1)).toBe('2027-01-04')
    expect(shiftWeek('2027-01-04', -1)).toBe('2026-12-28')
  })
})

describe('weekLabel（周导航标题）', () => {
  it('格式 W{ISO周} · 起始 ~ MM-DD', () => {
    expect(weekLabel('2026-08-10')).toBe('W33 · 2026-08-10 ~ 08-16')
  })

  it('跨年周标签正确（2027 年第 1 周）', () => {
    expect(weekLabel('2027-01-04')).toBe('W1 · 2027-01-04 ~ 01-10')
  })
})

describe('weekdayMaskToLabels（惯常日 bit → 中文）', () => {
  it('bit0=周一 … bit6=周日', () => {
    expect(weekdayMaskToLabels(1)).toEqual(['一'])
    expect(weekdayMaskToLabels(0b1000001)).toEqual(['一', '日'])
  })

  it('多日顿号连接序', () => {
    expect(weekdayMaskToLabels(0b010100)).toEqual(['三', '五'])
  })

  it('mask=0 → 空数组（徽标退化为 [固定]）', () => {
    expect(weekdayMaskToLabels(0)).toEqual([])
  })
})

describe('fixedBadge（固定徽标）', () => {
  const defs: FlowFixedDef[] = [
    {
      id: 10, title: '写周报', kind: 'once', targetCount: 1, weekdayMask: 0b100,
      recurrence: 'WEEKLY', note: null, isDeleted: false, deletedAt: null,
      createdAt: '', updatedAt: '',
    },
  ]

  it('temp 无徽标', () => {
    expect(fixedBadge(inst({ origin: 'temp' }), defs)).toBeNull()
  })

  it('fixed + 惯常日 → 固定·周三', () => {
    expect(fixedBadge(inst({ origin: 'fixed', fixedDefId: 10 }), defs)).toBe('固定·周三')
  })

  it('fixed + 多惯常日 → 固定·一/三', () => {
    const multi: FlowFixedDef[] = [{ ...defs[0], weekdayMask: 0b101 }]
    expect(fixedBadge(inst({ origin: 'fixed', fixedDefId: 10 }), multi)).toBe('固定·一/三')
  })

  it('fixed + mask=0 → 固定；def 不在列表（已停用）→ 固定', () => {
    expect(fixedBadge(inst({ origin: 'fixed', fixedDefId: 10 }), [{ ...defs[0], weekdayMask: 0 }])).toBe('固定')
    expect(fixedBadge(inst({ origin: 'fixed', fixedDefId: 99 }), defs)).toBe('固定')
  })
})

describe('instanceDisplay（完成态 → 显示态）', () => {
  it('once 未完成 → open；完成 → done', () => {
    expect(instanceDisplay(inst({}), completion({})).state).toBe('open')
    expect(instanceDisplay(inst({}), completion({ done: true })).state).toBe('done')
  })

  it('multi → n/目标 徽章；达标转 done', () => {
    const multi = inst({ kind: 'multi', targetCount: 3 })
    const d = instanceDisplay(multi, completion({ targetCount: 3, doneCount: 2 }))
    expect(d.state).toBe('open')
    expect(d.badge).toBe('2/3')
    const done = instanceDisplay(multi, completion({ targetCount: 3, doneCount: 3, done: true }))
    expect(done.state).toBe('done')
    expect(done.badge).toBe('3/3')
  })

  it('跳过 → skipped 灰显（免罪，无徽章）', () => {
    const d = instanceDisplay(inst({}), completion({ skipped: true }))
    expect(d.state).toBe('skipped')
    expect(d.badge).toBeNull()
  })

  it('once 无徽章', () => {
    expect(instanceDisplay(inst({}), completion({ done: true })).badge).toBeNull()
  })
})

describe('isHistoryWeek / monthOf', () => {
  it('本周/未来周非历史；早于本周一为历史', () => {
    expect(isHistoryWeek('2026-08-10', '2026-08-14')).toBe(false)
    expect(isHistoryWeek('2026-08-17', '2026-08-14')).toBe(false)
    expect(isHistoryWeek('2026-08-03', '2026-08-14')).toBe(true)
  })

  it('monthOf 截前 7 位', () => {
    expect(monthOf('2026-08-10')).toBe('2026-08')
  })
})

describe('focusDisplayTitle（弱级联：monthGoalId 实时取月目标标题）', () => {
  const focus = (partial: Partial<FlowWeekFocus>): FlowWeekFocus => ({
    id: 1, weekStart: WEEK_0810, title: '推进重构', monthGoalId: null, doneAt: null,
    sortOrder: 0, isDeleted: false, deletedAt: null, createdAt: '', updatedAt: '',
    ...partial,
  })
  const map = new Map<number, string>([[5, '重构完成']])

  it('无 monthGoalId → 快照标题', () => {
    expect(focusDisplayTitle(focus({}), map)).toBe('推进重构')
  })

  it('有 monthGoalId 且 map 有 → 月目标实时标题（改名跟随）', () => {
    expect(focusDisplayTitle(focus({ monthGoalId: 5 }), map)).toBe('重构完成')
  })

  it('monthGoalId 对应目标缺失（如已删）→ 回落快照', () => {
    expect(focusDisplayTitle(focus({ monthGoalId: 999 }), map)).toBe('推进重构')
  })
})

describe('hasTransferred（防重复转）', () => {
  const focus = { title: '推进重构' } as FlowWeekFocus

  it('本周无同名 temp → false', () => {
    expect(hasTransferred(focus, [inst({ title: '其它' })])).toBe(false)
  })

  it('本周有同名 temp（转出项）→ true 置灰', () => {
    expect(hasTransferred(focus, [inst({ title: '推进重构' })])).toBe(true)
  })

  it('固定型同名不算（转出产物恒为 temp）', () => {
    expect(hasTransferred(focus, [inst({ origin: 'fixed', title: '推进重构' })])).toBe(false)
  })
})

describe('vouchersOf（凭据按实例分组）', () => {
  const v = (partial: Partial<FlowVoucherView>): FlowVoucherView => ({
    id: 1, targetType: 'week_instance', targetId: 7, kind: 'manual',
    occurredAt: '2026-08-12', note: null, isDeleted: false, deletedAt: null,
    createdAt: '', updatedAt: '', targetTitle: '写周报', instanceId: null,
    ...partial,
  })

  it('按 instanceId 归组：manual/extra/check 同池；其它实例凭据不混入', () => {
    const list = [
      v({ id: 1, targetId: 7, instanceId: 7, kind: 'manual' }),
      v({ id: 2, targetId: 7, instanceId: 7, kind: 'extra' }),
      v({ id: 3, targetId: 8, instanceId: 8, kind: 'manual' }),
      // check 凭据：instanceId 经 entryInstMap 归到实例 7（flowDerived 派生）
      v({ id: 4, targetType: 'day_entry', targetId: 99, instanceId: 7, kind: 'check' }),
    ]
    expect(vouchersOf(7, list).map(x => x.id)).toEqual([1, 2, 4])
  })
})
