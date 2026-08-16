import { settingsRepo } from '../db/repositories/settingsRepo'
import { refreshNews } from './news'
import { logger } from '../lib/logger'

export async function maybeRunMorningRoutine(): Promise<void> {
  const today = new Date().toISOString().slice(0, 10) // YYYY-MM-DD

  const last = settingsRepo.get('lastMorningRoutine')?.value
  if (last === today) {
    logger.info('Morning routine already ran today, skipping')
    return
  }

  const nowMin = new Date().toTimeString().slice(0, 5) // HH:MM
  const start = settingsRepo.get('morningStart')?.value || '06:00'
  const end = settingsRepo.get('morningEnd')?.value || '09:00'

  if (nowMin < start || nowMin > end) {
    logger.info(`Outside morning window (${start}-${end}), skipping`)
    return
  }

  logger.info('Running morning routine...')
  try {
    await refreshNews()
  } catch (e) {
    logger.error('Morning news refresh failed:', e)
  }

  settingsRepo.set('lastMorningRoutine', today, false)
  // news:updated 由 refreshNews() 内部统一发送
  logger.info('Morning routine complete')
}
