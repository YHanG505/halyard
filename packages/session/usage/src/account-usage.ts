/**
 * Account-wide spend estimated from DeepSeek balance snapshots. The official
 * API exposes no usage endpoint, so the service records every balance it reads
 * and differences it against the start of the current Beijing day; the result
 * covers every client of the account, not only this harness.
 * @module @deepseek-ai/dsh-usage/account-usage
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { resolveDshHome } from '@deepseek-ai/dsh-home-paths'
import { beijingDayStart } from './fold.ts'
import type { AccountSpendEstimate } from './types.ts'

/** One persisted balance observation. */
export interface BalanceSample {
  /** Unix epoch milliseconds of the read. */
  readonly time: number
  /** Currency of the observed balance row. */
  readonly currency: string
  /** `total_balance` at that instant. */
  readonly totalBalance: number
}

/** Retained history window. */
const RETAIN_MS = 35 * 86_400_000
/** Hard cap on retained snapshots (a sample every ~25 minutes for 35 days). */
const MAX_SAMPLES = 2_000

/** File holding the balance history inside the harness home. */
export function balanceHistoryPath(): string {
  return join(resolveDshHome(), 'usage-balance-history.json')
}

/**
 * Read the persisted balance history.
 * @param path - history file path; defaults to {@link balanceHistoryPath}.
 * @returns the samples, or an empty list when absent or unreadable.
 */
export function readBalanceHistory(path: string = balanceHistoryPath()): BalanceSample[] {
  try {
    const parsed: unknown = JSON.parse(readFileSync(path, 'utf8'))
    if (!Array.isArray(parsed)) return []
    return parsed.filter((entry): entry is BalanceSample => {
      if (entry === null || typeof entry !== 'object') return false
      const sample = entry as Record<string, unknown>
      return typeof sample.time === 'number' && typeof sample.currency === 'string'
        && typeof sample.totalBalance === 'number'
    })
  } catch {
    // Absent or malformed history is a cold start, not a dashboard failure.
    return []
  }
}

/**
 * Append one balance observation, pruning old and excess samples.
 * @param sample - the observation to persist.
 * @param path - history file path; defaults to {@link balanceHistoryPath}.
 * @returns the full retained history after the write.
 */
export function recordBalanceSample(sample: BalanceSample, path: string = balanceHistoryPath()): BalanceSample[] {
  const cutoff = sample.time - RETAIN_MS
  const history = readBalanceHistory(path)
    .filter(entry => entry.time >= cutoff)
    .concat(sample)
    .sort((left, right) => left.time - right.time)
    .slice(-MAX_SAMPLES)
  try {
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, `${JSON.stringify(history)}\n`)
  } catch {
    // A read-only home must not fail the balance surface.
  }
  return history
}

/**
 * Estimate the account's spend over the current Beijing day from balance
 * snapshots. The reference is the last snapshot before today when one exists,
 * otherwise the earliest snapshot of today (the estimate then starts there).
 * @param history - persisted balance samples.
 * @param now - current epoch milliseconds.
 * @returns the estimate, or undefined when no usable reference exists.
 */
export function estimateAccountSpendToday(
  history: readonly BalanceSample[],
  now: number,
): AccountSpendEstimate | undefined {
  const dayStart = beijingDayStart(now)
  const ordered = [...history].sort((left, right) => left.time - right.time)
  const current = ordered.filter(sample => sample.time <= now).at(-1)
  if (current === undefined || current.currency !== 'CNY') return undefined
  const reference = ordered.filter(sample => sample.time < dayStart).at(-1)
    ?? ordered.find(sample => sample.time >= dayStart && sample.time < current.time)
  if (reference === undefined || reference.currency !== current.currency) return undefined
  const spent = reference.totalBalance - current.totalBalance
  return { spentCny: spent > 0 ? spent : 0, since: reference.time }
}
