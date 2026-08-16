// ========================================
// 任务数据流通重构 · 阶段2 周统筹页 composable
// 周状态装载 / 周导航 / 动作编排（每动作 Result 分支 + 反馈条）
// 纯函数导出供 tests/useFlowWeek.spec.ts 单测（技术栈规范 §6.4）
// ========================================

import { computed, ref, shallowRef } from 'vue'
import { useApi } from './useApi'
import { addDays, getWeekStart, getWeekRange, isoWeekOf } from '@shared/period'
import type {
  FlowFixedDef,
  FlowMonthGoal,
  FlowVoucherView,
  FlowWeekFocus,
  FlowWeekInstance,
  InstanceCompletion,
  WeekBoard,
} from '@shared/flowTypes'

// ===== 纯函数（导出单测） =====

/** 解析 ?week= 查询：非法/缺省 → 本周周一；一律归一化为周一起始 */
export function parseWeekQuery(query: unknown, fallbackToday: string): string {
  const raw = Array.isArray(query) ? query[0] : query
  if (typeof raw !== 'string') return getWeekStart(fallbackToday)
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw)
  if (!m) return getWeekStart(fallbackToday)
  const [, y, mo, d] = m.map(Number)
  // 拒绝越界月/日（Date.UTC 会静默进位，2026-13-99 → 2027-04-xx）
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return getWeekStart(fallbackToday)
  return getWeekStart(raw)
}

/** 周平移（±N 周，纯 UTC 算术，复用 @shared/period） */
export function shiftWeek(weekStart: string, delta: number): string {
  return addDays(weekStart, delta * 7)
}

/** 周标签：`W34 · 2026-08-10 ~ 08-16` */
export function weekLabel(weekStart: string): string {
  const [s, e] = getWeekRange(weekStart)
  return `W${isoWeekOf(weekStart)} · ${s} ~ ${e.slice(5)}`
}

const WEEKDAYS = ['一', '二', '三', '四', '五', '六', '日']

/** weekdayMask（bit0=周一 … bit6=周日）→ 中文星期数组；0 → [] */
export function weekdayMaskToLabels(mask: number): string[] {
  const out: string[] = []
  for (let i = 0; i < 7; i++) if (mask & (1 << i)) out.push(WEEKDAYS[i])
  return out
}

/** 固定徽标文字：temp → null；fixed → 单惯常日 `固定·周三` / 多惯常日 `固定·一/三`
 * （无惯常日 → `固定`；def 已停用退化为 `固定`） */
export function fixedBadge(inst: FlowWeekInstance, defs: FlowFixedDef[]): string | null {
  if (inst.origin !== 'fixed') return null
  const def = defs.find(d => d.id === inst.fixedDefId)
  const labels = def ? weekdayMaskToLabels(def.weekdayMask) : []
  if (labels.length === 0) return '固定'
  return labels.length === 1 ? `固定·周${labels[0]}` : `固定·${labels.join('/')}`
}

export type InstanceDisplayState = 'open' | 'done' | 'skipped'

/** 完成态 → 显示态（once：✓；multi：n/目标 徽章；跳过：免罪灰显） */
export function instanceDisplay(
  inst: FlowWeekInstance,
  completion: InstanceCompletion,
): { state: InstanceDisplayState; badge: string | null } {
  if (completion.skipped) return { state: 'skipped', badge: null }
  if (inst.kind === 'once') return { state: completion.done ? 'done' : 'open', badge: null }
  return {
    state: completion.doneCount >= completion.targetCount ? 'done' : 'open',
    badge: `${completion.doneCount}/${completion.targetCount}`,
  }
}

/** 历史周判定（weekStart 早于本周一）：转下周按钮仅在历史周显示 */
export function isHistoryWeek(weekStart: string, today: string): boolean {
  return weekStart < getWeekStart(today)
}

/** 周起始 → 所在月 'YYYY-MM' */
export function monthOf(weekStart: string): string {
  return weekStart.slice(0, 7)
}

/** 核心目标显示标题（弱级联）：monthGoalId 非空 → 取月目标实时标题；否则快照 */
export function focusDisplayTitle(focus: FlowWeekFocus, monthGoalMap: ReadonlyMap<number, string>): string {
  if (focus.monthGoalId !== null) {
    const live = monthGoalMap.get(focus.monthGoalId)
    if (live) return live
  }
  return focus.title
}

/** 防重复转：本周已存在同名 temp 实例 → 置灰（复制断链，无数据关联，纯 UI 辅助） */
export function hasTransferred(focus: FlowWeekFocus, instances: FlowWeekInstance[]): boolean {
  return instances.some(i => i.origin === 'temp' && i.title === focus.title)
}

// ===== composable =====

const INFO_MS = 4000
const ERROR_MS = 8000

