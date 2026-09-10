/**
 * Session-identity chip in the conversation header: the full session id in a
 * rounded capsule, inverted on hover, click to copy with a transient toast.
 */

import { useEffect, useRef, useState } from 'react'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { Pill } from '@deepseek-ai/dsh-client-ui-primitives'
import css from './SessionIdChip.module.css'

/** Full component props: session scope plus header copy. */
export type SessionIdChipProps =
  PropsRuntime<'conversation.session.header.actions'>
  & PropsLocale<'conversation'>

/**
 * Render the copyable session-id chip.
 * @param props - composed header slot props.
 * @returns the chip element tree.
 */
export function SessionIdChip({ sessionId, t }: SessionIdChipProps) {
  const [copied, setCopied] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  useEffect(() => () => {
    if (timer.current !== undefined) clearTimeout(timer.current)
  }, [])

  const copy = (): void => {
    void navigator.clipboard.writeText(sessionId).then(() => {
      setCopied(true)
      if (timer.current !== undefined) clearTimeout(timer.current)
      timer.current = setTimeout(() => { setCopied(false) }, 1_500)
    }, () => {
      // A denied clipboard leaves the chip unchanged; the id stays readable.
    })
  }

  return (
    <Pill
      className={css.chipHost}
      title={t('sessionId.copyTitle')}
      aria-label={t('sessionId.copyTitle')}
      data-testid="session-id-chip"
      onClick={copy}
    >
      <span className={css.id}>{sessionId}</span>
      {copied && <span className={css.toast}>{t('sessionId.copied')}</span>}
    </Pill>
  )
}
