import { ref, onMounted } from 'vue'
import { useApi } from './useApi'
import { LLM_QUERY_MAX_CHARS } from '@shared/constants'
import type { ChatResult } from '@shared/types'

export function useHotspotChat() {
  const api = useApi()
  const llmReady = ref(false)
  const query = ref('')
  const result = ref<ChatResult | null>(null)
  const loading = ref(false)
  const error = ref<{ code: string; message: string } | null>(null)

  async function checkReady() {
    const [b, m, k] = await Promise.all([
      api.settings.get('llmBaseUrl'),
      api.settings.get('llmModel'),
      api.settings.get('llmApiKey'),
    ])
    llmReady.value = !!(
      b.ok &&
      b.data.value.trim() &&
      m.ok &&
      m.data.value.trim() &&
      k.ok &&
      k.data.value.trim()
    )
  }

  async function search() {
    const q = query.value.trim()
    if (!q || loading.value) return
    if (q.length > LLM_QUERY_MAX_CHARS) {
      error.value = { code: 'INVALID', message: `问题过长（超过 ${LLM_QUERY_MAX_CHARS} 字）` }
      return
    }
    if (!llmReady.value) {
      error.value = { code: 'LLM_NOT_CONFIGURED', message: '未配置 AI，请先前往设置' }
      return
    }
    loading.value = true
    error.value = null
    result.value = null
    const r = await api.llm.search(q)
    loading.value = false
    if (r.ok) {
      result.value = r.data as ChatResult
    } else {
      error.value = r.error
    }
  }

  function clear() {
    result.value = null
    error.value = null
    query.value = ''
  }

  function openLink(url: string) {
    window.open(url, '_blank')
  }

  onMounted(checkReady)

  return { llmReady, query, result, loading, error, search, clear, openLink }
}
