import { getDb } from '../connection'
import { Project } from '@shared/types'

export const projectRepo = {
  findAll(includeDeleted = false): Project[] {
    const db = getDb()
    const where = includeDeleted ? '' : 'WHERE isDeleted = 0'
    return db.prepare(`SELECT * FROM projects ${where} ORDER BY createdAt DESC`).all() as Project[]
  },

  findById(id: string): Project | undefined {
    return getDb().prepare('SELECT * FROM projects WHERE id = ?').get(id) as Project | undefined
  },

  create(data: Omit<Project, 'createdAt' | 'updatedAt'>): Project {
    const now = new Date().toISOString()
    return getDb().prepare(`
      INSERT INTO projects (id, name, status, description, color, isDeleted, deletedAt, createdAt, updatedAt)
      VALUES (@id, @name, @status, @description, @color, @isDeleted, @deletedAt, @createdAt, @updatedAt)
      RETURNING *
    `).get({
      ...data,
      isDeleted: data.isDeleted ? 1 : 0,
      deletedAt: data.deletedAt ?? null,
      createdAt: now,
      updatedAt: now,
    }) as Project
  },

  update(id: string, data: Partial<Project>): Project | undefined {
    const now = new Date().toISOString()
    const existing = this.findById(id)
    if (!existing) return undefined
    const merged = { ...existing, ...data, updatedAt: now }
    getDb().prepare(`
      UPDATE projects SET name=@name, status=@status, description=@description, color=@color,
        isDeleted=@isDeleted, deletedAt=@deletedAt, updatedAt=@updatedAt
      WHERE id=@id
    `).run({ ...merged, isDeleted: merged.isDeleted ? 1 : 0 })
    return merged as Project
  },

  softDelete(id: string): boolean {
    const now = new Date().toISOString()
    const r = getDb().prepare(
      'UPDATE projects SET isDeleted=1, deletedAt=?, updatedAt=? WHERE id=? AND isDeleted=0'
    ).run(now, now, id)
    return r.changes > 0
  },

  listWithCounts(): (Project & { totalTasks: number; openTasks: number })[] {
    return getDb().prepare(`
      SELECT p.*,
        COUNT(t.id) AS totalTasks,
        SUM(CASE WHEN t.status='todo' AND t.isDeleted=0 THEN 1 ELSE 0 END) AS openTasks
      FROM projects p
      LEFT JOIN todos t ON t.projectId = p.id AND t.isDeleted = 0
      WHERE p.isDeleted = 0
      GROUP BY p.id
      ORDER BY p.createdAt DESC
    `).all() as (Project & { totalTasks: number; openTasks: number })[]
  },

  // 子阶段4：LLM 增强只读上下文（仅进行中项目，不写不改）
  findActive(): (Project & { totalTasks: number; openTasks: number })[] {
    return getDb().prepare(`
      SELECT p.*,
        COUNT(t.id) AS totalTasks,
        SUM(CASE WHEN t.status='todo' AND t.isDeleted=0 THEN 1 ELSE 0 END) AS openTasks
      FROM projects p
      LEFT JOIN todos t ON t.projectId = p.id AND t.isDeleted = 0
      WHERE p.isDeleted = 0 AND p.status = 'active'
      GROUP BY p.id
      ORDER BY p.createdAt DESC
    `).all() as (Project & { totalTasks: number; openTasks: number })[]
  },

  getWithCounts(id: string): (Project & { totalTasks: number; openTasks: number }) | undefined {
    return getDb().prepare(`
      SELECT p.*,
        COUNT(t.id) AS totalTasks,
        SUM(CASE WHEN t.status='todo' AND t.isDeleted=0 THEN 1 ELSE 0 END) AS openTasks
      FROM projects p
      LEFT JOIN todos t ON t.projectId = p.id AND t.isDeleted = 0
      WHERE p.isDeleted = 0 AND p.id = ?
      GROUP BY p.id
    `).get(id) as (Project & { totalTasks: number; openTasks: number }) | undefined
  },
}
