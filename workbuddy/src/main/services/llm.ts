import { logger } from '../lib/logger'
import { settingsRepo } from '../db/repositories/settingsRepo'
import { newsRepo } from '../db/repositories/newsRepo'
import { todoRepo } from '../db/repositories/todoRepo'
import { projectRepo } from '../db/repositories/projectRepo'
import { templateRepo } from '../db/repositories/templateRepo'
import { planRepo } from '../db/repositories/planRepo'
import { reviewRepo } from '../db/repositories/reviewRepo'
import { NewsItem, Todo, ProjectWithCounts, ReviewSummaryResult } from '@shared/types'
import { getWeekStart, getWeekRange, getMonthStart, getMonthRange, isoWeekOf, addDays, periodLabel } from '@shared/period'
import {
  LLM_NEWS_CONTEXT_LIMIT,
  LLM_CHAT_MAX_TOKENS,
  LLM_CHAT_TIMEOUT_MS,
  LLM_REFS_MAX,
  LLM_GUIDE_MAX_TOKENS,
  LLM_DRAFT_MAX_TOKENS,
  LLM_TODO_LIMIT,
  LLM_TODO_CHARS,
  LLM_PROJECT_LIMIT,
  LLM_GUIDE_ITEMS_MAX,
  LLM_WEEK_REVIEW_MAX_TOKENS,
  LLM_MONTH_REVIEW_MAX_TOKENS,
  LLM_REVIEW_TODO_LIMIT,
  LLM_REVIEW_TODO_CHARS,
  LLM_REVIEW_SUB_LIMIT,
  LLM_REVIEW_SUB_CHARS,
} from '@shared/constants'

export interface LlmTestConfig {
  baseUrl: string
  model: string
  apiKey: string
}

export interface LlmTestResult {
  ok: boolean
  message?: string
  latencyMs?: number
}

export class ChatError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message)
    this.name = 'ChatError'
  }
}

// ---- Phase 4: testConnection ----

// 尝试解析响应体：必须是 JSON 且含 choices[0].message.content 字符串（error 形态/HTML/非 JSON → null）
async function parseTestBody(res: Response): Promise<boolean> {
  const text = await res.text().catch(() => '')
  if (!text) return false
  const first = text.trim().charAt(0)
  if (first !== '{' && first !== '[') return false // HTML 页/纯文本 → 非 JSON
  try {
    const json = JSON.parse(text)
    const content = json?.choices?.[0]?.message?.content
    return typeof content === 'string'
  } catch {
    return false
  }
}

export async function testConnection(cfg: LlmTestConfig): Promise<LlmTestResult> {
  const started = Date.now()
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 10_000)

  try {
    const url = (cfg.baseUrl.replace(/\/+$/, '')) + '/chat/completions'
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${cfg.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: cfg.model,
        messages: [{ role: 'user', content: 'ping' }],
        max_tokens: 1,
        stream: false,
      }),
      signal: controller.signal,
    })

    clearTimeout(timeout)
    const latencyMs = Date.now() - started

    if (!res.ok) {
      const text = await res.text().catch(() => '')
      logger.warn(`LLM test failed: ${res.status} ${res.statusText}`, { status: res.status, msg: text.slice(0, 200) })
      return { ok: false, message: `服务器返回 ${res.status}：${text.slice(0, 100) || res.statusText}`, latencyMs }
    }

    // 校验响应体为有效 OpenAI Chat Completion（2xx 也可能是 HTML 错误页/soft-404/error 形态）
    const parsed = await parseTestBody(res)
    if (!parsed) {
      return { ok: false, message: '该地址未返回有效的 AI 响应，请确认 Base URL 指向 OpenAI 兼容的 /chat/completions 端点（如 https://api.deepseek.com）', latencyMs }
    }

    logger.info(`LLM test OK, ${latencyMs}ms`)
    return { ok: true, latencyMs }
  } catch (e: unknown) {
    clearTimeout(timeout)
    if ((e as Error).name === 'AbortError') {
      return { ok: false, message: '连接超时（10s）' }
    }
    logger.warn(`LLM test network error: ${(e as Error).message}`)
    return { ok: false, message: `连接失败：${(e as Error).message}` }
  }
}

