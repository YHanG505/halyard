/** Project-free first-send promotion eligibility. */

import { describe, expect, it } from 'vitest'
import type { SessionSummary } from '@deepseek-ai/dsh-api-session-controller/client'
import { isProjectFreeFirstSend } from '../src/client/input/hub.ts'

/** One list summary with defaults that already qualify for promotion. */
function summary(overrides: Partial<SessionSummary> = {}): SessionSummary {
  return {
    id: 'session-1' as never,
    displayTitle: 'session-1',
    running: false,
    blank: true,
    updatedAt: 1,
    ...overrides,
  }
}

describe('isProjectFreeFirstSend', () => {
  it('accepts a blank Session with no directory and no subagent origin', () => {
    expect(isProjectFreeFirstSend(summary())).toBe(true)
  })

  it('rejects a chosen directory, a non-blank log, a subagent, or no summary', () => {
    expect(isProjectFreeFirstSend(summary({ cwd: '/workspace' }))).toBe(false)
    expect(isProjectFreeFirstSend(summary({ blank: false }))).toBe(false)
    expect(isProjectFreeFirstSend(summary({ origin: 'subagent' }))).toBe(false)
    expect(isProjectFreeFirstSend(undefined)).toBe(false)
  })
})
