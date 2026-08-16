import { registerSettingsIpc } from './settings.ipc'
import { registerNewsIpc } from './news.ipc'
import { registerTodosIpc } from './todos.ipc'
import { registerProjectsIpc } from './projects.ipc'
import { registerLlmIpc } from './llm.ipc'
import { registerDataIpc } from './data.ipc'
import { registerTemplatesIpc } from './templates.ipc'
import { registerPlansIpc } from './plans.ipc'
import { registerReviewsIpc } from './reviews.ipc'
import { registerFlowIpc } from './flow.ipc'
import { ipcMain } from 'electron'
import { IPC, ok, err } from '@shared/ipc'
import { getDb, isReadonlyMode } from '../db/connection'
import { settingsRepo } from '../db/repositories/settingsRepo'
import { logger } from '../lib/logger'

export function registerAllIpc(): void {
  registerSettingsIpc()
  registerNewsIpc()
  registerTodosIpc()
  registerProjectsIpc()
  registerLlmIpc()
  registerDataIpc()
  registerTemplatesIpc()
  registerPlansIpc()
  registerReviewsIpc()
  registerFlowIpc()

  ipcMain.handle(IPC.DB_HEALTH, () => {
    try {
      const db = getDb()
      const v = db.prepare('SELECT MAX(version) as v FROM __schema_migrations').get() as { v: number }
      return ok({ ok: true, schemaVersion: v?.v ?? 0, readonly: isReadonlyMode() })
    } catch (e: unknown) {
      logger.error('db:health error', e)
      return err('DB_ERROR', (e as Error).message)
    }
  })

  ipcMain.handle(IPC.APP_FIRST_LAUNCH, () => {
    try {
      // onboarded 不在 seedDefaults 中，首次启动不存在或值不为 'true'
      const s = settingsRepo.get('onboarded')
      return ok(!s || s.value !== 'true')
    } catch (e: unknown) {
      logger.error('app:isFirstLaunch error', e)
      return err('INTERNAL', (e as Error).message)
    }
  })
}
