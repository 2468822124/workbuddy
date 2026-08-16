// ========================================
// 任务数据流通重构 · 阶段3 日规划页 composable
// 日装载 / 日导航 / 动作编排（每动作 Result 分支 + 反馈条）
// 纯函数导出供 tests/useFlowDay.spec.ts 单测（技术栈规范 §6.4）
// ========================================

import { ref, shallowRef } from 'vue'
import { useApi } from './useApi'
import { addDays, getWeekStart } from '@shared/period'
import type {
  DayBoard,
  DayBoardEntry,
  FlowEntrySource,
  FlowWeekInstance,
  WeekBoard,
} from '@shared/flowTypes'

// ===== 纯函数（导出单测） =====

/** 顺延高亮阈值（天数）——≥此值显 --warn 高亮 */
export const DEFER_WARN_DAYS = 3

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六']

/** 来源 → 展示徽标文字（七源全覆盖；null = 无徽标） */
export function sourceBadge(source: FlowEntrySource): string | null {
  switch (source) {
    case 'rail': return '周任务'
    case 'habit': return '固定'
    case 'template': return '模板'
    case 'project': return '项目'
    case 'reminder': return '提醒'
    case 'manual':
    case 'deferred':
    default: return null
  }
}

/** 解析 ?date= 查询：非法/缺省/数组/月日越界 → 回落今天；合法日期原样返回 */
export function parseDateQuery(query: unknown, fallbackToday: string): string {
  const raw = Array.isArray(query) ? query[0] : query
  if (typeof raw !== 'string') return fallbackToday
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw)
  if (!m) return fallbackToday
  const [, y, mo, d] = m.map(Number)
  // 拒绝越界月/日（Date.UTC 会静默进位，2026-13-99 → 2027-04-xx）
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return fallbackToday
  return raw
}

/** 日平移（±N 天，纯 UTC 算术，复用 @shared/period） */
export function shiftDate(date: string, delta: number): string {
  return addDays(date, delta)
}

/** 日期标签：`YYYY-MM-DD 周X`（中文星期） */
export function dateLabel(date: string): string {
  const weekDay = new Date(date + 'T00:00:00').getDay()
  return `${date} 周${WEEKDAYS[weekDay]}`
}

/** 历史日判定（date 早于今天）：历史日 rail 只读 */
export function isHistoryDate(date: string, today: string): boolean {
  return date < today
}

// ===== composable =====

const INFO_MS = 4000
const ERROR_MS = 8000

export function useFlowDay() {
  const api = useApi()

  const date = ref('')
  const dayBoard = shallowRef<DayBoard | null>(null)
  const weekBoard = shallowRef<WeekBoard | null>(null)
  const loading = ref(false)
  const error = ref<string | null>(null)
  const info = ref<string | null>(null)

  let infoTimer: ReturnType<typeof setTimeout> | undefined
  let errorTimer: ReturnType<typeof setTimeout> | undefined

  function todayStr(): string {
    const d = new Date()
    const pad = (n: number) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
  }

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

  /**
   * 装载序列（§5.2）：严格串行——先 await weekBoard（触发物化→惯常日行+rail 就绪），
   * 再 await dayBoard（含顺延派生）。weekBoard 失败则短路跳过 dayBoard。
   * 不先调 weekBoard，惯常日行与 rail 均不存在（物化先行依赖，禁并行）。
   */
  async function load(currentDate: string): Promise<void> {
    date.value = currentDate
    loading.value = true
    error.value = null
    const weekStart = getWeekStart(currentDate)
    const wbRes = await api.flow.weekBoard(weekStart)
    const dbRes = wbRes.ok ? await api.flow.dayBoard(currentDate) : null
    loading.value = false
    if (!wbRes.ok) {
      setError(wbRes.error.message)
      weekBoard.value = null
    } else {
      weekBoard.value = wbRes.data
    }
    if (dbRes === null) {
      // weekBoard 失败短路：dayBoard 不装载（面板已由上方错误分支置空）
      dayBoard.value = null
    } else if (!dbRes.ok) {
      setError(dbRes.error.message)
      dayBoard.value = null
    } else {
      dayBoard.value = dbRes.data
    }
  }

  /**
   * 双 reload（dayBoard + weekBoard）：rail 显隐/完成态/清单三者联动。
   * 任一动作成功后统一调用，简单一致防漏。
   */
  async function reload(): Promise<void> {
    await load(date.value)
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

  // ===== 日任务行动作 =====

  /** 手动添加自由行（入口①） */
  function addManual(title: string) {
    return runAction(
      () => api.flow.entry.add({ date: date.value, title, source: 'manual' }),
      '已添加',
    )
  }

  /** rail 选取（入口②）：生成🔒行（不传 locked，服务端对 source='rail' 强制 locked=true） */
  function railPick(inst: FlowWeekInstance) {
    return runAction(
      () => api.flow.entry.add({
        date: date.value,
        title: inst.title,
        source: 'rail',
        weekInstanceId: inst.id,
      }),
      '已添加',
    )
  }

  /** 勾选/收勾 */
  function toggleEntry(id: number) {
    return runAction(() => api.flow.entry.toggleCheck(id))
  }

  /** 移除（软删） */
  function removeEntry(id: number) {
    return runAction(() => api.flow.entry.remove(id), '已移除')
  }

  /** 挪日 */
  function moveEntry(id: number, newDate: string) {
    return runAction(() => api.flow.entry.move(id, newDate), '已挪动')
  }

  /** 跳过本场（免罪） */
  function skipEntry(id: number) {
    return runAction(() => api.flow.entry.skip(id), '已跳过（不计未完成）')
  }

  /** 自由行改名 */
  function updateEntryTitle(id: number, title: string) {
    return runAction(() => api.flow.entry.update(id, { title }), '已改名')
  }

  /** 更新私有备注（🔒行与自由行均可；null = 清空备注） */
  function updateEntryNote(id: number, note: string | null) {
    return runAction(() => api.flow.entry.update(id, { note }))
  }

  return {
    // 状态
    date,
    dayBoard,
    weekBoard,
    loading,
    error,
    info,
    todayStr,
    // 装载
    load,
    reload,
    setInfo,
    setError,
    // 动作
    addManual,
    railPick,
    toggleEntry,
    removeEntry,
    moveEntry,
    skipEntry,
    updateEntryTitle,
    updateEntryNote,
  }
}