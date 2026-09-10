/**
 * Balance degradation and official `GET /user/balance` payload parsing:
 * missing credential, network failure, HTTP error, and malformed payloads
 * all become `{ isAvailable: false, reason }`.
 */

import { describe, expect, it, vi } from 'vitest'
import { fetchBalance, parseBalancePayload, selectBalanceRow } from '../src/balance.ts'

describe('balance client', () => {
  it('reports missing-credential without calling the network', async () => {
    const fetchImpl = vi.fn()
    await expect(fetchBalance('https://api.deepseek.com', undefined, fetchImpl)).resolves.toEqual({
      isAvailable: false,
      reason: 'missing-credential',
    })
    await expect(fetchBalance('https://api.deepseek.com', '', fetchImpl)).resolves.toEqual({
      isAvailable: false,
      reason: 'missing-credential',
    })
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('reports network when fetch rejects', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'))
    await expect(fetchBalance('https://api.deepseek.com', 'key', fetchImpl)).resolves.toEqual({
      isAvailable: false,
      reason: 'network',
    })
  })

  it('reports http:<status> on a non-OK response', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 401 })
    await expect(fetchBalance('https://api.deepseek.com/', 'key', fetchImpl)).resolves.toEqual({
      isAvailable: false,
      reason: 'http:401',
    })
    expect(fetchImpl).toHaveBeenCalledWith('https://api.deepseek.com/user/balance', {
      method: 'GET',
      headers: { Authorization: 'Bearer key' },
    })
  })

  it('reports malformed when the body is not JSON', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.reject(new SyntaxError('bad json')),
    })
    await expect(fetchBalance('https://api.deepseek.com', 'key', fetchImpl)).resolves.toEqual({
      isAvailable: false,
      reason: 'malformed',
    })
  })

  it('parses the official balance_infos payload preferring CNY', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({
        is_available: true,
        balance_infos: [
          {
            currency: 'USD',
            total_balance: '1.00',
            granted_balance: '0.00',
            topped_up_balance: '1.00',
          },
          {
            currency: 'CNY',
            total_balance: '110.00',
            granted_balance: '10.00',
            topped_up_balance: '100.00',
          },
        ],
      }),
    })
    await expect(fetchBalance('https://api.deepseek.com', 'key', fetchImpl)).resolves.toEqual({
      isAvailable: true,
      totalBalance: 110,
      chargedBalance: 100,
      grantedBalance: 10,
      currency: 'CNY',
    })
  })

  it('falls back to the first balance_infos row when CNY is absent', () => {
    expect(parseBalancePayload({
      is_available: true,
      balance_infos: [
        {
          currency: 'USD',
          total_balance: '2.50',
          granted_balance: '0.50',
          topped_up_balance: '2.00',
        },
      ],
    })).toEqual({
      isAvailable: true,
      totalBalance: 2.5,
      chargedBalance: 2,
      grantedBalance: 0.5,
      currency: 'USD',
    })
  })

  it('selects no row from an empty or non-array balance_infos', () => {
    expect(selectBalanceRow([])).toBeUndefined()
    expect(selectBalanceRow(undefined)).toBeUndefined()
    expect(selectBalanceRow('nope')).toBeUndefined()
  })

  it('treats is_available false, empty infos, and bad numbers as unavailable', () => {
    expect(parseBalancePayload({ is_available: false, message: 'quota' })).toEqual({
      isAvailable: false,
      reason: 'api:quota',
    })
    expect(parseBalancePayload({ is_available: true, balance_infos: [] })).toEqual({
      isAvailable: false,
      reason: 'malformed',
    })
    expect(parseBalancePayload({
      is_available: true,
      balance_infos: [{ currency: 'CNY', total_balance: 'x', granted_balance: '1', topped_up_balance: '1' }],
    })).toEqual({ isAvailable: false, reason: 'malformed' })
    expect(parseBalancePayload(null)).toEqual({ isAvailable: false, reason: 'malformed' })
  })
})
