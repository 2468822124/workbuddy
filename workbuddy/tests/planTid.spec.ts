import { describe, it, expect } from 'vitest'
import { stripTaskLineComment, displayPlanContent, reconcilePlanContent } from '../src/renderer/src/lib/planTid'

// 第三轮实测·问题甲：编辑框隐藏 tid 注释（display/reconcile 纯函数）
describe('planTid.stripTaskLineComment', () => {
  it('任务行剥行尾 tid 注释', () => {
    expect(stripTaskLineComment('- [ ] 做周报 <!-- tid:62b00f519279 parent:251b4dcc4220 -->'))
      .toBe('- [ ] 做周报')
  })
  it('非任务行原样返回', () => {
    expect(stripTaskLineComment('## 任务清单')).toBe('## 任务清单')
    expect(stripTaskLineComment('- 普通列表')).toBe('- 普通列表')
  })
})

describe('planTid.displayPlanContent', () => {
  it('全文剥注释（标题/普通行保留）', () => {
    const raw = '## 任务清单\n- [ ] 做周报 <!-- tid:abc123 parent:def456 -->\n- [ ] 周会'
    expect(displayPlanContent(raw)).toBe('## 任务清单\n- [ ] 做周报\n- [ ] 周会')
  })
})

describe('planTid.reconcilePlanContent', () => {
  it('未改行保留原注释（display 回写 raw 幂等）', () => {
    const raw = '- [ ] 做周报 <!-- tid:abc123 parent:def456 -->'
    expect(reconcilePlanContent(raw, displayPlanContent(raw))).toBe(raw)
  })

  it('改名任务行 → 新文本 + 原 tid 注释（改名保 tid）', () => {
    const raw = '## 任务清单\n- [ ] 做周报 <!-- tid:abc123 parent:def456 -->'
    const display = '## 任务清单\n- [ ] 做本周周报'
    expect(reconcilePlanContent(raw, display))
      .toBe('## 任务清单\n- [ ] 做本周周报 <!-- tid:abc123 parent:def456 -->')
  })

  it('新增任务行 → 裸行无注释', () => {
    const raw = '- [ ] 做周报 <!-- tid:abc123 -->'
    const display = '- [ ] 做周报\n- [ ] 新增任务'
    expect(reconcilePlanContent(raw, display)).toBe('- [ ] 做周报 <!-- tid:abc123 -->\n- [ ] 新增任务')
  })

  it('删除任务行 → 注释随之丢弃', () => {
    const raw = '- [ ] 做周报 <!-- tid:abc123 -->\n- [ ] 周会 <!-- tid:def456 -->'
    const display = '- [ ] 做周报'
    expect(reconcilePlanContent(raw, display)).toBe('- [ ] 做周报 <!-- tid:abc123 -->')
  })

  it('勾选态变化 → 保留注释', () => {
    const raw = '- [ ] 做周报 <!-- tid:abc123 -->'
    const display = '- [x] 做周报'
    expect(reconcilePlanContent(raw, display)).toBe('- [x] 做周报 <!-- tid:abc123 -->')
  })

  it('非任务行修改 → 直接采用新行', () => {
    const raw = '## 任务清单\n- [ ] 做周报 <!-- tid:abc123 -->'
    const display = '## 任务列表\n- [ ] 做周报'
    expect(reconcilePlanContent(raw, display)).toBe('## 任务列表\n- [ ] 做周报 <!-- tid:abc123 -->')
  })

  // ── GLM 复审4 R1：删行 tid 错位修复 ──
  it('删首任务行 + 保后续 → 后续行保留自己的 tid（不挂被删行 tid）', () => {
    const raw = '- [ ] A <!-- tid:aaa -->\n- [ ] B <!-- tid:bbb -->'
    expect(reconcilePlanContent(raw, '- [ ] B')).toBe('- [ ] B <!-- tid:bbb -->')
  })

  it('删中间任务行 + 保后续 → 后续行 tid 不错挂', () => {
    const raw = '- [ ] A <!-- tid:aaa -->\n- [ ] B <!-- tid:bbb -->\n- [ ] C <!-- tid:ccc -->'
    expect(reconcilePlanContent(raw, '- [ ] A\n- [ ] C')).toBe('- [ ] A <!-- tid:aaa -->\n- [ ] C <!-- tid:ccc -->')
  })

  it('连续删多行 → 保剩余行 tid', () => {
    const raw = '- [ ] A <!-- tid:aaa -->\n- [ ] B <!-- tid:bbb -->\n- [ ] C <!-- tid:ccc -->'
    expect(reconcilePlanContent(raw, '- [ ] C')).toBe('- [ ] C <!-- tid:ccc -->')
  })

  it('改名 + 删行组合 → 改名行保自身 tid、删行后续行保自身 tid', () => {
    const raw = '- [ ] A <!-- tid:aaa -->\n- [ ] B <!-- tid:bbb -->\n- [ ] C <!-- tid:ccc -->'
    expect(reconcilePlanContent(raw, '- [ ] A改名\n- [ ] C'))
      .toBe('- [ ] A改名 <!-- tid:aaa -->\n- [ ] C <!-- tid:ccc -->')
  })

  it('中间插入行 → 裸行，原行 tid 归属不破坏', () => {
    const raw = '- [ ] A <!-- tid:aaa -->\n- [ ] B <!-- tid:bbb -->'
    expect(reconcilePlanContent(raw, '- [ ] A\n- [ ] 新任务\n- [ ] B'))
      .toBe('- [ ] A <!-- tid:aaa -->\n- [ ] 新任务\n- [ ] B <!-- tid:bbb -->')
  })

  it('删行 + 剩余行同时改名（混合错位）→ 降级裸行不挂错 tid', () => {
    const raw = '- [ ] A <!-- tid:aaa -->\n- [ ] B <!-- tid:bbb -->'
    expect(reconcilePlanContent(raw, '- [ ] B改名')).toBe('- [ ] B改名')
  })
})
