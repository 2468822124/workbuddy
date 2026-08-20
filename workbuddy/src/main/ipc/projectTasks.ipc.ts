import { ipcMain } from 'electron'
import { IPC, ok, err } from '@shared/ipc'
import { projectTaskRepo } from '../db/repositories/projectTaskRepo'
import { CreateProjectTaskInput, UpdateProjectTaskInput } from '@shared/types'
import { isValidDate } from '@shared/period'
import { isReadonlyMode } from '../db/connection'
import { logger } from '../lib/logger'

/** IPC 首行校验（规格 §5.7）：类型、必填、日期、长度和 id；全部返回 Result<T>。 */

function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.trim().length > 0
}

function isPlanDate(v: unknown): v is string | null {
  return v === null || (typeof v === 'string' && isValidDate(v))
}

function isContent(v: unknown): v is string {
  return typeof v === 'string' && v.trim().length > 0 && v.trim().length <= 200
}

function isWriteAllowed(): boolean {
  return !isReadonlyMode()
}

export function registerProjectTasksIpc(): void {
  ipcMain.handle(IPC.PROJECT_TASKS_LIST_BY_PROJECT, (_e, projectId: unknown) => {
    try {
      if (!isNonEmptyString(projectId)) return err('INVALID_INPUT', '项目 id 必填')
      return ok(projectTaskRepo.listByProject(projectId))
    } catch (e: unknown) {
      logger.error('projectTasks:listByProject error', e)
      return err('INTERNAL', (e as Error).message)
    }
  })

  ipcMain.handle(IPC.PROJECT_TASKS_CREATE, (_e, data: unknown) => {
    try {
      if (!isWriteAllowed()) return err('READ_ONLY', '数据库只读，无法写入')
      const input = data as CreateProjectTaskInput
      if (!isContent(input?.content)) return err('INVALID_INPUT', '内容必填且不超过200字符')
      if (!isNonEmptyString(input?.projectId)) return err('INVALID_INPUT', '项目 id 必填')
      if (input?.planDate !== undefined && !isPlanDate(input.planDate)) return err('INVALID_INPUT', '计划日期格式非法')
      return ok(projectTaskRepo.createProjectTask({
        content: input.content,
        planDate: input.planDate ?? null,
        projectId: input.projectId,
      }))
    } catch (e: unknown) {
      logger.error('projectTasks:create error', e)
      return err('INTERNAL', (e as Error).message)
    }
  })

  ipcMain.handle(IPC.PROJECT_TASKS_UPDATE, (_e, data: unknown) => {
    try {
      if (!isWriteAllowed()) return err('READ_ONLY', '数据库只读，无法写入')
      const input = data as UpdateProjectTaskInput & { id?: unknown }
      if (!isNonEmptyString(input?.id)) return err('INVALID_INPUT', '任务 id 必填')
      if (input?.content !== undefined && !isContent(input.content)) return err('INVALID_INPUT', '内容必填且不超过200字符')
      if (input?.planDate !== undefined && !isPlanDate(input.planDate)) return err('INVALID_INPUT', '计划日期格式非法')
      const t = projectTaskRepo.updateProjectTask(input.id as string, {
        content: input.content,
        planDate: input.planDate,
      })
      if (!t) return err('NOT_FOUND', '任务不存在')
      return ok(t)
    } catch (e: unknown) {
      logger.error('projectTasks:update error', e)
      return err('INTERNAL', (e as Error).message)
    }
  })

  ipcMain.handle(IPC.PROJECT_TASKS_DELETE, (_e, id: unknown) => {
    try {
      if (!isWriteAllowed()) return err('READ_ONLY', '数据库只读，无法写入')
      if (!isNonEmptyString(id)) return err('INVALID_INPUT', '任务 id 必填')
      return ok({ ok: projectTaskRepo.softDelete(id) })
    } catch (e: unknown) {
      logger.error('projectTasks:delete error', e)
      return err('INTERNAL', (e as Error).message)
    }
  })

  ipcMain.handle(IPC.PROJECT_TASKS_TOGGLE, (_e, id: unknown) => {
    try {
      if (!isWriteAllowed()) return err('READ_ONLY', '数据库只读，无法写入')
      if (!isNonEmptyString(id)) return err('INVALID_INPUT', '任务 id 必填')
      const t = projectTaskRepo.toggleDone(id)
      if (!t) return err('NOT_FOUND', '任务不存在')
      return ok(t)
    } catch (e: unknown) {
      logger.error('projectTasks:toggle error', e)
      return err('INTERNAL', (e as Error).message)
    }
  })
}
