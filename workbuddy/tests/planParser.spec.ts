import { describe, it, expect } from 'vitest'
import {
  parseTasks,
  parseTasksWithState,
  attachTid,
  setTaskConsumedByTid,
  findLineByTid,
  findOpenLineByText,
  stripComment,
  newTid,
  resolveStableTid,
  collectChildRefs,
} from '../src/main/services/planParser'

describe('planParser.parseTasks', () => {
  it('提取标准多任务（- [ ] 与 * [ ]）', () => {
    const md = [
      '# 日计划 · 2026-08-07',
      '',
      '## 今日重点',
      '- [ ] 写周报',
      '* [ ] 跑步 5km',
      '- [x] 已完成的事',
      '- 普通列表项',
    ].join('\n')
    expect(parseTasks(md)).toEqual(['写周报', '跑步 5km'])
  })

  it('空输入返回 []', () => {
    expect(parseTasks('')).toEqual([])
    expect(parseTasks(null as unknown as string)).toEqual([])
    expect(parseTasks(undefined as unknown as string)).toEqual([])
  })

  it('无任务行返回 []', () => {
    expect(parseTasks('# 标题\n\n- 普通项\n1. 数字项')).toEqual([])
  })

  it('已勾选 - [x] 不提取', () => {
    expect(parseTasks('- [x] 已完成\n- [X] 大写已完成\n- [ ] 未完成')).toEqual(['未完成'])
  })

  it('缩进容错', () => {
    expect(parseTasks('    - [ ] 缩进任务\n\t- [ ] Tab 任务\n- [ ] 顶格任务')).toEqual([
      '缩进任务', 'Tab 任务', '顶格任务',
    ])
  })

  it('重复行各自提取', () => {
    expect(parseTasks('- [ ] 任务A\n- [ ] 任务A\n- [ ] 任务B')).toEqual([
      '任务A', '任务A', '任务B',
    ])
  })

  it('任务文本去首尾空白', () => {
    expect(parseTasks('- [ ]   带空格任务  ')).toEqual(['带空格任务'])
  })

  // v0.2修复计划：tid 注释剥离
  it('tid 注释从提取文本中剥离（级联去重/复用池不受隐形标识干扰）', () => {
    const md = [
      '- [ ] 写周报 <!-- tid:7f3a2b parent:a1b2c3 -->',
      '- [ ] 跑步 5km',
      '- [ ] 写周报 <!-- tid:9e8d7c -->',
    ].join('\n')
    expect(parseTasks(md)).toEqual(['写周报', '跑步 5km', '写周报'])
  })

  it('未知/畸形注释不做提取（普通注释非任务行语义）', () => {
    expect(parseTasks('- [ ] 任务A <!-- note:123 -->')).toEqual(['任务A <!-- note:123 -->'])
  })
})

describe('planParser.parseTasksWithState (tid 感知)', () => {
  it('无 tid 行 → tid:null；带 tid/parent → 完整解析，text 已剥离', () => {
    const md = [
      '# 周统筹',
      '- [ ] 未下沉任务',
      '- [x] 已下沉任务 <!-- tid:aaa111 -->',
      '* [X] 大写已下沉 <!-- tid:bbb222 parent:ccc333 -->',
    ].join('\n')
    expect(parseTasksWithState(md)).toEqual([
      { text: '未下沉任务', consumed: false, tid: null, parentTid: null },
      { text: '已下沉任务', consumed: true, tid: 'aaa111', parentTid: null },
      { text: '大写已下沉', consumed: true, tid: 'bbb222', parentTid: 'ccc333' },
    ])
  })

  it('空输入返回 []，不抛', () => {
    expect(parseTasksWithState('')).toEqual([])
    expect(parseTasksWithState(null as unknown as string)).toEqual([])
    expect(parseTasksWithState(undefined as unknown as string)).toEqual([])
  })

  it('与 parseTasks 语义一致：parseTasks 仅认未勾选（syncPlanTodos 依赖）', () => {
    const md = '- [ ] A\n- [x] B <!-- tid:000001 -->\n- [ ] C'
    expect(parseTasks(md)).toEqual(['A', 'C'])
    expect(parseTasksWithState(md)).toEqual([
      { text: 'A', consumed: false, tid: null, parentTid: null },
      { text: 'B', consumed: true, tid: '000001', parentTid: null },
      { text: 'C', consumed: false, tid: null, parentTid: null },
    ])
  })
})

