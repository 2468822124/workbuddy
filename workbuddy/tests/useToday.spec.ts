import { describe, it, expect } from 'vitest'
import { localToday, boardSummary } from '../src/renderer/src/composables/useToday'
import type { DayBoardEntry } from '@shared/flowTypes'

// 阶段4 规格 §8.11：今日页聚合器纯函数单测（本地日期 / 聚合计数）

describe('localToday', () => {
  it('格式 YYYY-MM-DD 且与本地日期一致（不用 UTC 切片防时区漂移）', () => {
    const s = localToday()
    expect(/^\d{4}-\d{2}-\d{2}$/.test(s)).toBe(true)
    const [y, m, d] = s.split('-').map(Number)
    const now = new Date()
    expect(y).toBe(now.getFullYear())
    expect(m).toBe(now.getMonth() + 1)
    expect(d).toBe(now.getDate())
  })
})

function makeEntry(overrides: Partial<DayBoardEntry>): DayBoardEntry {
  return {
    id: 1,
    date: '2026-08-16',
    title: 't',
    source: 'manual',
    locked: false,
    weekInstanceId: null,
    projectId: null,
    reminderKey: null,
    templateId: null,
    note: null,
    skippedAt: null,
    isDeleted: false,
    deletedAt: null,
    createdAt: '',
    updatedAt: '',
    done: false,
    deferredCount: 0,
    displayTitle: 't',
    sourceHref: null,
    ...overrides,
  }
}

describe('boardSummary（今日页聚合计数）', () => {
  it('总/完成/顺延三项计数正确', () => {
    const entries = [
      makeEntry({ id: 1 }),
      makeEntry({ id: 2, done: true }),
      makeEntry({ id: 3, deferredCount: 2 }),
      makeEntry({ id: 4, done: true, deferredCount: 5 }),
    ]
    expect(boardSummary(entries)).toEqual({ total: 4, doneCount: 2, deferredCount: 2 })
  })

  it('空列表全零（空态展示依据）', () => {
    expect(boardSummary([])).toEqual({ total: 0, doneCount: 0, deferredCount: 0 })
  })
})
