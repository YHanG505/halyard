/**
 * DeepSeek account-balance client over the official `GET /user/balance`
 * endpoint (api-docs get-user-balance). Missing credentials and network/API
 * failures degrade to `{ isAvailable: false, reason }`; this module never
 * throws to its callers.
 * @module @deepseek-ai/dsh-usage/src/balance
 */

import type { BalanceInfo } from './types.ts'

/** One currency row from `balance_infos`. */
interface BalanceInfoWire {
  currency?: string
  total_balance?: string | number
  granted_balance?: string | number
  /** Official field name for prepaid/top-up balance. */
  topped_up_balance?: string | number
}

/** Wire response fields for `GET {baseURL}/user/balance`. */
interface BalanceWire {
  is_available?: boolean
  balance_infos?: unknown
  code?: number
  message?: string
}

/** Injectable HTTP face so tests supply a fake fetch. */
export type FetchBalance = (url: string, init: RequestInit) => Promise<Response>

function finiteNumber(value: string | number | undefined): number | undefined {
  if (value === undefined) return undefined
  const n = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(n) ? n : undefined
}

/**
 * Pick the display currency row: prefer CNY, else the first entry.
 * @param infos - parsed `balance_infos` array.
 * @returns the selected row, or `undefined` when the array is empty or invalid.
 */
export function selectBalanceRow(infos: unknown): BalanceInfoWire | undefined {
  if (!Array.isArray(infos) || infos.length === 0) return undefined
  const rows = infos.filter((row): row is BalanceInfoWire =>
    typeof row === 'object' && row !== null)
  const cny = rows.find(row => row.currency === 'CNY')
  return cny ?? rows[0]
}

/** Normalize a provider balance payload into {@link BalanceInfo}. */
export function parseBalancePayload(payload: unknown): BalanceInfo {
  if (typeof payload !== 'object' || payload === null) {
    return { isAvailable: false, reason: 'malformed' }
  }
  const wire = payload as BalanceWire
  if (wire.is_available !== true) {
    const message = typeof wire.message === 'string' && wire.message.length > 0 ? wire.message : 'unavailable'
    return { isAvailable: false, reason: message.startsWith('api:') ? message : `api:${message}` }
  }
  const row = selectBalanceRow(wire.balance_infos)
  if (row === undefined) {
    return { isAvailable: false, reason: 'malformed' }
  }
  const total = finiteNumber(row.total_balance)
  const granted = finiteNumber(row.granted_balance)
  const charged = finiteNumber(row.topped_up_balance)
  if (total === undefined || granted === undefined || charged === undefined) {
    return { isAvailable: false, reason: 'malformed' }
  }
  return {
    isAvailable: true,
    totalBalance: total,
    chargedBalance: charged,
    grantedBalance: granted,
    ...(typeof row.currency === 'string' && row.currency.length > 0 ? { currency: row.currency } : {}),
  }
}

/**
 * Read the account balance from the provider.
 * @param baseURL - provider endpoint without a trailing slash.
 * @param apiKey - resolved credential value; empty or undefined yields `missing-credential`.
 * @param fetchImpl - HTTP implementation; defaults to global `fetch`.
 * @param signal - optional cancellation.
 * @returns the balance or an unavailable branch; never throws.
 */
export async function fetchBalance(
  baseURL: string,
  apiKey: string | undefined,
  fetchImpl: FetchBalance = fetch,
  signal?: AbortSignal,
): Promise<BalanceInfo> {
  if (apiKey === undefined || apiKey.length === 0) {
    return { isAvailable: false, reason: 'missing-credential' }
  }
  const url = `${baseURL.replace(/\/+$/u, '')}/user/balance`
  let response: Response
  try {
    response = await fetchImpl(url, {
      method: 'GET',
      headers: { Authorization: `Bearer ${apiKey}` },
      ...(signal === undefined ? {} : { signal }),
    })
  } catch {
    // Transport failure (DNS, refused, abort, CORS-equivalent): unavailable, not throw.
    return { isAvailable: false, reason: 'network' }
  }
  if (!response.ok) {
    return { isAvailable: false, reason: `http:${String(response.status)}` }
  }
  let payload: unknown
  try {
    payload = await response.json()
  } catch {
    return { isAvailable: false, reason: 'malformed' }
  }
  return parseBalancePayload(payload)
}
