import { getDb } from '../connection'

export function init001(): void {
  const db = getDb()

  db.exec(`
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      description TEXT,
      color TEXT,
      isDeleted INTEGER NOT NULL DEFAULT 0,
      deletedAt TEXT,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS todos (
      id TEXT PRIMARY KEY,
      content TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'todo',
      planDate TEXT,
      projectId TEXT REFERENCES projects(id) ON DELETE SET NULL,
      isDeleted INTEGER NOT NULL DEFAULT 0,
      deletedAt TEXT,
      completedAt TEXT,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_todos_plan ON todos(planDate) WHERE isDeleted=0;
    CREATE INDEX IF NOT EXISTS idx_todos_project ON todos(projectId) WHERE isDeleted=0;

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      isEncrypted INTEGER NOT NULL DEFAULT 0,
      updatedAt TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS inboxes (
      id TEXT PRIMARY KEY,
      content TEXT NOT NULL,
      isProcessed INTEGER NOT NULL DEFAULT 0,
      processedType TEXT,
      processedAt TEXT,
      createdAt TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS plans (
      id TEXT PRIMARY KEY,
      date TEXT,
      type TEXT,
      content TEXT,
      generatedTodoIds TEXT,
      templateId TEXT,
      createdAt TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS templates (
      id TEXT PRIMARY KEY,
      name TEXT,
      type TEXT,
      content TEXT,
      isDefault INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS reviews (
      id TEXT PRIMARY KEY,
      date TEXT,
      type TEXT,
      content TEXT,
      linkedProjectIds TEXT
    );

    CREATE TABLE IF NOT EXISTS notes (
      id TEXT PRIMARY KEY,
      type TEXT,
      title TEXT,
      content TEXT,
      linkedNoteIds TEXT,
      isDeleted INTEGER NOT NULL DEFAULT 0,
      createdAt TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS books (
      id TEXT PRIMARY KEY,
      title TEXT,
      author TEXT,
      status TEXT
    );

    CREATE TABLE IF NOT EXISTS workout_logs (
      id TEXT PRIMARY KEY,
      type TEXT,
      durationMin INTEGER,
      distanceKm REAL,
      feeling TEXT,
      createdAt TEXT NOT NULL
    );
  `)
}
