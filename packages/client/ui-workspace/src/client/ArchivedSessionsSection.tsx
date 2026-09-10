/**
 * Settings section listing archived conversations with restore and permanent
 * delete. Data comes from the session list rows plus the workspace archive
 * set; actions go through the injected workspace/session faces.
 */

import { useState } from 'react'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
// Type-only: pulls the title projection key into the session list rows.
import type {} from '@deepseek-ai/dsh-session-title/client'
import css from './ArchivedSessionsSection.module.css'

/** Registration-side action face for the archived list. */
export interface ArchivedSessionsInjected {
  /** Restore one archived Session to the visible set. */
  restore: (sessionId: SessionId) => Promise<void>
  /** Permanently delete one archived Session. */
  remove: (sessionId: SessionId) => Promise<void>
}

/** Full section props. */
export type ArchivedSessionsProps =
  PropsRuntime<'settings.section'>
  & PropsLocale<'workspace'>
  & InjectFace<ArchivedSessionsInjected>

/**
 * Render the archived-conversation manager.
 * @param props - composed Settings slot props.
 * @returns the section element tree.
 */
export function ArchivedSessionsSection({
  useSessions, useWorkspaces, restore, remove, t,
}: ArchivedSessionsProps) {
  const archived = useWorkspaces(state => state.archivedSessionIds)
  const sessions = useSessions(state => state.byId)
  const [pending, setPending] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const titleOf = (id: SessionId): string => {
    const value = sessions[id]?.projectionValues?.title
    return typeof value === 'string' && value.length > 0 ? value : t('archived.untitled')
  }
  const updatedOf = (id: SessionId): string => {
    const at = sessions[id]?.updatedAt
    return at === undefined ? id : new Date(at).toLocaleString('zh-CN')
  }
  const run = (action: (id: SessionId) => Promise<void>, id: SessionId): void => {
    setBusy(id)
    setError(null)
    void action(id).then(
      () => { setPending(null) },
      (reason: unknown) => { setError(reason instanceof Error ? reason.message : String(reason)) },
    ).finally(() => { setBusy(null) })
  }

  return (
    <div className={css.section} data-testid="archived-sessions">
      <h2 className={css.title}>{t('archived.title')}</h2>
      {archived.length === 0 ? (
        <p className={css.empty}>{t('archived.empty')}</p>
      ) : (
        <ul className={css.list}>
          {archived.map(id => (
            <li key={id} className={css.row}>
              <div className={css.rowText}>
                <div className={css.rowTitle}>{titleOf(id)}</div>
                <div className={css.rowMeta}>
                  {t('archived.updated')} {updatedOf(id)}
                </div>
              </div>
              <div className={css.actions}>
                <button
                  type="button"
                  className={css.action}
                  disabled={busy === id}
                  onClick={() => { run(restore, id) }}
                >
                  {t('archived.restore')}
                </button>
                {pending === id ? (
                  <>
                    <button
                      type="button"
                      className={`${css.action} ${css.danger}`}
                      disabled={busy === id}
                      onClick={() => { run(remove, id) }}
                    >
                      {t('archived.confirmDelete')}
                    </button>
                    <button
                      type="button"
                      className={css.action}
                      disabled={busy === id}
                      onClick={() => { setPending(null) }}
                    >
                      {t('archived.cancel')}
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    className={`${css.action} ${css.danger}`}
                    disabled={busy === id}
                    onClick={() => { setPending(id) }}
                  >
                    {t('archived.delete')}
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      {error !== null && <p className={css.error}>{error}</p>}
    </div>
  )
}
