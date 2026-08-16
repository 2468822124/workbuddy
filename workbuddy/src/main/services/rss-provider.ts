import Parser from 'rss-parser'
import { createHash } from 'crypto'
import { NewsItem } from '@shared/types'

export interface NewsProviderConfig {
  id: string
  name: string
  type: 'rss'
  url: string
}

function hash(s: string): string {
  return createHash('sha1').update(s).digest('hex').slice(0, 32)
}

export class RssProvider {
  private config: NewsProviderConfig

  constructor(config: NewsProviderConfig) {
    this.config = config
  }

  async fetch(): Promise<NewsItem[]> {
    const parser = new Parser({
      timeout: 6000,
      headers: { 'User-Agent': 'WorkBuddy/0.1' },
    })
    const feed = await parser.parseURL(this.config.url)

    return (feed.items ?? []).map(item => {
      const link = item.link ?? ''
      return {
        id: hash(link),
        title: item.title ?? '(无标题)',
        link,
        source: this.config.name,
        sourceId: this.config.id,
        summary: item.contentSnippet?.slice(0, 280) ?? null,
        publishedAt: item.isoDate ?? item.pubDate ?? null,
        fetchedAt: '', // set by repo
      } as NewsItem
    })
  }
}
