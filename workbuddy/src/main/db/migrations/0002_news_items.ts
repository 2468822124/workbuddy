import { getDb } from '../connection'

export function init002(): void {
  const db = getDb()
  db.exec(`
    CREATE TABLE IF NOT EXISTS news_items (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      link TEXT NOT NULL UNIQUE,
      source TEXT NOT NULL,
      sourceId TEXT,
      summary TEXT,
      publishedAt TEXT,
      fetchedAt TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_news_published ON news_items(publishedAt DESC);
  `)
}
