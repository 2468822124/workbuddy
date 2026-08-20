import { describe, expect, test, beforeEach, vi } from 'vitest'
import {
  parseReviewWeekQuery,
  formatCompletionRate,
  reviewWeekLabel,
  isCurrentReviewWeek,
  carryTarget,
  monthKeyOf,
  useFlowReview,
} from '../src/renderer/src/composables/useFlowReview'

const TODAY = '2026-08-16' // 周日；本周一 = 2026-08-10
const CURRENT_WEEK = '2026-08-10'

describe('parseReviewWeekQuery', () => {
  test('缺省/非法 → 本周一', () => {
    expect(parseReviewWeekQuery(undefined, TODAY)).toBe(CURRENT_WEEK)
    expect(parseReviewWeekQuery('abc', TODAY)).toBe(CURRENT_WEEK)
    expect(parseReviewWeekQuery('2026-13-99', TODAY)).toBe(CURRENT_WEEK)
    expect(parseReviewWeekQuery(42, TODAY)).toBe(CURRENT_WEEK)
  })

  test('任意周内日期 → 归一到周一起始', () => {
    expect(parseReviewWeekQuery('2026-08-12', TODAY)).toBe('2026-08-10')
  })

  test("真实日历非法日（'2026-02-31'，F4）→ 本周一（防 Date.UTC 进位成 03-02 周）", () => {
    expect(parseReviewWeekQuery('2026-02-31', TODAY)).toBe(CURRENT_WEEK)
    expect(parseReviewWeekQuery('2026-02-29', TODAY)).toBe(CURRENT_WEEK) // 2026 平年
  })

  test('未来周 → 钳制回本周（复盘仅本周/历史周）', () => {
    expect(parseReviewWeekQuery('2026-08-17', TODAY)).toBe(CURRENT_WEEK)
    expect(parseReviewWeekQuery('2026-09-01', TODAY)).toBe(CURRENT_WEEK)
  })

  test('历史周原样归一', () => {
    expect(parseReviewWeekQuery('2026-08-03', TODAY)).toBe('2026-08-03')
  })

  test('数组查询（vue-router 形式）取首项', () => {
    expect(parseReviewWeekQuery(['2026-08-03'], TODAY)).toBe('2026-08-03')
    expect(parseReviewWeekQuery(['abc', '2026-08-03'], TODAY)).toBe(CURRENT_WEEK)
  })
})

describe('formatCompletionRate', () => {
  test('null → 破折号占位', () => {
    expect(formatCompletionRate(null)).toBe('—')
  })

  test('比率 → 四舍五入百分整数', () => {
    expect(formatCompletionRate(1)).toBe('100%')
    expect(formatCompletionRate(0.75)).toBe('75%')
    expect(formatCompletionRate(2 / 3)).toBe('67%')
    expect(formatCompletionRate(0)).toBe('0%')
  })
})

describe('reviewWeekLabel', () => {
  test('W 号 + 周区间（结尾去年份）', () => {
    expect(reviewWeekLabel('2026-08-10')).toBe('W33 · 2026-08-10 ~ 08-16')
  })
})

describe('isCurrentReviewWeek', () => {
  test('本周 → true；历史/未来 → false', () => {
    expect(isCurrentReviewWeek('2026-08-10', TODAY)).toBe(true)
    expect(isCurrentReviewWeek('2026-08-03', TODAY)).toBe(false)
    expect(isCurrentReviewWeek('2026-08-17', TODAY)).toBe(false)
  })
})

describe('carryTarget', () => {
  test('源周 + 7 天（下周一）', () => {
    expect(carryTarget('2026-08-03')).toBe('2026-08-10')
    expect(carryTarget('2026-08-10')).toBe('2026-08-17')
  })
})

describe('monthKeyOf', () => {
  test('周起始日 → 所在月 YYYY-MM（规格 §9.3）', () => {
    expect(monthKeyOf('2026-08-10')).toBe('2026-08')
    expect(monthKeyOf('2026-12-28')).toBe('2026-12')
  })
})

// ===== composable 感想读写（window.api mock；node 无 Electron preload） =====

interface JournalResult {
  ok: boolean
  data?: { content: string } | null
  error?: { code: string; message: string }
}

interface ApiMock {
  flow: {
    reviewBoard: ReturnType<typeof vi.fn>
    instance: { carryNext: ReturnType<typeof vi.fn> }
    journal: {
      get: ReturnType<typeof vi.fn>
      save: ReturnType<typeof vi.fn>
    }
  }
}

