import { ipcMain } from 'electron'
import { IPC, ok, err } from '@shared/ipc'
import { testConnection, searchNews, ChatError } from '../services/llm'
import { LLM_QUERY_MAX_CHARS } from '@shared/constants'
import { logger } from '../lib/logger'

export function registerLlmIpc(): void {
  ipcMain.handle(IPC.LLM_TEST, async (_e, cfg: { baseUrl: string; model: string; apiKey: string }) => {
    try {
      if (!cfg.baseUrl || !cfg.model || !cfg.apiKey) {
        return err('INVALID', '请填写 Base URL、Model 和 API Key')
      }
      const result = await testConnection(cfg)
      return ok(result)
    } catch (e: unknown) {
      logger.error('llm:test error', e)
      return ok({ ok: false, message: `内部错误：${(e as Error).message}` })
    }
  })

  ipcMain.handle(IPC.LLM_SEARCH, async (_e, query: string) => {
    try {
      if (!query || !query.trim()) {
        return err('INVALID', '请输入问题')
      }
      if (query.length > LLM_QUERY_MAX_CHARS) {
        return err('INVALID', `问题过长（超过 ${LLM_QUERY_MAX_CHARS} 字）`)
      }
      const result = await searchNews(query.trim())
      return ok(result)
    } catch (e: unknown) {
      if (e instanceof ChatError) {
        logger.warn(`chat search failed: ${e.code}`)
        return err(e.code, e.message)
      }
      logger.error('llm:search error', e)
      return err('INTERNAL', `内部错误：${(e as Error).message}`)
    }
  })
}
