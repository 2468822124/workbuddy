import { describe, it, expect } from 'vitest'
import {
  getWeekStart,
  getWeekRange,
  isoWeekOf,
  getMonthStart,
  getMonthRange,
  periodStartFor,
  nextPeriodStart,
  periodLabel,
  addDays,
} from '../src/shared/period'

describe('period.getWeekStart（周一始）', () => {
  it("周五 → 本周一（规格示例 '2026-08-07' → '2026-08-03'）", () => {
    expect(getWeekStart('2026-08-07')).toBe('2026-08-03')
  })

  it('周一本身 → 同一天', () => {
    expect(getWeekStart('2026-08-03')).toBe('2026-08-03')
  })

  it('周日 → 该周周一（跨周起点统一）', () => {
    expect(getWeekStart('2026-08-09')).toBe('2026-08-03')
  })

  it('跨年周（2027-01-01 周五）→ 2026-12-28', () => {
    expect(getWeekStart('2027-01-01')).toBe('2026-12-28')
  })
})

describe('period.getWeekRange', () => {
  it('周五所在周 = [周一, 周日]', () => {
    expect(getWeekRange('2026-08-07')).toEqual(['2026-08-03', '2026-08-09'])
  })

  it('跨年周范围正确', () => {
    expect(getWeekRange('2027-01-01')).toEqual(['2026-12-28', '2027-01-03'])
  })
})

describe('period.isoWeekOf（ISO 周数，周一始）', () => {
  it('2026-08-03 所在周 = 32', () => {
    expect(isoWeekOf('2026-08-03')).toBe(32)
  })

  it('同周日（2026-08-09）仍是 32 周', () => {
    expect(isoWeekOf('2026-08-09')).toBe(32)
  })

  it('下周（2026-08-10）= 33', () => {
    expect(isoWeekOf('2026-08-10')).toBe(33)
  })

  it('跨年周（2027-01-01）= 53', () => {
    expect(isoWeekOf('2027-01-01')).toBe(53)
  })
})

describe('period.getMonthStart / getMonthRange', () => {
  it('getMonthStart 返回当月 1 号', () => {
    expect(getMonthStart('2026-08-07')).toBe('2026-08-01')
  })

  it('平年 2 月 → 28 天', () => {
    expect(getMonthRange('2026-02-15')).toEqual(['2026-02-01', '2026-02-28'])
  })

  it('闰年 2 月 → 29 天', () => {
    expect(getMonthRange('2024-02-15')).toEqual(['2024-02-01', '2024-02-29'])
  })

  it('12 月跨年 → 年末日正确', () => {
    expect(getMonthRange('2026-12-01')).toEqual(['2026-12-01', '2026-12-31'])
  })
})

describe('period.periodStartFor（期起始）', () => {
  it('daily → 当天', () => {
    expect(periodStartFor('daily', '2026-08-07')).toBe('2026-08-07')
  })

  it('weekly → 周一', () => {
    expect(periodStartFor('weekly', '2026-08-07')).toBe('2026-08-03')
  })

  it('monthly → 1 号', () => {
    expect(periodStartFor('monthly', '2026-08-07')).toBe('2026-08-01')
  })

  it('非法 date 兜底今天且按 level 归一化（用户反馈3.1 根因 C：侧栏无 date query 进入）', () => {
    // 兜底用本地日期（period.ts todayStr），断言须同源——UTC toISOString 在本地跨午夜时段
    // （00:00–08:00 UTC+8）会取到前一天，造成 flaky（2026-08-09 凌晨实测复现）。
    const d = new Date()
    const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    expect(periodStartFor('daily', '')).toBe(today)
    expect(periodStartFor('weekly', '')).toBe(getWeekStart(today))
    expect(periodStartFor('monthly', '')).toBe(getMonthStart(today))
    expect(periodStartFor('daily', 'not-a-date')).toBe(today)
    expect(periodStartFor('weekly', '2026-8-8')).toBe(getWeekStart(today))
  })
})

describe('period.nextPeriodStart（下期起始）', () => {
  it('daily +1 天', () => {
    expect(nextPeriodStart('daily', '2026-08-07')).toBe('2026-08-08')
  })

  it('weekly +7 天（跨月）', () => {
    expect(nextPeriodStart('weekly', '2026-08-31')).toBe('2026-09-07')
  })

  it('monthly 进次月 1 号', () => {
    expect(nextPeriodStart('monthly', '2026-08-01')).toBe('2026-09-01')
  })

  it('monthly 跨年（12 月 → 次年 1 月）', () => {
    expect(nextPeriodStart('monthly', '2026-12-01')).toBe('2027-01-01')
  })
})

describe('period.periodLabel', () => {
  it('weekly → 「第 N 周 · MM/DD–MM/DD」', () => {
    expect(periodLabel('weekly', '2026-08-03')).toBe('第 32 周 · 08/03–08/09')
  })

  it('monthly → 「YYYY 年 M 月」', () => {
    expect(periodLabel('monthly', '2026-08-01')).toBe('2026 年 8 月')
  })

  it('daily → 原样 YYYY-MM-DD', () => {
    expect(periodLabel('daily', '2026-08-07')).toBe('2026-08-07')
  })
})

describe('period.addDays（跨期计算原语）', () => {
  it('普通日加减', () => {
    expect(addDays('2026-08-03', 1)).toBe('2026-08-04')
    expect(addDays('2026-08-03', -1)).toBe('2026-08-02')
  })

  it('跨月/跨年进位', () => {
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28')
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
  })
})
