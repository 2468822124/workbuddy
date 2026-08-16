import { describe, it, expect } from 'vitest'
import { parseMonthQuery, shiftMonth, monthLabel } from '../src/renderer/src/composables/useFlowMonth'

// 阶段2 规格 §8.3 附：月目标页 composable 纯函数单测（技术栈规范 §6.4）

const TODAY = '2026-08-14'

describe('parseMonthQuery（?month= 解析）', () => {
  it("合法 'YYYY-MM' → 原样", () => {
    expect(parseMonthQuery('2026-08', TODAY)).toBe('2026-08')
    expect(parseMonthQuery('2026-12', TODAY)).toBe('2026-12')
  })

  it('非法/缺省 → 当月', () => {
    expect(parseMonthQuery(undefined, TODAY)).toBe('2026-08')
    expect(parseMonthQuery('', TODAY)).toBe('2026-08')
    expect(parseMonthQuery('2026-13', TODAY)).toBe('2026-08')
    expect(parseMonthQuery('2026-08-14', TODAY)).toBe('2026-08')
  })

  it('数组 query 取首个', () => {
    expect(parseMonthQuery(['2026-09'], TODAY)).toBe('2026-09')
  })
})

describe('shiftMonth（月份平移，Date.UTC 纯算术）', () => {
  it('±1 月', () => {
    expect(shiftMonth('2026-08', 1)).toBe('2026-09')
    expect(shiftMonth('2026-08', -1)).toBe('2026-07')
  })

  it('跨年边界', () => {
    expect(shiftMonth('2026-01', -1)).toBe('2025-12')
    expect(shiftMonth('2026-12', 1)).toBe('2027-01')
  })
})

describe('monthLabel（月导航标题）', () => {
  it('YYYY 年 M 月', () => {
    expect(monthLabel('2026-08')).toBe('2026 年 8 月')
  })
})
