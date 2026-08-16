import { getDb } from '../connection'
import { FlowPlanTemplate } from '@shared/flowTypes'

function rowToTemplate(r: Record<string, unknown>): FlowPlanTemplate {
  const row = r as unknown as FlowPlanTemplate & { isDeleted: unknown; items: string }
  let items: { text: string }[] = []
  try {
    items = JSON.parse(row.items || '[]') as { text: string }[]
  } catch {
    items = []
  }
  return { ...row, isDeleted: !!row.isDeleted, items }
}

export const flowTemplateRepo = {
  list(type?: FlowPlanTemplate['type']): FlowPlanTemplate[] {
    const sql = type
      ? 'SELECT * FROM flow_plan_templates WHERE isDeleted = 0 AND type = ? ORDER BY createdAt ASC, id ASC'
      : 'SELECT * FROM flow_plan_templates WHERE isDeleted = 0 ORDER BY createdAt ASC, id ASC'
    const stmt = getDb().prepare(sql)
    return (type ? stmt.all(type) : stmt.all())
      .map((r: unknown) => rowToTemplate(r as Record<string, unknown>))
  },

  findById(id: number): FlowPlanTemplate | undefined {
    const r = getDb().prepare('SELECT * FROM flow_plan_templates WHERE id = ?').get(id)
    return r ? rowToTemplate(r as Record<string, unknown>) : undefined
  },

  create(data: Omit<FlowPlanTemplate, 'id' | 'isDeleted' | 'deletedAt' | 'createdAt' | 'updatedAt'>): FlowPlanTemplate {
    const now = new Date().toISOString()
    const r = getDb().prepare(`
      INSERT INTO flow_plan_templates (name, type, items, isDeleted, deletedAt, createdAt, updatedAt)
      VALUES (@name, @type, @items, 0, NULL, @now, @now)
      RETURNING *
    `).get({ ...data, items: JSON.stringify(data.items ?? []), now }) as Record<string, unknown>
    return rowToTemplate(r)
  },

  update(id: number, data: Partial<Pick<FlowPlanTemplate, 'name' | 'items'>>): FlowPlanTemplate | undefined {
    const existing = this.findById(id)
    if (!existing) return undefined
    const items = data.items !== undefined ? JSON.stringify(data.items) : JSON.stringify(existing.items)
    const now = new Date().toISOString()
    getDb().prepare(`
      UPDATE flow_plan_templates SET name=@name, items=@items, updatedAt=@updatedAt WHERE id=@id
    `).run({ id: existing.id, name: data.name ?? existing.name, items, updatedAt: now })
    return this.findById(id)
  },

  softDelete(id: number): boolean {
    const now = new Date().toISOString()
    const r = getDb().prepare(
      'UPDATE flow_plan_templates SET isDeleted=1, deletedAt=?, updatedAt=? WHERE id=? AND isDeleted=0'
    ).run(now, now, id)
    return r.changes > 0
  },
}
