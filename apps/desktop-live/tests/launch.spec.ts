/** Unit tests for desktop launch helpers — no Electron, no GUI. */

import { createServer, type Server } from 'node:net'
import { describe, expect, it } from 'vitest'
import {
  buildDshWebSpawn,
  buildRebuildSpawn,
  DEFAULT_HOST,
  parseWebReadyLine,
  pickFreePort,
  pickStablePort,
  PRODUCT_TITLE,
  resolveRepoRoot,
  shouldRebuild,
  waitForHealth,
  webUrl,
  type LaunchFs,
} from '../src/launch.ts'

function memoryFs(files: Record<string, string>): LaunchFs {
  return {
    exists: path => Object.prototype.hasOwnProperty.call(files, path),
    read: (path) => {
      const content = files[path]
      if (content === undefined) throw new Error(`missing ${path}`)
      return content
    },
  }
}

describe('resolveRepoRoot', () => {
  it('prefers DSH_REPO when it names a directory with package.json', () => {
    const fs = memoryFs({ '/repo/package.json': '{}' })
    expect(resolveRepoRoot('/elsewhere/deep', { DSH_REPO: '/repo' }, fs)).toBe('/repo')
  })

  it('rejects DSH_REPO without package.json', () => {
    const fs = memoryFs({})
    expect(() => resolveRepoRoot('/x', { DSH_REPO: '/missing' }, fs)).toThrow(/DSH_REPO/u)
  })

  it('walks up to the nearest workspace package.json', () => {
    const fs = memoryFs({
      '/repo/package.json': JSON.stringify({ workspaces: ['apps/*'] }),
      '/repo/apps/desktop/package.json': JSON.stringify({ name: 'dsh-desktop' }),
    })
    expect(resolveRepoRoot('/repo/apps/desktop/src', {}, fs)).toBe('/repo')
  })

  it('skips package.json files that declare no workspaces', () => {
    const fs = memoryFs({
      '/outer/package.json': JSON.stringify({ workspaces: ['apps/*'] }),
      '/outer/apps/desktop/package.json': JSON.stringify({ name: 'dsh-desktop' }),
    })
    expect(resolveRepoRoot('/outer/apps/desktop', {}, fs)).toBe('/outer')
  })

  it('throws when no workspace root exists above the start directory', () => {
    const fs = memoryFs({})
    expect(() => resolveRepoRoot('/nowhere', {}, fs)).toThrow(/DSH_REPO/u)
  })

  it('throws on a non-JSON manifest during the walk', () => {
    const fs = memoryFs({ '/bad/package.json': '{' })
    expect(() => resolveRepoRoot('/bad', {}, fs)).toThrow(/not valid JSON/u)
  })
})

describe('pickFreePort', () => {
  it('returns a bindable ephemeral port', async () => {
    const port = await pickFreePort()
    expect(port).toBeGreaterThan(0)
    expect(port).toBeLessThan(65_536)
    const probe: Server = createServer()
    await new Promise<void>((resolveListen, reject) => {
      probe.once('error', reject)
      probe.listen(port, DEFAULT_HOST, () => { resolveListen() })
    })
    await new Promise<void>((resolveClose, reject) => {
      probe.close((error) => { if (error) reject(error); else resolveClose() })
    })
  })
})

describe('pickStablePort', () => {
  it('keeps the preferred port when it is free', async () => {
    const preferred = await pickFreePort()
    await expect(pickStablePort(DEFAULT_HOST, preferred)).resolves.toBe(preferred)
  })

  it('falls back to an ephemeral port when the preferred one is taken', async () => {
    const held: Server = createServer()
    await new Promise<void>((resolveListen, reject) => {
      held.once('error', reject)
      held.listen(0, DEFAULT_HOST, () => { resolveListen() })
    })
    const address = held.address()
    if (address === null || typeof address === 'string') throw new Error('no bound address')
    try {
      const port = await pickStablePort(DEFAULT_HOST, address.port)
      expect(port).not.toBe(address.port)
      expect(port).toBeGreaterThan(0)
    } finally {
      await new Promise<void>((resolveClose, reject) => {
        held.close((error) => { if (error) reject(error); else resolveClose() })
      })
    }
  })
})

describe('spawn plans', () => {
  it('builds pnpm dsh web with host, free port, and --no-open', () => {
    expect(buildDshWebSpawn('/repo', 4311)).toEqual({
      command: 'pnpm',
      args: ['dsh', 'web', '--host', '127.0.0.1', '--port', '4311', '--no-open'],
      cwd: '/repo',
    })
  })

  it('honours a custom host', () => {
    expect(buildDshWebSpawn('/repo', 1, '0.0.0.0').args).toContain('--host')
    expect(buildDshWebSpawn('/repo', 1, '0.0.0.0').args).toContain('0.0.0.0')
  })

  it('builds the optional rebuild plan', () => {
    expect(buildRebuildSpawn('/repo')).toEqual({
      command: 'pnpm',
      args: ['run', 'build'],
      cwd: '/repo',
    })
  })
})

describe('shouldRebuild', () => {
  it('is true only for DSH_DESKTOP_REBUILD=1', () => {
    expect(shouldRebuild({ DSH_DESKTOP_REBUILD: '1' })).toBe(true)
    expect(shouldRebuild({ DSH_DESKTOP_REBUILD: '0' })).toBe(false)
    expect(shouldRebuild({ DSH_DESKTOP_REBUILD: 'true' })).toBe(false)
    expect(shouldRebuild({})).toBe(false)
  })
})

describe('webUrl and readiness parsing', () => {
  it('formats the loopback URL', () => {
    expect(webUrl(8080)).toBe('http://127.0.0.1:8080')
    expect(webUrl(9, 'localhost')).toBe('http://localhost:9')
  })

  it('parses the dsh web readiness line', () => {
    expect(parseWebReadyLine('dsh web: http://127.0.0.1:4311')).toBe('http://127.0.0.1:4311')
    expect(parseWebReadyLine('dsh web: http://127.0.0.1:4311 (LAN: http://10.0.0.2:4311)')).toBe('http://127.0.0.1:4311')
    expect(parseWebReadyLine('unrelated')).toBeUndefined()
  })
})

describe('waitForHealth', () => {
  const sleepImpl = async (): Promise<void> => {}

  it('resolves once fetch succeeds', async () => {
    let calls = 0
    const fetchImpl = async (): Promise<Response> => {
      calls += 1
      if (calls < 3) throw new Error('ECONNREFUSED')
      return new Response('ok', { status: 200 })
    }
    await expect(waitForHealth('http://127.0.0.1:1', {
      timeoutMs: 1_000,
      intervalMs: 1,
      fetchImpl: fetchImpl as typeof fetch,
      sleepImpl,
    })).resolves.toBe('http://127.0.0.1:1')
    expect(calls).toBe(3)
  })

  it('rejects when the deadline expires', async () => {
    const fetchImpl = async (): Promise<Response> => { throw new Error('ECONNREFUSED') }
    let now = 0
    await expect(waitForHealth('http://127.0.0.1:1', {
      timeoutMs: 50,
      intervalMs: 1,
      fetchImpl: fetchImpl as typeof fetch,
      sleepImpl,
      nowImpl: () => { now += 100; return now },
    })).rejects.toThrow(/health check timed out/u)
  })
})

describe('product title', () => {
  it('is DeepSeek Harness', () => {
    expect(PRODUCT_TITLE).toBe('DeepSeek Harness')
  })
})
