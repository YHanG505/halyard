/**
 * Sidebar usage card: today's estimated spend and the remaining account
 * balance, with a top-up jump. Registered into `sidebar.footer.action` so it
 * sits directly above the Settings row in both sidebar widths.
 */

import { useCallback, useEffect, useState } from 'react'
import type { InjectFace } from '@deepseek-ai/dsh-client-ui-slots'
import type { BalanceInfo, UsageSummary } from '@deepseek-ai/dsh-usage/types'
import type { UsageSectionInjected } from './UsageSection.tsx'
import { formatCny, formatTokens, TOP_UP_URL } from './format.ts'
import styles from './UsageSidebarCard.module.css'

/** Sidebar owner props plus the usage inject face. */
export type UsageSidebarCardProps = Partial<InjectFace<UsageSectionInjected>> & {
  /** Whether the sidebar renders wide content (false = 56px rail). */
  wide?: boolean
}

/** Refresh cadence for the live card. */
const REFRESH_MS = 60_000

/**
 * Render the live usage card for the sidebar foot.
 * @param props - owner `wide` flag and the usage inject face.
 * @returns the card element tree.
 */
export function UsageSidebarCard(props: UsageSidebarCardProps) {
  const remote = props.remote
  const t = props.t
  const wide = props.wide ?? true
  const [summary, setSummary] = useState<UsageSummary | null>(null)
  const [balance, setBalance] = useState<BalanceInfo | null>(null)

  const load = useCallback(async () => {
    if (remote === undefined) return
    try {
      const [carriedSummary, carriedBalance] = await Promise.all([
        remote.summary({ range: 'today' }),
        remote.balance(),
      ])
      if (carriedSummary.ok) setSummary(carriedSummary.value)
      if (carriedBalance.ok) setBalance(carriedBalance.value)
    } catch {
      // Keep the last good figures; the next poll retries.
    }
  }, [remote])

  useEffect(() => {
    void load()
    const timer = setInterval(() => { void load() }, REFRESH_MS)
    const onFocus = (): void => { void load() }
    window.addEventListener('focus', onFocus)
    return () => {
      clearInterval(timer)
      window.removeEventListener('focus', onFocus)
    }
  }, [load])

  if (t === undefined || remote === undefined) return null

  const cost = summary === null ? null : formatCny(summary.totals.estimatedCostCny)
  const tokens = summary === null
    ? null
    : formatTokens(summary.totals.inputTokens + summary.totals.outputTokens)
  const remaining = balance?.isAvailable === true ? formatCny(balance.totalBalance) : null

  if (!wide) {
    return (
      <a
        className={styles.rail}
        href={TOP_UP_URL}
        target="_blank"
        rel="noreferrer"
        title={`${t('sidebarBalance')} ${remaining ?? t('sidebarUnavailable')} · ${t('topUp')}`}
        data-testid="usage-sidebar-rail"
      >
        <span className={styles.railGlyph} aria-hidden="true">¥</span>
        {remaining !== null && <span className={styles.railValue}>{remaining}</span>}
      </a>
    )
  }

  return (
    <div className={styles.card} data-testid="usage-sidebar-card">
      <div className={styles.row}>
        <span className={styles.label}>{t('sidebarToday')}</span>
        <span className={styles.value}>{cost ?? '—'}</span>
      </div>
      <div className={styles.sub}>
        {summary === null
          ? t('sidebarNoUsage')
          : `${summary.totals.requests} ${t('requests')} · ${tokens ?? '0'} ${t('tokens')}`}
      </div>
      <div className={styles.divider} />
      <div className={styles.row}>
        <span className={styles.label}>{t('sidebarBalance')}</span>
        <span className={styles.value}>{remaining ?? t('sidebarUnavailable')}</span>
      </div>
      <a className={styles.topUp} href={TOP_UP_URL} target="_blank" rel="noreferrer">
        {t('topUp')}
      </a>
    </div>
  )
}
