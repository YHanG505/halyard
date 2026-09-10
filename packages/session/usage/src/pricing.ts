/**
 * Pure pricing and cost fold for the usage dashboard. Rates are CNY per
 * million tokens. Peak windows follow the deployment policy documented on
 * {@link DEFAULT_PRICING_TABLE}; the whole table is validated plugin config.
 * @module @deepseek-ai/dsh-usage/src/pricing
 */

import type { TokenUsage } from '@deepseek-ai/dsh-llm'

/** Per-million-token CNY rates for one model under one peak/off-peak window. */
export interface ModelRates {
  /** Uncached input tokens. */
  readonly inputMiss: number
  /** Cache-hit input tokens. */
  readonly inputHit: number
  /** Output tokens. */
  readonly output: number
}

/** Peak and off-peak rates for one billable model id. */
export interface ModelPricing {
  readonly peak: ModelRates
  readonly offPeak: ModelRates
}

/**
 * Pricing table keyed by billable model id. Callers resolve aliases through
 * {@link resolveBillableModel} before lookup so an unrouted id still bills.
 */
export type PricingTable = Readonly<Record<string, ModelPricing>>

/** Tokens per rate unit; published rates are CNY per million tokens. */
export const TOKENS_PER_MILLION = 1_000_000

/**
 * Published defaults for DeepSeek V4.1 Flash and V4 Pro, CNY per million
 * tokens (api-docs 2026-09-10). Peak is Mon–Fri 09:00–12:00 and 14:00–18:00
 * Beijing time; else off-peak at half rate. Override the whole table from
 * cordis.yml.
 */
export const DEFAULT_PRICING_TABLE: PricingTable = {
  'deepseek-v4-flash': {
    peak: { inputMiss: 2, inputHit: 0.04, output: 8 },
    offPeak: { inputMiss: 1, inputHit: 0.02, output: 4 },
  },
  'deepseek-v4-pro': {
    peak: { inputMiss: 9, inputHit: 0.3, output: 27 },
    offPeak: { inputMiss: 4.5, inputHit: 0.15, output: 13.5 },
  },
}

/**
 * Alias map: harness route ids that bill as a published model. After routing,
 * an alias collapses to its billable id so one pricing row covers the family.
 */
export const MODEL_ALIASES: Readonly<Record<string, string>> = {
  'deepseek-flash': 'deepseek-v4-flash',
  'deepseek-chat': 'deepseek-v4-flash',
  'deepseek-v4-flash-vision-exp': 'deepseek-v4-flash',
  'deepseek-reasoner': 'deepseek-v4-pro',
  'deepseek-v4.1-flash': 'deepseek-v4-flash',
  'deepseek-v4.1-pro': 'deepseek-v4-pro',
}

/**
 * Resolve a model id through the alias table to the billable pricing key.
 * @param model - model id from message provenance.
 * @returns the billable model id (the input when no alias applies).
 */
export function resolveBillableModel(model: string): string {
  return MODEL_ALIASES[model] ?? model
}

/**
 * Whether an instant falls in a DeepSeek peak window, Beijing time (UTC+8, no DST).
 * Peak is Monday–Friday 09:00–12:00 and 14:00–18:00; every other minute is off-peak.
 * @param epochMs - Unix epoch milliseconds.
 * @returns true when peak rates apply.
 */
export function isPeakBeijing(epochMs: number): boolean {
  const beijing = new Date(epochMs + 8 * 3_600_000)
  const day = beijing.getUTCDay()
  if (day === 0 || day === 6) return false
  const minutes = beijing.getUTCHours() * 60 + beijing.getUTCMinutes()
  return (minutes >= 9 * 60 && minutes < 12 * 60) || (minutes >= 14 * 60 && minutes < 18 * 60)
}

/**
 * Estimated CNY cost of one usage sample under a pricing table.
 * @param usage - provider-reported disjoint token counts.
 * @param rates - peak or off-peak rates for the billable model.
 * @returns `input_miss * p_in_miss + cache_hit * p_in_hit + output * p_out` in CNY.
 */
export function estimateCostCny(usage: TokenUsage, rates: ModelRates): number {
  const inputMiss = usage.inputTokens
  const cacheHit = usage.cacheReadTokens ?? 0
  const output = usage.outputTokens
  return (
    (inputMiss * rates.inputMiss + cacheHit * rates.inputHit + output * rates.output)
    / TOKENS_PER_MILLION
  )
}

/**
 * Look up rates for a model at an instant, collapsing aliases and choosing
 * peak or off-peak from the instant.
 * @param table - active pricing table.
 * @param model - model id from provenance.
 * @param epochMs - event timestamp.
 * @returns rates for the billable model, or `undefined` when the model is unlisted.
 */
export function ratesFor(
  table: PricingTable,
  model: string,
  epochMs: number,
): ModelRates | undefined {
  const pricing = table[resolveBillableModel(model)]
  if (pricing === undefined) return undefined
  return isPeakBeijing(epochMs) ? pricing.peak : pricing.offPeak
}
