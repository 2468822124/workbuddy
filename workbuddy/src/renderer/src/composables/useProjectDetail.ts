import { ref, computed } from 'vue'
import { useApi } from './useApi'
import type { Project, Todo } from '@shared/types'

type ProjectWithCounts = Project & { totalTasks: number; openTasks: number }

export function useProjectDetail(id: string) {
  const api = useApi()
  const project = ref<ProjectWithCounts | null>(null)
  const todos = ref<Todo[]>([])
  const notFound = ref(false)

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
    const r = await api.todos.byProject(id)
    if (r.ok) todos.value = r.data
  }

  async function updateProject(data: Partial<Project>) {
    const r = await api.projects.update({ id, ...data })
    if (r.ok) project.value = r.data as ProjectWithCounts
    return r.ok
  }

  async function removeProject() {
    const r = await api.projects.delete(id)
    return r.ok ? r.data : false
  }

  async function createTodo(content: string, planDate: string | null) {
    const r = await api.todos.create({ content, planDate, projectId: id })
    if (r.ok) todos.value = [r.data, ...todos.value]
    return r.ok ? r.data : null
  }

  async function updateTodo(todoId: string, data: { content?: string; planDate?: string | null }) {
    const r = await api.todos.update({ id: todoId, ...data })
    if (r.ok) {
      const i = todos.value.findIndex(t => t.id === todoId)
      if (i >= 0) todos.value[i] = r.data
    }
    return r.ok
  }

  async function deleteTodo(todoId: string) {
    const r = await api.todos.delete(todoId)
    if (r.ok) todos.value = todos.value.filter(t => t.id !== todoId)
    return r.ok
  }

  async function toggleTodo(todoId: string) {
    const r = await api.todos.toggle(todoId)
    if (r.ok) {
      const i = todos.value.findIndex(t => t.id === todoId)
      if (i >= 0) todos.value[i] = r.data // immutable replace
    }
    return r.ok
  }

  return { project, todos, notFound, load, updateProject, removeProject, createTodo, updateTodo, deleteTodo, toggleTodo }
}
