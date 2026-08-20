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

// ========================================
// 阶段6：项目/提醒兼容视图 —— todos 物理行的最小兼容视图
// 读取时忽略 sourcePlanId/parentTaskRef/sourceInvalid/sourceTaskTid 等旧规划字段，
// 不把旧规划字段传播到 flow 域；完成态只由 flow_vouchers 派生，本项目状态不复写。
// ========================================
export type ProjectTaskStatus = 'todo' | 'done'

export interface ProjectTask {
  id: string
  content: string
  status: ProjectTaskStatus
  planDate: string | null       // 'YYYY-MM-DD'
  projectId: string | null
  isDeleted: boolean
  deletedAt: string | null
  completedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface CreateProjectTaskInput {
  content: string
  planDate: string | null
  projectId: string
}

export interface UpdateProjectTaskInput {
  content?: string
  planDate?: string | null
}

export interface ReminderTaskInput {
  date: string                  // 'YYYY-MM-DD'
  key: 'weekly' | 'monthly'
  content: string
}

export type LegacyTableName = 'plans' | 'tasks' | 'templates' | 'reviews'

export interface LegacyArchiveResult {
  path: string
  counts: Record<LegacyTableName, number>
}
