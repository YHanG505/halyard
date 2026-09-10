/**
 * Pure pricing, peak-window, and usage-fold behavior for the usage dashboard.
 */

import { describe, expect, it } from 'vitest'
import { createMessage } from '@deepseek-ai/dsh-llm'
import type { SessionEvent } from '@deepseek-ai/dsh-session'
import {
  collectUsageSamples,
  DEFAULT_PRICING_TABLE,
  estimateCostCny,
  foldUsageSummary,
  isPeakBeijing,
  rangeStart,
  ratesFor,
  resolveBillableModel,
  TOKENS_PER_MILLION,
} from '../src/index.ts'

/** Monday 2026-09-07 10:00 Beijing = peak (UTC 02:00). */
const PEAK_MONDAY = Date.UTC(2026, 8, 7, 2, 0, 0)
/** Saturday 2026-09-05 10:00 Beijing = off-peak. */
const OFFPEAK_SATURDAY = Date.UTC(2026, 8, 5, 2, 0, 0)
/** Monday 2026-09-07 13:00 Beijing = lunch off-peak (UTC 05:00). */
const OFFPEAK_LUNCH = Date.UTC(2026, 8, 7, 5, 0, 0)

describe('usage pricing', () => {
  it('collapses flash aliases to the published flash billable id', () => {
    expect(resolveBillableModel('deepseek-v4-flash')).toBe('deepseek-v4-flash')
    expect(resolveBillableModel('deepseek-flash')).toBe('deepseek-v4-flash')
    expect(resolveBillableModel('deepseek-v4-flash-vision-exp')).toBe('deepseek-v4-flash')
    expect(resolveBillableModel('unknown-model')).toBe('unknown-model')
  })

  it('marks Beijing weekday business hours as peak and everything else off-peak', () => {
    expect(isPeakBeijing(PEAK_MONDAY)).toBe(true)
    expect(isPeakBeijing(OFFPEAK_SATURDAY)).toBe(false)
    expect(isPeakBeijing(OFFPEAK_LUNCH)).toBe(false)
    // Monday 14:00–18:00 Beijing is peak (UTC 06:00–10:00).
    expect(isPeakBeijing(Date.UTC(2026, 8, 7, 6, 0, 0))).toBe(true)
    expect(isPeakBeijing(Date.UTC(2026, 8, 7, 10, 0, 0))).toBe(false)
  })

  it('picks peak or off-peak rates for an aliased model at an instant', () => {
    const peak = ratesFor(DEFAULT_PRICING_TABLE, 'deepseek-flash', PEAK_MONDAY)
    const off = ratesFor(DEFAULT_PRICING_TABLE, 'deepseek-flash', OFFPEAK_SATURDAY)
    expect(peak).toEqual(DEFAULT_PRICING_TABLE['deepseek-v4-flash']!.peak)
    expect(off).toEqual(DEFAULT_PRICING_TABLE['deepseek-v4-flash']!.offPeak)
    expect(ratesFor(DEFAULT_PRICING_TABLE, 'nope', PEAK_MONDAY)).toBeUndefined()
  })

  it('computes miss + hit + output cost in CNY per million tokens', () => {
    const rates = { inputMiss: 1, inputHit: 0.1, output: 2 }
    const cost = estimateCostCny(
      { inputTokens: 1_000_000, outputTokens: 500_000, cacheReadTokens: 2_000_000 },
      rates,
    )
    expect(cost).toBeCloseTo(1 + 1 + 0.2, 10)
  })
})

/** Minimal assistant/message envelope with usage and a model. */
function usageEvent(time: number, model: string, usage: {
  inputTokens: number
  outputTokens: number
  cacheReadTokens?: number
}, seq = 1): SessionEvent {
  return {
    type: 'assistant/message',
    seq,
    time,
    data: {
      turn: 1,
      step: seq,
      message: createMessage({
        role: 'assistant',
        content: [{ type: 'text', text: 'ok' }],
        source: { kind: 'model', provider: 'deepseek-official', model },
      }),
      usage,
    },
  } as unknown as SessionEvent
}

describe('usage fold', () => {
  it('extracts only finalized assistant messages that report usage', () => {
    const events: SessionEvent[] = [
      {
        type: 'assistant/chunk',
        seq: 1,
        time: PEAK_MONDAY,
        data: { turn: 1, step: 1, chunk: { type: 'usage', usage: { inputTokens: 1, outputTokens: 1 } } },
      } as unknown as SessionEvent,
      usageEvent(PEAK_MONDAY, 'deepseek-v4-flash', { inputTokens: 10, outputTokens: 5, cacheReadTokens: 2 }, 2),
      usageEvent(PEAK_MONDAY, 'deepseek-v4-flash', { inputTokens: 1, outputTokens: 1 }, 3),
    ]
    const samples = collectUsageSamples(events)
    expect(samples).toHaveLength(2)
    expect(samples[0]?.model).toBe('deepseek-v4-flash')
  })

  it('folds totals, by-model, and by-day with peak pricing inside the window', () => {
    const now = PEAK_MONDAY + 3_600_000
    const samples = collectUsageSamples([
      usageEvent(PEAK_MONDAY, 'deepseek-v4-flash', { inputTokens: TOKENS_PER_MILLION, outputTokens: 0 }),
      usageEvent(OFFPEAK_SATURDAY, 'deepseek-v4-flash', { inputTokens: TOKENS_PER_MILLION, outputTokens: 0 }),
    ])
    const summary = foldUsageSummary('all', samples, DEFAULT_PRICING_TABLE, now)
    expect(summary.range).toBe('all')
    expect(summary.totals.requests).toBe(2)
    expect(summary.totals.inputTokens).toBe(2 * TOKENS_PER_MILLION)
    // One peak (¥2) + one off-peak (¥1) for flash miss input.
    expect(summary.totals.estimatedCostCny).toBeCloseTo(3, 10)
    expect(summary.byModel).toHaveLength(1)
    expect(summary.byModel[0]?.model).toBe('deepseek-v4-flash')
    expect(summary.byDay.map(day => day.date)).toEqual(['2026-09-05', '2026-09-07'])
  })

  it('filters by the Beijing day start for the today range', () => {
    const now = Date.UTC(2026, 8, 7, 12, 0, 0) // evening Beijing
    const todayStart = rangeStart('today', now)
    const samples = collectUsageSamples([
      usageEvent(todayStart, 'deepseek-v4-pro', { inputTokens: 100, outputTokens: 10 }),
      usageEvent(todayStart - 1_000, 'deepseek-v4-pro', { inputTokens: 100, outputTokens: 10 }),
    ])
    const summary = foldUsageSummary('today', samples, DEFAULT_PRICING_TABLE, now)
    expect(summary.totals.requests).toBe(1)
  })

  it('gives unlisted models zero estimated cost but still counts tokens', () => {
    const samples = collectUsageSamples([
      usageEvent(PEAK_MONDAY, 'other-model', { inputTokens: 1_000, outputTokens: 10 }),
    ])
    const summary = foldUsageSummary('all', samples, DEFAULT_PRICING_TABLE, PEAK_MONDAY)
    expect(summary.totals.estimatedCostCny).toBe(0)
    expect(summary.totals.inputTokens).toBe(1_000)
    expect(summary.byModel[0]?.model).toBe('other-model')
  })
})
