// ========================================
// 任务数据流通重构 · 阶段4 今日总览页聚合器
// 任务区改读 flow.dayBoard（与 /flow/day 同一实体双视图）；新闻/昵称读取保留。
// 纯函数导出供 tests/useToday.spec.ts 单测（技术栈规范 §6.4）
// ========================================

import { ref, computed, shallowRef, onMounted, onUnmounted } from 'vue'
import { useApi } from './useApi'
import { getWeekStart } from '@shared/period'
import type { NewsItem } from '@shared/types'
import type { DayBoard, DayBoardEntry } from '@shared/flowTypes'

// ===== 纯函数（导出单测） =====

/** 本地今天 YYYY-MM-DD（今日页装载基准；不用 UTC ISO 切片，避免东八区 0-8 点漂到昨天） */
export function localToday(): string {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** 今日页聚合计数（纯展示性派生）：总行 / 完成 / 顺延 */
export function boardSummary(entries: DayBoardEntry[]): {
  total: number
  doneCount: number
  deferredCount: number
} {
  return {
    total: entries.length,
    doneCount: entries.filter(e => e.done).length,
    deferredCount: entries.filter(e => e.deferredCount > 0).length,
  }
}

// ===== composable =====

const INFO_MS = 4000
const ERROR_MS = 8000

export function useToday() {
  const api = useApi()
  const dayBoard = shallowRef<DayBoard | null>(null)
  const newsItems = ref<NewsItem[]>([])
  const newsOk = ref(true)
  const nickname = ref('')
  const error = ref<string | null>(null)
  const info = ref<string | null>(null)

  const entries = computed(() => dayBoard.value?.entries ?? [])
  const summary = computed(() => boardSummary(entries.value))

  let infoTimer: ReturnType<typeof setTimeout> | undefined
  let errorTimer: ReturnType<typeof setTimeout> | undefined
  let midnightTimer: ReturnType<typeof setTimeout> | undefined

  /** F2：今日日期一律按需现算（不捕获初始化快照），跨午夜语义不失真 */
  function todayStr(): string {
    return localToday()
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
   * 装载序列（承袭阶段3 F1）：先 weekBoard（触发惰性物化 → 惯常日行/rail 就绪），
   * 再 dayBoard（含顺延与阶段4 来源投影合成）。weekBoard 失败短路 dayBoard。
   */
  async function loadBoard(): Promise<void> {
    const today = todayStr()
    const wbRes = await api.flow.weekBoard(getWeekStart(today))
    const dbRes = wbRes.ok ? await api.flow.dayBoard(today) : null
    if (!wbRes.ok) {
      setError(wbRes.error.message)
      dayBoard.value = null
      return
    }
    if (dbRes === null) {
      dayBoard.value = null
    } else if (!dbRes.ok) {
      setError(dbRes.error.message)
      dayBoard.value = null
    } else {
      dayBoard.value = dbRes.data
    }
  }

  async function loadAll() {
    const [nw, nick, nfo] = await Promise.all([
      api.news.list(5),
      api.settings.get('nickname'),
      api.settings.get('lastNewsFetchOk'),
    ])
    await loadBoard()
    if (nw.ok) newsItems.value = nw.data as NewsItem[]
    newsOk.value = nfo.ok && nfo.data.value === 'true'
    if (nick.ok) nickname.value = nick.data.value || '朋友'
  }

  async function loadNews() {
    const [nw, nfo] = await Promise.all([
      api.news.list(5),
      api.settings.get('lastNewsFetchOk'),
    ])
    if (nw.ok) newsItems.value = nw.data as NewsItem[]
    newsOk.value = nfo.ok && nfo.data.value === 'true'
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
    await loadBoard()
    return true
  }

  /** 手动新增自由行（今日页快速添加入口；日期按需现算） */
  function addManual(title: string) {
    return runAction(
      () => api.flow.entry.add({ date: todayStr(), title, source: 'manual' }),
      '已添加',
    )
  }

  /** 勾选/收勾（project/reminder 由服务端回写源状态） */
  function toggleEntry(id: number) {
    return runAction(() => api.flow.entry.toggleCheck(id))
  }

  /** 移出今日（软删投影行；project/reminder 不碰源） */
  function removeEntry(id: number) {
    return runAction(() => api.flow.entry.remove(id), '已移出今日')
  }

  /** 更新私有备注 */
  function updateEntryNote(id: number, note: string | null) {
    return runAction(() => api.flow.entry.update(id, { note }))
  }

  /** 自由行改名（锁定行/投影行由服务端守卫） */
  function updateEntryTitle(id: number, title: string) {
    return runAction(() => api.flow.entry.update(id, { title }), '已改名')
  }

  /** 挪日（project/reminder 投影行由服务端守卫禁挪） */
  function moveEntry(id: number, newDate: string) {
    return runAction(() => api.flow.entry.move(id, newDate), '已挪动')
  }

  /** 跳过本场（免罪；project/reminder 投影行由服务端守卫禁跳） */
  function skipEntry(id: number) {
    return runAction(() => api.flow.entry.skip(id), '已跳过（不计未完成）')
  }

  async function refreshNews() {
    const r = await api.news.refresh()
    if (r.ok && r.data.ok) {
      await loadNews()
    }
    // if not ok, newsOk stays as is; card will show cache or retry
  }

  let unsubNews: (() => void) | undefined

  /** F2：午夜定时重载（次日 00:00:02 触发 board 刷新后重排下一次；组件卸载即清除） */
  function scheduleMidnightReload(): void {
    clearTimeout(midnightTimer)
    const now = new Date()
    const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 2)
    midnightTimer = setTimeout(() => {
      loadBoard()
      scheduleMidnightReload()
    }, next.getTime() - now.getTime())
  }

  onMounted(() => {
    loadAll()
    unsubNews = api.onNewsUpdated(() => loadNews())
    scheduleMidnightReload()
  })

  onUnmounted(() => {
    unsubNews?.()
    clearTimeout(midnightTimer)
  })

  return {
    // 状态
    entries,
    summary,
    newsItems,
    newsOk,
    nickname,
    error,
    info,
    // F2：暴露按需日期函数（模板绑定处每次现算，跨午夜自动更新）
    todayStr,
    // 装载
    loadBoard,
    setInfo,
    setError,
    // 动作
    addManual,
    toggleEntry,
    removeEntry,
    updateEntryNote,
    updateEntryTitle,
    moveEntry,
    skipEntry,
    refreshNews,
  }
}
