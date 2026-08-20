import { createRouter, createWebHashHistory, Router, RouteRecordRaw, LocationQueryRaw } from 'vue-router'
import { isValidDate } from '@shared/period'

// ========================================
// 阶段6：路由收口（规格 §5.1）
// - 四个 flow 页为正式入口（name 保持 flow-week/flow-month/flow-day/flow-review）；
// - 旧 /planning/:level、/plan、/review 只保留纯重定向（redirect 函数不含 DB/旧 API 调用），
//   不再注册 PlanningView.vue；
// - 旧查询参数显式转换：daily 的 date→date，weekly 的 date→week，monthly 的 date→month，
//   review 的 week 保留、仅 date 则归一化为 week；其它旧参数（focus/模板/Markdown）不传递。
// ========================================

/** 旧查询里的 date 是否可作真实日期传递（阶段6修复批次 · F3：复用 isValidDate，拒绝 2026-02-31 等） */
function usableDate(query: Record<string, unknown>): string | undefined {
  const date = typeof query.date === 'string' && query.date !== '' ? query.date : undefined
  return date !== undefined && isValidDate(date) ? date : undefined
}

/** 纯重定向逻辑（可单测）：旧规划级别 → 新 flow 页 + 查询参数转换 */
export function planningRedirect(level: string, query: Record<string, unknown>): { path: string; query: LocationQueryRaw } {
  const date = usableDate(query)
  switch (level) {
    case 'daily':
      return date ? { path: '/flow/day', query: { date } } : { path: '/flow/day', query: {} }
    case 'weekly':
      return date ? { path: '/flow/week', query: { week: date } } : { path: '/flow/week', query: {} }
    case 'monthly':
      // 阶段6修复批次 · F3：month 必须为 'YYYY-MM'——旧 URL 传的是 YYYY-MM-DD，
      // 取前 7 位转月；非法日期不固化旧参数，回落 flow 默认值（当月）
      return date ? { path: '/flow/month', query: { month: date.slice(0, 7) } } : { path: '/flow/month', query: {} }
    default:
      return { path: '/flow/day', query: {} }
  }
}

/** 纯重定向逻辑（可单测）：旧复盘路径 → /flow/review；week 保留，仅 date 则归一化为 week */
export function reviewRedirect(query: Record<string, unknown>): { path: string; query: LocationQueryRaw } {
  const weekRaw =
    (typeof query.week === 'string' && query.week !== '' ? query.week : undefined) ??
    (typeof query.date === 'string' && query.date !== '' ? query.date : undefined)
  const week = weekRaw !== undefined && isValidDate(weekRaw) ? weekRaw : undefined
  return week ? { path: '/flow/review', query: { week } } : { path: '/flow/review', query: {} }
}

export const routes: RouteRecordRaw[] = [
  { path: '/', redirect: '/today' },
  {
    path: '/today',
    name: 'today',
    component: () => import('@/views/TodayView.vue'),
  },
  {
    path: '/projects',
    name: 'projects',
    component: () => import('@/views/ProjectsView.vue'),
  },
  {
    path: '/projects/:id',
    name: 'project-detail',
    component: () => import('@/views/ProjectDetailView.vue'),
  },
  {
    path: '/settings',
    name: 'settings',
    component: () => import('@/views/SettingsView.vue'),
  },
  // ===== 任务数据流通重构 · 阶段6：正式入口（侧边栏统一指向） =====
  {
    path: '/flow/week',
    name: 'flow-week',
    component: () => import('@/views/flow/FlowWeekView.vue'),
  },
  {
    path: '/flow/month',
    name: 'flow-month',
    component: () => import('@/views/flow/FlowMonthView.vue'),
  },
  {
    path: '/flow/day',
    name: 'flow-day',
    component: () => import('@/views/flow/FlowDayView.vue'),
  },
  {
    path: '/flow/review',
    name: 'flow-review',
    component: () => import('@/views/flow/FlowReviewView.vue'),
  },
  // ===== 旧路径兼容重定向（只重定向，不加载旧页面；规格 §5.1） =====
  {
    path: '/planning/:level',
    redirect: (to) => planningRedirect(to.params.level as string, to.query as Record<string, unknown>),
  },
  { path: '/plan', redirect: '/flow/day' },
  { path: '/review', redirect: (to) => reviewRedirect(to.query as Record<string, unknown>) },
]

/**
 * 仅浏览器环境创建（createWebHashHistory 依赖 window.location；
 * node 测试环境 import 本模块只为 routes/纯重定向函数，不触发默认路由创建）。
 */
export function createAppRouter(): Router {
  return createRouter({ history: createWebHashHistory(), routes })
}
