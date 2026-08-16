import { createRouter, createWebHashHistory } from 'vue-router'

const router = createRouter({
  history: createWebHashHistory(),
  routes: [
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
      path: '/planning/:level',
      name: 'planning',
      component: () => import('@/views/PlanningView.vue'),
      props: true,
    },
    // 子阶段5：旧路由重定向到日规划（保兼容）
    { path: '/plan', redirect: '/planning/daily' },
    { path: '/review', redirect: '/planning/daily' },
    {
      path: '/settings',
      name: 'settings',
      component: () => import('@/views/SettingsView.vue'),
    },
    // 任务数据流通重构 · 阶段2：新路由不进侧边栏（阶段6 统一切换），URL 直达实测
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
    // 任务数据流通重构 · 阶段3：日规划页（/flow/day），不进侧边栏（阶段6 统一切换），URL 直达实测
    {
      path: '/flow/day',
      name: 'flow-day',
      component: () => import('@/views/flow/FlowDayView.vue'),
    },
  ],
})

export default router
