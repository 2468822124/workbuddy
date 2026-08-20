// ========================================
// 任务数据流通重构 · 阶段5 复盘与趋势 composable
// 周选择（本周/历史周）/ 复盘面板装载 / 「转下周」动作编排 / 周月感想读写
// 纯函数导出供 tests/useFlowReview.spec.ts 单测（技术栈规范 §6.4）
// ========================================

import { ref, shallowRef } from 'vue'
import { useApi } from './useApi'
import { addDays, getWeekStart, getWeekRange, isValidDate, isoWeekOf } from '@shared/period'
import type { FlowReviewBoard } from '@shared/flowTypes'

// ===== 纯函数（导出单测） =====

/** 解析 ?week= 查询：非法/缺省 → 本周周一；未来周 → 钳制回本周（复盘仅本周/历史周） */
export function parseReviewWeekQuery(query: unknown, fallbackToday: string): string {
  const raw = Array.isArray(query) ? query[0] : query
  if (typeof raw !== 'string') return getWeekStart(fallbackToday)
  if (!isValidDate(raw)) return getWeekStart(fallbackToday) // 真实日历校验：2026-02-31 拒绝，防 Date.UTC 进位
  const week = getWeekStart(raw)
  const current = getWeekStart(fallbackToday)
  return week > current ? current : week
}

/** 完成率格式化：null → '—'；否则百分整数（四舍五入） */
export function formatCompletionRate(rate: number | null): string {
  if (rate === null) return '—'
  return `${Math.round(rate * 100)}%`
}

/** 周标签：`W34 · 2026-08-10 ~ 08-16` */
export function reviewWeekLabel(weekStart: string): string {
  const [s, e] = getWeekRange(weekStart)
  return `W${isoWeekOf(weekStart)} · ${s} ~ ${e.slice(5)}`
}

/** 本周判定（导航「下周」禁用） */
export function isCurrentReviewWeek(weekStart: string, today: string): boolean {
  return weekStart === getWeekStart(today)
}

/** 转下周目标 = 当前周 + 7 天（服务端校验=源周+7，渲染端只算不判） */
export function carryTarget(weekStart: string): string {
  return addDays(weekStart, 7)
}

/** 月感想 periodKey = 所选周起始日所在月（规格 §9.3） */
export function monthKeyOf(weekStart: string): string {
  return weekStart.slice(0, 7)
}

// ===== composable =====

const INFO_MS = 4000
const ERROR_MS = 8000

export function useFlowReview() {
  const api = useApi()

  const weekStart = ref('')
  const board = shallowRef<FlowReviewBoard | null>(null)
  const loading = ref(false)
  const error = ref<string | null>(null)
  const info = ref<string | null>(null)

  // 周/月感想：与统计完全独立的状态；读失败只影响感想块，保存失败不清空编辑内容
  const weekContent = ref<string | null>(null)
  const monthContent = ref<string | null>(null)
  const savingWeek = ref(false)
  const savingMonth = ref(false)
  const weekError = ref<string | null>(null)
  const monthError = ref<string | null>(null)

  /** 转下周进行中实例 id（行内确认按钮防双击） */
  const carryingId = ref<number | null>(null)

  let infoTimer: ReturnType<typeof setTimeout> | undefined
  let errorTimer: ReturnType<typeof setTimeout> | undefined

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

  /** 感想装载：周/月并行（独立降级）；任一失败只置该块错误与空态，不覆盖统计 */
  async function loadJournals(week: string): Promise<void> {
    const [w, m] = await Promise.all([
      api.flow.journal.get('week', week),
      api.flow.journal.get('month', monthKeyOf(week)),
    ])
    if (w.ok) {
      weekContent.value = w.data ? w.data.content : null
      weekError.value = null
    } else {
      weekContent.value = null
      weekError.value = w.error?.message ?? '周感想读取失败'
    }
    if (m.ok) {
      monthContent.value = m.data ? m.data.content : null
      monthError.value = null
    } else {
      monthContent.value = null
      monthError.value = m.error?.message ?? '月感想读取失败'
    }
  }

  async function load(week: string): Promise<void> {
    const target = getWeekStart(week)
    weekStart.value = target
    loading.value = true
    error.value = null
    const res = await api.flow.reviewBoard(target)
    loading.value = false
    if (!res.ok) {
      setError(res.error.message)
      board.value = null
      return
    }
    board.value = res.data
    void loadJournals(target) // 统计成功后再并载感想；感想失败不影响统计
  }

  async function reload(): Promise<void> {
    await load(weekStart.value)
  }

  /** 「转下周」：行内确认后调用；动作中 carryingId 防双击；失败 Result 反馈条可见 */
  async function carryNext(id: number): Promise<boolean> {
    carryingId.value = id
    const res = await api.flow.instance.carryNext(id, carryTarget(weekStart.value))
    carryingId.value = null
    if (!res.ok) {
      setError(res.error?.message ?? '转下周失败')
      return false
    }
    setInfo('已转至下周')
    await reload()
    return true
  }

  /** 感想保存：失败保留编辑内容（父级 content 不变，textarea 草稿不受影响）并显示块内错误 */
  async function saveJournal(scope: 'week' | 'month', content: string): Promise<void> {
    const key = scope === 'week' ? weekStart.value : monthKeyOf(weekStart.value)
    const saving = scope === 'week' ? savingWeek : savingMonth
    const errRef = scope === 'week' ? weekError : monthError
    saving.value = true
    errRef.value = null
    const res = await api.flow.journal.save(scope, key, content)
    saving.value = false
    if (res.ok) {
      if (scope === 'week') weekContent.value = content
      else monthContent.value = content
      setInfo('已保存')
    } else {
      errRef.value = res.error?.message ?? '保存失败'
    }
  }

  return {
    weekStart,
    board,
    loading,
    error,
    info,
    weekContent,
    monthContent,
    savingWeek,
    savingMonth,
    weekError,
    monthError,
    carryingId,
    load,
    reload,
    carryNext,
    loadJournals,
    saveJournal,
  }
}
