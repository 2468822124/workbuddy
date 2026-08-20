import { contextBridge, ipcRenderer } from 'electron'
import { IPC, Result } from '@shared/ipc'
import { Setting, Project, NewsItem, ChatResult, ProjectTask, CreateProjectTaskInput, UpdateProjectTaskInput, LegacyArchiveResult } from '@shared/types'
import { FlowFixedDef, FlowWeekInstance, FlowDayEntry, FlowVoucher, FlowMonthGoal, FlowWeekFocus, FlowPlanTemplate, FlowJournal, WeekBoard, DayBoard, FlowReviewBoard } from '@shared/flowTypes'

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
  // 阶段6：项目/提醒兼容读写（todos 表唯一项目任务入口；flow 投影只经 service，不经 renderer）
  projectTasks: {
    listByProject(projectId: string): Promise<Result<ProjectTask[]>> {
      return ipcRenderer.invoke(IPC.PROJECT_TASKS_LIST_BY_PROJECT, projectId)
    },
    create(data: CreateProjectTaskInput): Promise<Result<ProjectTask>> {
      return ipcRenderer.invoke(IPC.PROJECT_TASKS_CREATE, data)
    },
    update(data: UpdateProjectTaskInput & { id: string }): Promise<Result<ProjectTask>> {
      return ipcRenderer.invoke(IPC.PROJECT_TASKS_UPDATE, data)
    },
    delete(id: string): Promise<Result<{ ok: boolean }>> {
      return ipcRenderer.invoke(IPC.PROJECT_TASKS_DELETE, id)
    },
    toggle(id: string): Promise<Result<ProjectTask>> {
      return ipcRenderer.invoke(IPC.PROJECT_TASKS_TOGGLE, id)
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
  // 阶段6：旧表归档（仅设置页用户显式触发）
  archive: {
    legacy(): Promise<Result<LegacyArchiveResult>> {
      return ipcRenderer.invoke(IPC.ARCHIVE_LEGACY)
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
    reviewBoard(weekStart: string): Promise<Result<FlowReviewBoard>> {
      return ipcRenderer.invoke(IPC.FLOW_REVIEW_BOARD, { weekStart })
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
      add(data: { date: string; title: string; source: string; locked?: boolean; weekInstanceId?: number | null; projectId?: string | null; reminderKey?: string | null; templateId?: number | null; note?: string | null }): Promise<Result<FlowDayEntry>> {
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