// ---- Phase 5: conversational hotspot search ----

const SYSTEM_PROMPT = `你是 WorkBuddy 的热点助手。请仅依据用户提供的「今日热点」列表回答问题，不得编造列表之外的信息或链接。
规则：
1. 若列表中没有相关信息，在 answer 中如实说明，refs 返回空数组 []。
2. answer 用中文，简洁（不超过 150 字），口语、可读。
3. 引用真实存在的热点：refs 中每个 index 必须是列表里的编号（从 1 开始），reason 用一句话说明相关性（不超过 30 字）。
4. 不要输出任何链接；链接由系统根据 index 自动补全。
5. 必须只输出一个 JSON 对象，不要包含任何解释或 markdown 代码块标记：
{"answer":"...","refs":[{"index":1,"reason":"..."}]}`

function buildMessages(
  context: NewsItem[],
  query: string,
): { role: string; content: string }[] {
  const list = context
    .map(
      (n, i) =>
        `[${i + 1}] 《${n.title}》 来源：${n.source}${n.publishedAt ? ` · ${n.publishedAt.slice(0, 10)}` : ''}\n摘要：${n.summary ?? '无'}`,
    )
    .join('\n\n')

  return [
    { role: 'system', content: SYSTEM_PROMPT },
    {
      role: 'user',
      content: `今日热点（共 ${context.length} 条）：\n${list}\n\n用户问题：${query}\n\n请按系统提示的 JSON 格式回答。`,
    },
  ]
}

function parseChatJson(raw: string): {
  answer: string
  refs?: { index: number; reason?: string }[]
} | null {
  let s = raw.trim()
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fence) s = fence[1].trim()
  const first = s.indexOf('{')
  const last = s.lastIndexOf('}')
  if (first === -1 || last <= first) return null
  try {
    const obj = JSON.parse(s.slice(first, last + 1))
    return typeof obj.answer === 'string' ? obj : null
  } catch {
    return null
  }
}

function mapRefs(
  refs: { index: number; reason?: string }[] | undefined,
  context: NewsItem[],
): import('@shared/types').ChatRef[] {
  const seen = new Set<string>()
  const out: import('@shared/types').ChatRef[] = []
  for (const r of refs ?? []) {
    const i = Number(r?.index)
    if (!Number.isInteger(i) || i < 1 || i > context.length) continue
    const item = context[i - 1]
    if (seen.has(item.id)) continue
    seen.add(item.id)
    out.push({ item, reason: String(r.reason ?? '').slice(0, 80) })
    if (out.length >= LLM_REFS_MAX) break
  }
  return out
}

async function extractContent(res: Response): Promise<string> {
  try {
    const json = await res.json()
    return json?.choices?.[0]?.message?.content ?? ''
  } catch {
    return ''
  }
}

export async function searchNews(query: string): Promise<import('@shared/types').ChatResult> {
  // 1. Read config (settingsRepo.get auto-decrypts llmApiKey)
  const base = settingsRepo.get('llmBaseUrl')?.value?.trim()
  const model = settingsRepo.get('llmModel')?.value?.trim()
  const apiKey = settingsRepo.get('llmApiKey')?.value // already decrypted by rowToSetting

  if (!base || !model || !apiKey) {
    throw new ChatError(
      'LLM_NOT_CONFIGURED',
      '未配置 AI，请先在设置中填写 Base URL、Model 与 API Key',
    )
  }

  // 2. Read context (only news_items — no private tables)
  const context = newsRepo.list(LLM_NEWS_CONTEXT_LIMIT)
  if (context.length === 0) {
    return { answer: '暂无热点数据，请先在今日热点卡点击「刷新热点」。', refs: [], latencyMs: 0 }
  }

  // 3. Build messages
  const messages = buildMessages(context, query)

  // 4. Fetch
  const started = Date.now()
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), LLM_CHAT_TIMEOUT_MS)

  let res: Response
  try {
    res = await fetch(base.replace(/\/+$/, '') + '/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: 0.3,
        max_tokens: LLM_CHAT_MAX_TOKENS,
        stream: false,
      }),
      signal: controller.signal,
    })
  } catch (e: unknown) {
    clearTimeout(timer)
    if ((e as Error).name === 'AbortError') {
      throw new ChatError('LLM_TIMEOUT', 'AI 响应超时（>30s），请稍后重试')
    }
    throw new ChatError('LLM_NETWORK', '网络连接失败，请检查网络或 Base URL')
  }
  clearTimeout(timer)
  const latencyMs = Date.now() - started

  // 5. Map HTTP status → ChatError (single attempt, no retry)
  if (res.status === 401 || res.status === 403) {
    throw new ChatError('LLM_AUTH', 'API Key 无效或已过期，请前往设置检查')
  }
  if (res.status === 429) {
    throw new ChatError('LLM_RATE_LIMIT', '请求过于频繁，请稍后再试')
  }
  if (res.status >= 500) {
    throw new ChatError('LLM_UNAVAILABLE', `AI 服务暂时不可用（${res.status}），请稍后重试`)
  }
  if (!res.ok) {
    throw new ChatError('LLM_ERROR', `AI 返回异常（${res.status}）`)
  }

  // 6. Parse response — robust JSON extraction
  const raw = await extractContent(res)
  const parsed = parseChatJson(raw)
  const answer = parsed ? parsed.answer : raw.slice(0, 500)
  const refs = parsed ? mapRefs(parsed.refs, context) : []

  // 7. Log (only latency + ref count + status — never apiKey, never answer text)
  logger.info(`chat search OK, ${latencyMs}ms, refs=${refs.length}`)
  return { answer, refs, latencyMs }
}

