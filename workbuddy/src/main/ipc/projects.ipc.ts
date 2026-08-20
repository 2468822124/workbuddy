import { ipcMain } from 'electron'
import { randomUUID } from 'crypto'
import { IPC, ok, err } from '@shared/ipc'
import { projectRepo } from '../db/repositories/projectRepo'
import { Project, ProjectStatus } from '@shared/types'
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
}
