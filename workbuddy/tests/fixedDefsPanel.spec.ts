// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, nextTick, type App, type Component } from 'vue'
import FixedDefsPanel from '../src/renderer/src/components/flow/FixedDefsPanel.vue'
import type { FlowFixedDef } from '../src/shared/flowTypes'

const DEF: FlowFixedDef = {
  id: 7,
  title: 'F1',
  kind: 'once',
  targetCount: 1,
  weekdayMask: 0,
  recurrence: 'WEEKLY',
  note: null,
  isDeleted: false,
  deletedAt: null,
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-01T00:00:00.000Z',
}

function mountPanel(onDelete: (id: number) => void): { host: HTMLDivElement; app: App } {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const app = createApp(FixedDefsPanel as Component, {
    fixedDefs: [DEF],
    effectiveWeekStart: '2026-09-07',
    onDelete,
  })
  app.mount(host)
  return { host, app }
}

function click(host: HTMLElement, selector: string): void {
  const element = host.querySelector(selector)
  if (!element) throw new Error(`click: ${selector} not found`)
  ;(element as HTMLButtonElement).click()
}

function clickButtonWithText(host: HTMLElement, text: string): void {
  const element = [...host.querySelectorAll('button')].find(button => button.textContent?.trim() === text)
  if (!element) throw new Error(`button with text ${text} not found`)
  element.click()
}

beforeEach(() => {
  document.body.innerHTML = ''
})

describe('FixedDefsPanel retirement confirmation', () => {
  it('shows the effective-week retention rule; cancel emits nothing and confirm emits once', async () => {
    const onDelete = vi.fn()
    const { host } = mountPanel(onDelete)
    await nextTick()

    clickButtonWithText(host, '停用')
    await nextTick()
    expect(host.textContent).toContain('2026-09-07')
    expect(host.textContent).toContain('生效周和已进入日任务的存量保留')
    expect(host.textContent).toContain('未进入的未来实例隐藏')

    clickButtonWithText(host, '取消')
    await nextTick()
    expect(onDelete).not.toHaveBeenCalled()

    clickButtonWithText(host, '停用')
    await nextTick()
    clickButtonWithText(host, '确认停用')
    expect(onDelete).toHaveBeenCalledTimes(1)
    expect(onDelete).toHaveBeenCalledWith(7)
  })
})
