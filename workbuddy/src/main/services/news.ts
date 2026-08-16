import { RssProvider, NewsProviderConfig } from './rss-provider'
import { newsRepo } from '../db/repositories/newsRepo'
import { settingsRepo } from '../db/repositories/settingsRepo'
import { NewsItem } from '@shared/types'
import { DEFAULT_RSS_SOURCES } from '@shared/constants'
import { getMainWindow } from '../window'
import { logger } from '../lib/logger'

function sendNewsUpdated(): void {
  const win = getMainWindow()
  if (win && !win.isDestroyed()) {
    win.webContents.send('news:updated')
  }
}

export async function refreshNews(): Promise<{ count: number; ok: boolean }> {
  const raw = settingsRepo.get('newsProviders')?.value
  let providers: NewsProviderConfig[]
  try {
    providers = raw ? JSON.parse(raw) : DEFAULT_RSS_SOURCES
  } catch {
    providers = DEFAULT_RSS_SOURCES
  }

  logger.info(`Refreshing news from ${providers.length} provider(s)`)
  const results = await Promise.allSettled(
    providers.map(p => {
      const provider = new RssProvider(p)
      return provider.fetch()
    })
  )

  let allItems: NewsItem[] = []
  let okCount = 0
  for (const r of results) {
    if (r.status === 'fulfilled') {
      allItems = allItems.concat(r.value)
      okCount++
    } else {
      logger.warn(`News provider failed:`, r.reason?.message ?? r.reason)
    }
  }

  const count = newsRepo.upsertMany(allItems)
  const now = new Date().toISOString()
  settingsRepo.set('lastNewsFetchAt', now, false)
  settingsRepo.set('lastNewsFetchOk', okCount > 0 ? 'true' : 'false', false)

  sendNewsUpdated()

  logger.info(`News refresh done: ${okCount}/${providers.length} sources OK, ${count} new items`)
  return { count, ok: okCount > 0 }
}

export function getNews(limit = 5): NewsItem[] {
  return newsRepo.list(limit)
}
