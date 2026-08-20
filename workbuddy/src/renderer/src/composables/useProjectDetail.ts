import { ref } from 'vue'
import { useApi } from './useApi'
import { localToday } from './useToday'
import type { Project, ProjectTask } from '@shared/types'

type ProjectWithCounts = Project & { totalTasks: number; openTasks: number }

const INFO_MS = 4000
const ERROR_MS = 8000

export function useProjectDetail(id: string) {
  const api = useApi()
  const project = ref<ProjectWithCounts | null>(null)
  const todos = ref<ProjectTask[]>([])
  const notFound = ref(false)
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

  async function load() {
    const r = await api.projects.get(id)
    if (r.ok) {
      project.value = r.data as ProjectWithCounts
      notFound.value = false
      await loadTodos()
    } else {
      notFound.value = true
      project.value = null
    }
  }

  async function loadTodos() {
    const r = await api.projectTasks.listByProject(id)
    if (r.ok) todos.value = r.data
    else setError(r.error.message)
  }

  async function updateProject(data: Partial<Project>) {
    const r = await api.projects.update({ id, ...data })
    if (r.ok) project.value = r.data as ProjectWithCounts
    else setError(r.error.message)
    return r.ok
  }

  async function removeProject() {
    const r = await api.projects.delete(id)
    if (!r.ok) setError(r.error.message)
    return r.ok ? r.data : false
  }

  async function createTodo(content: string, planDate: string | null) {
    const r = await api.projectTasks.create({ content, planDate, projectId: id })
    if (r.ok) todos.value = [r.data, ...todos.value]
    else setError(r.error.message)
    return r.ok ? r.data : null
  }

  async function updateTodo(todoId: string, data: { content?: string; planDate?: string | null }) {
    const r = await api.projectTasks.update({ id: todoId, ...data })
    if (r.ok) {
      const i = todos.value.findIndex(t => t.id === todoId)
      if (i >= 0) todos.value[i] = r.data
    } else {
      setError(r.error.message)
    }
    return r.ok
  }

  async function deleteTodo(todoId: string) {
    const r = await api.projectTasks.delete(todoId)
    if (r.ok) todos.value = todos.value.filter(t => t.id !== todoId)
    else setError(r.error.message)
    return r.ok
  }

  async function toggleTodo(todoId: string) {
    const r = await api.projectTasks.toggle(todoId)
    if (r.ok) {
      const i = todos.value.findIndex(t => t.id === todoId)
      if (i >= 0) todos.value[i] = r.data // immutable replace
    } else {
      setError(r.error.message)
    }
    return r.ok
  }

  /** 阶段4：加入今日 → 生成 flow 今日投影（服务端幂等：同源同日重复加入返回同一行） */
  async function addToday(todoId: string) {
    const todo = todos.value.find(t => t.id === todoId)
    if (!todo) return false
    const r = await api.flow.entry.add({
      date: localToday(),
      title: todo.content,
      source: 'project',
      projectId: todoId,
    })
    if (!r.ok) {
      setError(r.error.message)
      return false
    }
    setInfo('已加入今日')
    return true
  }

  return {
    project, todos, notFound, error, info,
    load, updateProject, removeProject, createTodo, updateTodo, deleteTodo, toggleTodo, addToday,
  }
}