// ---- 子阶段4: 计划引导 + 复盘汇总草稿（复用阶段5 LLM 范式；searchNews 不重构） ----

export interface PlanGuideItem { placeholder: string; question: string; suggestion: string }
export interface PlanGuideResult { items: PlanGuideItem[]; latencyMs: number }
export interface ReviewDraftResult { draft: string; latencyMs: number }

// 共享请求：配置探测 → endpoint 规范化 → fetch+AbortController → 状态码 → ChatError → content 字符串
// apiKey 永不入日志（logger.redact 兜底 + 调用方显式不传）
async function requestChat(
  messages: { role: string; content: string }[],
  opts: { maxTokens: number; temperature?: number },
): Promise<{ content: string; latencyMs: number }> {
  const base = settingsRepo.get('llmBaseUrl')?.value?.trim()
  const model = settingsRepo.get('llmModel')?.value?.trim()
  const apiKey = settingsRepo.get('llmApiKey')?.value // settingsRepo.rowToSetting 已解密
  if (!base || !model || !apiKey) {
    throw new ChatError('LLM_NOT_CONFIGURED', '未配置 AI，请先在设置中填写 Base URL、Model 与 API Key')
  }
  const started = Date.now()
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), LLM_CHAT_TIMEOUT_MS)
  let res: Response
  try {
    res = await fetch(base.replace(/\/+$/, '') + '/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, messages, temperature: opts.temperature ?? 0.4, max_tokens: opts.maxTokens, stream: false }),
      signal: controller.signal,
    })
  } catch (e: unknown) {
    clearTimeout(timer)
    if ((e as Error).name === 'AbortError') throw new ChatError('LLM_TIMEOUT', 'AI 响应超时（>30s），请稍后重试')
    throw new ChatError('LLM_NETWORK', '网络连接失败，请检查网络或 Base URL')
  }
  clearTimeout(timer)
  if (res.status === 401 || res.status === 403) throw new ChatError('LLM_AUTH', 'API Key 无效或已过期，请前往设置检查')
  if (res.status === 429)                 throw new ChatError('LLM_RATE_LIMIT', '请求过于频繁，请稍后再试')
  if (res.status >= 500)                  throw new ChatError('LLM_UNAVAILABLE', `AI 服务暂时不可用（${res.status}），请稍后重试`)
  if (!res.ok)                            throw new ChatError('LLM_ERROR', `AI 返回异常（${res.status}）`)
  const content = await extractContent(res)
  return { content, latencyMs: Date.now() - started }
}

// 鲁棒 JSON 解析：剥 ```json 围栏；取首 '{' 到末 '}'；失败 → null（调用方降级）
function parseJsonObject(raw: string): Record<string, unknown> | null {
  let s = raw.trim()
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fence) s = fence[1].trim()
  const first = s.indexOf('{')
  const last = s.lastIndexOf('}')
  if (first === -1 || last <= first) return null
  try { return JSON.parse(s.slice(first, last + 1)) } catch { return null }
}

