/**
 * Pure fold from session-log usage samples into a {@link UsageSummary}.
 * Recomputed on demand; no parallel usage store.
 * @module @deepseek-ai/dsh-usage/src/fold
 */

import type { SessionEvent } from '@deepseek-ai/dsh-session'
import type { TokenUsage } from '@deepseek-ai/dsh-llm'
import type { UsageDayRow, UsageModelRow, UsageRange, UsageSummary } from './types.ts'
import { estimateCostCny, ratesFor, type PricingTable } from './pricing.ts'

/** One usage-bearing assistant message extracted from a session log. */
export interface UsageSample {
  /** Model id from message provenance. */
  readonly model: string
  /** Unix epoch milliseconds of the assistant/message event. */
  readonly time: number
  /** Provider-reported token counts for that step. */
  readonly usage: TokenUsage
}

/** Process-local cache lifetime for a recomputed summary. */
export const SUMMARY_CACHE_TTL_MS = 30_000

/**
 * Extract final usage samples from one session's event log.
 * A usage chunk and the later assistant/message for the same turn/step report
 * the same step; only the finalized message is counted so a stream does not
 * double-bill.
 * @param events - immutable logical event log.
 * @returns one sample per finalized assistant message that reported usage.
 */
export function collectUsageSamples(events: readonly SessionEvent[]): UsageSample[] {
  const samples: UsageSample[] = []
  for (const event of events) {
    if (event.type !== 'assistant/message') continue
    const usage = event.data.usage
    if (usage === undefined) continue
    const model = event.data.message.source.model
    samples.push({ model, time: event.time, usage })
  }
  return samples
}

/**
 * Start of the Beijing calendar day containing `epochMs`.
 * @param epochMs - Unix epoch milliseconds.
 * @returns epoch milliseconds of Beijing midnight for that day.
 */
export function beijingDayStart(epochMs: number): number {
  const shifted = epochMs + 8 * 3_600_000
  const dayMs = 86_400_000
  return Math.floor(shifted / dayMs) * dayMs - 8 * 3_600_000
}

/**
 * Beijing calendar date string `YYYY-MM-DD` for an instant.
 * @param epochMs - Unix epoch milliseconds.
 * @returns the Beijing date.
 */
export function beijingDateKey(epochMs: number): string {
  const shifted = new Date(epochMs + 8 * 3_600_000)
  const y = shifted.getUTCFullYear()
  const m = String(shifted.getUTCMonth() + 1).padStart(2, '0')
  const d = String(shifted.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/**
 * Inclusive start instant for a range label, computed relative to `now`.
 * @param range - requested window.
 * @param now - reference instant.
 * @returns the earliest instant included; `0` for `all`.
 */
export function rangeStart(range: UsageRange, now: number): number {
  const dayStart = beijingDayStart(now)
  switch (range) {
    case 'today':
      return dayStart
    case 'week':
      return dayStart - 6 * 86_400_000
    case 'month':
      return dayStart - 29 * 86_400_000
    case 'all':
      return 0
  }
}

/** Mutable totals accumulator during a fold. */
interface MutableTotals {
  requests: number
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  estimatedCostCny: number
}

function emptyMutableTotals(): MutableTotals {
  return {
    requests: 0,
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    estimatedCostCny: 0,
  }
}

function addTokens(target: MutableTotals, usage: TokenUsage, cost: number): void {
  target.requests += 1
  target.inputTokens += usage.inputTokens
  target.outputTokens += usage.outputTokens
  target.cacheReadTokens += usage.cacheReadTokens ?? 0
  target.estimatedCostCny += cost
}

/**
 * Fold usage samples into a window summary under a pricing table.
 * Unlisted models contribute tokens with zero estimated cost.
 * @param range - requested window label echoed on the summary.
 * @param samples - usage samples from every session in the store.
 * @param table - active pricing table.
 * @param now - generation timestamp and range anchor.
 * @returns the complete summary.
 */
export function foldUsageSummary(
  range: UsageRange,
  samples: readonly UsageSample[],
  table: PricingTable,
  now: number,
): UsageSummary {
  const start = rangeStart(range, now)
  const totals = emptyMutableTotals()
  const byModel = new Map<string, MutableTotals>()
  const byDay = new Map<string, UsageDayRowMutable>()

  for (const sample of samples) {
    if (sample.time < start) continue
    const rates = ratesFor(table, sample.model, sample.time)
    const cost = rates === undefined ? 0 : estimateCostCny(sample.usage, rates)
    addTokens(totals, sample.usage, cost)

    let modelRow = byModel.get(sample.model)
    if (modelRow === undefined) {
      modelRow = emptyMutableTotals()
      byModel.set(sample.model, modelRow)
    }
    addTokens(modelRow, sample.usage, cost)

    const date = beijingDateKey(sample.time)
    let dayRow = byDay.get(date)
    if (dayRow === undefined) {
      dayRow = { date, requests: 0, inputTokens: 0, outputTokens: 0, estimatedCostCny: 0 }
      byDay.set(date, dayRow)
    }
    dayRow.requests += 1
    dayRow.inputTokens += sample.usage.inputTokens
    dayRow.outputTokens += sample.usage.outputTokens
    dayRow.estimatedCostCny += cost
  }

  const modelRows: UsageModelRow[] = [...byModel.entries()]
    .map(([model, row]) => ({ model, ...row }))
    .sort((a, b) => b.estimatedCostCny - a.estimatedCostCny || a.model.localeCompare(b.model))

  const dayRows: UsageDayRow[] = [...byDay.values()].sort((a, b) => a.date.localeCompare(b.date))

  return {
    range,
    generatedAt: now,
    totals,
    byModel: modelRows,
    byDay: dayRows,
  }
}

interface UsageDayRowMutable {
  date: string
  requests: number
  inputTokens: number
  outputTokens: number
  estimatedCostCny: number
}
