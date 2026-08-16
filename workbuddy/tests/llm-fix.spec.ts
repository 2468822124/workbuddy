import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest'
import http from 'node:http'
import type { AddressInfo } from 'node:net'

// llm.ts 的 DB 依赖模块——用 mock 替换，避免 electron app 依赖
vi.mock('../src/main/db/repositories/todoRepo', () => ({
  todoRepo: {
    findCompletedOn: vi.fn(),
    findOverdue: vi.fn(),
    findOpenToday: vi.fn(),
  },
}))
vi.mock('../src/main/db/repositories/projectRepo', () => ({
  projectRepo: { findActive: vi.fn() },
}))
vi.mock('../src/main/db/repositories/settingsRepo', () => ({
  settingsRepo: { get: vi.fn() },
}))

import { todoRepo } from '../src/main/db/repositories/todoRepo'
import { projectRepo } from '../src/main/db/repositories/projectRepo'
import { settingsRepo } from '../src/main/db/repositories/settingsRepo'
import { testConnection, summarizeReview, ChatError } from '../src/main/services/llm'

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

// ---- U6: summarizeReview 短路（有进行中项目 + 当日无完成 → 不调 LLM） ----

describe('U6 summarizeReview 短路', () => {
  beforeEach(() => {
    vi.mocked(todoRepo.findCompletedOn).mockReset()
    vi.mocked(projectRepo.findActive).mockReset()
    vi.mocked(settingsRepo.get).mockReset()
    vi.stubGlobal('fetch', vi.fn())
  })

  it('有进行中项目 + 当日无完成任务 → 立即占位草稿、不调 fetch', async () => {
    vi.mocked(todoRepo.findCompletedOn).mockReturnValue([])
    vi.mocked(projectRepo.findActive).mockReturnValue([
      { id: 'p1', name: '进行中项目', status: 'active', openTasks: 3 } as never,
    ])

    const r = await summarizeReview('2020-01-01')

    expect(r.latencyMs).toBe(0)
    expect(r.draft).toContain('当日暂无完成任务记录')
    expect(globalThis.fetch).not.toHaveBeenCalled()
  })

  it('当日有完成任务 → 走 LLM 路径（fetch 被调）', async () => {
    vi.mocked(todoRepo.findCompletedOn).mockReturnValue([
      { id: 't1', content: '完成任务A', completedAt: '2026-08-07T10:00:00.000Z' } as never,
    ])
    vi.mocked(projectRepo.findActive).mockReturnValue([])
    vi.mocked(settingsRepo.get).mockReturnValue({ value: 'http://127.0.0.1:1' })
    const fetchMock = vi.fn().mockRejectedValue(new Error('connection refused'))
    vi.stubGlobal('fetch', fetchMock)

    await expect(summarizeReview('2026-08-07')).rejects.toBeInstanceOf(ChatError)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