describe('planParser.attachTid / setTaskConsumedByTid / 定位', () => {
  it('attachTid 追加注释（含 parent）', () => {
    expect(attachTid('- [ ] 写周报', '7f3a2b', 'a1b2c3')).toBe('- [ ] 写周报 <!-- tid:7f3a2b parent:a1b2c3 -->')
    expect(attachTid('- [x] 已下沉', '000001')).toBe('- [x] 已下沉 <!-- tid:000001 -->')
    expect(attachTid('* [ ] 星号行', '000002', null)).toBe('* [ ] 星号行 <!-- tid:000002 -->')
  })

  it('attachTid 对非任务行原样返回', () => {
    expect(attachTid('# 标题', '000001')).toBe('# 标题')
  })

  it('setTaskConsumedByTid 翻转 [ ]↔[x]，保留 tid/parent/缩进/星号', () => {
    const md = '- [ ] A <!-- tid:aaa parent:bbb -->\n- [ ] B\n  * [x] C <!-- tid:ccc -->'
    expect(setTaskConsumedByTid(md, 'aaa', true)).toBe(
      '- [x] A <!-- tid:aaa parent:bbb -->\n- [ ] B\n  * [x] C <!-- tid:ccc -->'
    )
    expect(setTaskConsumedByTid(md, 'ccc', false)).toBe(
      '- [ ] A <!-- tid:aaa parent:bbb -->\n- [ ] B\n  * [ ] C <!-- tid:ccc -->'
    )
  })

  it('setTaskConsumedByTid 找不到 tid → 原样返回（不崩）', () => {
    const md = '- [ ] A'
    expect(setTaskConsumedByTid(md, 'zzz999', true)).toBe(md)
  })

  it('findLineByTid 定位行 + parentTid；缺失返回 null', () => {
    const md = '- [ ] A\n- [x] B <!-- tid:aaa parent:bbb -->'
    expect(findLineByTid(md, 'aaa')).toEqual({ line: '- [x] B <!-- tid:aaa parent:bbb -->', index: 1, parentTid: 'bbb' })
    expect(findLineByTid(md, 'nope')).toBeNull()
  })

  it('findOpenLineByText 匹配未勾选行（文本已剥离注释）；已勾选/普通行不匹配', () => {
    const md = '- [ ] 写周报 <!-- tid:aaa -->\n- [x] 已完成 <!-- tid:bbb -->'
    expect(findOpenLineByText(md, '写周报')).toEqual({ line: '- [ ] 写周报 <!-- tid:aaa -->', index: 0 })
    expect(findOpenLineByText(md, '已完成')).toBeNull()
  })

  it('newTid 生成 12 位 hex', () => {
    expect(newTid()).toMatch(/^[0-9a-f]{12}$/)
  })

  it('stripComment 去尾注释', () => {
    expect(stripComment('写周报 <!-- tid:aaa parent:bbb -->')).toBe('写周报')
    expect(stripComment('写周报')).toBe('写周报')
  })
})

