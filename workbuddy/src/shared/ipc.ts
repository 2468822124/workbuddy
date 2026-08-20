export const IPC = {
  SETTINGS_GET: 'settings:get',
  SETTINGS_SET: 'settings:set',
  SETTINGS_GET_ALL: 'settings:getAll',
  DB_HEALTH: 'db:health',
  APP_FIRST_LAUNCH: 'app:isFirstLaunch',
  NEWS_LIST: 'news:list',
  NEWS_REFRESH: 'news:refresh',
  MORNING_STATUS: 'morning:status',
  PROJECTS_LIST: 'projects:list',
  PROJECTS_GET: 'projects:get',
  PROJECTS_CREATE: 'projects:create',
  PROJECTS_UPDATE: 'projects:update',
  PROJECTS_DELETE: 'projects:delete',
  LLM_TEST: 'llm:test',
  DATA_EXPORT: 'data:export',
  DATA_IMPORT: 'data:import',
  LLM_SEARCH: 'llm:search',
  // ===== 任务数据流通重构（阶段6：项目/提醒兼容 + 旧表归档） =====
  PROJECT_TASKS_LIST_BY_PROJECT: 'projectTasks:listByProject',
  PROJECT_TASKS_CREATE: 'projectTasks:create',
  PROJECT_TASKS_UPDATE: 'projectTasks:update',
  PROJECT_TASKS_DELETE: 'projectTasks:delete',
  PROJECT_TASKS_TOGGLE: 'projectTasks:toggle',
  ARCHIVE_LEGACY: 'archive:legacy',
  // ===== 任务数据流通重构（阶段1：flow_ 新任务域，与旧模块物理隔离） =====
  FLOW_WEEK_BOARD: 'flow:weekBoard',
  FLOW_DAY_BOARD: 'flow:dayBoard',
  FLOW_FIXED_DEFS_LIST: 'flow:fixedDefs:list',
  FLOW_FIXED_DEFS_SAVE: 'flow:fixedDefs:save',
  FLOW_FIXED_DEFS_DELETE: 'flow:fixedDefs:delete',
  FLOW_INSTANCE_CREATE: 'flow:instance:create',
  FLOW_INSTANCE_RENAME: 'flow:instance:rename',
  FLOW_INSTANCE_DELETE: 'flow:instance:delete',
  FLOW_INSTANCE_SKIP: 'flow:instance:skip',
  FLOW_INSTANCE_CARRY_NEXT: 'flow:instance:carryNext',
  FLOW_INSTANCE_MANUAL_COMPLETE: 'flow:instance:manualComplete',
  FLOW_INSTANCE_ADD_SESSION: 'flow:instance:addSession',
  FLOW_VOUCHER_DELETE: 'flow:voucher:delete',
  FLOW_VOUCHER_UPDATE: 'flow:voucher:update',
  FLOW_ENTRY_ADD: 'flow:entry:add',
  FLOW_ENTRY_TOGGLE_CHECK: 'flow:entry:toggleCheck',
  FLOW_ENTRY_REMOVE: 'flow:entry:remove',
  FLOW_ENTRY_MOVE: 'flow:entry:move',
  FLOW_ENTRY_SKIP: 'flow:entry:skip',
  FLOW_ENTRY_UPDATE: 'flow:entry:update',
  FLOW_MONTH_GOALS_LIST: 'flow:monthGoals:list',
  FLOW_MONTH_GOALS_SAVE: 'flow:monthGoals:save',
  FLOW_MONTH_GOALS_DELETE: 'flow:monthGoals:delete',
  FLOW_WEEK_FOCUS_LIST: 'flow:weekFocus:list',
  FLOW_WEEK_FOCUS_SAVE: 'flow:weekFocus:save',
  FLOW_WEEK_FOCUS_DELETE: 'flow:weekFocus:delete',
  FLOW_TEMPLATES_LIST: 'flow:templates:list',
  FLOW_TEMPLATES_SAVE: 'flow:templates:save',
  FLOW_TEMPLATES_DELETE: 'flow:templates:delete',
  FLOW_JOURNAL_GET: 'flow:journal:get',
  FLOW_JOURNAL_SAVE: 'flow:journal:save',
  // 阶段5：复盘派生面板（只读）
  FLOW_REVIEW_BOARD: 'flow:reviewBoard',
} as const

export type Result<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: string; message: string } }

export function ok<T>(data: T): Result<T> {
  return { ok: true, data }
}

export function err(code: string, message: string): Result<never> {
  return { ok: false, error: { code, message } }
}
