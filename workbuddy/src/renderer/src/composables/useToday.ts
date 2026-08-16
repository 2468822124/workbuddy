import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useApi } from './useApi'
import type { TodoWithSource, NewsItem } from '@shared/types'

export function useToday() {
  const api = useApi()
  // F3.2-2：列表项携带 sourceLabel 出处标注（todos:withSource 返回）
  const todayTodos = ref<TodoWithSource[]>([])
  const overdueTodos = ref<TodoWithSource[]>([])
  const newsItems = ref<NewsItem[]>([])
  const newsOk = ref(true)
  const nickname = ref('')

  const doneCount = computed(() => todayTodos.value.filter(t => t.status === 'done').length)
  const total = computed(() => todayTodos.value.length)

  const today = new Date().toISOString().slice(0, 10)

  // F3.2-2：一次 IPC 拉今日+逾期（含 sourceLabel）；变更后重拉，保证 label 与最新状态一致
  async function refreshTodos() {
    const wd = await api.todos.withSource(today)
    if (wd.ok) {
      todayTodos.value = wd.data.today
      overdueTodos.value = wd.data.overdue
    }
  }

  async function loadAll() {
    const [nw, nick, nfo] = await Promise.all([
      api.news.list(5),
      api.settings.get('nickname'),
      api.settings.get('lastNewsFetchOk'),
    ])
    await refreshTodos()
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

  async function toggleTodo(id: string) {
    const r = await api.todos.toggle(id)
    if (r.ok) await refreshTodos() // toggle 可能改 status（顺延规则依赖），重拉保持 label 正确
  }

  async function rescheduleTodo(id: string) {
    const r = await api.todos.rescheduleToday(id)
    if (r.ok) await refreshTodos() // 逾期→今日转移
  }

  async function quickCreate(content: string) {
    if (!content.trim()) return
    const r = await api.todos.quickCreate(content.trim())
    if (r.ok) await refreshTodos()
  }

  async function refreshNews() {
    const r = await api.news.refresh()
    if (r.ok && r.data.ok) {
      await loadNews()
    }
    // if not ok, newsOk stays as is; card will show cache or retry
  }

  let unsubNews: (() => void) | undefined

  onMounted(() => {
    loadAll()
    unsubNews = api.onNewsUpdated(() => loadNews())
  })

  onUnmounted(() => {
    unsubNews?.()
  })

  return {
    todayTodos,
    overdueTodos,
    newsItems,
    newsOk,
    nickname,
    doneCount,
    total,
    toggleTodo,
    rescheduleTodo,
    quickCreate,
    refreshNews,
  }
}
