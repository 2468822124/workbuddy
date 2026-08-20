import { getDb } from '../connection'

/**
 * 阶段6修复批次2 · T1：导入导出 SQL 全部下沉 repositories（技术栈规范 §2/§7/§10）。
 * 表清单/固定顺序是本模块唯一真相源；service 层只做载荷校验与编排。
 */
export const IMPORT_ORDER = [
  'projects',
  'todos',
  'settings', 'news_items', 'inboxes', 'notes', 'books', 'workout_logs',
  'flow_fixed_defs',
  'flow_month_goals',
  'flow_week_instances',
  'flow_week_focus',
  'flow_day_entries',
  'flow_vouchers',
  'flow_plan_templates', 'flow_journals',
] as const

/** 清库顺序 = IMPORT_ORDER 反向（FK 子先父；flow_week_instances 自引用由单条 DELETE 整体处理） */
export const DELETE_ORDER: readonly string[] = [...IMPORT_ORDER].reverse()

export const dataTransferRepo = {
  /** 导出快照：固定顺序读 16 表全部行（flow_week_instances 自引用 → id ASC 保证父实例先导出） */
  exportTables(): Record<string, unknown[]> {
    const db = getDb()
    const tables: Record<string, unknown[]> = {}
    for (const t of IMPORT_ORDER) {
      tables[t] = t === 'flow_week_instances'
        ? db.prepare(`SELECT * FROM ${t} ORDER BY id ASC`).all()
        : db.prepare(`SELECT * FROM ${t}`).all()
    }
    return tables
  },

  /**
   * 全量替换：单事务内清空（DELETE_ORDER 子先父，撞 FK）→ 插入（固定顺序，FK 父先子后）。
   * 任一失败抛错整体回滚；列名/行结构已由 service 在事务前校验（列名正则 + 每行对象），此处只执行。
   */
  replaceAll(tables: Record<string, unknown[]>): Record<string, number> {
    const db = getDb()
    const counts: Record<string, number> = {}
    db.transaction(() => {
      for (const table of DELETE_ORDER) {
        db.prepare(`DELETE FROM ${table}`).run()
      }
      for (const table of IMPORT_ORDER) {
        const rows = tables[table] || []
        for (const row of rows) {
          const rowObj = row as Record<string, unknown>
          const cols = Object.keys(rowObj)
          const placeholders = cols.map(() => '?').join(', ')
          const values = cols.map(c => rowObj[c])
          db.prepare(`INSERT INTO ${table} (${cols.join(', ')}) VALUES (${placeholders})`).run(...values)
        }
        counts[table] = rows.length
      }
    })()
    return counts
  },
}
