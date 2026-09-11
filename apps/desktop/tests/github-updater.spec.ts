/** GitHub Releases updater: release parsing, version comparison, install flow. */

import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { DesktopUpdateState } from '../src/ipc.ts'

vi.mock('electron', () => ({
  app: { getVersion: () => '0.1.5-rc.2', relaunch: vi.fn(), exit: vi.fn() },
  shell: { showItemInFolder: vi.fn() },
}))

const { GithubUpdateCoordinator, parseLatestRelease } = await import('../src/github-updater.ts')

const roots: string[] = []
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }) })

function tempRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'halyard-updater-'))
  roots.push(root)
  return root
}

function releaseJson(version: string, assets: readonly { name: string; url: string }[]): Response {
  return new Response(JSON.stringify({
    tag_name: `v${version}`,
    assets: assets.map(asset => ({ name: asset.name, browser_download_url: asset.url })),
  }), { status: 200 })
}

describe('parseLatestRelease', () => {
  it('reads the version and prefers a zip archive, keeping the dmg fallback', () => {
    expect(parseLatestRelease({
      tag_name: 'v0.1.5-rc.2.halyard.2',
      assets: [
        { name: 'DeepSeek-Halyard-0.1.5-rc.2.halyard.2-mac-arm64.dmg', browser_download_url: 'https://x/dmg' },
        { name: 'DeepSeek-Halyard-0.1.5-rc.2.halyard.2-mac-arm64.zip', browser_download_url: 'https://x/zip' },
      ],
    })).toEqual({
      version: '0.1.5-rc.2.halyard.2',
      archive: { name: 'DeepSeek-Halyard-0.1.5-rc.2.halyard.2-mac-arm64.zip', url: 'https://x/zip' },
      diskImage: { name: 'DeepSeek-Halyard-0.1.5-rc.2.halyard.2-mac-arm64.dmg', url: 'https://x/dmg' },
    })
  })

  it('rejects malformed tags and payloads', () => {
    expect(parseLatestRelease({ tag_name: 'not-a-version' })).toBeUndefined()
    expect(parseLatestRelease({})).toBeUndefined()
    expect(parseLatestRelease(null)).toBeUndefined()
  })
})

describe('GithubUpdateCoordinator', () => {
  it('publishes available for a newer release and ready after install', async () => {
    const states: DesktopUpdateState[] = []
    const installArchive = vi.fn(async () => {})
    const relaunch = vi.fn()
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = input instanceof URL ? input.href : typeof input === 'string' ? input : input.url
      if (url.includes('api.github.com')) {
        return releaseJson('0.1.5-rc.2.halyard.2', [
          { name: 'DeepSeek-Halyard-0.1.5-rc.2.halyard.2-mac-arm64.zip', url: 'https://x/zip' },
        ])
      }
      return new Response('archive-bytes')
    })
    const updates = new GithubUpdateCoordinator({
      repo: 'YHanG505/halyard',
      publish: (state) => { states.push(state); return state },
      fetchImpl: fetchImpl,
      currentVersion: '0.1.5-rc.2',
      downloadRoot: tempRoot(),
      installArchive,
      relaunch,
    })

    await expect(updates.check()).resolves.toMatchObject({ phase: 'available', version: '0.1.5-rc.2.halyard.2' })
    await expect(updates.install()).resolves.toMatchObject({ phase: 'ready', version: '0.1.5-rc.2.halyard.2' })
    expect(installArchive).toHaveBeenCalledOnce()
    expect(relaunch).toHaveBeenCalledOnce()
    expect(states.map(state => state.phase)).toEqual(['checking', 'available', 'installing', 'ready'])
  })

  it('keeps idle when the release is not newer', async () => {
    const updates = new GithubUpdateCoordinator({
      repo: 'YHanG505/halyard',
      publish: state => state,
      fetchImpl: async () => releaseJson('0.1.5-rc.2', []),
      currentVersion: '0.1.5-rc.2',
      downloadRoot: tempRoot(),
    })
    await expect(updates.check()).resolves.toMatchObject({ phase: 'idle' })
  })

  it('keeps idle when the repository has no release and reports fetch failures', async () => {
    const empty = new GithubUpdateCoordinator({
      repo: 'YHanG505/halyard',
      publish: state => state,
      fetchImpl: async () => new Response('{}', { status: 404 }),
      currentVersion: '0.1.5-rc.2',
      downloadRoot: tempRoot(),
    })
    await expect(empty.check()).resolves.toMatchObject({ phase: 'idle' })

    const failing = new GithubUpdateCoordinator({
      repo: 'YHanG505/halyard',
      publish: state => state,
      fetchImpl: async () => { throw new Error('offline') },
      currentVersion: '0.1.5-rc.2',
      downloadRoot: tempRoot(),
    })
    await expect(failing.check()).resolves.toMatchObject({ phase: 'error', message: 'offline' })
  })
})
