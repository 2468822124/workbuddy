// ========================================
// 任务数据流通重构 · 阶段2 月目标页 composable
// 月导航 / 当月目标 + 历史未关闭目标（滚动显示）/ CRUD 动作编排
// ========================================

import { ref } from 'vue'
import { useApi } from './useApi'
import type { FlowMonthGoal } from '@shared/flowTypes'

// ===== 纯函数（导出单测） =====

/** 解析 ?month= 查询：非法/缺省 → 当月 'YYYY-MM' */
export function parseMonthQuery(query: unknown, fallbackToday: string): string {
  const raw = Array.isArray(query) ? query[0] : query
  if (typeof raw !== 'string') return fallbackToday.slice(0, 7)
  const m = /^(\d{4})-(\d{2})$/.exec(raw)
  if (!m) return fallbackToday.slice(0, 7)
  const mo = Number(m[2])
  if (mo < 1 || mo > 12) return fallbackToday.slice(0, 7)
  return raw
}

/** 月份平移（±N 月，Date.UTC 纯算术） */
export function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number)
  const t = new Date(Date.UTC(y, m - 1 + delta, 1))
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, '0')}`
}

/** 月标签：`2026 年 8 月` */
export function monthLabel(month: string): string {
  const [y, m] = month.split('-').map(Number)
  return `${y} 年 ${m} 月`
}

// ===== composable =====

/** 历史回看深度（当前月 + 前 5 个月，个人量级够用；无新 IPC） */
const HISTORY_SPAN = 5
const INFO_MS = 4000
const ERROR_MS = 8000

export function useFlowMonth() {
  const api = useApi()

  const month = ref('')
  const goals = ref<FlowMonthGoal[]>([])
  /** 历史未关闭目标（默认视图收进「展开」区） */
  const historyUnclosed = ref<FlowMonthGoal[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)
  const info = ref<string | null>(null)

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

  async function load(m: string): Promise<void> {
    month.value = m
    loading.value = true
    error.value = null
    const months = [m, ...Array.from({ length: HISTORY_SPAN }, (_, i) => shiftMonth(m, -(i + 1)))]
    const res = await Promise.all(months.map(x => api.flow.monthGoals.list(x)))
    loading.value = false
    const cur = res[0].ok ? res[0].data : []
    if (!res[0].ok) setError(res[0].error.message)
    const hist = res.slice(1).flatMap(r => (r.ok ? r.data : []))
    goals.value = cur
    historyUnclosed.value = hist.filter(g => !g.closedAt)
  }

  async function reload(): Promise<void> {
    await load(month.value)
  }

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
    month,
    goals,
    historyUnclosed,
    loading,
    error,
    info,
    load,
    reload,
    /** 新建 / 改名（带 id 即改） */
    save(title: string, id?: number) {
      return runAction(
        () => api.flow.monthGoals.save({ id, month: month.value, title }),
        id ? '已保存' : '已添加',
      )
    },
    /** 手动关闭（无自动结算，未关闭跨月滚动；规格无「重新打开」，关闭后不可逆至删除重建） */
    closeGoal(goal: FlowMonthGoal) {
      return runAction(
        () => api.flow.monthGoals.save({ id: goal.id, month: goal.month, title: goal.title, closedAt: todayStr() }),
        '已关闭',
      )
    },
    deleteGoal(id: number) {
      return runAction(() => api.flow.monthGoals.delete(id), '已删除')
    },
  }
}

function todayStr(): string {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}
