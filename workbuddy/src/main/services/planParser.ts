import { randomUUID } from 'crypto'

/**
 * v0.2修复计划·参照完整性：任务行含内联隐形 tid。
 * `- [ ] 写周报 <!-- tid:7f3a2b [parent:a1b2c3] -->`
 * - tid 惰性分配（仅被级联引用时写回 content）；parent 仅在级联引用时存在。
 * - HTML 注释标记渲染不可见；Markdown 原文仍为真相源。
 * 组：1=缩进 2=bullet 3=勾选态 4=text(含注释) 5=tid 6=parentTid
 */
const TASK_LINE_RE = /^(\s*)([-*])\s+\[\s?([ xX])\s?\]\s+(.+?)(?:\s*<!--\s*tid:([0-9a-f]+)(?:\s+parent:([0-9a-f]+))?\s*-->)?\s*$/

export interface ParsedTaskLine {
  text: string
  consumed: boolean
  tid: string | null
  parentTid: string | null
}

/** 新 tid：12 位 hex（规格 tid 正则 [0-9a-f]+）。 */
export function newTid(): string {
  return randomUUID().replace(/-/g, '').slice(0, 12)
}

/** 去任务行尾内联 tid 注释（text 用）。 */
export function stripComment(text: string): string {
  return text.replace(/\s*<!--\s*tid:[0-9a-f]+(?:\s+parent:[0-9a-f]+)?\s*-->\s*$/, '').trim()
}

/** 在任务行后追加 tid 隐形注释（调用方保证幂等）。返回新行。 */
export function attachTid(line: string, tid: string, parentTid?: string | null): string {
  const m = line.match(TASK_LINE_RE)
  if (!m) return line
  const comment = parentTid ? ` <!-- tid:${tid} parent:${parentTid} -->` : ` <!-- tid:${tid} -->`
  return `${m[1]}${m[2]} [${m[3]}] ${stripComment(m[4])}${comment}`
}

/**
 * 提取所有未勾选任务行文本（去空白、去 tid 注释）。纯函数，无 DB/无副作用。
 * - 只提取 `- [ ]` / `* [ ]`；不提取 `- [x]`（已勾选）。
 * - 缩进容错（行首任意空白）。
 * - 非法/空输入 → 返回 []，不抛。
 */
export function parseTasks(markdown: string): string[] {
  if (!markdown) return []
  const out: string[] = []
  for (const line of markdown.split(/\r?\n/)) {
    const m = line.match(TASK_LINE_RE)
    if (m && m[3] === ' ') out.push(stripComment(m[4]))
  }
  return out
}

/**
 * v0.2修复计划·参照完整性：任务级联。同时提取未勾选与已勾选任务行，带消费状态 + tid。
 * - `- [ ] text` → { text, consumed:false, tid:null, parentTid:null }
 * - `- [x] text <!-- tid:abc -->` → { text, consumed:true, tid:'abc', parentTid:null }
 * - text 已剥离 tid 注释（渲染/复用池比较不受隐形标识干扰）。
 * - 缩进容错；非法/空输入 → []，不抛。
 */
export function parseTasksWithState(markdown: string): ParsedTaskLine[] {
  if (!markdown) return []
  const out: ParsedTaskLine[] = []
  for (const line of markdown.split(/\r?\n/)) {
    const m = line.match(TASK_LINE_RE)
    if (!m) continue
    out.push({
      text: stripComment(m[4]),
      consumed: m[3] !== ' ',
      tid: m[5] ?? null,
      parentTid: m[6] ?? null,
    })
  }
  return out
}

/** 按 tid 翻转任务行消费状态；找不到返回原 content。纯函数。 */
export function setTaskConsumedByTid(content: string, tid: string, consumed: boolean): string {
  let changed = false
  const out = content
    .split(/\r?\n/)
    .map(line => {
      const m = line.match(TASK_LINE_RE)
      if (!m || m[5] !== tid) return line
      changed = true
      const comment = ` <!-- tid:${m[5]}${m[6] ? ` parent:${m[6]}` : ''} -->`
      return `${m[1]}${m[2]} [${consumed ? 'x' : ' '}] ${stripComment(m[4])}${comment}`
    })
    .join('\n')
  return changed ? out : content
}

/** 按 tid 定位任务行（含 parentTid）。找不到返回 null。 */
export function findLineByTid(
  content: string,
  tid: string
): { line: string; index: number; parentTid: string | null } | null {
  const lines = content.split(/\r?\n/)
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(TASK_LINE_RE)
    if (m && m[5] === tid) return { line: lines[i], index: i, parentTid: m[6] ?? null }
  }
  return null
}

/**
 * P1-② 幂等加固（用户实测「tid 漂移」根因）：解析父任务行稳定 tid。
 * 优先级：content 行内注释 tid → 调用方传入的存量 tid（tasks 表同 planId+text 未删行，
 * content 注释因草稿覆盖/历史数据丢失时的复用源）→ 新分配。
 * 返回 { tid, lineWithTid, attached }：attached=true 表示行被补写 tid（需写回 content）。
 * 纯函数，无 DB 无副作用（存量 tid 由调用方查询后传入）。
 */
export function resolveStableTid(
  targetLine: string,
  existingTid: string | undefined
): { tid: string; lineWithTid: string; attached: boolean } {
  const m = targetLine.match(/<!--\s*tid:([0-9a-f]+)/)
  if (m) return { tid: m[1], lineWithTid: targetLine, attached: false }
  const tid = existingTid ?? newTid()
  return { tid, lineWithTid: attachTid(targetLine, tid, undefined), attached: true }
}

/** 按去注释文本定位第一个未勾选任务行（prepareTaskLink 无 tid 兜底）。找不到返回 null。 */
export function findOpenLineByText(
  content: string,
  text: string
): { line: string; index: number } | null {
  const lines = content.split(/\r?\n/)
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(TASK_LINE_RE)
    if (m && m[3] === ' ' && stripComment(m[4]) === text) return { line: lines[i], index: i }
  }
  return null
}

/**
 * 第二轮实测·问题①：收集一组子级计划 content 中被引用的上级任务 tid 集合
 * （任务行 `parent:{parentTid}` 注释）。纯函数，无 DB 无副作用。
 * rail 隐藏源：周/月任务 tid 命中该集合 → 本期已安排（全期隐藏，跨天防重复选取）。
 */
export function collectChildRefs(contents: string[]): Set<string> {
  const refs = new Set<string>()
  for (const content of contents) {
    if (!content) continue
    for (const line of content.split(/\r?\n/)) {
      const m = line.match(TASK_LINE_RE)
      if (m && m[6]) refs.add(m[6])
    }
  }
  return refs
}
