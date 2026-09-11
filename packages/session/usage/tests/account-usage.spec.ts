/** Range-aware account spend estimation from balance snapshots. */

import { describe, expect, it } from 'vitest'
import { estimateAccountSpend, type BalanceSample } from '../src/account-usage.ts'

const day = 86_400_000
/** 2026-09-11 12:00 Beijing. */
const now = Date.UTC(2026, 8, 11, 4, 0, 0)
const sample = (time: number, totalBalance: number, currency = 'CNY'): BalanceSample => ({
  time, currency, totalBalance,
})

describe('account spend estimate', () => {
  const history = [
    sample(now - 8 * day, 100),
    sample(now - 2 * day, 80),
    sample(now - 3_600_000, 70),
  ]

  it('differences against the last snapshot before the window', () => {
    expect(estimateAccountSpend(history, 'today', now)).toEqual({ spentCny: 10, since: now - 2 * day })
    expect(estimateAccountSpend(history, 'week', now)).toEqual({ spentCny: 30, since: now - 8 * day })
    expect(estimateAccountSpend(history, 'month', now)).toEqual({ spentCny: 30, since: now - 8 * day })
    expect(estimateAccountSpend(history, 'all', now)).toEqual({ spentCny: 30, since: now - 8 * day })
  })

  it('falls back to the earliest snapshot inside the window', () => {
    const inside = [sample(now - 6 * 3_600_000, 80), sample(now - 3_600_000, 70)]
    expect(estimateAccountSpend(inside, 'today', now)).toEqual({ spentCny: 10, since: now - 6 * 3_600_000 })
  })

  it('reports zero spend for a window that only received a top-up', () => {
    expect(estimateAccountSpend([sample(now - day, 50), sample(now, 80)], 'today', now))
      .toEqual({ spentCny: 0, since: now - day })
  })

  it('accumulates spend across a mid-window top-up', () => {
    const toppedUp = [
      sample(now - 8 * 3_600_000, 100),
      sample(now - 6 * 3_600_000, 90),
      sample(now - 4 * 3_600_000, 140),
      sample(now - 2 * 3_600_000, 130),
    ]
    expect(estimateAccountSpend(toppedUp, 'today', now)).toEqual({ spentCny: 20, since: now - 8 * 3_600_000 })
  })

  it('rejects unusable history', () => {
    expect(estimateAccountSpend([sample(now - 3_600_000, 80)], 'today', now)).toBeUndefined()
    expect(estimateAccountSpend([
      sample(now - day, 50, 'USD'),
      sample(now, 80, 'USD'),
    ], 'today', now)).toBeUndefined()
  })
})
