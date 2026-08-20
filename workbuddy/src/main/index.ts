import { app, BrowserWindow, Menu, session } from 'electron'
import { initDb, closeDb, getDbMode } from './db/connection'
import { runMigrations } from './db/migrate'
import { settingsRepo } from './db/repositories/settingsRepo'
import { createWindow, getMainWindow } from './window'
import { registerAllIpc } from './ipc'
import { maybeRunMorningRoutine } from './services/morning'
import { ensurePeriodicReminders } from './services/reminders'
import { logger } from './lib/logger'
import { mkdirSync } from 'node:fs'

// 实测隔离：设了 WORKBUDDY_USER_DATA 环境变量则重定向 userData（隔离 db/配置/缓存）。
// 不设（真实运行/生产打包）→ 用默认 %APPDATA%/workbuddy，零影响。
if (process.env.WORKBUDDY_USER_DATA) {
  mkdirSync(process.env.WORKBUDDY_USER_DATA, { recursive: true })
  app.setPath('userData', process.env.WORKBUDDY_USER_DATA)
  logger.info(`[TEST] userData redirected → ${process.env.WORKBUDDY_USER_DATA}`)
}

// Single-instance lock — prevents SQLite double-open write conflicts
const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    const wins = BrowserWindow.getAllWindows()
    if (wins.length) {
      if (wins[0].isMinimized()) wins[0].restore()
      wins[0].focus()
    }
  })

  app.whenReady().then(async () => {
    logger.info('WorkBuddy starting...')

    // Production hardening (app.isPackaged only)
    if (app.isPackaged) {
      Menu.setApplicationMenu(null)
      session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
        callback({
          responseHeaders: {
            ...details.responseHeaders,
            'Content-Security-Policy': [
              "default-src 'self'",
              "script-src 'self'",
              "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
              "font-src 'self' https://fonts.gstatic.com data:",
              "img-src 'self' data: https:",
              "connect-src 'self'",
              "object-src 'none'",
              "base-uri 'self'",
            ].join('; '),
          },
        })
      })
    }

    try {
      // DB（阶段6修复批次 · F5：损坏/只读时 initDb 不再 throw——
      // readonly 跳过全部写入任务、unavailable 进入保护模式；两者均继续注册 IPC）
      initDb()
      if (getDbMode() === 'normal') {
        try {
          runMigrations()
        } catch (e) {
          logger.error('Migration failed, entering safe mode:', e)
        }
        settingsRepo.seedDefaults()

        // 子阶段5：周期性提醒（周日→做周统筹；月末→做月指导）。幂等；失败不阻断启动
        try {
          ensurePeriodicReminders(new Date().toISOString().slice(0, 10))
        } catch (e) {
          logger.warn('ensurePeriodicReminders failed:', e)
        }
      } else {
        logger.warn('DB not in normal mode: skipping migrations/seed/reminders')
      }

      // IPC（registerAllIpc 内部按模式守卫：readonly → 写通道 READ_ONLY；unavailable → 全通道 DB_UNAVAILABLE）
      registerAllIpc()
    } catch (e) {
      logger.error('Startup sequence failed:', e)
    }

    // Window — always attempt, even if startup partially failed
    try {
      createWindow()
    } catch (e) {
      logger.error('Failed to create window:', e)
    }

    // Morning routine (async, non-blocking)
    maybeRunMorningRoutine().catch(e => logger.error('Morning routine error:', e))

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })

    logger.info('WorkBuddy ready')
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })

  app.on('before-quit', () => {
    closeDb()
  })
}
