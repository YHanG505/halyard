/**
 * Session-identity chip in the conversation header: the full session id in an
 * official Pill capsule; clicking copies it and announces through the shared
 * transient Toast.
 */

import { useRef, useState } from 'react'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { Pill, Toast } from '@deepseek-ai/dsh-client-ui-primitives'
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
  const [toast, setToast] = useState<{ seq: number; text: string } | null>(null)
  const seq = useRef(0)

  const copy = (): void => {
    void navigator.clipboard.writeText(sessionId).then(() => {
      seq.current += 1
      setToast({ seq: seq.current, text: t('sessionId.copied') })
    }, () => {
      // A denied clipboard leaves the chip unchanged; the id stays readable.
    })
  }

  return (
    <>
      <Pill
        className={css.chipHost}
        title={t('sessionId.copyTitle')}
        aria-label={t('sessionId.copyTitle')}
        data-testid="session-id-chip"
        onClick={copy}
      >
        <span className={css.id}>{sessionId}</span>
      </Pill>
      {toast !== null && (
        // Official transient banner: slides in, holds, fades out, fixed
        // top-center so a chip near a window edge cannot clip it.
        <Toast key={toast.seq} text={toast.text} onDone={() => { setToast(null) }} />
      )}
    </>
  )
}
