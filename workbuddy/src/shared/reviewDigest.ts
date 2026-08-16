const MARKDOWN_LINE_RE = /^\s*#{1,6}\s*$|^\s*-{3,}\s*$|^\s*\{\{.*\}\}\s*$|^\s*[-*]\s+\[[ xX]\]\s*$/

/** Markdown → 摘要纯文本。去标题/分隔/占位/空任务行 + 去行内符号 + 截断。空→''。*/
export function extractDigest(content: string, maxLen = 80): string {
  if (!content) return ''
  const kept = content.split(/\r?\n/)
    // 1. 过滤：空行、纯标题行、纯分隔线、模板占位行、空任务行
    .filter(line => line.trim() !== '' && !MARKDOWN_LINE_RE.test(line))
    // 2. 去行内 markdown 符号
    .map(line => line
      .replace(/^\s*#{1,6}\s*/, '')        // 行首标题符
      .replace(/^\s*[-*+]\s+(?:\[[ xX]\]\s+)?/, '') // 列表/任务符
      .replace(/^\s*\d+\.\s*/, '')          // 有序列表符
      .replace(/\*\*|__|~~|`/g, '')         // 强调/代码/删除线
      .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1') // [text](url) → text
      .trim())
    .filter(line => line !== '')
  const joined = kept.join(' ').replace(/\s+/g, ' ').trim()
  if (!joined) return ''
  return joined.length > maxLen ? joined.slice(0, maxLen) + '…' : joined
}
