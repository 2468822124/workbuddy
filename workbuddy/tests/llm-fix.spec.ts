import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest'
import http from 'node:http'
import type { AddressInfo } from 'node:net'
import type { NewsItem } from '../src/shared/types'

// 阶段6 · 步骤9：llm.ts 只保留 testConnection / searchNews（规格 §5.6）。
// 旧规划引导与旧复盘 LLM 路径（guidePlan / summarizeReview 等）已删除，相关测试一并移除。

// llm.ts 的 DB 依赖模块——用 mock 替换，避免 electron app 依赖
vi.mock('../src/main/db/repositories/settingsRepo', () => ({
  settingsRepo: { get: vi.fn() },
}))
vi.mock('../src/main/db/repositories/newsRepo', () => ({
  newsRepo: { list: vi.fn() },
}))

import { settingsRepo } from '../src/main/db/repositories/settingsRepo'
import { newsRepo } from '../src/main/db/repositories/newsRepo'
import { testConnection, searchNews, ChatError } from '../src/main/services/llm'

function setting(value: string | undefined) {
  return { value } as { value?: string }
}

function makeNews(over: Partial<NewsItem> = {}): NewsItem {
  return {
    id: 'n1',
    title: '测试热点',
    url: 'https://example.com/1',
    source: '测试源',
    publishedAt: '2026-08-10T08:00:00.000Z',
    summary: '测试摘要',
    ...over,
  }
}

// ---- E1: testConnection 响应体校验（真实 HTTP server，真 fetch） ----

let server: http.Server
let baseUrl = ''

beforeEach(async () => {
  await new Promise<void>(resolve => {
    server = http.createServer((req, res) => {
      let body = ''
      req.on('data', (c: Buffer) => (body += c))
      req.on('end', () => {
        const model = (JSON.parse(body || '{}') as { model?: string }).model ?? ''
        if (model === 'html') {
          res.writeHead(200, { 'Content-Type': 'text/html' })
          res.end('<html><head><title>首页</title></head><body>欢迎</body></html>')
        } else if (model === 'error') {
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: { message: 'invalid api key' } }))
        } else if (model === 'badjson') {
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end('{oops not json')
        } else if (model === 'valid') {
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ id: 'x', choices: [{ message: { role: 'assistant', content: 'pong' } }] }))
        } else if (model === 'unauth') {
          res.writeHead(401, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: { message: 'unauthorized' } }))
        } else {
          res.writeHead(404)
          res.end('not found')
        }
      })
    })
    server.listen(0, '127.0.0.1', () => {
      baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
      resolve()
    })
  })
})

afterAll(() => {
  server?.close()
})

describe('E1 testConnection 响应体校验', () => {
  it('HTML 页（soft-404，如 baidu.com）→ ok:false 非有效 AI 响应', async () => {
    const r = await testConnection({ baseUrl, model: 'html', apiKey: 'sk-test' })
    expect(r.ok).toBe(false)
    expect(r.message).toContain('未返回有效的 AI 响应')
  })

  it('200 + error 形态 → ok:false 非有效 AI 响应', async () => {
    const r = await testConnection({ baseUrl, model: 'error', apiKey: 'sk-test' })
    expect(r.ok).toBe(false)
    expect(r.message).toContain('未返回有效的 AI 响应')
  })

  it('200 + 非 JSON → ok:false 非有效 AI 响应', async () => {
    const r = await testConnection({ baseUrl, model: 'badjson', apiKey: 'sk-test' })
    expect(r.ok).toBe(false)
    expect(r.message).toContain('未返回有效的 AI 响应')
  })

  it('有效 OpenAI Chat Completion → ok:true + latencyMs', async () => {
    const r = await testConnection({ baseUrl, model: 'valid', apiKey: 'sk-test' })
    expect(r.ok).toBe(true)
    expect(typeof r.latencyMs).toBe('number')
  })

  it('401 → ok:false 保留既有 401 分支', async () => {
    const r = await testConnection({ baseUrl, model: 'unauth', apiKey: 'sk-bad' })
    expect(r.ok).toBe(false)
    expect(r.message).toContain('401')
  })
})

// ---- Phase 5: searchNews（mock settingsRepo/newsRepo/fetch） ----

function resLike(status: number, json: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => json,
  } as Response
}

describe('searchNews 配置与空数据分支', () => {
  beforeEach(() => {
    vi.mocked(settingsRepo.get).mockReset()
    vi.mocked(newsRepo.list).mockReset()
    vi.stubGlobal('fetch', vi.fn())
  })

  it('未配置 AI（base/model/apiKey 缺失）→ ChatError LLM_NOT_CONFIGURED，不调 fetch', async () => {
    vi.mocked(settingsRepo.get).mockReturnValue(setting(undefined))
    await expect(searchNews('问题')).rejects.toMatchObject({ code: 'LLM_NOT_CONFIGURED' })
    expect(vi.mocked(fetch)).not.toHaveBeenCalled()
  })

  it('无热点数据 → 占位 answer + refs 空数组，不调 fetch', async () => {
    vi.mocked(settingsRepo.get).mockImplementation(k => setting(k === 'llmApiKey' ? 'sk-x' : 'http://x' === 'llmBaseUrl' ? 'http://x' : 'm'))
    vi.mocked(newsRepo.list).mockReturnValue([])
    const r = await searchNews('问题')
    expect(r.answer).toContain('暂无热点数据')
    expect(r.refs).toEqual([])
    expect(vi.mocked(fetch)).not.toHaveBeenCalled()
  })
})

