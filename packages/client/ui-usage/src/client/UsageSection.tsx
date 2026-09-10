/**
 * Usage settings section: a balance hero with top-up jump, range picker,
 * KPI totals, a daily cost chart, and cost-share bars per model over the usage
 * Remote. Chinese primary copy arrives through the locale dictionary; the
 * component reads Remote results as plain props.
 */

import { useCallback, useEffect, useState } from 'react'
import type { RemoteResult } from '@deepseek-ai/dsh-typert-protocol'
import type { InjectFace } from '@deepseek-ai/dsh-client-ui-slots'
import type { BalanceInfo, UsageRange, UsageSummary } from '@deepseek-ai/dsh-usage/types'
import type { en } from './locales.ts'
import { formatCny, formatTokens, TOP_UP_URL } from './format.ts'
import styles from './UsageSection.module.css'

/**
 * Remote face this section calls. The generated Remote wraps every business
 * value in {@link RemoteResult}; carrier failures arrive as `ok: false`.
 */
export interface UsageRemote {
  summary: (request: { range: UsageRange; refresh?: boolean }) => Promise<RemoteResult<UsageSummary>>
  balance: (request?: { refresh?: boolean }) => Promise<RemoteResult<BalanceInfo>>
}

/** Injected dependencies of {@link UsageSection}. */
export interface UsageSectionInjected {
  /** Typed usage Remote namespace. */
  remote: UsageRemote
  /** Section copy. */
  t: (key: keyof typeof en) => string
}

/** Props delivered by the slot outlet. */
export type UsageSectionProps = Partial<InjectFace<UsageSectionInjected>>

type DayRow = UsageSummary['byDay'][number]
type ModelRow = UsageSummary['byModel'][number]

const RANGES: readonly { value: UsageRange; labelKey: keyof typeof en }[] = [
  { value: 'today', labelKey: 'rangeToday' },
  { value: 'week', labelKey: 'rangeWeek' },
  { value: 'month', labelKey: 'rangeMonth' },
  { value: 'all', labelKey: 'rangeAll' },
]

/**
 * Daily cost bars with date labels and a max-value axis hint.
 * @param props - day rows and the copy accessor.
 * @returns the chart element tree.
 */
function DailyBars({ rows, ariaLabel }: { rows: readonly DayRow[]; ariaLabel: string }) {
  const max = rows.reduce((peak, row) => Math.max(peak, row.estimatedCostCny), 0)
  const labelEvery = Math.max(1, Math.ceil(rows.length / 8))
  return (
    <div className={styles.chart} role="img" aria-label={ariaLabel} data-testid="usage-daily-chart">
      <div className={styles.chartBody}>
        {rows.map((row, index) => {
          const ratio = max > 0 ? row.estimatedCostCny / max : 0
          const height = row.estimatedCostCny > 0 ? Math.max(ratio * 100, 3) : 0
          return (
            <div
              key={row.date}
              className={styles.chartColumn}
              title={`${row.date} · ${formatCny(row.estimatedCostCny)} · ${row.requests}`}
            >
              <div className={styles.chartBarTrack}>
                <div className={styles.chartBar} style={{ height: `${height}%` }} />
              </div>
              <span className={styles.chartLabel}>
                {index % labelEvery === 0 ? row.date.slice(5) : ''}
              </span>
            </div>
          )
        })}
      </div>
      <div className={styles.chartMax}>{formatCny(max)}</div>
    </div>
  )
}

/**
 * Cost-share bars for the by-model rows.
 * @param props - model rows, total cost, and copy accessor.
 * @returns the share list element tree.
 */
function ModelShares({ rows, totalCost, shareLabel }: {
  rows: readonly ModelRow[]
  totalCost: number
  shareLabel: string
}) {
  return (
    <ul className={styles.shareList} data-testid="usage-model-shares">
      {rows.map((row) => {
        const share = totalCost > 0 ? row.estimatedCostCny / totalCost : 0
        return (
          <li key={row.model} className={styles.shareRow}>
            <div className={styles.shareHead}>
              <span className={styles.shareModel}>{row.model}</span>
              <span className={styles.shareValue}>
                {formatCny(row.estimatedCostCny)}
                {' · '}
                {`${(share * 100).toFixed(1)}%`}
              </span>
            </div>
            <div className={styles.shareTrack} aria-label={shareLabel}>
              <div className={styles.shareFill} style={{ width: `${(share * 100).toFixed(1)}%` }} />
            </div>
          </li>
        )
      })}
    </ul>
  )
}

