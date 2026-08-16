import { getDb } from '../connection'
import { Template, TemplateType } from '@shared/types'
import { randomUUID } from 'node:crypto'
import { logger } from '../../lib/logger'

function rowToTemplate(r: Record<string, unknown>): Template {
  return {
    id: r.id as string,
    name: (r.name as string | null) ?? null,
    type: (r.type as TemplateType | null) ?? null,
    content: (r.content as string | null) ?? null,
    isDefault: !!r.isDefault,
    isDeleted: !!r.isDeleted,
    deletedAt: (r.deletedAt as string | null) ?? null,
    createdAt: r.createdAt as string,
    updatedAt: r.updatedAt as string,
  }
}

const DEFAULT_TEMPLATES: Array<{ id: string; name: string; type: TemplateType; content: string }> = [
  {
    id: 'tpl-default-daily-plan',
    name: '日计划',
    type: 'daily_plan',
    content:
      '# \u{1F4C5} 日计划 · {{date}}\n\n## \u{1F3AF} 今日重点\n{{focus}}\n\n## ✅ 任务清单\n- [ ] \n- [ ] \n- [ ] \n\n## \u{1F552} 时间安排\n- 上午：\n- 下午：\n- 晚上：\n\n## \u{1F4DD} 备注\n',
  },
  {
    id: 'tpl-default-daily-review',
    name: '日复盘',
    type: 'daily_review',
    content:
      '# \u{1F319} 日复盘 · {{date}}\n\n## ✅ 今日完成\n- \n\n## \u{1F4C8} 关键进展\n{{progress}}\n\n## \u{1F4A1} 反思与收获\n- 做得好的：\n- 可改进的：\n\n## ➡️ 明日重点\n- \n',
  },
  {
    id: 'tpl-default-weekly-review',
    name: '周复盘',
    type: 'weekly_review',
    content:
      '# \u{1F5D3}️ 周复盘 · {{week}}\n\n## \u{1F4CA} 本周回顾\n- 计划完成情况：\n- 关键成果：\n\n## \u{1F50D} 深度反思\n{{reflection}}\n\n## \u{1F3AF} 下周重点\n- [ ] \n- [ ] \n\n## \u{1F4DD} 备注\n',
  },
  {
    id: 'tpl-default-weekly-plan',
    name: '周计划',
    type: 'weekly_plan',
    content:
      '# \u{1F5D3}️ 周计划 · {{week}}\n\n## \u{1F3AF} 本周重点\n{{focus}}\n\n## ✅ 本周任务\n- [ ] \n- [ ] \n- [ ] \n\n## \u{1F4C5} 分日安排\n- 周一：\n- 周二：\n- 周三：\n- 周四：\n- 周五：\n- 周末：\n\n## \u{1F4DD} 备注\n',
  },
  // 子阶段5：月级模板（月任务是级联源头，不进待办）
  {
    id: 'tpl-default-monthly-plan',
    name: '月指导',
    type: 'monthly_plan',
    content:
      '# \u{1F4C5} 月指导 · {{month}}\n\n## \u{1F3AF} 本月重点\n{{focus}}\n\n## ✅ 本月任务\n- [ ] \n- [ ] \n- [ ] \n\n## \u{1F4C6} 分周安排\n- 第 1 周：\n- 第 2 周：\n- 第 3 周：\n- 第 4 周：\n- 第 5 周（如有）：\n\n## \u{1F4DD} 备注\n',
  },
  {
    id: 'tpl-default-monthly-review',
    name: '月复盘',
    type: 'monthly_review',
    content:
      '# \u{1F319} 月复盘 · {{month}}\n\n## ◎ 本期目标达成对照\n| 目标 | 实际 | 状态 |\n|---|---|---|\n|  |  |  |\n\n## \u{26A0}\u{FE0F} 本月风险评估\n- \n\n## \u{1F4A1} 经验教训\n1. \n\n## \u{27A1}\u{FE0F} 下月计划调整建议\n1. \n',
  },
]

