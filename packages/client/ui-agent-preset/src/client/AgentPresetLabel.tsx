/**
 * The session header's agent-preset control.
 *
 * The label names the preset this session runs; clicking it opens a small
 * panel that can switch the preset while the session is still blank, start a
 * new conversation with another preset once it has started, and toggle the
 * deployment setting that exposes preset picking at all.
 */

import { useEffect, useState } from 'react'
import type { SnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { IconAgentPresetOutline16, Modal, Switch } from '@deepseek-ai/dsh-client-ui-primitives'
// Type-only: pulls the ui-conversation SlotMap merge (the header actions).
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { AgentPresetSettingsState } from './settings-store.ts'
import type { AgentPresetSectionState } from './section-store.ts'
import { presetDisplayText } from './locales.ts'
import css from './AgentPresetLabel.module.css'

/** Registration-side business face for the header control. */
export interface AgentPresetLabelInjected {
  hooks: {
    /** Roster snapshot bound by the renderer as useAgentPresets. */
    agentPresets: SnapshotStore<AgentPresetSettingsState>
    /** Deployment picker setting bound by the renderer as useAgentPresetSection. */
    agentPresetSection: SnapshotStore<AgentPresetSectionState>
  }
  /** Read the roster, so the label can show a name rather than an id. */
  load: () => Promise<void>
  /** Switch the preset of a blank session; resolves to a refusal message, or undefined. */
  switchPreset: (sessionId: SessionId, id: string) => Promise<string | undefined>
  /** Open a new conversation carrying the chosen preset. */
  startWithPreset: (id: string, cwd: string | undefined) => Promise<string | undefined>
  /** Fork the started session onto the chosen preset, carrying its history. */
  forkWithPreset: (sessionId: SessionId, id: string) => Promise<string | undefined>
  /** Persist whether new-session surfaces expose preset selection. */
  setPickerVisible: (enabled: boolean) => Promise<string | undefined>
}

/** Full component props. */
export type AgentPresetLabelProps =
  PropsRuntime<'conversation.session.header.actions'>
  & PropsLocale<'settings.agentPreset'>
  & InjectFace<AgentPresetLabelInjected>

/**
 * Render this session's agent-preset name beside its title, with a picker.
 * @param props - composed slot props.
 * @returns the control, or null when the session records no preset.
 */
export function AgentPresetLabel({
  sessionId, useSessions, useAgentPresets, useAgentPresetSection, load,
  switchPreset, startWithPreset, forkWithPreset, setPickerVisible, t,
}: AgentPresetLabelProps) {
  const preset = useSessions((state) => {
    const value = state.byId[sessionId]?.projectionValues?.agentPreset
    return typeof value === 'string' ? value : undefined
  })
  const blank = useSessions(state => state.byId[sessionId]?.blank === true)
  const cwd = useSessions(state => state.byId[sessionId]?.cwd)
  const options = useAgentPresets(state => state.options)
  const showPicker = useAgentPresetSection(state => state.showPicker)
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [refused, setRefused] = useState<string | null>(null)

  useEffect(() => {
    // Deployments that compose no presets never label anything, so the roster
    // is only worth a request once a session reports one.
    if (preset !== undefined) void load()
  }, [preset, load])

  if (preset === undefined) return null

  const option = options.find(entry => entry.id === preset)
  const text = option === undefined ? undefined : presetDisplayText(option, t)

  const choose = (id: string): void => {
    setBusy(true)
    setNotice(null)
    void switchPreset(sessionId, id).then((failure) => {
      setBusy(false)
      if (failure === undefined) {
        setOpen(false)
        setRefused(null)
        return
      }
      setNotice(null)
      setRefused(id)
    }, () => {
      setBusy(false)
      setRefused(id)
    })
  }

  const startNew = (id: string): void => {
    setBusy(true)
    void startWithPreset(id, cwd).then((failure) => {
      setBusy(false)
      if (failure === undefined) {
        setOpen(false)
        setRefused(null)
        return
      }
      setNotice(failure)
    }, (error: unknown) => {
      setBusy(false)
      setNotice(error instanceof Error ? error.message : String(error))
    })
  }

  const forkTo = (id: string): void => {
    setBusy(true)
    void forkWithPreset(sessionId, id).then((failure) => {
      setBusy(false)
      if (failure === undefined) {
        setOpen(false)
        setRefused(null)
        return
      }
      setNotice(failure)
    }, (error: unknown) => {
      setBusy(false)
      setNotice(error instanceof Error ? error.message : String(error))
    })
  }

  const togglePicker = (enabled: boolean): void => {
    setBusy(true)
    void setPickerVisible(enabled).then((failure) => {
      setBusy(false)
      setNotice(failure ?? null)
    }, (error: unknown) => {
      setBusy(false)
      setNotice(error instanceof Error ? error.message : String(error))
    })
  }

  return (
    <>
      <button
        type="button"
        className={css.label}
        title={text?.description ?? t('headerHint')}
        aria-haspopup="dialog"
        data-testid="agent-preset-label"
        onClick={() => {
          setNotice(null)
          setRefused(null)
          setOpen(true)
        }}
      >
        <IconAgentPresetOutline16 size={14} className={css.icon} />
        {text?.name ?? preset}
      </button>
      <Modal
        open={open}
        onClose={() => { setOpen(false) }}
        title={t('headerTitle')}
        closeLabel={t('close')}
      >
        <div className={css.panel}>
          <div className={css.current}>
            <span className={css.currentLabel}>{t('headerCurrent')}</span>
            <span className={css.currentValue}>{text?.name ?? preset}</span>
          </div>

          <div className={css.switchRow}>
            <span className={css.switchLabel}>{t('showPicker')}</span>
            <Switch
              checked={showPicker}
              disabled={busy}
              onChange={togglePicker}
              label={t('showPicker')}
            />
          </div>

          {showPicker && (
            <ul className={css.list}>
              {options.map(entry => (
                <li key={entry.id}>
                  <button
                    type="button"
                    className={entry.id === preset ? `${css.option} ${css.optionActive}` : css.option}
                    disabled={busy || entry.id === preset}
                    onClick={() => { choose(entry.id) }}
                  >
                    {presetDisplayText(entry, t).name}
                  </button>
                </li>
              ))}
            </ul>
          )}

          {!showPicker && <p className={css.hint}>{t('showPickerDescription')}</p>}

          {(refused !== null || notice !== null) && (
            <div className={css.notice}>
              <span>{notice ?? t('headerLocked')}</span>
              {refused !== null && !blank && (
                <>
                  <button
                    type="button"
                    className={css.newWith}
                    disabled={busy}
                    onClick={() => { forkTo(refused) }}
                  >
                    {t('headerForkWith')}
                  </button>
                  <button
                    type="button"
                    className={`${css.newWith} ${css.newWithSecondary}`}
                    disabled={busy}
                    onClick={() => { startNew(refused) }}
                  >
                    {t('headerNewWith')}
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      </Modal>
    </>
  )
}