/**
 * Render the usage dashboard for one selected range.
 * @param props - inject face from the slot registration.
 * @returns the section element tree.
 */
export function UsageSection(props: UsageSectionProps) {
  const remote = props.remote
  const t = props.t
  const [range, setRange] = useState<UsageRange>('today')
  const [summary, setSummary] = useState<UsageSummary | null>(null)
  const [balance, setBalance] = useState<BalanceInfo | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const load = useCallback(async (force = false) => {
    if (remote === undefined || t === undefined) return
    setLoading(true)
    setError(null)
    try {
      // Balance first: its fresh snapshot feeds the account-wide estimate.
      const carriedBalance = await (force ? remote.balance({ refresh: true }) : remote.balance({}))
      const carriedSummary = await (force
        ? remote.summary({ range, refresh: true })
        : remote.summary({ range }))
      if (!carriedSummary.ok || !carriedBalance.ok) {
        setError(t('loadFailed'))
        return
      }
      setSummary(carriedSummary.value)
      setBalance(carriedBalance.value)
    } catch {
      setError(t('loadFailed'))
    } finally {
      setLoading(false)
    }
  }, [range, remote, t])

  useEffect(() => {
    void load()
  }, [load])

  if (t === undefined || remote === undefined) return null

  const totals = summary?.totals
  const rangeLabel = t(RANGES.find(entry => entry.value === range)?.labelKey ?? 'rangeToday')
  const sinceLabel = (epoch: number): string => {
    const beijing = (value: number): string => new Date(value + 8 * 3_600_000).toISOString().slice(0, 10)
    const sameDay = beijing(epoch) === beijing(Date.now())
    return new Date(epoch).toLocaleString('zh-CN', sameDay
      ? { hour: '2-digit', minute: '2-digit' }
      : { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
  }

  return (
    <div className={styles.section} data-testid="usage-section">
      <div className={styles.titleRow}>
        <div>
          <h2 className={styles.title}>{t('title')}</h2>
          <p className={styles.intro}>{t('intro')}</p>
        </div>
        <button
          type="button"
          className={styles.refreshButton}
          onClick={() => { void load(true) }}
          disabled={loading}
          title={t('refresh')}
          aria-label={t('refresh')}
          data-testid="usage-refresh"
        >
          <span
            className={loading ? `${styles.refreshIcon} ${styles.spinning}` : styles.refreshIcon}
            aria-hidden="true"
          >
            ↻
          </span>
        </button>
      </div>

      <div className={styles.rangeRow} role="group" aria-label={t('title')}>
        {RANGES.map(({ value, labelKey }) => (
          <button
            key={value}
            type="button"
            className={range === value ? `${styles.rangeButton} ${styles.rangeButtonActive}` : styles.rangeButton}
            aria-pressed={range === value}
            onClick={() => { setRange(value) }}
          >
            {t(labelKey)}
          </button>
        ))}
      </div>

      <div className={styles.heroGrid}>
        <section className={styles.heroCard} aria-label={t('accountToday')}>
          <h3 className={styles.cardTitle}>{rangeLabel} · {t('accountRange')}</h3>
          {summary?.account === undefined ? (
            <>
              <p className={styles.heroAmount}>—</p>
              <p className={styles.balanceMeta}>{t('accountHint')}</p>
            </>
          ) : (
            <>
              <p className={styles.heroAmount}>{formatCny(summary.account.spentCny)}</p>
              <p className={styles.balanceMeta}>
                {t('accountSince').replace('{time}', sinceLabel(summary.account.since))}
              </p>
            </>
          )}
          <a
            className={styles.platformLink}
            href="https://platform.deepseek.com/usage"
            target="_blank"
            rel="noreferrer"
          >
            {t('platformUsage')}
          </a>
        </section>

        <section className={styles.heroCard} aria-label={t('balanceTitle')}>
          <h3 className={styles.cardTitle}>{t('balanceAvailable')}</h3>
          {balance?.isAvailable === true ? (
            <>
              <p className={styles.heroAmount}>{formatCny(balance.totalBalance)}</p>
              <p className={styles.balanceMeta}>
                {t('chargedBalance')} {formatCny(balance.chargedBalance)}
                {' · '}
                {t('grantedBalance')} {formatCny(balance.grantedBalance)}
              </p>
            </>
          ) : (
            <p className={styles.unavailable} data-testid="balance-unavailable">
              {balance?.reason === 'network'
                ? t('balanceNetwork')
                : balance?.reason === 'missing-credential'
                  ? t('balanceMissingKey')
                  : t('balanceGeneric')}
              {' — '}
              {t('balanceUnavailable')}
            </p>
          )}
          <a className={styles.topUpButton} href={TOP_UP_URL} target="_blank" rel="noreferrer">
            {t('topUp')}
          </a>
        </section>

        <section className={styles.heroCard} aria-label={t('estimatedCost')}>
          <h3 className={styles.cardTitle}>{t('localScope')} · {t('estimatedCost')}</h3>
          <p className={styles.heroAmount}>{totals === undefined ? '…' : formatCny(totals.estimatedCostCny)}</p>
          <p className={styles.balanceMeta}>
            {totals === undefined
              ? ' '
              : `${totals.requests} ${t('requests')} · ${formatTokens(totals.inputTokens + totals.outputTokens)} ${t('tokens')}`}
          </p>
        </section>
      </div>

      {error !== null && (
        <div className={styles.errorRow}>
          <p className={styles.errorText}>{error}</p>
          <button type="button" className={styles.retryButton} onClick={() => { void load() }}>
            {t('retry')}
          </button>
        </div>
      )}

      <section className={styles.card} aria-label={t('totalsTitle')}>
        <h3 className={styles.cardTitle}>{t('totalsTitle')}</h3>
        {totals === undefined ? (
          <p className={styles.empty}>{loading ? '…' : t('empty')}</p>
        ) : (
          <div className={styles.statsGrid}>
            <div>
              <p className={styles.statLabel}>{t('requests')}</p>
              <p className={styles.statValue}>{totals.requests}</p>
            </div>
            <div>
              <p className={styles.statLabel}>{t('inputTokens')}</p>
              <p className={styles.statValue}>{formatTokens(totals.inputTokens)}</p>
            </div>
            <div>
              <p className={styles.statLabel}>{t('outputTokens')}</p>
              <p className={styles.statValue}>{formatTokens(totals.outputTokens)}</p>
            </div>
            <div>
              <p className={styles.statLabel}>{t('cacheReadTokens')}</p>
              <p className={styles.statValue}>{formatTokens(totals.cacheReadTokens)}</p>
            </div>
            <div>
              <p className={styles.statLabel}>{t('estimatedCost')}</p>
              <p className={styles.statValue}>{formatCny(totals.estimatedCostCny)}</p>
            </div>
          </div>
        )}
      </section>

      <section className={styles.card} aria-label={t('chartDaily')}>
        <h3 className={styles.cardTitle}>{t('chartDaily')}</h3>
        {summary === null || summary.byDay.length === 0 ? (
          <p className={styles.empty}>{t('empty')}</p>
        ) : (
          <DailyBars rows={summary.byDay} ariaLabel={t('chartDaily')} />
        )}
      </section>

      <section className={styles.card} aria-label={t('byModelTitle')}>
        <h3 className={styles.cardTitle}>{t('byModelTitle')}</h3>
        {summary === null || summary.byModel.length === 0 ? (
          <p className={styles.empty}>{t('empty')}</p>
        ) : (
          <>
            <ModelShares
              rows={summary.byModel}
              totalCost={summary.totals.estimatedCostCny}
              shareLabel={t('share')}
            />
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>{t('model')}</th>
                    <th>{t('requests')}</th>
                    <th>{t('inputTokens')}</th>
                    <th>{t('outputTokens')}</th>
                    <th>{t('estimatedCost')}</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.byModel.map(row => (
                    <tr key={row.model}>
                      <td>{row.model}</td>
                      <td>{row.requests}</td>
                      <td>{formatTokens(row.inputTokens)}</td>
                      <td>{formatTokens(row.outputTokens)}</td>
                      <td>{formatCny(row.estimatedCostCny)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>

      <section className={styles.card} aria-label={t('byDayTitle')}>
        <h3 className={styles.cardTitle}>{t('byDayTitle')}</h3>
        {summary === null || summary.byDay.length === 0 ? (
          <p className={styles.empty}>{t('empty')}</p>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>{t('date')}</th>
                  <th>{t('requests')}</th>
                  <th>{t('inputTokens')}</th>
                  <th>{t('outputTokens')}</th>
                  <th>{t('estimatedCost')}</th>
                </tr>
              </thead>
              <tbody>
                {summary.byDay.map(row => (
                  <tr key={row.date}>
                    <td>{row.date}</td>
                    <td>{row.requests}</td>
                    <td>{formatTokens(row.inputTokens)}</td>
                    <td>{formatTokens(row.outputTokens)}</td>
                    <td>{formatCny(row.estimatedCostCny)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
