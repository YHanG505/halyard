/**
 * Public request, value, and failure vocabulary for the usage dashboard.
 * Types only so generated Remote clients can consume this module without
 * importing Host runtime code.
 * @module @deepseek-ai/dsh-usage/types
 */

/** Time window folded by {@link UsageSummaryRequest.range}. */
export type UsageRange = 'today' | 'week' | 'month' | 'all'

/** Token and cost totals plus by-model and by-day breakdowns for one window. */
export interface UsageSummary {
  /** Requested window label. */
  readonly range: UsageRange
  /** Unix epoch milliseconds when this summary was computed. */
  readonly generatedAt: number
  /** Whole-window totals. */
  readonly totals: UsageTotals
  /** Per-model fold, ordered by estimated cost descending. */
  readonly byModel: readonly UsageModelRow[]
  /** Per-day fold (Beijing calendar dates), ordered ascending. */
  readonly byDay: readonly UsageDayRow[]
  /** Account-wide spend estimate from balance snapshots, when a reference exists. */
  readonly account?: AccountSpendEstimate
}

/** Account-wide spend estimated from balance snapshots (all clients of the account). */
export interface AccountSpendEstimate {
  /** Estimated spend in CNY; never negative (a top-up clamps to zero). */
  readonly spentCny: number
  /** Epoch milliseconds of the reference snapshot the estimate starts from. */
  readonly since: number
}

/** Aggregate token counts and estimated CNY cost. */
export interface UsageTotals {
  /** Count of finalized assistant messages that reported usage. */
  readonly requests: number
  /** Uncached input tokens. */
  readonly inputTokens: number
  /** Output tokens. */
  readonly outputTokens: number
  /** Cache-hit input tokens. */
  readonly cacheReadTokens: number
  /** Estimated spend in CNY under the active pricing table. */
  readonly estimatedCostCny: number
}

/** One model's contribution to a usage window. */
export interface UsageModelRow extends UsageTotals {
  /** Model id from the assistant message provenance. */
  readonly model: string
}

/** One Beijing calendar day's contribution to a usage window. */
export interface UsageDayRow {
  /** Beijing calendar date, `YYYY-MM-DD`. */
  readonly date: string
  readonly requests: number
  readonly inputTokens: number
  readonly outputTokens: number
  readonly estimatedCostCny: number
}

/** Read the usage summary for one window. */
export interface UsageSummaryRequest {
  readonly range: UsageRange
  /** Drop the process caches and recompute from the durable logs. */
  readonly refresh?: boolean
}

/** Successful balance read (official `GET /user/balance`). */
export interface BalanceAvailable {
  readonly isAvailable: true
  /** `total_balance` — remaining usable balance in `currency`. */
  readonly totalBalance: number
  /** `topped_up_balance` — prepaid/top-up balance. */
  readonly chargedBalance: number
  /** `granted_balance` — unexpired grant balance. */
  readonly grantedBalance: number
  /** Currency code from the selected `balance_infos` row, when present. */
  readonly currency?: string
}

/** Balance endpoint is unreachable or unusable; never throws to the caller. */
export interface BalanceUnavailable {
  readonly isAvailable: false
  /** Stable reason code: `missing-credential`, `network`, `http`, `malformed`, or `api`. */
  readonly reason: string
}

/** Account balance result; unavailability is a first-class outcome. */
export type BalanceInfo = BalanceAvailable | BalanceUnavailable

/** Balance read options; the read is never cached. */
export interface BalanceRequest {
  /** Accepted for symmetry with the summary's refresh flag. */
  readonly refresh?: boolean
}
