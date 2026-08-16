// ========================================
// 任务数据流通重构 · 阶段3 模板管理 composable
// 模板 CRUD 状态编排 + 套用确认卡交互
// ========================================

import { ref } from 'vue'
import { useApi } from './useApi'
import type { FlowPlanTemplate } from '@shared/flowTypes'

const INFO_MS = 4000
const ERROR_MS = 8000

export function useFlowTemplates() {
  const api = useApi()

  const templates = ref<FlowPlanTemplate[]>([])
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

  async function load(): Promise<void> {
    loading.value = true
    error.value = null
    const res = await api.flow.templates.list()
    loading.value = false
    if (res.ok) {
      templates.value = res.data
    } else {
      setError(res.error.message)
    }
  }

  async function reload(): Promise<void> {
    await load()
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

  function save(data: { id?: number; name: string; type: 'daily' | 'weekly'; items: { text: string }[] }) {
    return runAction(() => api.flow.templates.save(data), data.id ? '已保存' : '已创建')
  }

  function remove(id: number) {
    return runAction(() => api.flow.templates.delete(id), '已删除')
  }

  return {
    templates,
    loading,
    error,
    info,
    load,
    reload,
    save,
    remove,
    setInfo,
    setError,
  }
}