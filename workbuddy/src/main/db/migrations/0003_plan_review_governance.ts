import { getDb } from '../connection'

/**
 * Idempotent helper: add column only if it does not already exist.
 * SQLite ALTER TABLE ADD COLUMN has no IF NOT EXISTS,
 * so we check PRAGMA table_info first.
 */
function addColumnIfMissing(table: string, colName: string, colDef: string): void {
  const db = getDb()
  const cols = db.pragma(`table_info(${table})`) as Array<{ name: string }>
  if (cols.some(c => c.name === colName)) return
  db.exec(`ALTER TABLE ${table} ADD COLUMN ${colName} ${colDef}`)
}

export function init003(): void {
  const db = getDb()

  // plans: add isDeleted, deletedAt, updatedAt (createdAt already exists)
  addColumnIfMissing('plans', 'isDeleted', 'INTEGER NOT NULL DEFAULT 0')
  addColumnIfMissing('plans', 'deletedAt', 'TEXT')
  addColumnIfMissing('plans', 'updatedAt', "TEXT NOT NULL DEFAULT ''")

  // templates: add isDeleted, deletedAt, createdAt, updatedAt (isDefault already exists)
  addColumnIfMissing('templates', 'isDeleted', 'INTEGER NOT NULL DEFAULT 0')
  addColumnIfMissing('templates', 'deletedAt', 'TEXT')
  addColumnIfMissing('templates', 'createdAt', "TEXT NOT NULL DEFAULT ''")
  addColumnIfMissing('templates', 'updatedAt', "TEXT NOT NULL DEFAULT ''")

  // reviews: add createdAt, updatedAt, isDeleted, deletedAt (table was bare-bones)
  addColumnIfMissing('reviews', 'createdAt', "TEXT NOT NULL DEFAULT ''")
  addColumnIfMissing('reviews', 'updatedAt', "TEXT NOT NULL DEFAULT ''")
  addColumnIfMissing('reviews', 'isDeleted', 'INTEGER NOT NULL DEFAULT 0')
  addColumnIfMissing('reviews', 'deletedAt', 'TEXT')

  // Indexes — CREATE INDEX IF NOT EXISTS is SQLite-safe
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_plans_date     ON plans(date)     WHERE isDeleted=0;
    CREATE INDEX IF NOT EXISTS idx_reviews_date   ON reviews(date)   WHERE isDeleted=0;
    CREATE INDEX IF NOT EXISTS idx_templates_type ON templates(type) WHERE isDeleted=0;
  `)
}
