// ========================================
// 任务数据流通重构 · 阶段1 数据模型类型
// 与 migration 0008 七表字段一一对应；派生 DTO 只读，禁止落库
// ========================================

export type FlowTaskKind = 'once' | 'multi'
export type FlowEntrySource =
  | 'manual'
  | 'rail'
  | 'template'
  | 'deferred'
  | 'habit'
  | 'project'
  | 'reminder'
export type FlowVoucherKind = 'check' | 'manual' | 'extra'

export interface FlowFixedDef {
  id: number
  title: string
  kind: FlowTaskKind
  targetCount: number
  /** bit0=周一 … bit6=周日；0=无惯常日 */
  weekdayMask: number
  /** 预留扩展，本轮仅 WEEKLY */
  recurrence: 'WEEKLY'
  note: string | null
  isDeleted: boolean
  deletedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface FlowWeekInstance {
  id: number
  /** 周一日期 YYYY-MM-DD */
  weekStart: string
  origin: 'temp' | 'fixed'
  fixedDefId: number | null
  /** 克隆快照；def 改名时同步本周实例 */
  title: string
  kind: FlowTaskKind
  targetCount: number
  sortOrder: number
  /** 本周跳过（免罪，不计未完成） */
  skippedAt: string | null
  /** 「转下周」来源实例 */
  carriedFrom: number | null
  isDeleted: boolean
  deletedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface FlowDayEntry {
  id: number
  /** YYYY-MM-DD */
  date: string
  /** 自由行自存；锁定行展示取实例实时值 */
  title: string
  source: FlowEntrySource
  locked: boolean
  weekInstanceId: number | null
  projectId: number | null
  reminderKey: string | null
  templateId: number | null
  /** 私有备注（不传播） */
  note: string | null
  skippedAt: string | null
  isDeleted: boolean
  deletedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface FlowVoucher {
  id: number
  targetType: 'day_entry' | 'week_instance'
  targetId: number
  kind: FlowVoucherKind
  /** 实际完成日（manual 可回填） */
  occurredAt: string
  note: string | null
  isDeleted: boolean
  deletedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface FlowMonthGoal {
  id: number
  /** YYYY-MM */
  month: string
  title: string
  /** 手动关闭；无自动结算 */
  closedAt: string | null
  isDeleted: boolean
  deletedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface FlowWeekFocus {
  id: number
  weekStart: string
  title: string
  monthGoalId: number | null
  /** 手动勾完成（参照区） */
  doneAt: string | null
  sortOrder: number
  isDeleted: boolean
  deletedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface FlowPlanTemplate {
  id: number
  name: string
  type: 'daily' | 'weekly'
  /** JSON 数组 [{text}]，套用时复制断链 */
  items: { text: string }[]
  isDeleted: boolean
  deletedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface FlowJournal {
  id: number
  scope: 'day' | 'week' | 'month'
  /** date / weekStart / month */
  periodKey: string
  content: string
  isDeleted: boolean
  deletedAt: string | null
  createdAt: string
  updatedAt: string
}

// ========================================
// 派生 DTO（只读，禁止落库）
// ========================================

export interface InstanceCompletion {
  instanceId: number
  done: boolean
  doneCount: number
  targetCount: number
  arrangedCount: number
  skipped: boolean
}

/** 凭据视图（派生只读）：补展示标题 + 归组实例 id，供凭据弹层按实例分组 */
export interface FlowVoucherView extends FlowVoucher {
  /** manual/extra = 实例标题；check = 所在实例标题（实例已删则空串，前端回退行标题） */
  targetTitle: string
  /** 归组键：manual/extra = inst.id；check = 所在实例 id（经 entryInstMap）；null = 无归属（保守回退） */
  instanceId: number | null
}

export interface WeekBoard {
  weekStart: string
  instances: (FlowWeekInstance & { completion: InstanceCompletion })[]
  rail: FlowWeekInstance[]
  focus: FlowWeekFocus[]
  /** 全周 active 凭据（check/manual/extra 同池）——凭据弹层数据源（阶段2 扩展） */
  vouchers: FlowVoucherView[]
}

export interface DayBoardEntry extends FlowDayEntry {
  done: boolean
  deferredCount: number
  /** 锁定行=实例实时标题 */
  displayTitle: string
}

export interface DayBoard {
  date: string
  entries: DayBoardEntry[]
}
