/**
 * Cross-session usage summary and DeepSeek account-balance service
 * (`ctx.usage`). Token/cost folds recompute from session-persistence
 * `list()` + `load()` on demand with a short process-local cache; balance
 * degrades to an unavailable branch without throwing.
 * @module @deepseek-ai/dsh-usage
 */

import type {} from '@deepseek-ai/dsh-session-persistence'
import type { Context } from '@deepseek-ai/cordis'
import s from '@deepseek-ai/schemastery'
import { credentialRef } from '@deepseek-ai/dsh-credentials'
import { TypertRemoteService, Remote } from '@deepseek-ai/dsh-typert-protocol'
import { fetchBalance } from './balance.ts'
import { estimateAccountSpendToday, readBalanceHistory, recordBalanceSample } from './account-usage.ts'
import {
  collectUsageSamples,
  foldUsageSummary,
  SUMMARY_CACHE_TTL_MS,
  type UsageSample,
} from './fold.ts'
import { DEFAULT_PRICING_TABLE, type ModelRates, type PricingTable } from './pricing.ts'
import type { BalanceInfo, BalanceRequest, UsageRange, UsageSummary, UsageSummaryRequest } from './types.ts'

export type * from './types.ts'
export {
  DEFAULT_PRICING_TABLE,
  MODEL_ALIASES,
  TOKENS_PER_MILLION,
  estimateCostCny,
  isPeakBeijing,
  ratesFor,
  resolveBillableModel,
} from './pricing.ts'
export type { ModelPricing, ModelRates, PricingTable } from './pricing.ts'
export {
  beijingDateKey,
  beijingDayStart,
  collectUsageSamples,
  foldUsageSummary,
  rangeStart,
  SUMMARY_CACHE_TTL_MS,
} from './fold.ts'
export type { UsageSample } from './fold.ts'
export { fetchBalance, parseBalancePayload, selectBalanceRow } from './balance.ts'
export type { FetchBalance } from './balance.ts'

/** Public DeepSeek API base; deployments override via config or `$DEEPSEEK_BASE_URL`. */
export const PUBLIC_BASE_URL = 'https://api.deepseek.com'

/** Default credential reference resolved per balance call. */
export const DEFAULT_API_KEY_ENV = 'DEEPSEEK_API_KEY'

/** Per-model peak/off-peak rates as validated config (CNY per million tokens). */
export interface PricingConfigEntry {
  /** Billable model id this entry prices. */
  model: string
  peak: ModelRates
  offPeak: ModelRates
}

/** Plugin configuration. Every field has a published default. */
export interface Config {
  /** Credential reference (environment-variable name) resolved per balance call. */
  apiKeyEnv?: string
  /** Provider endpoint for the balance API; defaults to the public DeepSeek API. */
  baseURL?: string
  /** Pricing table entries; defaults to published DeepSeek V4.1 Flash / V4 Pro rates. */
  pricing?: PricingConfigEntry[]
}

const ratesSchema = s.object({
  inputMiss: s.number().min(0),
  inputHit: s.number().min(0),
  output: s.number().min(0),
})

export const Config: s<Config> = s.object({
  apiKeyEnv: s.string().role('credential-ref').default(DEFAULT_API_KEY_ENV),
  baseURL: s.string().default(PUBLIC_BASE_URL),
  pricing: s.array(s.object({
    model: s.string().required(),
    peak: ratesSchema.required(),
    offPeak: ratesSchema.required(),
  })),
})

declare module '@deepseek-ai/cordis' {
  interface Context {
    usage: UsageService
  }
}

/** Build a frozen pricing table from validated config, falling back to defaults. */
function resolvePricingTable(entries: readonly PricingConfigEntry[] | undefined): PricingTable {
  if (entries === undefined || entries.length === 0) return DEFAULT_PRICING_TABLE
  const table: Record<string, { peak: ModelRates; offPeak: ModelRates }> = {}
  for (const entry of entries) {
    table[entry.model] = { peak: entry.peak, offPeak: entry.offPeak }
  }
  return Object.freeze(table)
}

/** Cached recomputation of one range's summary. */
interface SummaryCacheEntry {
  readonly generatedAt: number
  readonly summary: UsageSummary
}

