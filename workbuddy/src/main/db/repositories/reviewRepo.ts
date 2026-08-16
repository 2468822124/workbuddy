import { getDb } from '../connection'
import { Review, TemplateType } from '@shared/types'
import { randomUUID } from 'node:crypto'

function parseIds(raw: string | null | undefined): string[] {
  if (!raw) return []
  try {
    const v = JSON.parse(raw)
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []
  } catch {
    return []
  }
}

function rowToReview(r: Record<string, unknown>): Review {
  return {
    id: r.id as string,
    date: (r.date as string | null) ?? null,
    type: (r.type as string | null) ?? null,
    content: (r.content as string | null) ?? null,
    linkedProjectIds: parseIds(r.linkedProjectIds as string | null),
    isDeleted: !!r.isDeleted,
    deletedAt: (r.deletedAt as string | null) ?? null,
    createdAt: r.createdAt as string,
    updatedAt: r.updatedAt as string,
  }
}

export const reviewRepo = {
  findAll(opts?: { from?: string; to?: string; type?: string }): Review[] {
    const db = getDb()
    const conds: string[] = ['isDeleted = 0']
    const args: string[] = []
    if (opts?.from) { conds.push('date >= ?'); args.push(opts.from) }
    if (opts?.to) { conds.push('date <= ?'); args.push(opts.to) }
    if (opts?.type) { conds.push('type = ?'); args.push(opts.type) }
    return (db
      .prepare(`SELECT * FROM reviews WHERE ${conds.join(' AND ')} ORDER BY date DESC, createdAt DESC`)
      .all(...args) as Record<string, unknown>[]).map(rowToReview)
  },

  findById(id: string): Review | undefined {
    const r = getDb().prepare('SELECT * FROM reviews WHERE id = ?').get(id) as Record<string, unknown> | undefined
    if (!r || r.isDeleted) return undefined
    return rowToReview(r)
  },

  /**
   * 子阶段5：type + 期起始查询（date 已是期起始）。只读；多条取最新。
   */
  getByPeriod(type: TemplateType, start: string): Review | undefined {
    const r = getDb()
      .prepare('SELECT * FROM reviews WHERE type = ? AND date = ? AND isDeleted = 0 ORDER BY createdAt DESC LIMIT 1')
      .get(type, start) as Record<string, unknown> | undefined
    if (!r) return undefined
    return rowToReview(r)
  },

  findByDate(date: string, type?: string): Review | undefined {
    const db = getDb()
    if (type) {
      const r = db
        .prepare('SELECT * FROM reviews WHERE date = ? AND type = ? AND isDeleted = 0 ORDER BY createdAt DESC LIMIT 1')
        .get(date, type) as Record<string, unknown> | undefined
      if (!r) return undefined
      return rowToReview(r)
    }
    const r = db
      .prepare('SELECT * FROM reviews WHERE date = ? AND isDeleted = 0 ORDER BY createdAt DESC LIMIT 1')
      .get(date) as Record<string, unknown> | undefined
    if (!r) return undefined
    return rowToReview(r)
  },

  create(data: {
    id?: string; date: string | null; type?: string | null;
    content: string | null; linkedProjectIds?: string[]; templateId?: string | null;
  }): Review {
    const now = new Date().toISOString()
    const id = data.id || randomUUID()
    getDb().prepare(`
      INSERT INTO reviews (id, date, type, content, linkedProjectIds, isDeleted, deletedAt, createdAt, updatedAt)
      VALUES (@id, @date, @type, @content, @linkedProjectIds, 0, NULL, @createdAt, @updatedAt)
    `).run({
      id,
      date: data.date ?? null,
      type: data.type ?? null,
      content: data.content ?? null,
      linkedProjectIds: JSON.stringify(data.linkedProjectIds ?? []),
      createdAt: now,
      updatedAt: now,
    })
    return this.findById(id) as Review
  },

  update(id: string, data: Partial<Pick<Review, 'date' | 'type' | 'content' | 'linkedProjectIds'>>): Review | undefined {
    const now = new Date().toISOString()
    const existing = this.findById(id)
    if (!existing) return undefined
    const merged = {
      date: data.date !== undefined ? data.date : existing.date,
      type: data.type !== undefined ? data.type : existing.type,
      content: data.content !== undefined ? data.content : existing.content,
      linkedProjectIds: data.linkedProjectIds ?? existing.linkedProjectIds,
    }
    getDb().prepare(`
      UPDATE reviews
      SET date = @date, type = @type, content = @content, linkedProjectIds = @linkedProjectIds, updatedAt = @updatedAt
      WHERE id = @id
    `).run({
      id,
      date: merged.date ?? null,
      type: merged.type ?? null,
      content: merged.content ?? null,
      linkedProjectIds: JSON.stringify(merged.linkedProjectIds),
      updatedAt: now,
    })
    return this.findById(id) as Review
  },

  softDelete(id: string): boolean {
    const now = new Date().toISOString()
    const r = getDb()
      .prepare('UPDATE reviews SET isDeleted = 1, deletedAt = ?, updatedAt = ? WHERE id = ? AND isDeleted = 0')
      .run(now, now, id)
    return r.changes > 0
  },
}