export const templateRepo = {
  findAll(type?: TemplateType): Template[] {
    const db = getDb()
    if (type) {
      return (db
        .prepare('SELECT * FROM templates WHERE isDeleted = 0 AND type = ? ORDER BY type, name')
        .all(type) as Record<string, unknown>[]).map(rowToTemplate)
    }
    return (db
      .prepare('SELECT * FROM templates WHERE isDeleted = 0 ORDER BY type, name')
      .all() as Record<string, unknown>[]).map(rowToTemplate)
  },

  findById(id: string): Template | undefined {
    const r = getDb().prepare('SELECT * FROM templates WHERE id = ?').get(id) as Record<string, unknown> | undefined
    if (!r) return undefined
    return rowToTemplate(r)
  },

  findByType(type: TemplateType): Template[] {
    return (getDb()
      .prepare('SELECT * FROM templates WHERE type = ? AND isDeleted = 0 ORDER BY name')
      .all(type) as Record<string, unknown>[]).map(rowToTemplate)
  },

  findDefaultByType(type: TemplateType): Template | undefined {
    const r = getDb()
      .prepare('SELECT * FROM templates WHERE type = ? AND isDefault = 1 AND isDeleted = 0 LIMIT 1')
      .get(type) as Record<string, unknown> | undefined
    if (!r) return undefined
    return rowToTemplate(r)
  },

  upsert(data: Omit<Template, 'createdAt' | 'updatedAt'>): Template {
    const db = getDb()
    const now = new Date().toISOString()
    const existing = data.id ? this.findById(data.id) : undefined

    if (existing) {
      db.prepare(`
        UPDATE templates
        SET name = @name, type = @type, content = @content, isDefault = @isDefault,
            isDeleted = @isDeleted, deletedAt = @deletedAt, updatedAt = @updatedAt
        WHERE id = @id
      `).run({
        id: existing.id,
        name: data.name ?? null,
        type: data.type ?? null,
        content: data.content ?? null,
        isDefault: data.isDefault ? 1 : 0,
        isDeleted: data.isDeleted ? 1 : 0,
        deletedAt: data.deletedAt ?? null,
        updatedAt: now,
      })
      // Re-read to get current state with correct timestamps
      return this.findById(existing.id) as Template
    }

    const id = data.id || randomUUID()
    db.prepare(`
      INSERT INTO templates (id, name, type, content, isDefault, isDeleted, deletedAt, createdAt, updatedAt)
      VALUES (@id, @name, @type, @content, @isDefault, @isDeleted, @deletedAt, @createdAt, @updatedAt)
    `).run({
      id,
      name: data.name ?? null,
      type: data.type ?? null,
      content: data.content ?? null,
      isDefault: data.isDefault ? 1 : 0,
      isDeleted: data.isDeleted ? 1 : 0,
      deletedAt: data.deletedAt ?? null,
      createdAt: now,
      updatedAt: now,
    })
    return this.findById(id) as Template
  },

  softDelete(id: string): boolean {
    const now = new Date().toISOString()
    const r = getDb()
      .prepare('UPDATE templates SET isDeleted = 1, deletedAt = ?, updatedAt = ? WHERE id = ? AND isDeleted = 0')
      .run(now, now, id)
    return r.changes > 0
  },

  seedDefaults(): void {
    const now = new Date().toISOString()
    const db = getDb()
    let seeded = 0

    for (const t of DEFAULT_TEMPLATES) {
      try {
        const existing = db.prepare('SELECT id FROM templates WHERE id = ?').get(t.id) as { id: string } | undefined
        if (existing) continue
        db.prepare(`
          INSERT INTO templates (id, name, type, content, isDefault, isDeleted, deletedAt, createdAt, updatedAt)
          VALUES (?, ?, ?, ?, 1, 0, NULL, ?, ?)
        `).run(t.id, t.name, t.type, t.content, now, now)
        seeded++
      } catch (e: unknown) {
        logger.warn(`Failed to seed template ${t.id}:`, e)
      }
    }
    if (seeded > 0) {
      logger.info(`Seeded ${seeded} default templates`)
    }
  },
}
