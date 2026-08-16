import { getDb } from '../connection'
import { FlowVoucher, FlowVoucherKind } from '@shared/flowTypes'

function rowToVoucher(r: Record<string, unknown>): FlowVoucher {
  const row = r as unknown as FlowVoucher & { isDeleted: unknown }
  return { ...row, isDeleted: !!row.isDeleted }
}

export const flowVoucherRepo = {
  listActiveByTarget(targetType: FlowVoucher['targetType'], targetId: number): FlowVoucher[] {
    return getDb()
      .prepare('SELECT * FROM flow_vouchers WHERE targetType = ? AND targetId = ? AND isDeleted = 0 ORDER BY occurredAt ASC, id ASC')
      .all(targetType, targetId)
      .map((r: unknown) => rowToVoucher(r as Record<string, unknown>))
  },

  /** 批量取凭据（周/日面板派生用，避免 N+1） */
  listActiveByTargets(targetType: FlowVoucher['targetType'], ids: number[]): FlowVoucher[] {
    if (ids.length === 0) return []
    const placeholders = ids.map(() => '?').join(',')
    return getDb()
      .prepare(`SELECT * FROM flow_vouchers WHERE targetType = ? AND targetId IN (${placeholders}) AND isDeleted = 0 ORDER BY occurredAt ASC, id ASC`)
      .all(targetType, ...ids)
      .map((r: unknown) => rowToVoucher(r as Record<string, unknown>))
  },

  /** 取未删勾选凭据（存在=已勾选） */
  findActiveCheck(entryId: number): FlowVoucher | undefined {
    const r = getDb().prepare(
      "SELECT * FROM flow_vouchers WHERE targetType = 'day_entry' AND targetId = ? AND kind = 'check' AND isDeleted = 0 LIMIT 1"
    ).get(entryId)
    return r ? rowToVoucher(r as Record<string, unknown>) : undefined
  },

  create(data: Omit<FlowVoucher, 'id' | 'isDeleted' | 'deletedAt' | 'createdAt' | 'updatedAt'>): FlowVoucher {
    const now = new Date().toISOString()
    const r = getDb().prepare(`
      INSERT INTO flow_vouchers (targetType, targetId, kind, occurredAt, note, isDeleted, deletedAt, createdAt, updatedAt)
      VALUES (@targetType, @targetId, @kind, @occurredAt, @note, 0, NULL, @now, @now)
      RETURNING *
    `).get({ ...data, note: data.note ?? null, now }) as Record<string, unknown>
    return rowToVoucher(r)
  },

  update(id: number, data: Partial<Pick<FlowVoucher, 'occurredAt' | 'note'>>): FlowVoucher | undefined {
    const existing = this.findById(id)
    if (!existing) return undefined
    const merged = { ...existing, ...data, updatedAt: new Date().toISOString() }
    getDb().prepare(`
      UPDATE flow_vouchers SET occurredAt=@occurredAt, note=@note, updatedAt=@updatedAt WHERE id=@id
    `).run({ ...merged, note: merged.note ?? null })
    return this.findById(id)
  },

  findById(id: number): FlowVoucher | undefined {
    const r = getDb().prepare('SELECT * FROM flow_vouchers WHERE id = ?').get(id)
    return r ? rowToVoucher(r as Record<string, unknown>) : undefined
  },

  /** 凭据删除一律软删 → 派生完成态实时回退（历史可改铁律） */
  softDelete(id: number): boolean {
    const now = new Date().toISOString()
    const r = getDb().prepare(
      'UPDATE flow_vouchers SET isDeleted=1, deletedAt=?, updatedAt=? WHERE id=? AND isDeleted=0'
    ).run(now, now, id)
    return r.changes > 0
  },
}

export type { FlowVoucherKind }
