export type TodoStatus = 'todo' | 'done'
export type ProjectStatus = 'active' | 'paused' | 'done' | 'dropped'

export interface Todo {
  id: string
  content: string
  status: TodoStatus
  planDate: string | null       // 'YYYY-MM-DD'
  projectId: string | null
  // F3.2-2：来源日计划 plan.id（syncPlanTodos 生成时写入；手动/项目 todo 为 null）
  sourcePlanId: string | null
  // v0.2修复计划·参照完整性：上级任务引用 JSON `{"parentPlanId":string|null,"parentTaskId":string}`
  // （pick 级联时写入；手动/项目 todo 为 null；来源已删时 parentTaskId 指向已软删 tasks 行）
  parentTaskRef: string | null
  // 第二轮实测·问题②：生成它的日规划任务行已被删除（done orphan 保留时置 1，加回复用清零）
  sourceInvalid: boolean
  // 第三轮实测·问题乙：生成该 todo 的日规划任务行内联 tid（childTid；tasks 表同 tid）。
  // 改名文本变、行 tid 不变 → syncPlanTodos 按此复用同一 todo（完成态保留）。
  // 注意：≠ parentTaskRef.parentTaskId（周/月上级任务 tid）。非日规划来源为 null。
  sourceTaskTid: string | null
  isDeleted: boolean
  deletedAt: string | null
  completedAt: string | null
  createdAt: string
  updatedAt: string
}

// v0.2修复计划·参照完整性：计划任务（tasks 表；plan.content 为 Markdown 真相源，tasks 为轻量索引）
export interface Task {
  tid: string                   // 内联隐形 tid（`<!-- tid:{tid} [parent:{parentTid}] -->`）
  planId: string
  content: string
  parentTaskId: string | null   // 上级任务 tid（同表自引用；任务行可能不存在于 tasks 表）
  consumed: boolean
  sortOrder: number
  isDeleted: boolean
  deletedAt: string | null
  createdAt: string
  updatedAt: string
}

// v0.2修复计划·参照完整性：todo 的上级任务上下文（todos:withSource 主进程解析注入）
export interface TodoParentTask {
  level: PlanningLevel          // 上级计划层级（daily/weekly/monthly；路由跳转用）
  planId: string
  planDate: string | null
  tid: string
  content: string
  invalid: boolean              // 上级任务行已被删（来源已删标注）
}

// F3.2-2 + v0.2修复计划：带出处标注的 todo（todos:withSource 返回；sourceLabel 主进程 labelTodoSource 计算）
export type TodoWithSource = Todo & {
  sourceLabel: string
  parentTask: TodoParentTask | null   // parentTaskRef 解析结果（来源链跳转/失效标注用）
}

// v0.2修复计划·参照完整性：task:resolveChain 逐级返回（todo → 周任务 → 月任务 → 源头）
export interface TaskChainItem {
  level: PlanningLevel
  planId: string
  planDate: string | null
  tid: string
  content: string
}

export interface Project {
  id: string
  name: string
  status: ProjectStatus
  description: string | null
  color: string | null
  isDeleted: boolean
  deletedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface Setting {
  key: string
  value: string               // ciphertext(base64) if isEncrypted
  isEncrypted: boolean
  updatedAt: string
}

export interface NewsItem {
  id: string                  // sha1(link)
  title: string
  link: string
  source: string              // provider name
  sourceId: string | null     // provider id
  summary: string | null
  publishedAt: string | null  // ISO
  fetchedAt: string           // ISO when pulled
}

export interface ProjectWithCounts extends Project {
  totalTasks: number
  openTasks: number           // status='todo' AND isDeleted=0
}

export interface CreateTodoInput {
  content: string
  planDate: string | null
  projectId: string | null
}

export interface LlmTestResult {
  ok: boolean
  message?: string
  latencyMs?: number
}

export interface DataImportResult {
  ok: boolean
  counts?: Record<string, number>
  message?: string
}

// Phase 5: conversational hotspot search
export interface ChatRef {
  item: NewsItem
  reason: string
}
export interface ChatResult {
  answer: string
  refs: ChatRef[]
  latencyMs: number
}

// 计划与复盘体系（子阶段5：+monthly_plan/monthly_review）
export type TemplateType =
  | 'daily_plan'
  | 'weekly_plan'
  | 'monthly_plan'
  | 'daily_review'
  | 'weekly_review'
  | 'monthly_review'

// 子阶段5：规划三级
export type PlanningLevel = 'daily' | 'weekly' | 'monthly'

export interface Template {
  id: string
  name: string | null
  type: TemplateType | null
  content: string | null
  isDefault: boolean
  isDeleted: boolean
  deletedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface Plan {
  id: string
  date: string | null              // 'YYYY-MM-DD'
  type: string | null              // 'daily_plan' | 'weekly_plan'（与模板 type 对齐；字符串留宽）
  content: string | null           // Markdown 原文
  generatedTodoIds: string[]       // 解析生成的 todo id（DB 内存 JSON 字符串，repo 层 ↔ 数组）
  templateId: string | null
  isDeleted: boolean
  deletedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface Review {
  id: string
  date: string | null              // 'YYYY-MM-DD'
  type: string | null              // 'daily_review' | 'weekly_review'（与模板 type 对齐；字符串留宽）
  content: string | null           // Markdown 原文
  linkedProjectIds: string[]       // 关联项目（DB 内存 JSON 字符串，repo 层 ↔ 数组）；本子阶段 UI 不暴露，默认 []
  isDeleted: boolean
  deletedAt: string | null
  createdAt: string
  updatedAt: string
}

// 子阶段4：LLM 增强结果类型
export interface PlanGuideItem {
  placeholder: string
  question: string
  suggestion: string
}
export interface PlanGuideResult {
  items: PlanGuideItem[]
  latencyMs: number
}
export interface ReviewDraftResult {
  draft: string
  latencyMs: number
}

// 子阶段5：AI 结构化复盘结果（直出 Markdown，非 {draft} 包装）
export interface ReviewSummaryResult {
  content: string
  latencyMs: number
}

// 子阶段5 + v0.2修复计划：plan:listTasksByPeriod 返回（任务级联；tid=内联隐形标识，未分配为 null）
export interface PlanTasksByPeriodResult {
  planId: string | null
  tasks: {
    text: string
    consumed: boolean
    tid: string | null
    // 第二轮实测·问题①：已安排到本期内子级计划（daily 页=本周某天 / weekly 页=本月某周）
    // —— 有 parent:{tid} 行即 true（全期隐藏，跨天/跨周防重复选取；改名不失效）
    scheduledInPeriod: boolean
  }[]
}

// v0.2修复计划·§3.4：plan:prepareTaskLink 返回（pick 下沉预关联；行 `- [ ] {taskText} <!-- tid:{childTid} parent:{parentTid} -->`）
export interface PrepareTaskLinkResult {
  parentTid: string
  childTid: string
  taskText: string
}

// 子阶段5：周期提醒任务（周日周统筹 / 月末月指导）
export interface PeriodicReminder {
  content: string   // 完整待办文案，如「📌 做周统筹 · 第 32 周」
  prefix: string    // 匹配前缀，如「📌 做周统筹」
  route: string     // TodayView「前往」跳转路由，如 /planning/weekly
}
