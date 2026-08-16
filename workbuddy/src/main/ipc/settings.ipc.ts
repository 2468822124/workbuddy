import { ipcMain } from 'electron'
import { IPC, err, ok } from '@shared/ipc'
import { settingsRepo } from '../db/repositories/settingsRepo'
import { getDb, isReadonlyMode } from '../db/connection'
import { logger } from '../lib/logger'

export function registerSettingsIpc(): void {
  ipcMain.handle(IPC.SETTINGS_GET, (_e, key: string) => {
    try {
      const s = settingsRepo.get(key)
      if (!s) return err('NOT_FOUND', `Setting '${key}' not found`)
      return ok(s)
    } catch (e: unknown) {
      logger.error('settings:get error', e)
      return err('INTERNAL', (e as Error).message)
    }
  })

  ipcMain.handle(IPC.SETTINGS_GET_ALL, () => {
    try {
      return ok(settingsRepo.getAll())
    } catch (e: unknown) {
      logger.error('settings:getAll error', e)
      return err('INTERNAL', (e as Error).message)
    }
  })

  ipcMain.handle(IPC.SETTINGS_SET, (_e, key: string, value: string) => {
    try {
      const existing = settingsRepo.get(key)
      const isEncrypted = existing?.isEncrypted ?? false
      const s = settingsRepo.set(key, value, isEncrypted)
      return ok(s)
    } catch (e: unknown) {
      logger.error('settings:set error', e)
      return err('INTERNAL', (e as Error).message)
    }
  })
}
