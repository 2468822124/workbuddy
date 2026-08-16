import { describe, it, expect } from 'vitest'
import { extractTaskTexts, taskExistsInDraft } from '../src/renderer/src/composables/usePlanning'

// 渲染端 usePlanning 纯函数单测（GLM 复审1 R2：补覆盖，防 m[4] 类运行时崩溃漏网）
// 注意：usePlanning 的 TASK_LINE_RE 仅 3 组（1缩进/2勾选态/3文本），与主进程 planParser 6 组不同形。
describe('usePlanning.extractTaskTexts（rail 隐藏源）', () => {
  it('提取未勾选与已勾选任务文本，剥 tid 注释', () => {
    const md = '## 本周任务\n- [ ] 写周报 <!-- tid:abc -->\n- [x] 已完成 <!-- tid:def -->\n- [ ] 周会'
    expect([...extractTaskTexts(md)]).toEqual(['写周报', '已完成', '周会'])
  })

  it('空/无任务行内容 → 空集（不抛）', () => {
    expect([...extractTaskTexts('')]).toEqual([])
    expect([...extractTaskTexts('## 仅标题\n无任务行')]).toEqual([])
  })

  it('缩进任务行也提取', () => {
    expect([...extractTaskTexts('  - [ ] 缩进任务')]).toEqual(['缩进任务'])
  })
})

describe('usePlanning.taskExistsInDraft（P1-① 点选取去重）', () => {
  it('草稿含同名任务（带 tid 注释）→ true（去重）', () => {
    expect(taskExistsInDraft('- [ ] 写周报 <!-- tid:abc -->', '写周报')).toBe(true)
  })

  it('草稿含同名任务（无 tid 注释）→ true', () => {
    expect(taskExistsInDraft('- [ ] 写周报', '写周报')).toBe(true)
  })

  it('草稿不含该任务 → false', () => {
    expect(taskExistsInDraft('- [ ] 写周报 <!-- tid:abc -->', '周会')).toBe(false)
  })

  it('空草稿 → false（不抛）', () => {
    expect(taskExistsInDraft('', '写周报')).toBe(false)
  })

  it('尾部空格容错：text 两侧空白剥离后比对', () => {
    expect(taskExistsInDraft('- [ ] 写周报', ' 写周报 ')).toBe(true)
  })
})
