import { describe, it, expect } from 'vitest'
import { Todo } from '../src/shared/types'
import { labelTodoSource } from '../src/main/services/todoSource'

const TODAY = '2026-08-09'
const YDAY = '2026-08-08'

function makeTodo(overrides: Partial<Todo> = {}): Todo {
  return {
    id: 't1',
    content: '任务',
    status: 'todo',
    planDate: TODAY,
    projectId: null,
    sourcePlanId: null,
    parentTaskRef: null,
    sourceInvalid: false,
    sourceTaskTid: null,
    isDeleted: false,
    deletedAt: null,
    completedAt: null,
    createdAt: '2026-08-09T00:00:00.000Z',
    updatedAt: '2026-08-09T00:00:00.000Z',
    ...overrides,
  }
}

describe('labelTodoSource F3.2-2 出处标注规则', () => {
  // v0.2修复计划·§3.5：规则0 parentTaskRef 优先于其他规则（主进程已解析注入 parentTask）
  it('规则0：parentTaskRef 优先 → ← {层级}·{content}', () => {
    const weekly = { level: 'weekly' as const, planId: 'w1', planDate: '2026-08-03', tid: 'a1b2c3', content: '写周报', invalid: false }
    // 即使有 projectId/sourcePlanId，上级任务链标签仍优先
    expect(labelTodoSource(makeTodo({ projectId: 'p1', sourcePlanId: 's1' }), { today: TODAY, parentTask: weekly }))
      .toBe('← 周任务·写周报')
    expect(labelTodoSource(makeTodo({}), { today: TODAY, parentTask: { ...weekly, level: 'monthly', content: '月目标' } }))
      .toBe('← 月任务·月目标')
    expect(labelTodoSource(makeTodo({}), { today: TODAY, parentTask: { ...weekly, level: 'daily', content: '日计划' } }))
      .toBe('← 日任务·日计划')
  })

  it('规则0：parentTask.invalid → 来源已删（done 历史失效标注）', () => {
    expect(labelTodoSource(makeTodo({ status: 'done' }), {
      today: TODAY,
      parentTask: { level: 'weekly', planId: 'w1', planDate: null, tid: 'a1b2c3', content: '写周报', invalid: true },
    })).toBe('来源已删')
  })

  it('规则1：📌 开头 → 周期提醒（无日期）', () => {
    expect(labelTodoSource(makeTodo({ content: '📌 做周统筹 · 第 32 周' }), { today: TODAY }))
      .toBe('周期提醒')
    expect(labelTodoSource(makeTodo({ content: '  📌 缩进周期提醒' }), { today: TODAY }))
      .toBe('周期提醒')
  })

  it('规则2：projectId + 项目名 → 项目·{name}', () => {
    expect(labelTodoSource(makeTodo({ projectId: 'p1' }), { today: TODAY, projectName: '读书会' }))
      .toBe('项目·读书会')
  })

  it('规则3：sourcePlanId + 日计划日期 → 日规划·{date}', () => {
    expect(labelTodoSource(makeTodo({ sourcePlanId: 'plan1' }), { today: TODAY, sourcePlanDate: '2026-08-09' }))
      .toBe('日规划·2026-08-09')
  })

  it('规则4：planDate 早于今天且未完成 → 顺延·{date}', () => {
    expect(labelTodoSource(makeTodo({ planDate: YDAY, status: 'todo' }), { today: TODAY }))
      .toBe('顺延·2026-08-08')
  })

  it('规则5：其余 → 手动·{planDate}', () => {
    expect(labelTodoSource(makeTodo({}), { today: TODAY })).toBe('手动·2026-08-09')
    expect(labelTodoSource(makeTodo({ planDate: YDAY, status: 'done' }), { today: TODAY }))
      .toBe('手动·2026-08-08') // 已完成旧任务不标顺延
    expect(labelTodoSource(makeTodo({ planDate: null }), { today: TODAY }))
      .toBe('手动·无日期')
  })

  it('优先级：📌 最高（即使有 projectId/sourcePlanId）', () => {
    expect(labelTodoSource(makeTodo({ content: '📌 做周统筹', projectId: 'p1', sourcePlanId: 's1' }), {
      today: TODAY, projectName: '项目A', sourcePlanDate: '2026-08-09',
    })).toBe('周期提醒')
  })

  it('降级：项目已删除（name 解析为 null）→ 落到后续规则', () => {
    expect(labelTodoSource(makeTodo({ projectId: 'p-dead' }), { today: TODAY, projectName: null }))
      .toBe('手动·2026-08-09')
    expect(labelTodoSource(makeTodo({ projectId: 'p-dead', planDate: YDAY, status: 'todo' }), {
      today: TODAY, projectName: null,
    })).toBe('顺延·2026-08-08')
  })

  it('降级：计划已删除（sourcePlanDate 为 null）→ 顺延/手动', () => {
    expect(labelTodoSource(makeTodo({ sourcePlanId: 'plan-dead', planDate: YDAY, status: 'todo' }), {
      today: TODAY, sourcePlanDate: null,
    })).toBe('顺延·2026-08-08')
  })

  it('legacy 存量 todo（sourcePlanId=NULL 且 projectId=NULL）→ 手动/顺延', () => {
    expect(labelTodoSource(makeTodo({ sourcePlanId: null, projectId: null }), { today: TODAY }))
      .toBe('手动·2026-08-09')
  })

  it('第二轮实测·问题②：sourceInvalid → 来源已删（同级 done orphan，即使 plan 仍存在）', () => {
    expect(labelTodoSource(
      makeTodo({ sourcePlanId: 'plan1', sourceInvalid: true, status: 'done' }),
      { today: TODAY, sourcePlanDate: '2026-08-09' },
    )).toBe('来源已删')
  })

  it('第二轮实测·问题②：sourceInvalid=false 时规则3 正常（不受新规则干扰）', () => {
    expect(labelTodoSource(makeTodo({ sourcePlanId: 'plan1' }), { today: TODAY, sourcePlanDate: '2026-08-09' }))
      .toBe('日规划·2026-08-09')
  })
})
