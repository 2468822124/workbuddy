// ========================================
// 阶段6修复批次2 · F5：DB 三态安全模式单测（connection.ts）
// - normal：可打开可 pragma → 读写模式
// - readonly：正常打开失败但只读打开成功 **且探针查询通过** → 只读保护模式
// - unavailable：只读打不开（CANTOPEN）或只读打开成功但探针查询失败（NOTADB）→ 不可用保护模式
// 注：better-sqlite3 原生绑定 NODE_MODULE_VERSION 与测试 Node 不匹配（ERR_DLOPEN_FAILED），
// 本测试 mock Database 构造器模拟 SQLite 行为，逻辑等价。
// 复审根因：只读构造成功 ≠ 数据库可查询——损坏文件只读打开成功但查询报 NOTADB，
// 修复前误判为 readonly（健康/读路径 DB_ERROR），修复后探针失败转 unavailable（全通道 DB_UNAVAILABLE）。
// ========================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'

// app.getPath 指向可变的临时 userData（vi.hoisted 在 import 前执行，须内联 require）
const mockUserData = vi.hoisted(() => {
  const os = require('node:os')
  const path = require('node:path')
  return path.join(os.tmpdir(), 'workbuddy-dbmode-test')
})

vi.mock('electron', () => ({
  app: { getPath: () => mockUserData },
}))

// 模拟 better-sqlite3：按文件内容模拟 SQLite 打开/查询行为（避免原生绑定版本不匹配）
vi.mock('better-sqlite3', () => {
  const fs = require('node:fs')
  const path = require('node:path')
  return {
    __esModule: true,
    default: class FakeDatabase {
      filePath: string
      readonly: boolean
      constructor(filePath: string, opts?: { readonly?: boolean }) {
        this.filePath = filePath
        this.readonly = !!opts?.readonly
        // dbPath 是目录 → SQLITE_CANTOPEN（正常与只读打开都失败）
        if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
          throw new Error('SQLITE_CANTOPEN: unable to open database file')
        }
        // 正常模式遇 "locked" 内容 → 模拟被锁/权限拒绝（正常打不开，只读可开且可查询）
        if (!this.readonly && fs.existsSync(filePath) && fs.readFileSync(filePath, 'utf-8').startsWith('locked')) {
          throw new Error('SQLITE_BUSY: database is locked')
        }
      }
      pragma(): string {
        // 正常打开模式：损坏文件 → SQLITE_NOTADB（触发 readonly 回退）
        if (!this.readonly && fs.existsSync(this.filePath) && fs.readFileSync(this.filePath, 'utf-8').startsWith('garbage')) {
          throw new Error('SQLITE_NOTADB: file is not a database')
        }
        return 'wal'
      }
      prepare(): { get: () => unknown } {
        // 只读打开损坏文件成功，但探针查询才报 NOTADB（可构造 ≠ 可查询 → unavailable）
        if (this.readonly && fs.existsSync(this.filePath) && fs.readFileSync(this.filePath, 'utf-8').startsWith('garbage')) {
          return { get: () => { throw new Error('SQLITE_NOTADB: file is not a database') } }
        }
        return { get: () => ({ v: 1 }) }
      }
      close(): void {}
    },
  }
})

import { initDb, closeDb, getDbMode, isReadonlyMode } from '../src/main/db/connection'

const DB_PATH = path.join(mockUserData, 'workbuddy.db')

describe('connection.ts DB 三态模式（F5 修复批次2）', () => {
  beforeEach(() => {
    closeDb()
    fs.rmSync(mockUserData, { recursive: true, force: true })
    fs.mkdirSync(mockUserData, { recursive: true })
  })

  afterEach(() => {
    closeDb()
    fs.rmSync(mockUserData, { recursive: true, force: true })
  })

  it('normal：可打开可 pragma → 读写模式，非只读', () => {
    fs.writeFileSync(DB_PATH, 'valid sqlite-ish content')

    initDb()
    expect(getDbMode()).toBe('normal')
    expect(isReadonlyMode()).toBe(false)
  })

  it('readonly：正常打开被锁，只读打开成功且探针通过 → 只读保护模式（跳过迁移/写入）', () => {
    // "locked"：正常打开 SQLITE_BUSY → 只读打开成功 → 探针查询通过 → readonly
    fs.writeFileSync(DB_PATH, 'locked but valid sqlite database')

    initDb()
    expect(getDbMode()).toBe('readonly')
    expect(isReadonlyMode()).toBe(true)
  })

  it('unavailable：损坏文件只读打开成功但探针查询 NOTADB → 不可用（修复前误判 readonly）', () => {
    // 修复批次2 关键用例：可只读构造 ≠ 可查询——探针失败必须转 unavailable，不得停在 readonly
    fs.writeFileSync(DB_PATH, 'garbage not a sqlite database')

    initDb()
    expect(getDbMode()).toBe('unavailable')
    expect(isReadonlyMode()).toBe(false)
  })

  it('unavailable：只读也打不开（dbPath 是目录）→ 不可用保护模式', () => {
    fs.mkdirSync(DB_PATH)

    initDb()
    expect(getDbMode()).toBe('unavailable')
    expect(isReadonlyMode()).toBe(false)
  })
})