function mockApi(): ApiMock {
  const api: ApiMock = {
    flow: {
      reviewBoard: vi.fn(),
      instance: { carryNext: vi.fn() },
      journal: {
        get: vi.fn(),
        save: vi.fn(),
      },
    },
  }
  ;(globalThis as unknown as { window: unknown }).window = { api }
  return api
}

const okData = (content: string): JournalResult => ({ ok: true, data: { content } })
const okNull = (): JournalResult => ({ ok: true, data: null })
const fail = (message: string): JournalResult => ({ ok: false, error: { code: 'INTERNAL', message } })

describe('useFlowReview 感想读写', () => {
  beforeEach(() => {
    mockApi()
  })

  test('loadJournals：周/月并行、独立降级（周失败只影响周块）', async () => {
    const api = (globalThis as unknown as { window: { api: ApiMock } }).window.api
    api.flow.journal.get.mockImplementation((scope: string) =>
      scope === 'week'
        ? Promise.resolve(fail('读坏了'))
        : Promise.resolve(okData('月内容')),
    )

    const fr = useFlowReview()
    await fr.loadJournals('2026-08-10')

    expect(api.flow.journal.get).toHaveBeenCalledWith('week', '2026-08-10')
    expect(api.flow.journal.get).toHaveBeenCalledWith('month', '2026-08')
    expect(fr.weekError.value).toBe('读坏了')
    expect(fr.weekContent.value).toBeNull()
    expect(fr.monthError.value).toBeNull()
    expect(fr.monthContent.value).toBe('月内容')
  })

  test('loadJournals：空库 → content null 无错误', async () => {
    const api = (globalThis as unknown as { window: { api: ApiMock } }).window.api
    api.flow.journal.get.mockResolvedValue(okNull())

    const fr = useFlowReview()
    await fr.loadJournals('2026-08-10')

    expect(fr.weekContent.value).toBeNull()
    expect(fr.monthContent.value).toBeNull()
    expect(fr.weekError.value).toBeNull()
    expect(fr.monthError.value).toBeNull()
  })

  test('saveJournal 成功：携带正确 key、更新 content、info 反馈', async () => {
    const api = (globalThis as unknown as { window: { api: ApiMock } }).window.api
    api.flow.journal.save.mockResolvedValue(okData('周内容'))

    const fr = useFlowReview()
    fr.weekStart.value = '2026-08-10'
    await fr.saveJournal('week', '周内容')

    expect(api.flow.journal.save).toHaveBeenCalledWith('week', '2026-08-10', '周内容')
    expect(fr.weekContent.value).toBe('周内容')
    expect(fr.info.value).toBe('已保存')
    expect(fr.weekError.value).toBeNull()
  })

  test('saveJournal 月感想：periodKey = weekStart 所在月', async () => {
    const api = (globalThis as unknown as { window: { api: ApiMock } }).window.api
    api.flow.journal.save.mockResolvedValue(okData('m'))

    const fr = useFlowReview()
    fr.weekStart.value = '2026-08-10'
    await fr.saveJournal('month', 'm')

    expect(api.flow.journal.save).toHaveBeenCalledWith('month', '2026-08', 'm')
    expect(fr.monthContent.value).toBe('m')
  })

  test('saveJournal 失败：块内错误 + 父级 content 不变（textarea 草稿保真）', async () => {
    const api = (globalThis as unknown as { window: { api: ApiMock } }).window.api
    api.flow.journal.save.mockResolvedValue(fail('磁盘满'))

    const fr = useFlowReview()
    fr.weekStart.value = '2026-08-10'
    fr.weekContent.value = '旧内容'
    await fr.saveJournal('week', '新草稿')

    expect(fr.weekError.value).toBe('磁盘满')
    // 父级 content 未更新 → ReviewJournal watch 不触发 → textarea 保留「新草稿」
    expect(fr.weekContent.value).toBe('旧内容')
    expect(fr.info.value).toBeNull()
    expect(fr.savingWeek.value).toBe(false)
  })

  test('saveJournal 请求期间 saving=true（保存按钮防双击）', async () => {
    const api = (globalThis as unknown as { window: { api: ApiMock } }).window.api
    let resolveSave!: (r: JournalResult) => void
    api.flow.journal.save.mockReturnValue(new Promise<JournalResult>(r => { resolveSave = r }))

    const fr = useFlowReview()
    fr.weekStart.value = '2026-08-10'
    const p = fr.saveJournal('week', '内容')

    expect(fr.savingWeek.value).toBe(true)
    resolveSave(okData('内容'))
    await p
    expect(fr.savingWeek.value).toBe(false)
    expect(fr.weekContent.value).toBe('内容')
  })
})