function todayStr(): string {
  return new Date().toISOString().slice(0, 10)
}

// 引导上下文：todo content 截断 LLM_TODO_CHARS；项目仅 name/status/openTasks（不暴露 description，最小化外发）
function buildGuideContext(open: Todo[], overdue: Todo[], projects: ProjectWithCounts[]): string {
  const fmt = (t: Todo, tag: string) =>
    `[${tag}] ${String(t.content).slice(0, LLM_TODO_CHARS)}${t.projectId ? '（项目内）' : ''}`
  const lines: string[] = []
  if (overdue.length) lines.push('逾期未完成：\n' + overdue.map(t => fmt(t, '逾期')).join('\n'))
  if (open.length) lines.push('今日待办：\n' + open.map(t => fmt(t, '今日')).join('\n'))
  if (projects.length) lines.push('进行中项目：\n' + projects.map(p => `- ${p.name}（${p.status}，${p.openTasks} 项待办）`).join('\n'))
  return lines.join('\n\n') || '（无上下文）'
}

// 汇总上下文：done content 截断；项目仅 name/status/openTasks
function buildSummaryContext(done: Todo[], projects: ProjectWithCounts[]): { done: string; projects: string } {
  const doneLines = done.map(t => `- ${String(t.content).slice(0, LLM_TODO_CHARS)}`).join('\n')
  const projLines = projects.map(p => `- ${p.name}（${p.status}，${p.openTasks} 项进行中待办）`).join('\n')
  return { done: doneLines || '（无）', projects: projLines || '（无）' }
}

const GUIDE_SYSTEM_PROMPT = `你是 WorkBuddy 的计划助手，帮用户做日/周计划。依据用户提供的「待办与项目上下文」+「计划模板结构」+「用户已填内容」，为模板里出现的每个占位符（形如 {{名称}}）给出引导。
规则：
1. 对模板里出现的每个 {{占位符}}，输出一个对象：placeholder=占位符名（不含花括号），question=一句引导提问（≤30 字），suggestion=一条具体可用、贴合上下文的建议填写（≤80 字）。
2. 若上下文有逾期/今日待办/进行中项目，在相关 suggestion 里点名（如"先处理逾期的 X"）。
3. 不要编造上下文里没有的任务或项目名。
4. 必须只输出一个 JSON 对象，不要任何解释或 markdown 代码块标记：
{"items":[{"placeholder":"focus","question":"...","suggestion":"..."}]}`

const DRAFT_SYSTEM_PROMPT = `你是 WorkBuddy 的复盘助手，帮用户写日复盘。依据用户提供的「当日已完成任务」+「项目进展」，生成一份简洁、真实的日复盘 Markdown 草稿。
规则：
1. 只使用上下文里真实出现的任务与项目，不得编造。
2. 草稿用中文，结构含：一段今日完成概述 + 关键进展（按条目或按项目）+ 一句反思 + 明日可关注点。总长度适中（约 150–300 字）。
3. 任务用普通列表（- ），不要用 - [ ] 任务框（复盘不生成待办）。
4. 必须只输出一个 JSON 对象，不要任何解释或 markdown 代码块标记：
{"draft":"# 日复盘草稿\\n\\n..."}`

