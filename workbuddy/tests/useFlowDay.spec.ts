import { describe, it, expect } from 'vitest'
import {
  parseDateQuery,
  shiftDate,
  dateLabel,
  sourceBadge,
  isHistoryDate,
  DEFER_WARN_DAYS,
} from '../src/renderer/src/composables/useFlowDay'

// 阶段3 规格 §8.3：composable 纯函数单测（日期解析/导航/徽标/历史判定）

const TODAY = '2026-08-15'

describe('parseDateQuery', () => {
  it('合法日期原样返回', () => {
    expect(parseDateQuery('2026-08-15', TODAY)).toBe('2026-08-15')
  })

  it('缺省/undefined/null → 回落今天', () => {
    expect(parseDateQuery(undefined, TODAY)).toBe(TODAY)
    expect(parseDateQuery(null, TODAY)).toBe(TODAY)
    expect(parseDateQuery('', TODAY)).toBe(TODAY)
  })

  it('数组 → 取首项', () => {
    expect(parseDateQuery(['2026-08-20'], TODAY)).toBe('2026-08-20')
    expect(parseDateQuery(['2026-08-20', '2026-08-21'], TODAY)).toBe('2026-08-20')
  })

  it('非法格式 → 回落今天', () => {
    expect(parseDateQuery('not-a-date', TODAY)).toBe(TODAY)
    expect(parseDateQuery('2026/08/15', TODAY)).toBe(TODAY)
    expect(parseDateQuery('2026-8-5', TODAY)).toBe(TODAY)
  })

  it('月日越界 → 拒收回落（防 Date.UTC 静默进位）', () => {
    expect(parseDateQuery('2026-13-99', TODAY)).toBe(TODAY)
    expect(parseDateQuery('2026-00-01', TODAY)).toBe(TODAY)
    expect(parseDateQuery('2026-08-32', TODAY)).toBe(TODAY)
  })
})

describe('shiftDate', () => {
  it('+1 天', () => {
    expect(shiftDate('2026-08-15', 1)).toBe('2026-08-16')
  })

  it('-1 天', () => {
    expect(shiftDate('2026-08-15', -1)).toBe('2026-08-14')
  })

  it('跨月', () => {
    expect(shiftDate('2026-08-31', 1)).toBe('2026-09-01')
    expect(shiftDate('2026-09-01', -1)).toBe('2026-08-31')
  })

  it('跨年', () => {
    expect(shiftDate('2026-12-31', 1)).toBe('2027-01-01')
  })

  it('+7 天（一周）', () => {
    expect(shiftDate('2026-08-15', 7)).toBe('2026-08-22')
  })
})

describe('dateLabel', () => {
  it('2026-08-15 周六', () => {
    expect(dateLabel('2026-08-15')).toBe('2026-08-15 周六')
  })

  it('2026-08-10 周一', () => {
    expect(dateLabel('2026-08-10')).toBe('2026-08-10 周一')
  })

  it('2026-08-16 周日', () => {
    expect(dateLabel('2026-08-16')).toBe('2026-08-16 周日')
  })
})

describe('sourceBadge', () => {
  it('rail → 周任务', () => {
    expect(sourceBadge('rail')).toBe('周任务')
  })

  it('habit → 固定', () => {
    expect(sourceBadge('habit')).toBe('固定')
  })

  it('template → 模板', () => {
    expect(sourceBadge('template')).toBe('模板')
  })

  it('project → 项目（阶段4 预先映射）', () => {
    expect(sourceBadge('project')).toBe('项目')
  })

  it('reminder → 提醒（阶段4 预先映射）', () => {
    expect(sourceBadge('reminder')).toBe('提醒')
  })

  it('manual → null（无徽标）', () => {
    expect(sourceBadge('manual')).toBeNull()
  })

  it('deferred → null（顺延区已有徽章）', () => {
    expect(sourceBadge('deferred')).toBeNull()
  })
})

describe('isHistoryDate', () => {
  it('昨天 = 历史', () => {
    expect(isHistoryDate('2026-08-14', TODAY)).toBe(true)
  })

  it('今天 = 非历史', () => {
    expect(isHistoryDate('2026-08-15', TODAY)).toBe(false)
  })

  it('明天 = 非历史', () => {
    expect(isHistoryDate('2026-08-16', TODAY)).toBe(false)
  })

  it('上周 = 历史', () => {
    expect(isHistoryDate('2026-08-08', TODAY)).toBe(true)
  })
})

describe('DEFER_WARN_DAYS', () => {
  it('阈值 = 3', () => {
    expect(DEFER_WARN_DAYS).toBe(3)
  })

  it('N=2 不触发高亮', () => {
    expect(2 < DEFER_WARN_DAYS).toBe(true)
  })

  it('N=3 触发高亮', () => {
    expect(3 >= DEFER_WARN_DAYS).toBe(true)
  })

  it('N=5 触发高亮', () => {
    expect(5 >= DEFER_WARN_DAYS).toBe(true)
  })
})