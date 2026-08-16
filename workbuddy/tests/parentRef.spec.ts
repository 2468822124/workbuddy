import { describe, it, expect } from 'vitest'
import { makeParentTaskRef, parseParentTaskRef } from '../src/main/services/parentRef'

// v0.2修复计划·参照完整性：parentTaskRef JSON 编解码（纯函数，无 DB）

describe('parentRef 编解码', () => {
  it('make → parse 往返一致（含 parentPlanId=null）', () => {
    expect(parseParentTaskRef(makeParentTaskRef('plan-1', 'a1b2c3d4e5f6')))
      .toEqual({ parentPlanId: 'plan-1', parentTaskId: 'a1b2c3d4e5f6' })
    expect(parseParentTaskRef(makeParentTaskRef(null, 'x1y2z3')))
      .toEqual({ parentPlanId: null, parentTaskId: 'x1y2z3' })
  })

  it('非法/缺失 → null 不抛', () => {
    expect(parseParentTaskRef(null)).toBeNull()
    expect(parseParentTaskRef(undefined)).toBeNull()
    expect(parseParentTaskRef('')).toBeNull()
    expect(parseParentTaskRef('not-json')).toBeNull()
    expect(parseParentTaskRef('{"parentTaskId":"abc"}')).toEqual({ parentPlanId: null, parentTaskId: 'abc' })
    expect(parseParentTaskRef('{"parentTaskId":123}')).toBeNull() // 非字符串 → 拒绝
    expect(parseParentTaskRef('[]')).toBeNull()
    expect(parseParentTaskRef('{"parentTaskId":""}')).toBeNull() // 空串 → 拒绝
  })
})
