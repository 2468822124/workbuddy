import { ipcMain } from 'electron'
import { IPC, ok, err, Result } from '@shared/ipc'
import { Review } from '@shared/types'
import { reviewRepo } from '../db/repositories/reviewRepo'
import { randomUUID } from 'node:crypto'
import { logger } from '../lib/logger'
import { ChatError, summarizeReview, summarizeWeeklyReview, summarizeMonthlyReview } from '../services/llm'

/**
 * 复盘不解析、不生成 todos、无 sync。CRUD 即终。
 * logger 禁记 review.content 明文——仅记异常/计数。
 */

export function registerReviewsIpc(): void {
  ipcMain.handle(IPC.REVIEW_GET, (_e, arg: { id: string }) => {
    try {
      const review = reviewRepo.findById(arg.id)
      return ok(review ?? null)
    } catch (e: unknown) {
      logger.error('review:get error', e)
      return err('INTERNAL', (e as Error).message)
    }
  })

  ipcMain.handle(IPC.REVIEW_LIST, (_e, arg?: { from?: string; to?: string; type?: string }) => {
    try {
      return ok(reviewRepo.findAll(arg))
    } catch (e: unknown) {
      logger.error('review:list error', e)
      return err('INTERNAL', (e as Error).message)
    }
  })

  ipcMain.handle(IPC.REVIEW_BY_DATE, (_e, arg: { date: string; type?: string }) => {
    try {
      if (!arg?.date) return err('INVALID', 'date is required')
      const review = reviewRepo.findByDate(arg.date, arg.type)
      return ok(review ?? null)
    } catch (e: unknown) {
      logger.error('review:byDate error', e)
      return err('INTERNAL', (e as Error).message)
    }
  })

  ipcMain.handle(IPC.REVIEW_CREATE, (_e, arg: { date: string; type?: string; content: string; linkedProjectIds?: string[]; templateId?: string }) => {
    try {
      if (!arg?.date || typeof arg.content !== 'string') {
        return err('INVALID', 'date and content are required')
      }
      const review = reviewRepo.create({
        id: randomUUID(),
        date: arg.date,
        type: arg.type ?? null,
        content: arg.content,
        linkedProjectIds: arg.linkedProjectIds ?? [],
        templateId: arg.templateId ?? null,
      })
      logger.info(`review:created id=${review.id} date=${arg.date}`)
      return ok(review)
    } catch (e: unknown) {
      logger.error('review:create error', e)
      return err('INTERNAL', (e as Error).message)
    }
  })

  ipcMain.handle(IPC.REVIEW_UPDATE, (_e, arg: { id: string; content: string; date?: string; type?: string }) => {
    try {
      if (!arg?.id || typeof arg.content !== 'string') {
        return err('INVALID', 'id and content are required')
      }
      const existing = reviewRepo.findById(arg.id)
      if (!existing) return err('NOT_FOUND', 'Review not found')
      const review = reviewRepo.update(arg.id, {
        content: arg.content,
        date: arg.date !== undefined ? arg.date : undefined,
        type: arg.type !== undefined ? arg.type : undefined,
      })
      if (!review) return err('NOT_FOUND', 'Review not found after update')
      logger.info(`review:updated id=${review.id}`)
      return ok(review)
    } catch (e: unknown) {
      logger.error('review:update error', e)
      return err('INTERNAL', (e as Error).message)
    }
  })

  ipcMain.handle(IPC.REVIEW_DELETE, (_e, arg: { id: string }) => {
    try {
      const ok_ = reviewRepo.softDelete(arg.id)
      return ok({ ok: ok_ })
    } catch (e: unknown) {
      logger.error('review:delete error', e)
      return err('INTERNAL', (e as Error).message)
    }
  })

  // 子阶段4：LLM 复盘汇总草稿（前台用户主动触发；仅传 date，apiKey 在主进程内取）
  ipcMain.handle(IPC.REVIEW_SUMMARIZE, async (_e, arg: { date: string }) => {
    try {
      if (!arg?.date) return err('INVALID', 'date is required')
      const result = await summarizeReview(arg.date)
      return ok(result)
    } catch (e: unknown) {
      if (e instanceof ChatError) { logger.warn(`review draft failed: ${e.code}`); return err(e.code, e.message) }
      logger.error('review:summarizeDraft error', e)
      return err('INTERNAL', `内部错误：${(e as Error).message}`)
    }
  })

  // 子阶段5：AI 周复盘（date=本周一；主进程聚合本周数据 → Markdown；仅记 latency/长度）
  ipcMain.handle(IPC.REVIEW_SUMMARIZE_WEEKLY, async (_e, arg: { date: string }) => {
    try {
      if (!arg?.date) return err('INVALID', 'date is required')
      const result = await summarizeWeeklyReview(arg.date)
      return ok(result)
    } catch (e: unknown) {
      if (e instanceof ChatError) { logger.warn(`weekly review failed: ${e.code}`); return err(e.code, e.message) }
      logger.error('review:summarizeWeekly error', e)
      return err('INTERNAL', `内部错误：${(e as Error).message}`)
    }
  })

  // 子阶段5：AI 月复盘（date=本月 1 号）
  ipcMain.handle(IPC.REVIEW_SUMMARIZE_MONTHLY, async (_e, arg: { date: string }) => {
    try {
      if (!arg?.date) return err('INVALID', 'date is required')
      const result = await summarizeMonthlyReview(arg.date)
      return ok(result)
    } catch (e: unknown) {
      if (e instanceof ChatError) { logger.warn(`monthly review failed: ${e.code}`); return err(e.code, e.message) }
      logger.error('review:summarizeMonthly error', e)
      return err('INTERNAL', `内部错误：${(e as Error).message}`)
    }
  })
}
