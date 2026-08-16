import { getDb } from '../connection'
import { NewsItem } from '@shared/types'

export const newsRepo = {
  list(limit = 5): NewsItem[] {
    return getDb().prepare(
      'SELECT * FROM news_items ORDER BY publishedAt DESC LIMIT ?'
    ).all(limit) as NewsItem[]
  },

  upsertMany(items: NewsItem[]): number {
    const db = getDb()
    const stmt = db.prepare(`
      INSERT INTO news_items (id, title, link, source, sourceId, summary, publishedAt, fetchedAt)
      VALUES (@id, @title, @link, @source, @sourceId, @summary, @publishedAt, @fetchedAt)
      ON CONFLICT(link) DO NOTHING
    `)
    let count = 0
    const insert = db.transaction(() => {
      for (const item of items) {
        const r = stmt.run({ ...item, fetchedAt: new Date().toISOString() })
        count += r.changes
      }
    })
    insert()
    return count
  },
}
