import { getDb } from '../db/connection'
import { flowFixedRepo } from '../db/repositories/flowFixedRepo'
import { flowWeekRepo } from '../db/repositories/flowWeekRepo'
import { flowDayRepo } from '../db/repositories/flowDayRepo'
import { getWeekStart, addDays } from '@shared/period'
import { ok, err, Result } from '../lib/result'
import { logger } from '../lib/logger'

/** weekdayMask（bit0=周一…bit6=周日）→ 周内偏移数组 */
export function weekdayBits(mask: number): number[] {
  const out: number[] = []
  for (let wd = 0; wd < 7; wd++) {
    if (mask & (1 << wd)) out.push(wd)
  }
  return out
}

export interface MaterializeResult {
  createdInstances: number
  createdEntries: number
}

/**
 * 惰性物化：首次访问某周数据前调用，幂等（同周重复调用零新增）。
 * 固定任务 → 周实例（标题快照）→ 惯常日自动安排（🔒行）。
 * 全程事务包裹：中途失败回滚，不留半克隆脏数据。
 */
export function materializeWeek(weekStart: string): Result<MaterializeResult> {
  try {
    const start = getWeekStart(weekStart) // 归一化周一，防非法输入
    let createdInstances = 0
    let createdEntries = 0

    getDb().transaction(() => {
      const defs = flowFixedRepo.listActive()
      for (const def of defs) {
        if (flowWeekRepo.existsByDef(start, def.id)) continue
        const inst = flowWeekRepo.create({
          weekStart: start,
          origin: 'fixed',
          fixedDefId: def.id,
          title: def.title,
          kind: def.kind,
          targetCount: def.targetCount,
          sortOrder: 0,
          skippedAt: null,
          carriedFrom: null,
        })
        createdInstances++
        for (const wd of weekdayBits(def.weekdayMask)) {
          flowDayRepo.create({
            date: addDays(start, wd),
            title: def.title,
            source: 'habit',
            locked: true,
            weekInstanceId: inst.id,
            projectId: null,
            reminderKey: null,
            templateId: null,
            note: null,
            skippedAt: null,
          })
          createdEntries++
        }
      }
    })()

    return ok({ createdInstances, createdEntries })
  } catch (e: unknown) {
    logger.error('flowCloneEngine.materializeWeek failed', e)
    return err('CLONE_FAILED', (e as Error).message)
  }
}