export function useFlowWeek() {
  const api = useApi()

  const weekStart = ref('')
  const board = shallowRef<WeekBoard | null>(null)
  const fixedDefs = ref<FlowFixedDef[]>([])
  const monthGoals = ref<FlowMonthGoal[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)
  const info = ref<string | null>(null)

  let infoTimer: ReturnType<typeof setTimeout> | undefined
  let errorTimer: ReturnType<typeof setTimeout> | undefined

  /** 月目标实时标题映射（含已关闭——弱级联显示不受关闭影响） */
  const monthGoalMap = computed(() => new Map(monthGoals.value.map(g => [g.id, g.title])))

  /** 当月末关闭目标（核心目标区「从月目标选取」下拉） */
  const openGoals = computed(() => monthGoals.value.filter(g => !g.closedAt))

  function setInfo(msg: string): void {
    info.value = msg
    clearTimeout(infoTimer)
    infoTimer = setTimeout(() => { info.value = null }, INFO_MS)
  }

  function setError(msg: string): void {
    error.value = msg
    clearTimeout(errorTimer)
    errorTimer = setTimeout(() => { error.value = null }, ERROR_MS)
  }

  function todayStr(): string {
    const d = new Date()
    const pad = (n: number) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
  }

  async function load(week: string): Promise<void> {
    const target = getWeekStart(week)
    weekStart.value = target
    loading.value = true
    error.value = null
    const [boardRes, defsRes, goalsRes] = await Promise.all([
      api.flow.weekBoard(target),
      api.flow.fixedDefs.list(),
      api.flow.monthGoals.list(monthOf(target)),
    ])
    loading.value = false
    if (!boardRes.ok) {
      setError(boardRes.error.message)
      board.value = null
      return
    }
    board.value = boardRes.data
    fixedDefs.value = defsRes.ok ? defsRes.data : []
    monthGoals.value = goalsRes.ok ? goalsRes.data : []
  }

  async function reload(): Promise<void> {
    await load(weekStart.value)
  }

  /** 动作统一编排：Result 分支 + 失败反馈条（IPC err 一律可见，禁静默） */
  async function runAction(
    action: () => Promise<{ ok: boolean; error?: { message: string } }>,
    successInfo?: string,
  ): Promise<boolean> {
    const res = await action()
    if (!res.ok) {
      setError(res.error?.message ?? '操作失败')
      return false
    }
    if (successInfo) setInfo(successInfo)
    await reload()
    return true
  }

  return {
    // 状态
    weekStart,
    board,
    fixedDefs,
    monthGoals,
    monthGoalMap,
    openGoals,
    loading,
    error,
    info,
    // 装载
    load,
    reload,
    todayStr,
    setInfo,
    // 周任务实例动作
    createTemp(title: string, kind: 'once' | 'multi', targetCount?: number) {
      return runAction(() => api.flow.instance.create({ weekStart: weekStart.value, title, kind, targetCount }), '已添加')
    },
    renameInstance(id: number, title: string) {
      return runAction(() => api.flow.instance.rename(id, title), '已改名')
    },
    deleteInstance(id: number) {
      return runAction(() => api.flow.instance.delete(id), '已删除')
    },
    skipInstance(id: number) {
      return runAction(() => api.flow.instance.skip(id), '已跳过（不计未完成）')
    },
    carryNext(id: number) {
      return runAction(
        () => api.flow.instance.carryNext(id, addDays(weekStart.value, 7)),
        '已转至下周',
      )
    },
    manualComplete(id: number) {
      return runAction(() => api.flow.instance.manualComplete(id), '已完成')
    },
    addSession(id: number) {
      return runAction(() => api.flow.instance.addSession(id), '+1 场次')
    },
    // 凭据（R1 撤销 UI）
    voucherDelete(voucherId: number) {
      return runAction(() => api.flow.voucher.delete(voucherId), '凭据已删除')
    },
    voucherUpdate(voucherId: number, data: { occurredAt?: string; note?: string | null }) {
      return runAction(() => api.flow.voucher.update(voucherId, data), '凭据已更新')
    },
    // 核心目标
    addFocus(title: string, monthGoalId?: number | null) {
      return runAction(() => api.flow.weekFocus.save({ weekStart: weekStart.value, title, monthGoalId: monthGoalId ?? null }), '已添加')
    },
    toggleFocusDone(focus: FlowWeekFocus) {
      return runAction(() =>
        api.flow.weekFocus.save({
          id: focus.id,
          weekStart: weekStart.value,
          title: focus.title,
          monthGoalId: focus.monthGoalId,
          doneAt: focus.doneAt ? null : todayStr(),
        }),
      )
    },
    deleteFocus(id: number) {
      return runAction(() => api.flow.weekFocus.delete(id), '已删除')
    },
    /** 转周任务 = 复制断链（同名 once 临时实例），成功后重载使「已转」徽章生效 */
    transferFocus(focus: FlowWeekFocus) {
      return runAction(() => api.flow.instance.create({ weekStart: weekStart.value, title: focus.title, kind: 'once' }), '已转为周任务')
    },
    // 每周固定
    saveFixedDef(input: { id?: number; title: string; kind: 'once' | 'multi'; targetCount?: number; weekdayMask?: number }) {
      return runAction(() => api.flow.fixedDefs.save(input), '已保存（物化后本周出现实例）')
    },
    deleteFixedDef(id: number) {
      return runAction(() => api.flow.fixedDefs.delete(id), '已停用（存量保留）')
    },
  }
}

/** 类型助手：取某实例的凭据视图（按 instanceId 归组，含 manual/extra/check 三种凭据同池） */
export function vouchersOf(instanceId: number, vouchers: FlowVoucherView[]): FlowVoucherView[] {
  return vouchers.filter(v => v.instanceId === instanceId)
}