describe('searchNews 错误分支映射', () => {
  beforeEach(() => {
    vi.mocked(settingsRepo.get).mockReset()
    vi.mocked(newsRepo.list).mockReset()
    vi.mocked(settingsRepo.get).mockImplementation(k =>
      k === 'llmBaseUrl' ? setting('http://llm.test') : k === 'llmModel' ? setting('m') : setting('sk-x'),
    )
    vi.mocked(newsRepo.list).mockReturnValue([makeNews()])
  })

  it('401/403 → ChatError LLM_AUTH', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(resLike(401, {})))
    await expect(searchNews('问题')).rejects.toMatchObject({ code: 'LLM_AUTH' })
  })

  it('429 → ChatError LLM_RATE_LIMIT', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(resLike(429, {})))
    await expect(searchNews('问题')).rejects.toMatchObject({ code: 'LLM_RATE_LIMIT' })
  })

  it('5xx → ChatError LLM_UNAVAILABLE', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(resLike(500, {})))
    await expect(searchNews('问题')).rejects.toMatchObject({ code: 'LLM_UNAVAILABLE' })
  })

  it('网络错误 → ChatError LLM_NETWORK', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')))
    await expect(searchNews('问题')).rejects.toMatchObject({ code: 'LLM_NETWORK' })
  })

  it('超时（AbortError）→ ChatError LLM_TIMEOUT', async () => {
    const abortErr = new Error('aborted')
    abortErr.name = 'AbortError' // 真实 AbortController abort 的 DOMException name
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(abortErr))
    await expect(searchNews('问题')).rejects.toMatchObject({ code: 'LLM_TIMEOUT' })
  })
})

describe('searchNews 成功路径', () => {
  beforeEach(() => {
    vi.mocked(settingsRepo.get).mockReset()
    vi.mocked(newsRepo.list).mockReset()
    vi.mocked(settingsRepo.get).mockImplementation(k =>
      k === 'llmBaseUrl' ? setting('http://llm.test') : k === 'llmModel' ? setting('m') : setting('sk-x'),
    )
    vi.mocked(newsRepo.list).mockReturnValue([makeNews({ id: 'n1' }), makeNews({ id: 'n2', title: '热点二' })])
  })

  it('有效 JSON 响应 → answer + refs 按 index 映射、reason 保留', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      resLike(200, { choices: [{ message: { content: '{"answer":"要点总结","refs":[{"index":2,"reason":"相关"}]}' } }] }),
    )
    vi.stubGlobal('fetch', fetchMock)
    const r = await searchNews('问题')
    expect(r.answer).toBe('要点总结')
    expect(r.refs).toHaveLength(1)
    expect(r.refs[0].item.id).toBe('n2')
    expect(r.refs[0].reason).toBe('相关')
    expect(r.latencyMs).toBeGreaterThanOrEqual(0)
    // 请求体必须携带已配置 model 与消息
    const [, init] = fetchMock.mock.calls[0]
    expect(init.headers.Authorization).toBe('Bearer sk-x')
    expect(JSON.parse(init.body).model).toBe('m')
  })

  it('markdown 代码块包裹的 JSON 也能解析', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      resLike(200, { choices: [{ message: { content: '```json\n{"answer":"带围栏","refs":[]}\n```' } }] }),
    ))
    const r = await searchNews('问题')
    expect(r.answer).toBe('带围栏')
  })

  it('越界 index / 重复 index 被过滤；LLM_REFS_MAX 上限生效', async () => {
    vi.mocked(newsRepo.list).mockReturnValue([
      makeNews({ id: 'n1' }), makeNews({ id: 'n2' }), makeNews({ id: 'n3' }),
      makeNews({ id: 'n4' }), makeNews({ id: 'n5' }), makeNews({ id: 'n6' }),
    ])
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      resLike(200, { choices: [{ message: { content: JSON.stringify({
        answer: 'a',
        refs: [
          { index: 99, reason: '越界' },
          { index: 1, reason: 'x' },
          { index: 1, reason: '重复' },
          { index: 2, reason: 'y' },
          { index: 3, reason: 'z' },
          { index: 4, reason: 'w' },
          { index: 5, reason: 'v' },
          { index: 6, reason: 'u' },
        ],
      }) } }] }),
    ))
    const r = await searchNews('问题')
    expect(r.refs).toHaveLength(5)
    expect(r.refs.map(x => x.item.id)).toEqual(['n1', 'n2', 'n3', 'n4', 'n5'])
  })

  it('非 JSON 响应 → 原始内容截断作为 answer，refs 空', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      resLike(200, { choices: [{ message: { content: '纯文本回复内容' } }] }),
    ))
    const r = await searchNews('问题')
    expect(r.answer).toBe('纯文本回复内容')
    expect(r.refs).toEqual([])
  })
})
