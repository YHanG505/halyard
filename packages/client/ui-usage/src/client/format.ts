/** Shared display formatting for the usage surfaces. */

/** DeepSeek platform top-up page opened by the recharge actions. */
export const TOP_UP_URL = 'https://platform.deepseek.com/top_up'

/** Compact integer / decimal token display. */
export function formatTokens(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}k`
  return String(value)
}

/** Currency display with two decimals. */
export function formatCny(value: number): string {
  return `¥${value.toFixed(2)}`
}
