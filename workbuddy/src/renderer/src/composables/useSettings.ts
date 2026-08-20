import { ref, onMounted } from 'vue'
import { useApi } from './useApi'
import type { Setting } from '@shared/types'

export function useSettings() {
  const api = useApi()
  const settings = ref<Record<string, string>>({})
  const loading = ref(true)
  const testResult = ref<{ ok: boolean; message?: string; latencyMs?: number } | null>(null)
  const testing = ref(false)

  async function load() {
    const r = await api.settings.getAll()
    if (r.ok) {
      const map: Record<string, string> = {}
      for (const s of r.data) map[s.key] = s.value
      settings.value = map
    }
    loading.value = false
  }

  async function save(key: string, value: string) {
    await api.settings.set(key, value)
    settings.value[key] = value
    // on complete config, mark onboarded
    if (key === 'nickname' || key === 'llmBaseUrl' || key === 'llmApiKey') {
      await api.settings.set('onboarded', 'true')
    }
  }

  async function testLlm(baseUrl: string, model: string, apiKey: string) {
    testing.value = true
    testResult.value = null
    const r = await api.llm.test({ baseUrl, model, apiKey })
    testResult.value = r.ok ? r.data : { ok: false, message: (r as any)?.error?.message ?? '测试失败' }
    testing.value = false
  }

  async function exportData() {
    return api.data.export()
  }

  async function importData() {
    return api.data.import()
  }

  // 阶段6：旧表归档（设置页显式触发；Result 含 counts/路径，错误经反馈条展示）
  async function archiveLegacy() {
    return api.archive.legacy()
  }

  async function refreshNews() {
    const r = await api.news.refresh()
    return r.ok && r.data?.ok
  }

  onMounted(load)

  return { settings, loading, testResult, testing, save, testLlm, exportData, importData, refreshNews, archiveLegacy }
}
