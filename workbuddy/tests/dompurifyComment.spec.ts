import { describe, it, expect } from 'vitest'
import { JSDOM } from 'jsdom'
import DOMPurify from 'dompurify'
import { marked } from 'marked'

// 审查LOW-3 + 规格 §3.2 待测点：预览渲染态必须不显示 `<!-- tid:xxx -->` 注释。
// 真实管线：MarkdownEditor renderedHtml = DOMPurify.sanitize(marked.parse(content), { ADD_ATTR:['target'] })
// DOMPurify 默认移除 HTML 注释 → 内联隐形 tid 仅在编辑器源码（textarea）可见，预览/渲染态不可见。
// 用 jsdom window 构建 DOMPurify（headless 可测；jsdom 已声明 devDep）。

function sanitizeLikeEditor(content: string): string {
  const window = new JSDOM('').window
  const purify = DOMPurify(window)
  const raw = marked.parse(content, { breaks: false, gfm: true }) as string
  return purify.sanitize(raw, { ADD_ATTR: ['target'] })
}

describe('DOMPurify 剥除 tid 注释（规格 §3.2 待测点）', () => {
  it('任务行内联 `<!-- tid:xxx -->` 注释在净化后不残留', () => {
    const clean = sanitizeLikeEditor('- [ ] 写周报 <!-- tid:aaa111bbb222 -->\n- [ ] 周目标 <!-- tid:ccc333ddd444 parent:aaa111bbb222 -->')
    expect(clean).not.toContain('tid:')
    expect(clean).not.toContain('<!--')
    expect(clean).toContain('写周报') // 任务文本保留
    expect(clean).toContain('周目标')
  })

  it('正文内容不受净化影响（ADD_ATTR target 保留链接）', () => {
    const clean = sanitizeLikeEditor('[链接](https://example.com)')
    expect(clean).toContain('href="https://example.com"')
  })
})
