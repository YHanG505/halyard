// @vitest-environment jsdom
/**
 * Usage section presentation: renders balance/totals/tables from a driven
 * Remote face and switches range on the picker.
 */

import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import { UsageSection } from '../src/client/UsageSection.tsx'
import { en } from '../src/client/locales.ts'
import type { BalanceInfo, UsageSummary } from '@deepseek-ai/dsh-usage/types'

const t = (key: keyof typeof en): string => en[key]

const SUMMARY: UsageSummary = {
  range: 'today',
  generatedAt: 1,
  totals: {
    requests: 2,
    inputTokens: 1_500,
    outputTokens: 200,
    cacheReadTokens: 100,
    estimatedCostCny: 1.25,
  },
  byModel: [{
    model: 'deepseek-v4-flash',
    requests: 2,
    inputTokens: 1_500,
    outputTokens: 200,
    cacheReadTokens: 100,
    estimatedCostCny: 1.25,
  }],
  byDay: [{
    date: '2026-09-07',
    requests: 2,
    inputTokens: 1_500,
    outputTokens: 200,
    estimatedCostCny: 1.25,
  }],
}

const BALANCE_OK: BalanceInfo = {
  isAvailable: true,
  totalBalance: 12.5,
  chargedBalance: 10,
  grantedBalance: 2.5,
  currency: 'CNY',
}

afterEach(cleanup)

describe('UsageSection', () => {
  it('renders balance, totals, by-model, and by-day from the Remote', async () => {
    const remote = {
      summary: vi.fn().mockResolvedValue({ ok: true, value: SUMMARY }),
      balance: vi.fn().mockResolvedValue({ ok: true, value: BALANCE_OK }),
    }
    render(<UsageSection remote={remote} t={t} />)
    await waitFor(() => {
      expect(screen.getByTestId('usage-section')).toBeTruthy()
      expect(screen.getByText('¥12.50')).toBeTruthy()
      expect(screen.getAllByText('deepseek-v4-flash').length).toBeGreaterThan(0)
      expect(screen.getByText('2026-09-07')).toBeTruthy()
      expect(screen.getByTestId('usage-daily-chart')).toBeTruthy()
      expect(screen.getByTestId('usage-model-shares')).toBeTruthy()
    })
    expect(remote.summary).toHaveBeenCalledWith({ range: 'today' })
  })

  it('shows the unavailable copy when balance degrades', async () => {
    const remote = {
      summary: vi.fn().mockResolvedValue({ ok: true, value: SUMMARY }),
      balance: vi.fn().mockResolvedValue({
        ok: true,
        value: { isAvailable: false, reason: 'missing-credential' } satisfies BalanceInfo,
      }),
    }
    render(<UsageSection remote={remote} t={t} />)
    await waitFor(() => {
      expect(screen.getByTestId('balance-unavailable')).toBeTruthy()
    })
  })

  it('refetches when the range picker changes', async () => {
    const remote = {
      summary: vi.fn().mockResolvedValue({ ok: true, value: SUMMARY }),
      balance: vi.fn().mockResolvedValue({ ok: true, value: BALANCE_OK }),
    }
    render(<UsageSection remote={remote} t={t} />)
    await waitFor(() => expect(remote.summary).toHaveBeenCalledTimes(1))
    const week = screen.getByRole('button', { name: en.rangeWeek })
    await act(async () => {
      week.click()
    })
    await waitFor(() => {
      expect(remote.summary).toHaveBeenCalledWith({ range: 'week' })
    })
  })
})
