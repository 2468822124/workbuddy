import { ipcMain } from 'electron'
import { randomUUID } from 'crypto'
import { IPC, ok, err } from '@shared/ipc'
import { projectRepo } from '../db/repositories/projectRepo'
import { todoRepo } from '../db/repositories/todoRepo'
import { Project, Todo, ProjectStatus } from '@shared/types'
import { logger } from '../lib/logger'

/** IPC 边界窄化：非法 status 值降级 active（与原 `?? 'active'` 语义一致）。 */
function normalizeStatus(s: string | undefined): ProjectStatus {
  return s === 'paused' || s === 'done' || s === 'dropped' ? s : 'active'
}

export function registerProjectsIpc(): void {
  // ── Projects ──
  ipcMain.handle(IPC.PROJECTS_LIST, () => {
    try {
      return ok(projectRepo.listWithCounts())
    } catch (e: unknown) {
      logger.error('projects:list error', e)
      return err('INTERNAL', (e as Error).message)
    }
  })

  ipcMain.handle(IPC.PROJECTS_GET, (_e, id: string) => {
    try {
      const p = projectRepo.getWithCounts(id)
      if (!p) return err('NOT_FOUND', '项目不存在')
      return ok(p)
    } catch (e: unknown) {
      logger.error('projects:get error', e)
      return err('INTERNAL', (e as Error).message)
    }
  })

  ipcMain.handle(IPC.PROJECTS_CREATE, (_e, data: { name: string; description?: string; status?: string }) => {
    try {
      if (!data.name?.trim()) return err('INVALID', '名称不能为空')
      if (data.name.trim().length > 80) return err('INVALID', '名称不超过80字符')
      const p = projectRepo.create({
        id: randomUUID(),
        name: data.name.trim(),
        status: normalizeStatus(data.status),
        description: (data.description ?? '').slice(0, 500) || null,
        color: null,
        isDeleted: false,
        deletedAt: null,
      })
      return ok(p)
    } catch (e: unknown) {
      logger.error('projects:create error', e)
      return err('INTERNAL', (e as Error).message)
    }
  })

  ipcMain.handle(IPC.PROJECTS_UPDATE, (_e, data: { id: string; name?: string; description?: string; status?: string }) => {
    try {
      if (data.name !== undefined && data.name.trim().length > 80) return err('INVALID', '名称不超过80字符')
      const partial: Record<string, unknown> = {}
      if (data.name !== undefined) partial.name = data.name.trim()
      if (data.description !== undefined) partial.description = (data.description ?? '').slice(0, 500) || null
      if (data.status !== undefined) partial.status = data.status
      const p = projectRepo.update(data.id, partial as Partial<Project>)
      if (!p) return err('NOT_FOUND', '项目不存在')
      return ok(p)
    } catch (e: unknown) {
      logger.error('projects:update error', e)
      return err('INTERNAL', (e as Error).message)
    }
  })

  ipcMain.handle(IPC.PROJECTS_DELETE, (_e, id: string) => {
    try {
      const ok_ = projectRepo.softDelete(id)
      return ok(ok_)
    } catch (e: unknown) {
      logger.error('projects:delete error', e)
      return err('INTERNAL', (e as Error).message)
    }
  })

  // ── Todos (project-scoped) ──
  ipcMain.handle(IPC.TODOS_BY_PROJECT, (_e, projectId: string) => {
    try {
      return ok(todoRepo.findByProject(projectId))
    } catch (e: unknown) {
      logger.error('todos:byProject error', e)
      return err('INTERNAL', (e as Error).message)
    }
  })

  ipcMain.handle(IPC.TODOS_CREATE, (_e, data: { content: string; planDate?: string; projectId: string }) => {
    try {
      if (!data.content?.trim()) return err('INVALID', '内容不能为空')
      if (data.content.trim().length > 200) return err('INVALID', '内容不超过200字符')
      const t = todoRepo.create({
        id: randomUUID(),
        content: data.content.trim(),
        status: 'todo',
        planDate: data.planDate ?? null,
        projectId: data.projectId,
        sourcePlanId: null, // F3.2-2 复审#1：项目任务非日规划生成，sourcePlanId 显式 null
        parentTaskRef: null, // v0.2修复计划：项目手动任务无上级任务链
        sourceInvalid: false, // 第二轮实测·问题②：非日规划生成，无失效来源
        sourceTaskTid: null, // 第三轮实测·问题乙：项目任务无任务级来源
        isDeleted: false,
        deletedAt: null,
        completedAt: null,
      })
      return ok(t)
    } catch (e: unknown) {
      logger.error('todos:create error', e)
      return err('INTERNAL', (e as Error).message)
    }
  })

  ipcMain.handle(IPC.TODOS_UPDATE, (_e, data: { id: string; content?: string; planDate?: string | null }) => {
    try {
      if (data.content !== undefined) {
        if (!data.content.trim()) return err('INVALID', '内容不能为空')
        if (data.content.trim().length > 200) return err('INVALID', '内容不超过200字符')
      }
      const partial: Record<string, unknown> = {}
      if (data.content !== undefined) partial.content = data.content.trim()
      if (data.planDate !== undefined) partial.planDate = data.planDate
      const t = todoRepo.update(data.id, partial as Partial<Todo>)
      if (!t) return err('NOT_FOUND', '任务不存在')
      return ok(t)
    } catch (e: unknown) {
      logger.error('todos:update error', e)
      return err('INTERNAL', (e as Error).message)
    }
  })

  ipcMain.handle(IPC.TODOS_DELETE, (_e, id: string) => {
    try {
      const ok_ = todoRepo.softDelete(id)
      return ok(ok_)
    } catch (e: unknown) {
      logger.error('todos:delete error', e)
      return err('INTERNAL', (e as Error).message)
    }
  })
}