describe('planParser.parseTasksWithState', () => {
  it('混合解析：- [ ] → consumed:false；- [x]/- [X] → consumed:true', () => {
    const md = [
      '# 周统筹',
      '- [ ] 未下沉任务',
      '- [x] 已下沉任务',
      '* [X] 大写已下沉',
      '- 普通列表项',
      '1. 数字项',
    ].join('\n')
    expect(parseTasksWithState(md)).toEqual([
      { text: '未下沉任务', consumed: false, tid: null, parentTid: null },
      { text: '已下沉任务', consumed: true, tid: null, parentTid: null },
      { text: '大写已下沉', consumed: true, tid: null, parentTid: null },
    ])
  })

  it('空输入返回 []，不抛', () => {
    expect(parseTasksWithState('')).toEqual([])
    expect(parseTasksWithState(null as unknown as string)).toEqual([])
    expect(parseTasksWithState(undefined as unknown as string)).toEqual([])
  })

  it('缩进容错（空格/Tab）', () => {
    expect(parseTasksWithState('    - [ ] 缩进任务\n\t- [x] Tab 已下沉')).toEqual([
      { text: '缩进任务', consumed: false, tid: null, parentTid: null },
      { text: 'Tab 已下沉', consumed: true, tid: null, parentTid: null },
    ])
  })

  it('任务文本去首尾空白', () => {
    expect(parseTasksWithState('- [ ]   带空格任务  ')).toEqual([{ text: '带空格任务', consumed: false, tid: null, parentTid: null }])
  })

  it('与 parseTasks 语义一致：parseTasks 仅认未勾选（syncPlanTodos 依赖）', () => {
    const md = '- [ ] A\n- [x] B\n- [ ] C'
    expect(parseTasks(md)).toEqual(['A', 'C'])
    expect(parseTasksWithState(md)).toEqual([
      { text: 'A', consumed: false, tid: null, parentTid: null },
      { text: 'B', consumed: true, tid: null, parentTid: null },
      { text: 'C', consumed: false, tid: null, parentTid: null },
    ])
  })
})

describe('planParser.resolveStableTid P1-② 幂等加固', () => {
  it('行内已有 tid 注释 → 保持原 tid，行不变（attached=false）', () => {
    const line = '- [ ] 写周报 <!-- tid:abc123 parent:def456 -->'
    const r = resolveStableTid(line, 'reuse999')
    expect(r.tid).toBe('abc123')
    expect(r.lineWithTid).toBe(line)
    expect(r.attached).toBe(false)
  })

  it('行内无 tid + 存量 tid 传入 → 复用存量 tid（重复 pick 不漂移）', () => {
    const r = resolveStableTid('- [ ] 写周报', 'abc123')
    expect(r.tid).toBe('abc123')
    expect(r.lineWithTid).toContain('tid:abc123')
    expect(r.attached).toBe(true)
  })

  it('行内无 tid + 无存量 → 新分配 12 位 hex tid', () => {
    const r = resolveStableTid('- [ ] 写周报', undefined)
    expect(r.tid).toMatch(/^[0-9a-f]{12}$/)
    expect(r.lineWithTid).toContain(`tid:${r.tid}`)
    expect(r.attached).toBe(true)
  })

  it('无 tid 行补写后仍为单标记纯任务行（P2：无双 `- [ ]`）', () => {
    const r = resolveStableTid('- [ ] 写周报', 'abc123')
    expect(r.lineWithTid).toBe('- [ ] 写周报 <!-- tid:abc123 -->')
  })
})

describe('planParser.collectChildRefs 第二轮实测·问题① 本期已安排引用集', () => {
  it('收集多 content 中的 parent 引用（含无 tid 裸行忽略）', () => {
    const refs = collectChildRefs([
      '- [ ] 做周报 <!-- tid:c41d1 parent:abc123 -->',
      '- [ ] 普通行',
      '- [ ] 周会 <!-- tid:c41d2 parent:def456 -->',
    ])
    expect(refs.has('abc123')).toBe(true)
    expect(refs.has('def456')).toBe(true)
    expect(refs.size).toBe(2)
  })

  it('空/无 parent 行 → 空集', () => {
    expect(collectChildRefs([]).size).toBe(0)
    expect(collectChildRefs(['', '- [ ] 裸行']).size).toBe(0)
  })

  it('跨 content 去重（同名 parent 引用只保留一个）', () => {
    const refs = collectChildRefs([
      '- [ ] A <!-- tid:c1 parent:ab12cd -->',
      '- [ ] B <!-- tid:c2 parent:ab12cd -->',
    ])
    expect(refs.size).toBe(1)
    expect(refs.has('ab12cd')).toBe(true)
  })
})
