// ========================================
// 阶段6 · 步骤8：路由切换与兼容重定向单测（规格 §8 步骤8 / §5.1）
// - planningRedirect / reviewRedirect 纯函数：query 转换 + 未知 level 降级 + 旧参数丢弃
// - 真实 router（createMemoryHistory）验证旧路径只发生一次重定向、不加载旧页面
// ========================================

import { describe, expect, test } from 'vitest'
import { createRouter, createMemoryHistory } from 'vue-router'
import { planningRedirect, reviewRedirect, routes } from '../src/renderer/src/router/index'

describe('planningRedirect（旧规划级别 → flow 页 + query 转换）', () => {
  test('daily：date 直传 → /flow/day', () => {
    expect(planningRedirect('daily', { date: '2026-08-10' })).toEqual({ path: '/flow/day', query: { date: '2026-08-10' } })
  })

  test('daily：无 date → /flow/day 空 query（走新页默认日期）', () => {
    expect(planningRedirect('daily', {})).toEqual({ path: '/flow/day', query: {} })
  })

  test('weekly：date 转 week → /flow/week', () => {
    expect(planningRedirect('weekly', { date: '2026-08-10' })).toEqual({ path: '/flow/week', query: { week: '2026-08-10' } })
  })

  test('monthly：date 转 month（YYYY-MM-DD 取前 7 位）→ /flow/month', () => {
    expect(planningRedirect('monthly', { date: '2026-08-10' })).toEqual({ path: '/flow/month', query: { month: '2026-08' } })
  })

  test('未知 level → 降级落日规划 /flow/day', () => {
    expect(planningRedirect('yearly', { date: '2026-08-10' })).toEqual({ path: '/flow/day', query: {} })
    expect(planningRedirect('', {})).toEqual({ path: '/flow/day', query: {} })
  })

  test('旧 focus/模板/Markdown 参数不传递（除日期外白名单过滤）', () => {
    const r = planningRedirect('daily', { date: '2026-08-10', focus: 'x', template: 'y', content: '# md' })
    expect(r.query).toEqual({ date: '2026-08-10' })
  })

  test('空字符串 date 视为缺省（不传非法日期）', () => {
    expect(planningRedirect('weekly', { date: '' })).toEqual({ path: '/flow/week', query: {} })
  })

  // 阶段6修复批次 · F3：真实日历校验——静默进位日期（2026-02-31）不得固化进 query，
  // 回落 flow 默认值（空 query → 新页默认今天/本周/当月）
  test('daily：非法日期 2026-02-31 → 空 query（回落默认日期）', () => {
    expect(planningRedirect('daily', { date: '2026-02-31' })).toEqual({ path: '/flow/day', query: {} })
  })

  test('weekly：非法日期 2026-02-31 → 空 query（回落默认周）', () => {
    expect(planningRedirect('weekly', { date: '2026-02-31' })).toEqual({ path: '/flow/week', query: {} })
  })

  test('monthly：非法日期 2026-02-31 → 空 query（回落当月）', () => {
    expect(planningRedirect('monthly', { date: '2026-02-31' })).toEqual({ path: '/flow/month', query: {} })
  })
})

describe('reviewRedirect（旧复盘 → /flow/review）', () => {
  test('week 保留 → /flow/review', () => {
    expect(reviewRedirect({ week: '2026-08-10' })).toEqual({ path: '/flow/review', query: { week: '2026-08-10' } })
  })

  test('仅 date → 归一化为 week', () => {
    expect(reviewRedirect({ date: '2026-08-10' })).toEqual({ path: '/flow/review', query: { week: '2026-08-10' } })
  })

  test('week 优先于 date（同时存在时以 week 为准）', () => {
    expect(reviewRedirect({ week: '2026-08-03', date: '2026-08-10' })).toEqual({ path: '/flow/review', query: { week: '2026-08-03' } })
  })

  test('无参数 → 空 query（走默认周）；旧 focus 等参数丢弃', () => {
    expect(reviewRedirect({})).toEqual({ path: '/flow/review', query: {} })
    expect(reviewRedirect({ focus: 'x', date: '' })).toEqual({ path: '/flow/review', query: {} })
  })

  // 阶段6修复批次 · F3：真实日历校验
  test('非法日期 2026-02-31 → 空 query（回落默认周）', () => {
    expect(reviewRedirect({ week: '2026-02-31' })).toEqual({ path: '/flow/review', query: {} })
    expect(reviewRedirect({ date: '2026-02-31' })).toEqual({ path: '/flow/review', query: {} })
  })
})

describe('真实路由：旧路径只重定向、不加载旧页面（规格 §9.1）', () => {
  test('/planning/daily?date=... → 单次重定向到 /flow/day', async () => {
    const router = createRouter({ history: createMemoryHistory(), routes })
    await router.push('/planning/daily?date=2026-08-10')
    await router.isReady()
    expect(router.currentRoute.value.path).toBe('/flow/day')
    expect(router.currentRoute.value.query).toEqual({ date: '2026-08-10' })
    expect(router.currentRoute.value.name).toBe('flow-day')
  })

  test('/planning/weekly?date=... → /flow/week', async () => {
    const router = createRouter({ history: createMemoryHistory(), routes })
    await router.push('/planning/weekly?date=2026-08-10')
    await router.isReady()
    expect(router.currentRoute.value.path).toBe('/flow/week')
    expect(router.currentRoute.value.query).toEqual({ week: '2026-08-10' })
  })

  test('/planning/monthly?date=... → /flow/month（date 转 YYYY-MM）', async () => {
    const router = createRouter({ history: createMemoryHistory(), routes })
    await router.push('/planning/monthly?date=2026-08-10')
    await router.isReady()
    expect(router.currentRoute.value.path).toBe('/flow/month')
    expect(router.currentRoute.value.query).toEqual({ month: '2026-08' })
  })

  // 阶段6修复批次 · F3：旧 monthly URL 传 YYYY-MM-DD 是历史缺陷——非当前月日期不得错误回落当前月
  test('/planning/monthly?date=2026-02-31（真实日历非法）→ /flow/month 空 query（回落当月）', async () => {
    const router = createRouter({ history: createMemoryHistory(), routes })
    await router.push('/planning/monthly?date=2026-02-31')
    await router.isReady()
    expect(router.currentRoute.value.path).toBe('/flow/month')
    expect(router.currentRoute.value.query).toEqual({})
  })

  test('/planning/未知级别 → 降级 /flow/day', async () => {
    const router = createRouter({ history: createMemoryHistory(), routes })
    await router.push('/planning/yearly')
    await router.isReady()
    expect(router.currentRoute.value.path).toBe('/flow/day')
  })

  test('/plan → /flow/day', async () => {
    const router = createRouter({ history: createMemoryHistory(), routes })
    await router.push('/plan')
    await router.isReady()
    expect(router.currentRoute.value.path).toBe('/flow/day')
  })

  test('/review?date=... → /flow/review（date 归一化 week）', async () => {
    const router = createRouter({ history: createMemoryHistory(), routes })
    await router.push('/review?date=2026-08-10')
    await router.isReady()
    expect(router.currentRoute.value.path).toBe('/flow/review')
    expect(router.currentRoute.value.query).toEqual({ week: '2026-08-10' })
  })

  test('/flow/day 直达仍可用（正式入口）', async () => {
    const router = createRouter({ history: createMemoryHistory(), routes })
    await router.push('/flow/day')
    await router.isReady()
    expect(router.currentRoute.value.name).toBe('flow-day')
  })
})
