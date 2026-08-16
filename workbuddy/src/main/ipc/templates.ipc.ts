import { ipcMain } from 'electron'
import { IPC, ok, err } from '@shared/ipc'
import { TemplateType } from '@shared/types'
import { templateRepo } from '../db/repositories/templateRepo'
import { logger } from '../lib/logger'

export function registerTemplatesIpc(): void {
  ipcMain.handle(IPC.TEMPLATES_LIST, (_e, arg?: { type?: TemplateType }) => {
    try {
      const templates = templateRepo.findAll(arg?.type)
      return ok(templates)
    } catch (e: unknown) {
      logger.error('templates:list error', e)
      return err('INTERNAL', (e as Error).message)
    }
  })

  ipcMain.handle(IPC.TEMPLATES_GET, (_e, arg: { id: string }) => {
    try {
      const t = templateRepo.findById(arg.id)
      if (!t) return err('NOT_FOUND', 'Template not found')
      return ok(t)
    } catch (e: unknown) {
      logger.error('templates:get error', e)
      return err('INTERNAL', (e as Error).message)
    }
  })

  ipcMain.handle(IPC.TEMPLATES_UPSERT, (_e, arg: {
    id?: string
    name?: string | null
    type?: string | null
    content?: string | null
    isDefault?: boolean
    isDeleted?: boolean
    deletedAt?: string | null
  }) => {
    try {
      // Validate type if provided
      if (arg.type != null) {
        const validTypes: TemplateType[] = ['daily_plan', 'weekly_plan', 'monthly_plan', 'daily_review', 'weekly_review', 'monthly_review']
        if (!validTypes.includes(arg.type as TemplateType)) {
          return err('INVALID', `Invalid template type: ${arg.type}`)
        }
      }
      const t = templateRepo.upsert({
        id: arg.id ?? '',
        name: arg.name ?? null,
        type: (arg.type as TemplateType) ?? null,
        content: arg.content ?? null,
        isDefault: arg.isDefault ?? false,
        isDeleted: arg.isDeleted ?? false,
        deletedAt: arg.deletedAt ?? null,
      })
      return ok(t)
    } catch (e: unknown) {
      logger.error('templates:upsert error', e)
      return err('INTERNAL', (e as Error).message)
    }
  })

  ipcMain.handle(IPC.TEMPLATES_DELETE, (_e, arg: { id: string }) => {
    try {
      const t = templateRepo.findById(arg.id)
      if (t && t.isDefault) {
        return err('INVALID', '默认模板不可删除')
      }
      const ok_ = templateRepo.softDelete(arg.id)
      return ok({ ok: ok_ })
    } catch (e: unknown) {
      logger.error('templates:delete error', e)
      return err('INTERNAL', (e as Error).message)
    }
  })
}
