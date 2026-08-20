import { registerSettingsIpc } from './settings.ipc'
import { registerNewsIpc } from './news.ipc'
import { registerProjectsIpc } from './projects.ipc'
import { registerProjectTasksIpc } from './projectTasks.ipc'
import { registerLlmIpc } from './llm.ipc'
import { registerDataIpc } from './data.ipc'
import { registerArchiveIpc } from './archive.ipc'
import { registerFlowIpc } from './flow.ipc'
import { ipcMain } from 'electron'
import { IPC, ok, err } from '@shared/ipc'
import { isReadonlyMode, getDbMode } from '../db/connection'
import { settingsRepo } from '../db/repositories/settingsRepo'
import { getMaxSchemaVersion } from '../db/repositories/migrationRepo'
import { logger } from '../lib/logger'

/**
 * 阶段6修复批次 · F5：写通道白名单（显式枚举）。
 * 只读保护模式下这些通道被 guardChannels 替换为 READ_ONLY 守卫，
 * 不再出现 "No handler registered"（handler 已注册，只是拒绝写入）。
 */
const WRITE_CHANNELS: string[] = [
  IPC.SETTINGS_SET,
  IPC.NEWS_REFRESH,
  IPC.PROJECTS_CREATE,
  IPC.PROJECTS_UPDATE,
  IPC.PROJECTS_DELETE,
  IPC.PROJECT_TASKS_CREATE,
  IPC.PROJECT_TASKS_UPDATE,
  IPC.PROJECT_TASKS_DELETE,
  IPC.PROJECT_TASKS_TOGGLE,
  IPC.ARCHIVE_LEGACY,
  IPC.DATA_IMPORT,
  IPC.FLOW_FIXED_DEFS_SAVE,
  IPC.FLOW_FIXED_DEFS_DELETE,
  IPC.FLOW_INSTANCE_CREATE,
  IPC.FLOW_INSTANCE_RENAME,
  IPC.FLOW_INSTANCE_DELETE,
  IPC.FLOW_INSTANCE_SKIP,
  IPC.FLOW_INSTANCE_CARRY_NEXT,
  IPC.FLOW_INSTANCE_MANUAL_COMPLETE,
  IPC.FLOW_INSTANCE_ADD_SESSION,
  IPC.FLOW_VOUCHER_DELETE,
  IPC.FLOW_VOUCHER_UPDATE,
  IPC.FLOW_ENTRY_ADD,
  IPC.FLOW_ENTRY_TOGGLE_CHECK,
  IPC.FLOW_ENTRY_REMOVE,
  IPC.FLOW_ENTRY_MOVE,
  IPC.FLOW_ENTRY_SKIP,
  IPC.FLOW_ENTRY_UPDATE,
  IPC.FLOW_MONTH_GOALS_SAVE,
  IPC.FLOW_MONTH_GOALS_DELETE,
  IPC.FLOW_WEEK_FOCUS_SAVE,
  IPC.FLOW_WEEK_FOCUS_DELETE,
  IPC.FLOW_TEMPLATES_SAVE,
  IPC.FLOW_TEMPLATES_DELETE,
  IPC.FLOW_JOURNAL_SAVE,
]

/**
 * 阶段6修复批次 · F5：按 DB 模式守卫已注册的 IPC handler。
 * - writeOnly=true（readonly 模式）：写通道 removeHandler 后统一返回 READ_ONLY，
 *   读通道保留原 handler（可读降级）；
 * - writeOnly=false（unavailable 模式）：全部通道统一返回 DB_UNAVAILABLE。
 * 导出供单测（ipcGuard.spec.ts）直接调用。
 */
export function guardChannels(writeOnly: boolean): void {
  const channels = writeOnly ? WRITE_CHANNELS : Object.values(IPC)
  const code = writeOnly ? 'READ_ONLY' : 'DB_UNAVAILABLE'
  const message = writeOnly
    ? '数据库只读保护模式，写入已禁用'
    : '数据库不可用，功能已保护性禁用'
  for (const channel of channels) {
    ipcMain.removeHandler(channel)
    ipcMain.handle(channel, () => err(code, message))
  }
  logger.warn(
    writeOnly
      ? `DB read-only: ${channels.length} write channels guarded as ${code}`
      : `DB unavailable: all ${channels.length} channels guarded as ${code}`,
  )
}

export function registerAllIpc(): void {
  registerSettingsIpc()
  registerNewsIpc()
  registerProjectsIpc()
  registerProjectTasksIpc()
  registerLlmIpc()
  registerDataIpc()
  registerArchiveIpc()
  registerFlowIpc()

  ipcMain.handle(IPC.DB_HEALTH, () => {
    try {
      // 阶段6修复批次2 · T1：SQL 下沉 migrationRepo，IPC 层不再直接触碰 DB API
      return ok({ ok: true, schemaVersion: getMaxSchemaVersion(), readonly: isReadonlyMode() })
    } catch (e: unknown) {
      logger.error('db:health error', e)
      return err('DB_ERROR', (e as Error).message)
    }
  })

  ipcMain.handle(IPC.APP_FIRST_LAUNCH, () => {
    try {
      // onboarded 不在 seedDefaults 中，首次启动不存在或值不为 'true'
      const s = settingsRepo.get('onboarded')
      return ok(!s || s.value !== 'true')
    } catch (e: unknown) {
      logger.error('app:isFirstLaunch error', e)
      return err('INTERNAL', (e as Error).message)
    }
  })

  // F5 守卫必须在全部 handler 注册完成后执行（覆盖 DB_HEALTH/APP_FIRST_LAUNCH）
  const mode = getDbMode()
  if (mode === 'readonly') guardChannels(true)
  else if (mode === 'unavailable') guardChannels(false)
}
