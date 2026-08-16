import { describe, it, expect } from 'vitest'
import { extractDigest } from '../src/shared/reviewDigest'

describe('extractDigest', () => {
  it('标准复盘取实质摘要（过滤纯标题行/占位/空任务行，去行内符号）', () => {
    const md = [
      '# 🌙 日复盘 · 2026-08-06',
      '',
      '## ✅ 今日完成',
      '- 写完阶段6打包配置',
      '- 修复用户反馈1的启动问题',
      '',
      '## 📈 关键进展',
      '{{progress}}',
      '',
      '## 💡 反思与收获',
      '- 做得好的：**electron-builder** 配置踩坑记录完整',
      '- 可改进的：动态 require 没早发现',
      '',
      '## ➡️ 明日重点',
      '- [ ] 计划与复盘子阶段2实现',
      '- [ ] ',
    ].join('\n')
    const d = extractDigest(md, 250)
    expect(d).toContain('写完阶段6打包配置')
    expect(d).toContain('修复用户反馈1的启动问题')
    // section titles survive (they're content, not pure heading lines)
    // {{progress}} filtered (placeholder line)
    expect(d).not.toContain('{{progress}}')
    // - [ ] 计划... ：task text survives in map step (strip - [ ] prefix)
    expect(d).toContain('计划与复盘子阶段2实现')
    // main section titles present
    expect(d).toContain('✅ 今日完成')
  })

  it('空输入返回空串', () => {
    expect(extractDigest('')).toBe('')
    expect(extractDigest(null as unknown as string)).toBe('')
    expect(extractDigest(undefined as unknown as string)).toBe('')
  })

  it('纯占位符行被过滤，但含文本标题保留', () => {
    // MARKDOWN_LINE_RE only filters lines that are PURELY # or ##  (no text), ---, {{...}}, - [x]  (no text).
    // Lines like '## 标题' are NOT pure heading lines — they have text.
    const r = extractDigest('# \n## \n### \n---\n{{focus}}')
    expect(r).toBe('')
  })

  it('全占位符未填返回空串', () => {
    expect(extractDigest('{{progress}}\n{{focus}}')).toBe('')
  })

  it('超长截断加…', () => {
    const long = '这是'.repeat(50) // 100 chars
    const d = extractDigest(long, 60)
    expect(d.length).toBeLessThanOrEqual(61) // 60 + '…'
    expect(d.endsWith('…')).toBe(true)
  })

  it('去行内 markdown 符号（加粗/斜体/代码/链接/删除线）', () => {
    const md = [
      '今天修复了 **electron-builder** 配置',
      '使用了 `better-sqlite3` 原生模块',
      '参考 [文档](https://example.com) 解决',
      '~~旧方案~~ 新方案上线',
      '1. 第一步',
    ].join('\n')
    const d = extractDigest(md)
    expect(d).toContain('electron-builder')
    expect(d).not.toContain('**')
    expect(d).toContain('better-sqlite3')
    expect(d).not.toContain('`')
    expect(d).toContain('文档')
    expect(d).not.toContain('https://example.com')
    expect(d).not.toContain('~~')
    expect(d).toContain('第一步')
  })

  it('多 section 模板：占位过滤，section 标题保留，空任务滤掉', () => {
    const md = [
      '# ',
      '',
      '全天的核心产出',
      '',
      '## ✅ 完成',
      '- 任务1',
      '',
      '## 📈 进展',
      '{{progress}}',
      '',
      '---',
      '',
      '## 💡 反思',
      '今天学到的',
      '- [ ]',
    ].join('\n')
    const d = extractDigest(md)
    expect(d).toContain('全天的核心产出')
    expect(d).toContain('任务1')
    expect(d).toContain('今天学到的')
    // section titles survive as content
    expect(d).toContain('✅ 完成')
    expect(d).toContain('💡 反思')
    // filtered: pure heading/callout, placeholder, separator, empty task
    expect(d).not.toContain('{{progress}}')
    expect(d).not.toContain('---')
    // empty - [ ] is filtered; # with only whitespace filtered
  })

  it('自定义截断长度生效', () => {
    const md = '一句话总结今天的工作成果和明天的计划安排'
    expect(extractDigest(md, 10).length).toBeLessThanOrEqual(11)
    expect(extractDigest(md, 5).length).toBeLessThanOrEqual(6)
    expect(extractDigest(md, 100)).toBe('一句话总结今天的工作成果和明天的计划安排')
  })
})
