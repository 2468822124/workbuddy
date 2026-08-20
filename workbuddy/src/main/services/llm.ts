import { logger } from '../lib/logger'
import { settingsRepo } from '../db/repositories/settingsRepo'
import { newsRepo } from '../db/repositories/newsRepo'
import { NewsItem } from '@shared/types'
import {
  LLM_NEWS_CONTEXT_LIMIT,
  LLM_CHAT_MAX_TOKENS,
  LLM_CHAT_TIMEOUT_MS,
  LLM_REFS_MAX,
} from '@shared/constants'

// 阶段6：llm.ts 只保留热点搜索与连接测试（规格 §5.6）；
// 旧计划引导（guidePlan）、日复盘草稿（summarizeReview）、周/月复盘 LLM 路径及常量已随冻结区清理删除。

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