export async function guidePlan(args: { templateId: string; filled: string }): Promise<PlanGuideResult> {
  const tpl = templateRepo.findById(args.templateId)
  if (!tpl || !tpl.content) throw new ChatError('INVALID', '模板不存在或为空')

  const today = todayStr()
  const openTodos = todoRepo.findOpenToday(today).slice(0, LLM_TODO_LIMIT)
  const overdue = todoRepo.findOverdue(today).slice(0, LLM_TODO_LIMIT)
  const projects = projectRepo.findActive().slice(0, LLM_PROJECT_LIMIT)
  const ctx = buildGuideContext(openTodos, overdue, projects)

  const messages = [
    { role: 'system', content: GUIDE_SYSTEM_PROMPT },
    { role: 'user', content: `计划模板：\n${tpl.content}\n\n用户已填内容：\n${args.filled || '（空）'}\n\n上下文：\n${ctx}\n\n请为模板里出现的每个 {{占位符}} 给出引导，按系统提示的 JSON 格式输出。` },
  ]

  const { content, latencyMs } = await requestChat(messages, { maxTokens: LLM_GUIDE_MAX_TOKENS, temperature: 0.5 })
  const parsed = parseJsonObject(content)
  const items: PlanGuideItem[] = Array.isArray(parsed?.items)
    ? parsed.items
        .filter((it: unknown): it is PlanGuideItem =>
          it != null && typeof it === 'object' &&
          typeof (it as PlanGuideItem).placeholder === 'string' &&
          typeof (it as PlanGuideItem).question === 'string' &&
          typeof (it as PlanGuideItem).suggestion === 'string')
        .map((it: PlanGuideItem) => ({
          placeholder: it.placeholder.slice(0, 40),
          question: it.question.slice(0, 80),
          suggestion: it.suggestion.slice(0, 200),
        }))
        .slice(0, LLM_GUIDE_ITEMS_MAX)
    : []

  logger.info(`plan guide OK, ${latencyMs}ms, items=${items.length}`) // 仅记计数
  return { items, latencyMs }
}

export async function summarizeReview(date: string): Promise<ReviewDraftResult> {
  const done = todoRepo.findCompletedOn(date).slice(0, LLM_TODO_LIMIT)
  const projects = projectRepo.findActive().slice(0, LLM_PROJECT_LIMIT)
  if (done.length === 0) {
    return { draft: `# 日复盘草稿 · ${date}\n\n（当日暂无完成任务记录，可手动补充今日收获与反思。）`, latencyMs: 0 }
  }
  const ctx = buildSummaryContext(done, projects)

  const messages = [
    { role: 'system', content: DRAFT_SYSTEM_PROMPT },
    { role: 'user', content: `复盘日期：${date}\n\n当日已完成任务：\n${ctx.done}\n\n项目进展：\n${ctx.projects}\n\n请按系统提示的 JSON 格式输出日复盘草稿。` },
  ]
  const { content, latencyMs } = await requestChat(messages, { maxTokens: LLM_DRAFT_MAX_TOKENS, temperature: 0.4 })
  const parsed = parseJsonObject(content)
  const draft = (parsed && typeof parsed.draft === 'string')
    ? parsed.draft.slice(0, 4000)
    : content.slice(0, 1000) // 降级：原文当草稿
  logger.info(`review draft OK, ${latencyMs}ms, draftLen=${draft.length}`) // 仅记长度
  return { draft, latencyMs }
}

// ---- 子阶段5: 周/月结构化复盘（复用 requestChat；直出 Markdown，不做 JSON 解析） ----

// 模型误包 ``` 代码块时剥除（保留内部 Markdown 原文；非围栏 → 原样返回）
function stripFence(raw: string): string {
  let s = raw.trim()
  const fence = s.match(/^```(?:markdown|md)?\s*([\s\S]*?)\s*```$/i)
  if (fence) s = fence[1].trim()
  return s
}

const WEEKLY_REVIEW_SYSTEM_PROMPT = `你是 WorkBuddy 的周复盘助手。依据用户提供的「本周目标」「本周完成任务」「本周每日复盘」「上周风险评估」「进行中项目」，生成一份结构化周复盘 Markdown。
严格按以下章节顺序与格式输出（纯 Markdown，不要 \`\`\`代码块包裹，不要任何前言/解释）：

## ◎ 本期目标达成对照
| 目标 | 实际 | 状态 |
|---|---|---|
| <目标1，来自本周目标> | <对照本周完成的实际> | ✓达成 / ◐部分 / ✗未达 |
（列出本周目标里的每个重点/任务，逐条对照；无目标则写「（本期未设定明确目标）」）

## 🔴 重大事件
1. **<标题>**：<叙事，含因果/演进，≤80 字>
（2–3 条本周有跨天演进或决定性意义的事）

## 🟢 亮点
1. <亮点，≤40 字>
（2–4 条）

## 🟡 不足
### <现象标题>
- **现象**：<观察到的问题>
- **原因**：<分析>
- **改进**：<下周具体动作>
（1–2 个）

## ⚠️ 上周风险复查
| 上周风险 | 本周状态 |
|---|---|
| <风险> | <已解除/持续/升级> ✅/⚠️
（对照上周风险评估里的每条；无则「（上周无登记风险）」）

## ⚠️ 风险评估
**新增风险**：<若无新增写「无新增风险」；有则点名 + 规律分析>

## ➡️ 下周计划调整建议
1. <建议>
（2–3 条，直接来自上面不足/风险/亮点的推论）

规则：
1. 只使用上下文里真实出现的任务/项目/复盘内容，不得编造。
2. 完成状态判断依据「本周完成」清单与目标对照；状态符号必须用 ✓达成 / ◐部分 / ✗未达 三选一。
3. 输出纯 Markdown，不要外层代码块、不要 JSON。`

