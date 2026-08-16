import { getDb } from '../connection'

/**
 * 任务数据流通重构 · 阶段1：flow_ 新任务域七表（与旧 plans/todos/tasks 物理隔离）。
 * 结构化库为任务域唯一真相源；完成态一律由 flow_vouchers 凭据池派生，不落状态字段。
 * 删除语义全部软删（isDeleted/deletedAt），无强外键 cascade（编排在 service）。
 * 全部 CREATE TABLE IF NOT EXISTS → 幂等；旧 0.2.0 存量库平滑升级。
 */
export function init008(): void {
  const db = getDb()

  db.exec(`
    CREATE TABLE IF NOT EXISTS flow_fixed_defs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      kind TEXT NOT NULL DEFAULT 'once' CHECK (kind IN ('once','multi')),
      targetCount INTEGER NOT NULL DEFAULT 1,
      weekdayMask INTEGER NOT NULL DEFAULT 0,
      recurrence TEXT NOT NULL DEFAULT 'WEEKLY',
      note TEXT,
      isDeleted INTEGER NOT NULL DEFAULT 0,
      deletedAt TEXT,
      createdAt TEXT NOT NULL DEFAULT '',
      updatedAt TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS flow_week_instances (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      weekStart TEXT NOT NULL,
      origin TEXT NOT NULL CHECK (origin IN ('temp','fixed')),
      fixedDefId INTEGER REFERENCES flow_fixed_defs(id),
      title TEXT NOT NULL,
      kind TEXT NOT NULL DEFAULT 'once' CHECK (kind IN ('once','multi')),
      targetCount INTEGER NOT NULL DEFAULT 1,
      sortOrder INTEGER NOT NULL DEFAULT 0,
      skippedAt TEXT,
      carriedFrom INTEGER REFERENCES flow_week_instances(id),
      isDeleted INTEGER NOT NULL DEFAULT 0,
      deletedAt TEXT,
      createdAt TEXT NOT NULL DEFAULT '',
      updatedAt TEXT NOT NULL DEFAULT ''
    );
    CREATE INDEX IF NOT EXISTS idx_fwi_week ON flow_week_instances(weekStart) WHERE isDeleted=0;
    CREATE INDEX IF NOT EXISTS idx_fwi_def  ON flow_week_instances(fixedDefId) WHERE isDeleted=0;

    CREATE TABLE IF NOT EXISTS flow_day_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL,
      title TEXT NOT NULL,
      source TEXT NOT NULL CHECK (source IN ('manual','rail','template','deferred','habit','project','reminder')),
      locked INTEGER NOT NULL DEFAULT 0,
      weekInstanceId INTEGER REFERENCES flow_week_instances(id),
      projectId INTEGER,
      reminderKey TEXT,
      templateId INTEGER,
      note TEXT,
      skippedAt TEXT,
      isDeleted INTEGER NOT NULL DEFAULT 0,
      deletedAt TEXT,
      createdAt TEXT NOT NULL DEFAULT '',
      updatedAt TEXT NOT NULL DEFAULT ''
    );
    CREATE INDEX IF NOT EXISTS idx_fde_date ON flow_day_entries(date) WHERE isDeleted=0;
    CREATE INDEX IF NOT EXISTS idx_fde_inst ON flow_day_entries(weekInstanceId) WHERE isDeleted=0;

    CREATE TABLE IF NOT EXISTS flow_vouchers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      targetType TEXT NOT NULL CHECK (targetType IN ('day_entry','week_instance')),
      targetId INTEGER NOT NULL,
      kind TEXT NOT NULL CHECK (kind IN ('check','manual','extra')),
      occurredAt TEXT NOT NULL,
      note TEXT,
      isDeleted INTEGER NOT NULL DEFAULT 0,
      deletedAt TEXT,
      createdAt TEXT NOT NULL DEFAULT '',
      updatedAt TEXT NOT NULL DEFAULT ''
    );
    CREATE INDEX IF NOT EXISTS idx_fv_target ON flow_vouchers(targetType,targetId) WHERE isDeleted=0;

    CREATE TABLE IF NOT EXISTS flow_month_goals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      month TEXT NOT NULL,
      title TEXT NOT NULL,
      closedAt TEXT,
      isDeleted INTEGER NOT NULL DEFAULT 0,
      deletedAt TEXT,
      createdAt TEXT NOT NULL DEFAULT '',
      updatedAt TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS flow_week_focus (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      weekStart TEXT NOT NULL,
      title TEXT NOT NULL,
      monthGoalId INTEGER REFERENCES flow_month_goals(id),
      doneAt TEXT,
      sortOrder INTEGER NOT NULL DEFAULT 0,
      isDeleted INTEGER NOT NULL DEFAULT 0,
      deletedAt TEXT,
      createdAt TEXT NOT NULL DEFAULT '',
      updatedAt TEXT NOT NULL DEFAULT ''
    );
    CREATE INDEX IF NOT EXISTS idx_fwf_week ON flow_week_focus(weekStart) WHERE isDeleted=0;

    CREATE TABLE IF NOT EXISTS flow_plan_templates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      type TEXT NOT NULL CHECK (type IN ('daily','weekly')),
      items TEXT NOT NULL DEFAULT '[]',
      isDeleted INTEGER NOT NULL DEFAULT 0,
      deletedAt TEXT,
      createdAt TEXT NOT NULL DEFAULT '',
      updatedAt TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS flow_journals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      scope TEXT NOT NULL CHECK (scope IN ('day','week','month')),
      periodKey TEXT NOT NULL,
      content TEXT NOT NULL DEFAULT '',
      isDeleted INTEGER NOT NULL DEFAULT 0,
      deletedAt TEXT,
      createdAt TEXT NOT NULL DEFAULT '',
      updatedAt TEXT NOT NULL DEFAULT ''
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_fj_unique ON flow_journals(scope, periodKey) WHERE isDeleted=0;
  `)
}