/**
 * Host service over session-persistence usage samples. Injects
 * `sessionPersistence`; credentials are resolved optionally through
 * `ctx.get('credentials')` so assemblies without the credential seam still
 * serve summaries and report balance unavailable.
 */
export class UsageService extends TypertRemoteService {
  static inject = ['sessionPersistence'] as const

  static Config = Config

  private readonly apiKeyRef: ReturnType<typeof credentialRef>
  private readonly baseURL: string
  private readonly pricingTable: PricingTable
  private readonly summaryCache = new Map<UsageRange, SummaryCacheEntry>()
  private cachedSamples: { at: number; samples: readonly UsageSample[] } | null = null

  /**
   * @param ctx - Host context carrying persistence and optional credentials.
   * @param config - Validated plugin configuration.
   */
  constructor(ctx: Context, config: Config = {}) {
    super(ctx, 'usage')
    this.apiKeyRef = credentialRef(config.apiKeyEnv ?? DEFAULT_API_KEY_ENV)
    this.baseURL = (config.baseURL ?? PUBLIC_BASE_URL).replace(/\/+$/u, '')
    this.pricingTable = resolvePricingTable(config.pricing)
    // Process-local caches die with the fiber so a remount recomputes.
    ctx.effect(() => () => {
      this.summaryCache.clear()
      this.cachedSamples = null
    })
  }

  /**
   * Fold every persisted session's usage samples into a window summary.
   * Results are process-cached for {@link SUMMARY_CACHE_TTL_MS}.
   * @param request - window label.
   * @returns the complete summary for the window.
   */
  @Remote('summary')
  async summary(request: UsageSummaryRequest): Promise<UsageSummary> {
    const now = Date.now()
    if (request.refresh === true) {
      this.summaryCache.clear()
      this.cachedSamples = null
    }
    const cached = this.summaryCache.get(request.range)
    if (cached !== undefined && now - cached.generatedAt < SUMMARY_CACHE_TTL_MS) {
      return cached.summary
    }
    const samples = await this.loadSamples(now)
    const folded = foldUsageSummary(request.range, samples, this.pricingTable, now)
    const account = estimateAccountSpendToday(readBalanceHistory(), now)
    const summary: UsageSummary = account === undefined ? folded : { ...folded, account }
    this.summaryCache.set(request.range, { generatedAt: now, summary })
    return summary
  }

  /**
   * Read the DeepSeek account balance. Missing credentials, network failure,
   * and non-OK or malformed responses degrade to `{ isAvailable: false, reason }`.
   * @returns the balance or an unavailable branch; never throws.
   */
  @Remote('balance')
  async balance(_request: BalanceRequest): Promise<BalanceInfo> {
    const credentials = this.ctx.get('credentials')
    if (credentials === undefined) return { isAvailable: false, reason: 'missing-credential' }
    const resolved = await credentials.resolve(this.apiKeyRef)
    const info = await fetchBalance(this.baseURL, resolved?.value)
    if (info.isAvailable) {
      recordBalanceSample({ time: Date.now(), currency: info.currency ?? 'CNY', totalBalance: info.totalBalance })
    }
    return info
  }

  /**
   * Collect usage samples across every materialized session, collapsing
   * concurrent callers onto one in-flight walk and caching the sample set
   * for {@link SUMMARY_CACHE_TTL_MS}.
   */
  private async loadSamples(now: number): Promise<readonly UsageSample[]> {
    if (this.cachedSamples !== null && now - this.cachedSamples.at < SUMMARY_CACHE_TTL_MS) {
      return this.cachedSamples.samples
    }
    const snapshots = await this.ctx.sessionPersistence.list()
    const samples: UsageSample[] = []
    // Sequential loads keep peak memory bounded for large stores; the walk is
    // already I/O-bound and summaries are not on a hot path.
    for (const snapshot of snapshots) {
      try {
        const handle = await this.ctx.sessionPersistence.open(snapshot.header.id, 'read')
        try {
          const { events } = await handle.read()
          samples.push(...collectUsageSamples(events))
        } finally {
          await handle.close()
        }
      } catch {
        // A single unreadable log must not fail the whole dashboard; skip it.
      }
    }
    this.cachedSamples = { at: now, samples }
    return samples
  }
}

export default UsageService