const MONTHLY_REVIEW_SYSTEM_PROMPT = `你是 WorkBuddy 的月复盘助手。依据「本月目标」「本月完成统计」「本月每周完成率&任务数」「本月各周复盘」「上月风险评估」「进行中项目」，生成结构化月复盘 Markdown。
严格按以下章节输出（纯 Markdown，无代码块/无前言）：

## ◎ 本期目标达成对照
| 目标 | 实际 | 状态 |
|---|---|---|
（同周规则，逐条对照本月目标）

## ⚠️ 本月风险评估
**<风险标题>**：<趋势/规律/对策>（含「已解除/持续/升级」）
（1–2 条；对照上月风险 + 识别本月新模式，如「某类事项系统性让位」）

## 💡 经验教训
1. <本月总结性教训，偏宏观/制度/节奏>
（2–3 条）

## ➡️ 下月计划调整建议
1. <建议>
（2–3 条）

规则：
1. 只用真实上下文，不编造数字或事件。
2. 整月宏观完成率&任务数、每周完成率&任务数的【图表由系统自动绘制】，你只需在「经验教训/风险评估」里引用这些数字做洞察，不要自己画图。
3. 状态符号 ✓达成 / ◐部分 / ✗未达。
4. 纯 Markdown，无代码块/无 JSON。`

