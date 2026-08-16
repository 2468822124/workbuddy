// 第三轮实测·问题甲：编辑框隐藏 tid 注释 —— 显示剥离 / 回写按行 reconcile。
// 设计：planDraft（raw，真相源）保留 `<!-- tid:x parent:y -->` 隐形注释；
// textarea 只显示剥离后的纯文本；用户编辑后按行贪心对齐把原注释挂回。
// 纯函数，无副作用（供 MarkdownEditor 与单测）。

// 任务行（与 usePlanning 的 TASK_LINE_RE 同形；含行尾内联 tid 注释）
const TASK_LINE_RE = /^(\s*)[-*]\s+\[\s?([ xX])\s?\]\s+(.+?)(?:\s*<!--\s*tid:[0-9a-f]+(?:\s+parent:[0-9a-f]+)?\s*-->)?\s*$/

// 行尾 tid 注释（含前导空白），提取用
const TID_COMMENT_RE = /(?:\s*<!--\s*tid:[0-9a-f]+(?:\s+parent:[0-9a-f]+)?\s*-->)\s*$/

function isTaskLine(line: string): boolean {
  return TASK_LINE_RE.test(line)
}

/** 剥任务行尾 tid 注释（非任务行原样返回）。 */
export function stripTaskLineComment(line: string): string {
  if (!isTaskLine(line)) return line
  return line.replace(TID_COMMENT_RE, '')
}

/** 提取任务行尾 tid 注释段（无则 ''，保留前导一个空格便于拼接）。 */
function tidCommentOf(line: string): string {
  if (!isTaskLine(line)) return ''
  const m = line.match(TID_COMMENT_RE)
  return m ? m[0] : ''
}

/** 全文显示视图：每行任务行剥注释。 */
export function displayPlanContent(raw: string): string {
  if (!raw) return ''
  return raw.split(/\r?\n/).map(stripTaskLineComment).join('\n')
}

/**
 * 回写 reconcile：display 新文本 → raw 真相源。
 * 按行贪心对齐（顺序指针），判定顺序：
 *  1. 未改行（剥注释后相同）→ 保留原 raw 行（含注释）
 *  2. 插入行（当前 old 行出现在 news 后文）→ 裸行 nl，old 指针不动
 *  3. 删行（nl 匹配 old 后文某行，可连续多行被删）→ 丢弃中间行，保匹配原行
 *  4. 改名（任务行文本改 + 后文行数对齐）→ 新文本 + 原注释（改名保 tid）
 *  5. 无法对齐（多行编辑/粘贴错位）→ 裸行，不崩（tid 归属宁可丢不挂错）
 */
export function reconcilePlanContent(oldRaw: string, newDisplay: string): string {
  const olds = oldRaw.split(/\r?\n/)
  const news = newDisplay.split(/\r?\n/)
  const out: string[] = []
  let oi = 0
  for (let ni = 0; ni < news.length; ni++) {
    const nl = news[ni]
    const ol = oi < olds.length ? olds[oi] : undefined
    if (ol === undefined) {
      out.push(nl)
      continue
    }
    const strippedOld = stripTaskLineComment(ol)
    // 1. 未改行：保留原行（含注释）
    if (strippedOld === nl) {
      out.push(ol)
      oi++
      continue
    }
    // 2. 插入行：当前 old 行仍会在 news 后文出现 → nl 是新插入，裸行（old 指针不动）
    if (news.slice(ni + 1).some(x => x === strippedOld)) {
      out.push(nl)
      continue
    }
    // 3. 删行（可连续多行）：nl 匹配 old 后文某行 → 中间 old 行被删（注释失效），保留匹配原行
    let lookahead = oi
    while (lookahead < olds.length && stripTaskLineComment(olds[lookahead]) !== nl) lookahead++
    if (lookahead < olds.length) {
      out.push(olds[lookahead])
      oi = lookahead + 1
      continue
    }
    // 4. 改名：同行位置任务行文本改。安全判据：news 后文非空（后续行对齐可信，允许"改名+删行"组合）；
    //    或 news 后文已空但 old 后文也无任务行（纯尾部改名）。否则（old 尾部被删且 nl 可能是
    //    尾部某行改名 = "删行+改名"混合）→ 不走改名，降级裸行（宁可丢 tid 不挂错）。
    const newsRemain = news.length - ni - 1
    const oldTailHasTask = olds.slice(oi + 1).some(isTaskLine)
    const tailSafe = newsRemain > 0 || !oldTailHasTask
    if (tailSafe && isTaskLine(ol) && isTaskLine(nl) && tidCommentOf(ol)) {
      // 新文本 + 原注释（改名保 tid —— 与问题乙 syncPlanTodos 按 tid 复用协同）
      out.push(stripTaskLineComment(nl).trimEnd() + tidCommentOf(ol))
      oi++
      continue
    }
    // 5. 无法对齐：裸行（宁可丢 tid 不挂错）
    out.push(nl)
  }
  return out.join('\n')
}
