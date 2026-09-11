/**
 * Sidebar footer action: in a packaged desktop app, shows a branded update
 * button when the shell's GitHub Releases check finds a newer version, and
 * drives the download-and-relaunch flow. In a plain browser, or when the
 * shell reports no update, the action renders nothing.
 */
import { useEffect, useState } from 'react'
import { Button } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { NS } from './locales.ts'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import css from './UpdateAction.module.css'

/** Release-update phases published by the desktop shell bridge. */
export interface DesktopUpdateState {
  readonly phase: 'idle' | 'checking' | 'available' | 'installing' | 'ready' | 'error'
  readonly version?: string
  readonly message?: string
}

/** The desktop preload update bridge; absent in a plain browser. */
export interface DesktopUpdatesBridge {
  /** Current published state, without re-checking the feed. */
  status(): Promise<DesktopUpdateState>
  /** Check the release feed now. */
  check(): Promise<DesktopUpdateState>
  /** Download, install, and relaunch. */
  install(): Promise<void>
  /** Subscribe to published state changes. */
  subscribe(listener: (state: DesktopUpdateState) => void): () => void
}

/**
 * Resolve the desktop update bridge.
 * @returns the bridge exposed by the desktop preload, or undefined elsewhere.
 */
export function desktopUpdatesBridge(): DesktopUpdatesBridge | undefined {
  return (globalThis as { dshDesktop?: { updates?: DesktopUpdatesBridge } }).dshDesktop?.updates
}

/** Composed props for the sidebar update action. */
export type UpdateActionProps = PropsRuntime<'sidebar.footer.action'> & PropsLocale<typeof NS>

/**
 * Render the update prompt.
 * @param props - sidebar column state and the locale seat.
 * @returns the branded update button, or nothing without an available update.
 */
export function UpdateAction({ wide, t }: UpdateActionProps) {
  const [state, setState] = useState<DesktopUpdateState | undefined>(undefined)
  const bridge = desktopUpdatesBridge()
  useEffect(() => {
    if (bridge === undefined) return
    let active = true
    void bridge.status().then(
      (next) => { if (active) setState(next) },
      () => {},
    )
    const dispose = bridge.subscribe((next) => { setState(next) })
    void bridge.check().catch(() => {})
    return () => { active = false; dispose() }
  }, [bridge])

  if (bridge === undefined || state === undefined || !wide) return null
  if (state.phase === 'available' || state.phase === 'installing' || state.phase === 'ready') {
    const busy = state.phase !== 'available'
    const label = state.phase === 'installing'
      ? t('action.updating')
      : state.phase === 'ready'
        ? t('action.ready')
        : t('action.available', { version: state.version ?? '' })
    return (
      <div className={css.row}>
        <Button
          variant="primary"
          size="sm"
          className={css.button}
          disabled={busy}
          onClick={() => { void bridge.install().catch(() => {}) }}
        >
          {label}
        </Button>
      </div>
    )
  }
  if (state.phase === 'error' && state.version !== undefined) {
    return <div className={css.row}><span className={css.error}>{t('action.error')}</span></div>
  }
  return null
}