// 周复盘上下文：本期目标 + 本周完成 + 日级复盘摘要 + 上周风险 + 项目（仅 name/status/counts，不暴露 description）
function buildWeeklyContext(periodStart: string, periodEnd: string): string {
  const plan = planRepo.getByPeriod('weekly_plan', periodStart)
  const done = todoRepo.findCompletedInRange(periodStart, periodEnd).slice(0, LLM_REVIEW_TODO_LIMIT)
  const subReviews = reviewRepo.findAll({ from: periodStart, to: periodEnd, type: 'daily_review' })
    .slice(0, LLM_REVIEW_SUB_LIMIT)
  const prevWeekStart = getWeekStart(addDays(periodStart, -1))
  const prevReview = reviewRepo.getByPeriod('weekly_review', prevWeekStart)
  const projects = projectRepo.findActive().slice(0, LLM_PROJECT_LIMIT)

  const parts: string[] = []
  parts.push(`【本周目标】\n${plan?.content ? plan.content.slice(0, 2000) : '（本期未设定明确目标）'}`)
  parts.push(`【本周完成任务】\n${done.map(t => `- ${String(t.content).slice(0, LLM_REVIEW_TODO_CHARS)}`).join('\n') || '（无）'}`)
  parts.push(`【本周每日复盘】\n${subReviews.map(r => `### ${r.date}\n${(r.content ?? '').slice(0, LLM_REVIEW_SUB_CHARS)}`).join('\n\n') || '（无）'}`)
  parts.push(`【上周风险评估】\n${prevReview?.content ? prevReview.content.slice(0, LLM_REVIEW_SUB_CHARS) : '（上周无登记风险）'}`)
  parts.push(`【进行中项目】\n${projects.map(p => `- ${p.name}（${p.status}，${p.openTasks} 项待办）`).join('\n') || '（无）'}`)
  return parts.join('\n\n')
}

// 月复盘上下文：本月目标 + 完成统计 + 按周完成率（与前端图表同源：findAllInRange 按 planDate 分组）+ 周级复盘摘要 + 上月风险 + 项目
function buildMonthlyContext(monthStart: string, monthEnd: string): string {
  const plan = planRepo.getByPeriod('monthly_plan', monthStart)
  const all = todoRepo.findAllInRange(monthStart, monthEnd)
  const done = all.filter(t => t.status === 'done').slice(0, LLM_REVIEW_TODO_LIMIT)

  const weekMap = new Map<string, { done: number; total: number }>()
  for (const t of all) {
    const ws = t.planDate ? getWeekStart(t.planDate) : null
    if (!ws) continue
    const key = `W${isoWeekOf(ws)}`
    const cur = weekMap.get(key) ?? { done: 0, total: 0 }
    cur.total++
    if (t.status === 'done') cur.done++
    weekMap.set(key, cur)
  }
  const weekLines = [...weekMap.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([k, v]) => `${k}: ${v.done}/${v.total}(${v.total ? Math.round((v.done / v.total) * 100) : 0}%)`)

  const subReviews = reviewRepo.findAll({ from: monthStart, to: monthEnd, type: 'weekly_review' })
    .slice(0, LLM_REVIEW_SUB_LIMIT)
  const prevMonthStart = getMonthStart(addDays(monthStart, -1))
  const prevReview = reviewRepo.getByPeriod('monthly_review', prevMonthStart)
  const projects = projectRepo.findActive().slice(0, LLM_PROJECT_LIMIT)

  const parts: string[] = []
  parts.push(`【本月目标】\n${plan?.content ? plan.content.slice(0, 2000) : '（本期未设定明确目标）'}`)
  parts.push(`【本月完成统计】\n共 ${done.length} 条已完成：\n${done.map(t => `- ${String(t.content).slice(0, LLM_REVIEW_TODO_CHARS)}`).join('\n') || '（无）'}`)
  parts.push(`【本月每周完成率&任务数】\n${weekLines.join('\n') || '（无）'}`)
  parts.push(`【本月各周复盘】\n${subReviews.map(r => `### ${r.date}\n${(r.content ?? '').slice(0, LLM_REVIEW_SUB_CHARS)}`).join('\n\n') || '（无）'}`)
  parts.push(`【上月风险评估】\n${prevReview?.content ? prevReview.content.slice(0, LLM_REVIEW_SUB_CHARS) : '（上月无登记风险）'}`)
  parts.push(`【进行中项目】\n${projects.map(p => `- ${p.name}（${p.status}，${p.openTasks} 项待办）`).join('\n') || '（无）'}`)
  return parts.join('\n\n')
}

export async function summarizeWeeklyReview(periodStart: string): Promise<ReviewSummaryResult> {
  const [start, end] = getWeekRange(periodStart)
  const ctx = buildWeeklyContext(start, end)
  const messages = [
    { role: 'system', content: WEEKLY_REVIEW_SYSTEM_PROMPT },
    { role: 'user', content: `本期：${start} 至 ${end}\n\n${ctx}\n\n请按系统提示生成周复盘 Markdown。` },
  ]
  const { content, latencyMs } = await requestChat(messages, { maxTokens: LLM_WEEK_REVIEW_MAX_TOKENS, temperature: 0.4 })
  const markdown = stripFence(content).slice(0, 6000)
  logger.info(`weekly review OK, ${latencyMs}ms, len=${markdown.length}`) // 仅记长度，不记复盘明文
  return { content: markdown, latencyMs }
}

export async function summarizeMonthlyReview(periodStart: string): Promise<ReviewSummaryResult> {
  const [start, end] = getMonthRange(periodStart)
  const ctx = buildMonthlyContext(start, end)
  const messages = [
    { role: 'system', content: MONTHLY_REVIEW_SYSTEM_PROMPT },
    { role: 'user', content: `本期：${periodLabel('monthly', start)}\n\n${ctx}\n\n请按系统提示生成月复盘 Markdown。` },
  ]
  const { content, latencyMs } = await requestChat(messages, { maxTokens: LLM_MONTH_REVIEW_MAX_TOKENS, temperature: 0.4 })
  const markdown = stripFence(content).slice(0, 6000)
  logger.info(`monthly review OK, ${latencyMs}ms, len=${markdown.length}`) // 仅记长度，不记复盘明文
  return { content: markdown, latencyMs }
}
