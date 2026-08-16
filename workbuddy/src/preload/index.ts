import { contextBridge, ipcRenderer } from 'electron'
import { IPC, Result } from '@shared/ipc'
import { Setting, Todo, TodoWithSource, Project, NewsItem, ChatResult, Template, TemplateType, Plan, Review, PlanGuideResult, ReviewDraftResult, PlanTasksByPeriodResult, ReviewSummaryResult, TaskChainItem, PrepareTaskLinkResult } from '@shared/types'
import { FlowFixedDef, FlowWeekInstance, FlowDayEntry, FlowVoucher, FlowMonthGoal, FlowWeekFocus, FlowPlanTemplate, FlowJournal, WeekBoard, DayBoard } from '@shared/flowTypes'

const api = {
  settings: {
    get(key: string): Promise<Result<Setting>> {
      return ipcRenderer.invoke(IPC.SETTINGS_GET, key)
    },
    getAll(): Promise<Result<Setting[]>> {
      return ipcRenderer.invoke(IPC.SETTINGS_GET_ALL)
    },
    set(key: string, value: string): Promise<Result<Setting>> {
      return ipcRenderer.invoke(IPC.SETTINGS_SET, key, value)
    },
  },
  db: {
    health(): Promise<Result<{ ok: boolean; schemaVersion: number; readonly: boolean }>> {
      return ipcRenderer.invoke(IPC.DB_HEALTH)
    },
  },
  app: {
    isFirstLaunch(): Promise<Result<boolean>> {
      return ipcRenderer.invoke(IPC.APP_FIRST_LAUNCH)
    },
  },
  news: {
    list(limit?: number): Promise<Result<NewsItem[]>> {
      return ipcRenderer.invoke(IPC.NEWS_LIST, limit)
    },
    refresh(): Promise<Result<{ count: number; ok: boolean }>> {
      return ipcRenderer.invoke(IPC.NEWS_REFRESH)
    },
  },
  morning: {
    status(): Promise<Result<{ ranToday: boolean; lastRun: string; inWindow: boolean }>> {
      return ipcRenderer.invoke(IPC.MORNING_STATUS)
    },
  },
  todos: {
    today(date?: string): Promise<Result<Todo[]>> {
      return ipcRenderer.invoke(IPC.TODOS_TODAY, date)
    },
    // F3.2-2：今日+逾期聚合 + sourceLabel 出处标注
    withSource(date?: string): Promise<Result<{ today: TodoWithSource[]; overdue: TodoWithSource[] }>> {
      return ipcRenderer.invoke(IPC.TODOS_WITH_SOURCE, date)
    },
    overdue(date?: string): Promise<Result<Todo[]>> {
      return ipcRenderer.invoke(IPC.TODOS_OVERDUE, date)
    },
    toggle(id: string): Promise<Result<Todo>> {
      return ipcRenderer.invoke(IPC.TODOS_TOGGLE, id)
    },
    rescheduleToday(id: string): Promise<Result<Todo>> {
      return ipcRenderer.invoke(IPC.TODOS_RESCHEDULE_TODAY, id)
    },
    quickCreate(content: string): Promise<Result<Todo>> {
      return ipcRenderer.invoke(IPC.TODOS_QUICK_CREATE, content)
    },
    byProject(projectId: string): Promise<Result<Todo[]>> {
      return ipcRenderer.invoke(IPC.TODOS_BY_PROJECT, projectId)
    },
    // 子阶段5：planDate 范围查询（月图表确定性数据源）
    findInRange(data: { from: string; to: string }): Promise<Result<Todo[]>> {
      return ipcRenderer.invoke(IPC.TODOS_FIND_IN_RANGE, data)
    },
    create(data: { content: string; planDate?: string | null; projectId: string }): Promise<Result<Todo>> {
      return ipcRenderer.invoke(IPC.TODOS_CREATE, data)
    },
    update(data: { id: string; content?: string; planDate?: string | null }): Promise<Result<Todo>> {
      return ipcRenderer.invoke(IPC.TODOS_UPDATE, data)
    },
    delete(id: string): Promise<Result<boolean>> {
      return ipcRenderer.invoke(IPC.TODOS_DELETE, id)
    },
  },
  projects: {
    list(): Promise<Result<Project[]>> { return ipcRenderer.invoke(IPC.PROJECTS_LIST) },
    get(id: string): Promise<Result<Project>> { return ipcRenderer.invoke(IPC.PROJECTS_GET, id) },
    create(data: { name: string; description?: string; status?: string }): Promise<Result<Project>> { return ipcRenderer.invoke(IPC.PROJECTS_CREATE, data) },
    update(data: { id: string; name?: string; description?: string; status?: string }): Promise<Result<Project>> { return ipcRenderer.invoke(IPC.PROJECTS_UPDATE, data) },
    delete(id: string): Promise<Result<boolean>> { return ipcRenderer.invoke(IPC.PROJECTS_DELETE, id) },
  },
  llm: {
    test(cfg: { baseUrl: string; model: string; apiKey: string }): Promise<Result<{ ok: boolean; message?: string; latencyMs?: number }>> {
      return ipcRenderer.invoke(IPC.LLM_TEST, cfg)
    },
    search(query: string): Promise<Result<ChatResult>> {
      return ipcRenderer.invoke(IPC.LLM_SEARCH, query)
    },
  },
  data: {
    export(): Promise<Result<{ path: string }>> { return ipcRenderer.invoke(IPC.DATA_EXPORT) },
    import(): Promise<Result<{ ok: boolean; counts?: Record<string, number>; message?: string }>> { return ipcRenderer.invoke(IPC.DATA_IMPORT) },
  },
  templates: {
    list(type?: TemplateType): Promise<Result<Template[]>> {
      return ipcRenderer.invoke(IPC.TEMPLATES_LIST, { type })
    },
    get(id: string): Promise<Result<Template>> {
      return ipcRenderer.invoke(IPC.TEMPLATES_GET, { id })
    },
    upsert(data: {
      id?: string; name?: string | null; type?: string | null;
      content?: string | null; isDefault?: boolean
    }): Promise<Result<Template>> {
      return ipcRenderer.invoke(IPC.TEMPLATES_UPSERT, data)
    },
    delete(id: string): Promise<Result<{ ok: boolean }>> {
      return ipcRenderer.invoke(IPC.TEMPLATES_DELETE, { id })
    },
  },
  plans: {
    get(id: string): Promise<Result<Plan | null>> {
      return ipcRenderer.invoke(IPC.PLAN_GET, { id })
    },
    list(opts?: { from?: string; to?: string; type?: string }): Promise<Result<Plan[]>> {
      return ipcRenderer.invoke(IPC.PLAN_LIST, opts)
    },
    byDate(date: string): Promise<Result<Plan | null>> {
      return ipcRenderer.invoke(IPC.PLAN_BY_DATE, { date })
    },
    // v0.2修复计划·§3.6：RunSyncResult 含跨级删除分流计数（cascadeRemovedOpen/cascadeInvalidatedDone）
    create(data: { date: string; type?: string; content: string; templateId?: string }): Promise<Result<{ plan: Plan; generatedCount: number; removedOpenCount: number; keptDoneCount: number; cascadeRemovedOpenCount: number; cascadeInvalidatedDoneCount: number }>> {
      return ipcRenderer.invoke(IPC.PLAN_CREATE, data)
    },
    update(data: { id: string; content: string; date?: string; type?: string }): Promise<Result<{ plan: Plan; generatedCount: number; removedOpenCount: number; keptDoneCount: number; cascadeRemovedOpenCount: number; cascadeInvalidatedDoneCount: number }>> {
      return ipcRenderer.invoke(IPC.PLAN_UPDATE, data)
    },
    delete(id: string): Promise<Result<{ ok: boolean }>> {
      return ipcRenderer.invoke(IPC.PLAN_DELETE, { id })
    },
    guideQuestion(data: { templateId: string; filled: string }): Promise<Result<PlanGuideResult>> {
      return ipcRenderer.invoke(IPC.PLAN_GUIDE, data)
    },
    // 子阶段5：按 type+期起始查（date=期起始，前端用 periodStartFor 算）
    getByPeriod(data: { type: string; date: string }): Promise<Result<Plan | null>> {
      return ipcRenderer.invoke(IPC.PLAN_GET_BY_PERIOD, data)
    },
    listTasksByPeriod(data: { type: string; date: string }): Promise<Result<PlanTasksByPeriodResult>> {
      return ipcRenderer.invoke(IPC.PLAN_LIST_TASKS_BY_PERIOD, data)
    },
    // v0.2修复计划·§3.4：匹配键 text→tid（改名后关联存活）
    markTaskConsumed(data: { planId: string; tid: string }): Promise<Result<Plan>> {
      return ipcRenderer.invoke(IPC.PLAN_MARK_TASK_CONSUMED, data)
    },
    markTaskUnconsumed(data: { planId: string; tid: string }): Promise<Result<Plan>> {
      return ipcRenderer.invoke(IPC.PLAN_MARK_TASK_UNCONSUMED, data)
    },
    // v0.2修复计划·§3.4：pick 预关联（惰性分配 parent tid + 分配 child tid）
    prepareTaskLink(data: { parentPlanId: string; taskText: string; taskTid?: string }): Promise<Result<PrepareTaskLinkResult>> {
      return ipcRenderer.invoke(IPC.PLAN_PREPARE_TASK_LINK, data)
    },
  },
  // v0.2修复计划·§3.5：来源链逐级解析（task tid 上溯至源头）
  tasks: {
    resolveChain(data: { tid: string }): Promise<Result<TaskChainItem[]>> {
      return ipcRenderer.invoke(IPC.TASK_RESOLVE_CHAIN, data)
    },
  },
  reviews: {
    get(id: string): Promise<Result<Review | null>> {
      return ipcRenderer.invoke(IPC.REVIEW_GET, { id })
    },
    list(opts?: { from?: string; to?: string; type?: string }): Promise<Result<Review[]>> {
      return ipcRenderer.invoke(IPC.REVIEW_LIST, opts)
    },
    byDate(date: string, type?: string): Promise<Result<Review | null>> {
      return ipcRenderer.invoke(IPC.REVIEW_BY_DATE, { date, type })
    },
    create(data: { date: string; type?: string; content: string; linkedProjectIds?: string[]; templateId?: string }): Promise<Result<Review>> {
      return ipcRenderer.invoke(IPC.REVIEW_CREATE, data)
    },
    update(data: { id: string; content: string; date?: string; type?: string }): Promise<Result<Review>> {
      return ipcRenderer.invoke(IPC.REVIEW_UPDATE, data)
    },
    delete(id: string): Promise<Result<{ ok: boolean }>> {
      return ipcRenderer.invoke(IPC.REVIEW_DELETE, { id })
    },
    summarizeDraft(data: { date: string }): Promise<Result<ReviewDraftResult>> {
      return ipcRenderer.invoke(IPC.REVIEW_SUMMARIZE, data)
    },
    // 子阶段5：AI 周/月复盘（date=期起始）
    summarizeWeekly(data: { date: string }): Promise<Result<ReviewSummaryResult>> {
      return ipcRenderer.invoke(IPC.REVIEW_SUMMARIZE_WEEKLY, data)
    },
    summarizeMonthly(data: { date: string }): Promise<Result<ReviewSummaryResult>> {
      return ipcRenderer.invoke(IPC.REVIEW_SUMMARIZE_MONTHLY, data)
    },
  },
  // ===== 任务数据流通重构（阶段1：flow_ 新任务域） =====
  flow: {
    weekBoard(weekStart: string): Promise<Result<WeekBoard>> {
      return ipcRenderer.invoke(IPC.FLOW_WEEK_BOARD, { weekStart })
    },
    dayBoard(date: string): Promise<Result<DayBoard>> {
      return ipcRenderer.invoke(IPC.FLOW_DAY_BOARD, { date })
    },
    fixedDefs: {
      list(): Promise<Result<FlowFixedDef[]>> {
        return ipcRenderer.invoke(IPC.FLOW_FIXED_DEFS_LIST)
      },
      save(data: { id?: number; title: string; kind: string; targetCount?: number; weekdayMask?: number; note?: string | null }): Promise<Result<FlowFixedDef>> {
        return ipcRenderer.invoke(IPC.FLOW_FIXED_DEFS_SAVE, data)
      },
      delete(id: number): Promise<Result<{ ok: boolean }>> {
        return ipcRenderer.invoke(IPC.FLOW_FIXED_DEFS_DELETE, { id })
      },
    },
    instance: {
      create(data: { weekStart: string; title: string; kind: string; targetCount?: number }): Promise<Result<FlowWeekInstance>> {
        return ipcRenderer.invoke(IPC.FLOW_INSTANCE_CREATE, data)
      },
      rename(id: number, title: string): Promise<Result<FlowWeekInstance>> {
        return ipcRenderer.invoke(IPC.FLOW_INSTANCE_RENAME, { id, title })
      },
      delete(id: number): Promise<Result<{ ok: boolean }>> {
        return ipcRenderer.invoke(IPC.FLOW_INSTANCE_DELETE, { id })
      },
      skip(id: number): Promise<Result<FlowWeekInstance>> {
        return ipcRenderer.invoke(IPC.FLOW_INSTANCE_SKIP, { id })
      },
      carryNext(id: number, nextWeekStart: string): Promise<Result<FlowWeekInstance>> {
        return ipcRenderer.invoke(IPC.FLOW_INSTANCE_CARRY_NEXT, { id, nextWeekStart })
      },
      manualComplete(id: number, occurredAt?: string, note?: string): Promise<Result<FlowVoucher>> {
        return ipcRenderer.invoke(IPC.FLOW_INSTANCE_MANUAL_COMPLETE, { id, occurredAt, note })
      },
      addSession(id: number): Promise<Result<FlowVoucher>> {
        return ipcRenderer.invoke(IPC.FLOW_INSTANCE_ADD_SESSION, { id })
      },
    },
    voucher: {
      delete(id: number): Promise<Result<{ ok: boolean }>> {
        return ipcRenderer.invoke(IPC.FLOW_VOUCHER_DELETE, { id })
      },
      update(id: number, data: { occurredAt?: string; note?: string | null }): Promise<Result<FlowVoucher>> {
        return ipcRenderer.invoke(IPC.FLOW_VOUCHER_UPDATE, { id, ...data })
      },
    },
    entry: {
      add(data: { date: string; title: string; source: string; locked?: boolean; weekInstanceId?: number | null; projectId?: number | null; reminderKey?: string | null; templateId?: number | null; note?: string | null }): Promise<Result<FlowDayEntry>> {
        return ipcRenderer.invoke(IPC.FLOW_ENTRY_ADD, data)
      },
      toggleCheck(id: number): Promise<Result<{ done: boolean }>> {
        return ipcRenderer.invoke(IPC.FLOW_ENTRY_TOGGLE_CHECK, { id })
      },
      remove(id: number): Promise<Result<{ ok: boolean }>> {
        return ipcRenderer.invoke(IPC.FLOW_ENTRY_REMOVE, { id })
      },
      move(id: number, newDate: string): Promise<Result<FlowDayEntry>> {
        return ipcRenderer.invoke(IPC.FLOW_ENTRY_MOVE, { id, newDate })
      },
      skip(id: number): Promise<Result<FlowDayEntry>> {
        return ipcRenderer.invoke(IPC.FLOW_ENTRY_SKIP, { id })
      },
      update(id: number, data: { title?: string; note?: string | null }): Promise<Result<FlowDayEntry>> {
        return ipcRenderer.invoke(IPC.FLOW_ENTRY_UPDATE, { id, ...data })
      },
    },
    monthGoals: {
      list(month: string): Promise<Result<FlowMonthGoal[]>> {
        return ipcRenderer.invoke(IPC.FLOW_MONTH_GOALS_LIST, { month })
      },
      save(data: { id?: number; month: string; title: string; closedAt?: string }): Promise<Result<FlowMonthGoal>> {
        return ipcRenderer.invoke(IPC.FLOW_MONTH_GOALS_SAVE, data)
      },
      delete(id: number): Promise<Result<{ ok: boolean }>> {
        return ipcRenderer.invoke(IPC.FLOW_MONTH_GOALS_DELETE, { id })
      },
    },
    weekFocus: {
      list(weekStart: string): Promise<Result<FlowWeekFocus[]>> {
        return ipcRenderer.invoke(IPC.FLOW_WEEK_FOCUS_LIST, { weekStart })
      },
      save(data: { id?: number; weekStart: string; title: string; monthGoalId?: number | null; doneAt?: string | null; sortOrder?: number }): Promise<Result<FlowWeekFocus>> {
        return ipcRenderer.invoke(IPC.FLOW_WEEK_FOCUS_SAVE, data)
      },
      delete(id: number): Promise<Result<{ ok: boolean }>> {
        return ipcRenderer.invoke(IPC.FLOW_WEEK_FOCUS_DELETE, { id })
      },
    },
    templates: {
      list(type?: string): Promise<Result<FlowPlanTemplate[]>> {
        return ipcRenderer.invoke(IPC.FLOW_TEMPLATES_LIST, { type })
      },
      save(data: { id?: number; name: string; type: string; items: { text: string }[] }): Promise<Result<FlowPlanTemplate>> {
        return ipcRenderer.invoke(IPC.FLOW_TEMPLATES_SAVE, data)
      },
      delete(id: number): Promise<Result<{ ok: boolean }>> {
        return ipcRenderer.invoke(IPC.FLOW_TEMPLATES_DELETE, { id })
      },
    },
    journal: {
      get(scope: string, periodKey: string): Promise<Result<FlowJournal | null>> {
        return ipcRenderer.invoke(IPC.FLOW_JOURNAL_GET, { scope, periodKey })
      },
      save(scope: string, periodKey: string, content: string): Promise<Result<FlowJournal>> {
        return ipcRenderer.invoke(IPC.FLOW_JOURNAL_SAVE, { scope, periodKey, content })
      },
    },
  },
  onNewsUpdated(callback: () => void): () => void {
    const handler = () => callback()
    ipcRenderer.on('news:updated', handler)
    return () => ipcRenderer.removeListener('news:updated', handler)
  },
}

contextBridge.exposeInMainWorld('api', api)

export type ApiType = typeof api
