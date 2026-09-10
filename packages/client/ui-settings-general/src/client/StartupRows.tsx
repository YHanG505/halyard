/**
 * General Settings rows for startup behavior: whether app open creates a new
 * conversation (or restores the last one) and which Workspace new
 * conversations use (or none at all).
 */

import { useState } from 'react'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { Switch } from '@deepseek-ai/dsh-client-ui-primitives'
// Type-only: pulls the ui-workspace GlobalStandardProps merge (useWorkspaces).
import type {} from '@deepseek-ai/dsh-client-ui-workspace/client'
import type { SettingsKey } from './locales.ts'
import type { StartupSettings } from './startup-settings.ts'
import css from './StartupRows.module.css'

/** Registration-side read/write face for the startup policy. */
export interface StartupRowsInjected {
  /** Read the stored policy. */
  read: () => StartupSettings
  /** Persist one policy change. */
  write: (patch: Partial<StartupSettings>) => StartupSettings
}

/** Composed Settings-row props. */
export type StartupRowsProps =
  PropsRuntime<'settings.general.item'>
  & PropsLocale<'settings'>
  & InjectFace<StartupRowsInjected>

/**
 * Toggle: create a new conversation on app open instead of restoring the last.
 * @param props - composed Settings slot props.
 * @returns the preference row.
 */
export function NewSessionOnOpenRow({ read, write, t }: StartupRowsProps) {
  const [settings, setSettings] = useState<StartupSettings>(read)
  const toggle = (): void => {
    setSettings(write({ newSessionOnOpen: !settings.newSessionOnOpen }))
  }
  return (
    <div className={css.row}>
      <div className={css.rowText}>
        <div className={css.title}>{t('startup.newSession.title')}</div>
        <div className={css.desc}>{t('startup.newSession.desc')}</div>
      </div>
      <Switch
        checked={settings.newSessionOnOpen}
        onChange={() => { toggle() }}
        label={t('startup.newSession.title')}
      />
    </div>
  )
}

/**
 * Toggle plus Workspace picker: new conversations use the chosen default
 * project, or stay project-free when the toggle is off.
 * @param props - composed Settings slot props.
 * @returns the preference row.
 */
export function DefaultProjectRow({ read, write, useWorkspaces, t }: StartupRowsProps) {
  const [settings, setSettings] = useState<StartupSettings>(read)
  const workspaces = useWorkspaces(state => state.items)
  const options: readonly { id: string; label: string }[] = workspaces.map(workspace => ({
    id: workspace.workspaceId,
    label: workspace.title.length > 0 ? workspace.title : workspace.path,
  }))
  return (
    <div className={css.row}>
      <div className={css.rowText}>
        <div className={css.title}>{t('startup.defaultProject.title')}</div>
        <div className={css.desc}>{t('startup.defaultProject.desc')}</div>
        {settings.useDefaultWorkspace && (
          <select
            className={css.select}
            value={settings.defaultWorkspaceId}
            onChange={(event) => { setSettings(write({ defaultWorkspaceId: event.target.value })) }}
            aria-label={t('startup.defaultProject.choose')}
            data-testid="startup-default-project-select"
          >
            <option value="">{options.length === 0 ? t('startup.defaultProject.none') : t('startup.defaultProject.choose')}</option>
            {options.map(option => (
              <option key={option.id} value={option.id}>{option.label}</option>
            ))}
          </select>
        )}
      </div>
      <Switch
        checked={settings.useDefaultWorkspace}
        onChange={() => { setSettings(write({ useDefaultWorkspace: !settings.useDefaultWorkspace })) }}
        label={t('startup.defaultProject.title')}
      />
    </div>
  )
}

/** Locale key helper kept local to this file. */
export type StartupSettingKey = SettingsKey
