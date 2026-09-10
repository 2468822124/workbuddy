import { describe, expect, it, vi } from 'vitest'
import { IPC } from '@shared/ipc'
import type { ApiType } from '../src/preload/index'

const { state } = vi.hoisted(() => ({
  state: {
    api: undefined as unknown,
    invoke: vi.fn(),
  },
}))

vi.mock('electron', () => ({
  contextBridge: {
    exposeInMainWorld: (_name: string, api: unknown) => {
      state.api = api
    },
  },
  ipcRenderer: {
    invoke: state.invoke,
    on: vi.fn(),
    removeListener: vi.fn(),
  },
}))

import '../src/preload/index'

describe('preload fixed definition API', () => {
  it('passes the viewed week as the effective week to IPC', async () => {
    const api = state.api as ApiType

    await api.flow.fixedDefs.delete(17, '2026-09-10')

    expect(state.invoke).toHaveBeenCalledWith(IPC.FLOW_FIXED_DEFS_DELETE, {
      id: 17,
      weekStart: '2026-09-10',
    })
  })
})
