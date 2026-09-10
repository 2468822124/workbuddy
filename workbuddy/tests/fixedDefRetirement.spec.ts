import { beforeAll, beforeEach, describe, expect, it, afterEach, vi } from 'vitest'
import { mockConnectionDb, resetDb } from './flowTestDb'
import { IPC } from '@shared/ipc'
import { flowFixedRepo } from '../src/main/db/repositories/flowFixedRepo'
import { flowWeekRepo } from '../src/main/db/repositories/flowWeekRepo'
import { flowDayRepo } from '../src/main/db/repositories/flowDayRepo'
import { flowVoucherRepo } from '../src/main/db/repositories/flowVoucherRepo'
import { deleteFixedDef } from '../src/main/services/flowActions'

const { handlers } = vi.hoisted(() => ({
  handlers: {} as Record<string, (event: unknown, input: unknown) => unknown>,
}))

vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, handler: (event: unknown, input: unknown) => unknown) => {
      handlers[channel] = handler
    },
  },
}))

mockConnectionDb()

import { registerFlowIpc } from '../src/main/ipc/flow.ipc'

const HISTORICAL_WEEK = '2026-08-31'
const W0 = '2026-09-07'
const W1 = '2026-09-14'
const W2 = '2026-09-21'
const W3 = '2026-09-28'
const W4 = '2026-10-05'
const W5 = '2026-10-12'

function makeDef(title = 'F1'): ReturnType<typeof flowFixedRepo.create> {
  return flowFixedRepo.create({
    title,
    kind: 'once',
    targetCount: 1,
    weekdayMask: 0,
    recurrence: 'WEEKLY',
    note: null,
  })
}

function makeFixedInstance(defId: number, weekStart: string, title = 'F1') {
  return flowWeekRepo.create({
    weekStart,
    origin: 'fixed',
    fixedDefId: defId,
    title,
    kind: 'once',
    targetCount: 1,
    sortOrder: 0,
    skippedAt: null,
    carriedFrom: null,
  })
}

function makeEntry(
  weekInstanceId: number,
  date: string,
  overrides: Partial<Parameters<typeof flowDayRepo.create>[0]> = {},
) {
  return flowDayRepo.create({
    date,
    title: 'F1 day entry',
    source: 'habit',
    locked: true,
    weekInstanceId,
    projectId: null,
    reminderKey: null,
    templateId: null,
    note: null,
    skippedAt: null,
    ...overrides,
  })
}

beforeAll(() => {
  registerFlowIpc()
})

