// @vitest-environment jsdom
/** Sidebar update action: bridge-driven visibility, install click, phase copy. */

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  UpdateAction, type DesktopUpdateState, type DesktopUpdatesBridge, type UpdateActionProps,
} from '../src/client/UpdateAction.tsx'
import { zh } from '../src/client/locales.ts'

afterEach(() => {
  cleanup()
  delete (globalThis as { dshDesktop?: unknown }).dshDesktop
})

function translate(key: keyof typeof zh, params?: Record<string, string>): string {
  return zh[key].replace(/\{(\w+)\}/gu, (_match, name: string) => params?.[name] ?? '')
}

function props(): UpdateActionProps {
  return { wide: true, t: translate } as unknown as UpdateActionProps
}

interface BridgeBench {
  readonly bridge: DesktopUpdatesBridge
  readonly install: ReturnType<typeof vi.fn>
  readonly listeners: Set<(state: DesktopUpdateState) => void>
}

function bridgeBench(state: DesktopUpdateState): BridgeBench {
  const listeners = new Set<(next: DesktopUpdateState) => void>()
  const install = vi.fn(async () => {})
  const bridge: DesktopUpdatesBridge = {
    status: async () => state,
    check: async () => state,
    install,
    subscribe(listener) {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
  }
  return { bridge, install, listeners }
}

function mount(state: DesktopUpdateState): BridgeBench {
  const bench = bridgeBench(state)
  ;(globalThis as { dshDesktop?: unknown }).dshDesktop = { updates: bench.bridge }
  render(<UpdateAction {...props()} />)
  return bench
}

describe('UpdateAction', () => {
  it('renders nothing without the desktop bridge', () => {
    const { container } = render(<UpdateAction {...props()} />)
    expect(container.innerHTML).toBe('')
  })

  it('renders nothing while no update is available', async () => {
    mount({ phase: 'idle' })
    await waitFor(() => { expect((globalThis as { dshDesktop?: unknown }).dshDesktop).toBeDefined() })
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('shows the versioned update button and installs on click', async () => {
    const bench = mount({ phase: 'available', version: '0.1.5-halyard.2' })
    const button = await screen.findByRole('button', { name: '更新到 0.1.5-halyard.2' })
    fireEvent.click(button)
    await waitFor(() => { expect(bench.install).toHaveBeenCalledOnce() })
  })

  it('labels an in-flight install and disables the button', async () => {
    const bench = mount({ phase: 'available', version: '0.1.5-halyard.2' })
    await screen.findByRole('button')
    bench.listeners.forEach((listener) => { listener({ phase: 'installing', version: '0.1.5-halyard.2' }) })
    const button = await screen.findByRole('button', { name: '正在更新…' })
    expect((button as HTMLButtonElement).disabled).toBe(true)
  })

  it('surfaces a failed install', async () => {
    mount({ phase: 'error', version: '0.1.5-halyard.2', message: 'denied' })
    expect(await screen.findByText('更新失败，请手动下载')).toBeTruthy()
  })
})
