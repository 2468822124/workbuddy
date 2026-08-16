import { ipcMain } from 'electron'
import { IPC, ok, err } from '@shared/ipc'
import { getNews, refreshNews } from '../services/news'
import { settingsRepo } from '../db/repositories/settingsRepo'
import { logger } from '../lib/logger'

export function registerNewsIpc(): void {
  ipcMain.handle(IPC.NEWS_LIST, (_e, limit?: number) => {
    try {
      return ok(getNews(limit ?? 5))
    } catch (e: unknown) {
      logger.error('news:list error', e)
      return err('INTERNAL', (e as Error).message)
    }
  })

  ipcMain.handle(IPC.NEWS_REFRESH, async () => {
    try {
      const result = await refreshNews()
      return ok(result)
    } catch (e: unknown) {
      logger.error('news:refresh error', e)
      return err('NEWS_REFRESH_FAILED', (e as Error).message)
    }
  })

  ipcMain.handle(IPC.MORNING_STATUS, () => {
    try {
      const today = new Date().toISOString().slice(0, 10)
      const last = settingsRepo.get('lastMorningRoutine')?.value ?? ''
      const start = settingsRepo.get('morningStart')?.value ?? '06:00'
      const end = settingsRepo.get('morningEnd')?.value ?? '09:00'
      const nowMin = new Date().toTimeString().slice(0, 5)
      return ok({ ranToday: last === today, lastRun: last, inWindow: nowMin >= start && nowMin <= end })
    } catch (e: unknown) {
      logger.error('morning:status error', e)
      return err('INTERNAL', (e as Error).message)
    }
  })
}