beforeEach(() => {
  resetDb()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('flowWeekRepo fixed definition future lookup', () => {
  it('returns only active fixed instances strictly after the effective week', () => {
    const f1 = makeDef()
    const f2 = makeDef('F2')
    const current = makeFixedInstance(f1.id, W0)
    const future = makeFixedInstance(f1.id, W1)
    const deleted = makeFixedInstance(f1.id, W2)
    const otherDef = makeFixedInstance(f2.id, W1, 'F2')

    expect(current.id).not.toBe(future.id)
    flowWeekRepo.softDelete(deleted.id)

    expect(flowWeekRepo.listActiveByFixedDefAfter(f1.id, W0).map(i => i.id)).toEqual([future.id])
    expect(flowWeekRepo.listActiveByFixedDefAfter(f2.id, W0).map(i => i.id)).toEqual([otherDef.id])
  })
})

describe('deleteFixedDef R3 retirement rules', () => {
  it('keeps effective/history/entered instances, hides unentered future instances, and isolates F2', () => {
    const f1 = makeDef('F1')
    const f2 = makeDef('F2')

    const historical = makeFixedInstance(f1.id, HISTORICAL_WEEK)
    const effective = makeFixedInstance(f1.id, W0)
    const unentered = makeFixedInstance(f1.id, W1)
    const skippedEntryInstance = makeFixedInstance(f1.id, W2)
    const softDeletedEntryInstance = makeFixedInstance(f1.id, W3)
    const credentialOnly = makeFixedInstance(f1.id, W4)
    const entered = makeFixedInstance(f1.id, W5)
    const f2Future = makeFixedInstance(f2.id, W1, 'F2')

    const skippedEntry = makeEntry(skippedEntryInstance.id, W2, { skippedAt: '2026-09-21' })
    const tombstoneEntry = makeEntry(softDeletedEntryInstance.id, W3)
    expect(flowDayRepo.softDelete(tombstoneEntry.id)).toBe(true)
    const enteredEntry = makeEntry(entered.id, W5)
    const voucher = flowVoucherRepo.create({
      targetType: 'week_instance',
      targetId: credentialOnly.id,
      kind: 'manual',
      occurredAt: W4,
      note: 'week-level completion only',
    })
    const historicalVoucher = flowVoucherRepo.create({
      targetType: 'week_instance',
      targetId: historical.id,
      kind: 'manual',
      occurredAt: HISTORICAL_WEEK,
      note: 'historical completion',
    })

    const result = deleteFixedDef(f1.id, '2026-09-09')

    expect(result).toEqual({ ok: true, data: { ok: true } })
    expect(flowFixedRepo.findById(f1.id)?.isDeleted).toBe(true)

    expect(flowWeekRepo.findById(historical.id)?.isDeleted).toBe(false)
    expect(flowWeekRepo.findById(effective.id)?.isDeleted).toBe(false)
    expect(flowWeekRepo.findById(skippedEntryInstance.id)?.isDeleted).toBe(false)
    expect(flowWeekRepo.findById(entered.id)?.isDeleted).toBe(false)
    expect(flowWeekRepo.findById(f2Future.id)?.isDeleted).toBe(false)

    expect(flowWeekRepo.findById(unentered.id)?.isDeleted).toBe(true)
    expect(flowWeekRepo.findById(softDeletedEntryInstance.id)?.isDeleted).toBe(true)
    expect(flowWeekRepo.findById(credentialOnly.id)?.isDeleted).toBe(true)

    // Active skipped/habit rows count as entered; soft-deleted rows do not.
    expect(flowDayRepo.findById(skippedEntry.id)?.isDeleted).toBe(false)
    expect(flowDayRepo.findById(enteredEntry.id)?.isDeleted).toBe(false)
    expect(flowDayRepo.findById(tombstoneEntry.id)?.isDeleted).toBe(true)
    expect(flowVoucherRepo.findById(voucher.id)?.isDeleted).toBe(false)
    expect(flowVoucherRepo.findById(historicalVoucher.id)?.isDeleted).toBe(false)

    expect(flowWeekRepo.listByWeek(W0).map(i => i.id)).toContain(effective.id)
    expect(flowWeekRepo.listByWeek(W1).map(i => i.id)).toContain(f2Future.id)
    expect(flowWeekRepo.listByWeek(W1).map(i => i.id)).not.toContain(unentered.id)

    // Reload/re-entry: the same viewed weeks converge to stable active lists.
    const loadWeek = (weekStart: string) => handlers[IPC.FLOW_WEEK_BOARD]!(null, { weekStart }) as {
      ok: true
      data: { instances: { id: number }[] }
    }
    const w0First = loadWeek(W0)
    const w0Second = loadWeek(W0)
    const w1First = loadWeek(W1)
    const w1Second = loadWeek(W1)
    expect(w0Second.data.instances.map(i => i.id)).toEqual(w0First.data.instances.map(i => i.id))
    expect(w1Second.data.instances.map(i => i.id)).toEqual(w1First.data.instances.map(i => i.id))
  })

  it('normalizes the effective date and remains idempotent on repeat', () => {
    const def = makeDef()
    const effective = makeFixedInstance(def.id, W0)
    const future = makeFixedInstance(def.id, W1)

    const first = deleteFixedDef(def.id, '2026-09-10')
    const second = deleteFixedDef(def.id, '2026-09-10')

    expect(first).toEqual({ ok: true, data: { ok: true } })
    expect(second).toEqual({ ok: true, data: { ok: false } })
    expect(flowWeekRepo.findById(effective.id)?.isDeleted).toBe(false)
    expect(flowWeekRepo.findById(future.id)?.isDeleted).toBe(true)
    expect(flowWeekRepo.listByWeek(W1)).toHaveLength(0)
  })

  it('rejects an invalid effective date without changing data', () => {
    const def = makeDef()
    const future = makeFixedInstance(def.id, W1)

    const result = deleteFixedDef(def.id, '2026-02-31')

    expect(result).toEqual({ ok: false, error: { code: 'INVALID_INPUT', message: 'weekStart 非法日期' } })
    expect(flowFixedRepo.findById(def.id)?.isDeleted).toBe(false)
    expect(flowWeekRepo.findById(future.id)?.isDeleted).toBe(false)
  })

  it('rolls back definition and instance changes when future cleanup fails', () => {
    const def = makeDef()
    const future = makeFixedInstance(def.id, W1)
    vi.spyOn(flowWeekRepo, 'softDelete').mockImplementationOnce(() => {
      throw new Error('simulated retirement failure')
    })

    const result = deleteFixedDef(def.id, W0)

    expect(result).toEqual({ ok: false, error: { code: 'INTERNAL', message: 'simulated retirement failure' } })
    expect(flowFixedRepo.findById(def.id)?.isDeleted).toBe(false)
    expect(flowWeekRepo.findById(future.id)?.isDeleted).toBe(false)
  })
})

describe('flow:fixedDefs:delete handler', () => {
  it('requires an effective week and applies the normalized week boundary', () => {
    const def = makeDef()
    const effective = makeFixedInstance(def.id, W0)
    const future = makeFixedInstance(def.id, W1)

    const missing = handlers[IPC.FLOW_FIXED_DEFS_DELETE]!(null, { id: def.id }) as { ok: false; error: { code: string } }
    expect(missing.error.code).toBe('INVALID_INPUT')

    const invalid = handlers[IPC.FLOW_FIXED_DEFS_DELETE]!(null, { id: def.id, weekStart: '2026-02-31' }) as { ok: false; error: { code: string } }
    expect(invalid.error.code).toBe('INVALID_INPUT')

    const result = handlers[IPC.FLOW_FIXED_DEFS_DELETE]!(null, {
      id: def.id,
      weekStart: '2026-09-10',
    }) as { ok: true; data: { ok: boolean } }

    expect(result).toEqual({ ok: true, data: { ok: true } })
    expect(flowWeekRepo.findById(effective.id)?.isDeleted).toBe(false)
    expect(flowWeekRepo.findById(future.id)?.isDeleted).toBe(true)
  })
})
