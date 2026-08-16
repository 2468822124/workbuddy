import { ref } from 'vue'
import { useApi } from './useApi'
import type { Project } from '@shared/types'

type ProjectWithCounts = Project & { totalTasks: number; openTasks: number }

export function useProjects() {
  const api = useApi()
  const projects = ref<ProjectWithCounts[]>([])
  const viewMode = ref<'kanban' | 'list'>(
    (localStorage.getItem('wb_proj_view') as 'kanban' | 'list') || 'kanban'
  )

  function toggleView(v: 'kanban' | 'list') {
    viewMode.value = v
    localStorage.setItem('wb_proj_view', v)
  }

  async function load() {
    const r = await api.projects.list()
    if (r.ok) projects.value = r.data as ProjectWithCounts[]
  }

  async function create(name: string, desc?: string) {
    const r = await api.projects.create({ name, description: desc })
    if (r.ok) { await load(); return r.data }
    return null
  }

  async function update(id: string, data: Partial<Project>) {
    const r = await api.projects.update({ id, ...data })
    if (r.ok) { await load(); return r.data }
    return null
  }

  async function remove(id: string) {
    const r = await api.projects.delete(id)
    if (r.ok) await load()
    return r.ok ? r.data : false
  }

  // Optimistic: move card locally, then persist
  async function changeStatus(id: string, status: Project['status']) {
    const i = projects.value.findIndex(p => p.id === id)
    if (i < 0) return
    const old = projects.value[i].status
    projects.value[i] = { ...projects.value[i], status }
    const r = await api.projects.update({ id, status })
    if (!r.ok) {
      projects.value[i] = { ...projects.value[i], status: old }
    }
  }

  return { projects, viewMode, toggleView, load, create, update, remove, changeStatus }
}
