/**
 * GitHub Releases updater for unsigned desktop builds.
 *
 * The signed release stream uses electron-updater against a packaged
 * `app-update.yml`; an unsigned local build has no feed, so this coordinator
 * checks the repository's latest GitHub release instead, downloads its
 * platform archive, swaps the running application bundle, and relaunches.
 * The public surface matches {@link DesktopUpdateCoordinator} so the shell
 * wires either coordinator through the same IPC channels.
 * @module @deepseek-ai/dsh-desktop/github-updater
 */

import { spawn } from 'node:child_process'
import { accessSync, constants, createWriteStream, mkdirSync, readdirSync, renameSync, rmSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { app, shell } from 'electron'
import semver from 'semver'
import type { DesktopUpdateState } from './ipc.ts'

/** The default fork repository whose releases carry desktop artifacts. */
export const DEFAULT_UPDATE_REPO = 'YHanG505/halyard'

/** One release asset the updater may download. */
interface ReleaseAsset {
  readonly name: string
  readonly url: string
}

/** Parsed latest-release facts. */
export interface LatestRelease {
  readonly version: string
  /** Platform archive preferred for in-place replacement. */
  readonly archive?: ReleaseAsset
  /** Disk image offered when in-place replacement is not possible. */
  readonly diskImage?: ReleaseAsset
}

/** Options for one desktop GitHub updater. */
export interface GithubUpdaterOptions {
  /** `owner/repository` hosting the releases. */
  readonly repo: string
  /** State sink shared with the shell's IPC publisher. */
  readonly publish: (state: DesktopUpdateState) => DesktopUpdateState
  /** Stop application-owned processes before the relaunch. */
  readonly beforeRestart?: () => Promise<void>
  /** Download cache root; defaults to the user cache directory. */
  readonly downloadRoot?: string
  /** Test seam: replace the download URL fetch. */
  readonly fetchImpl?: typeof fetch
  /** Test seam: replace the bundle swap; returns the published ready state. */
  readonly installArchive?: (archivePath: string, version: string) => Promise<void>
  /** Test seam: replace process relaunch. */
  readonly relaunch?: () => void
  /** Current application version; defaults to `app.getVersion()`. */
  readonly currentVersion?: string
}

/** Parse the GitHub release JSON into the facts the updater needs. */
export function parseLatestRelease(value: unknown): LatestRelease | undefined {
  if (typeof value !== 'object' || value === null) return undefined
  const tag = (value as { tag_name?: unknown }).tag_name
  if (typeof tag !== 'string' || tag === '') return undefined
  const version = semver.valid(tag.replace(/^v/u, '')) ?? undefined
  if (version === undefined) return undefined
  const assets = (value as { assets?: unknown }).assets
  const parsed: ReleaseAsset[] = []
  if (Array.isArray(assets)) {
    for (const asset of assets as readonly unknown[]) {
      if (typeof asset !== 'object' || asset === null) continue
      const name = (asset as { name?: unknown }).name
      const url = (asset as { browser_download_url?: unknown }).browser_download_url
      if (typeof name === 'string' && typeof url === 'string') parsed.push({ name, url })
    }
  }
  const archive = parsed.find(asset => asset.name.endsWith('.zip'))
  const diskImage = parsed.find(asset => asset.name.endsWith('.dmg'))
  return {
    version,
    ...(archive === undefined ? {} : { archive }),
    ...(diskImage === undefined ? {} : { diskImage }),
  }
}

/** Run one system helper to completion. */
function run(command: string, args: readonly string[]): Promise<void> {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, [...args], { stdio: 'ignore' })
    child.once('error', reject)
    child.once('close', (code) => {
      if (code === 0) resolvePromise()
      else reject(new Error(`${command} exited with ${String(code)}`))
    })
  })
}

/** The running application bundle root, derived from the executable path. */
export function applicationBundleRoot(execPath: string = process.execPath): string {
  return resolve(dirname(execPath), '..', '..')
}

/**
 * Unpack one archive and replace the running application bundle in place.
 * @param archivePath - downloaded `.zip` containing the new application.
 * @returns true when the swap succeeded; false when the bundle is not writable.
 */
async function replaceApplicationBundle(archivePath: string): Promise<boolean> {
  const bundleRoot = applicationBundleRoot()
  if (!bundleRoot.endsWith('.app')) throw new Error(`desktop update: unexpected application path ${bundleRoot}`)
  try {
    accessSync(dirname(bundleRoot), constants.W_OK)
  } catch {
    return false
  }
  const staging = join(dirname(archivePath), `staging-${String(process.pid)}`)
  rmSync(staging, { recursive: true, force: true })
  mkdirSync(staging, { recursive: true })
  await run('/usr/bin/ditto', ['-x', '-k', archivePath, staging])
  const incomingName = readdirSync(staging).find(name => name.endsWith('.app'))
  if (incomingName === undefined) throw new Error('desktop update: archive contains no application bundle')
  const incoming = join(staging, incomingName)
  await run('/usr/bin/xattr', ['-cr', incoming])
  const previous = `${bundleRoot}.previous-${String(process.pid)}`
  renameSync(bundleRoot, previous)
  try {
    renameSync(incoming, bundleRoot)
  } catch (error) {
    renameSync(previous, bundleRoot)
    throw error
  }
  rmSync(previous, { recursive: true, force: true })
  rmSync(staging, { recursive: true, force: true })
  return true
}

/** Manual GitHub Releases update coordinator. */
export class GithubUpdateCoordinator {
  private available: LatestRelease | undefined
  private latestState: DesktopUpdateState = { phase: 'idle' }
  private checkOperation: Promise<DesktopUpdateState> | undefined
  private installOperation: Promise<DesktopUpdateState> | undefined

  /**
   * @param options - repository, state sink, and test seams.
   */
  constructor(private readonly options: GithubUpdaterOptions) {}

  /** Current published state. */
  state(): DesktopUpdateState {
    return this.latestState
  }

  /** Check the repository's latest release. */
  async check(): Promise<DesktopUpdateState> {
    if (this.checkOperation !== undefined) return this.checkOperation
    this.checkOperation = this.doCheck().finally(() => { this.checkOperation = undefined })
    return this.checkOperation
  }

  /** Download and install the retained release, then relaunch. */
  async install(): Promise<DesktopUpdateState> {
    if (this.installOperation !== undefined) return this.installOperation
    this.installOperation = this.doInstall().finally(() => { this.installOperation = undefined })
    return this.installOperation
  }

  private publish(state: DesktopUpdateState): DesktopUpdateState {
    this.latestState = state
    return this.options.publish(state)
  }

  private async doCheck(): Promise<DesktopUpdateState> {
    this.publish({ phase: 'checking' })
    try {
      const fetchImpl = this.options.fetchImpl ?? fetch
      const response = await fetchImpl(`https://api.github.com/repos/${this.options.repo}/releases/latest`, {
        headers: { accept: 'application/vnd.github+json', 'user-agent': 'DeepSeek-Halyard' },
      })
      if (response.status === 404) {
        this.available = undefined
        return this.publish({ phase: 'idle', message: 'no published release' })
      }
      if (!response.ok) throw new Error(`GitHub release check failed: HTTP ${String(response.status)}`)
      const release = parseLatestRelease(await response.json())
      if (release === undefined) {
        this.available = undefined
        return this.publish({ phase: 'idle', message: 'latest release carries no usable version' })
      }
      const current = this.options.currentVersion ?? app.getVersion()
      if (!semver.gt(release.version, current)) {
        this.available = undefined
        return this.publish({ phase: 'idle', message: current })
      }
      this.available = release
      return this.publish({ phase: 'available', version: release.version })
    } catch (error) {
      this.available = undefined
      return this.publish({
        phase: 'error',
        message: error instanceof Error ? error.message : String(error),
      })
    }
  }

  private async doInstall(): Promise<DesktopUpdateState> {
    const release = this.available
    if (release === undefined) throw new Error('desktop update: no verified update is available')
    this.publish({ phase: 'installing', version: release.version })
    const root = this.options.downloadRoot
      ?? join(homedir(), 'Library', 'Caches', 'DeepSeek Halyard', 'updates')
    try {
      if (release.archive === undefined) {
        // No in-place archive: open the disk image for a manual drag install.
        if (release.diskImage !== undefined) {
          const target = join(root, release.diskImage.name)
          await this.download(release.diskImage, target)
          shell.showItemInFolder(target)
        }
        return this.publish({
          phase: 'error',
          version: release.version,
          message: 'release has no archive for in-place update; install the opened disk image manually',
        })
      }
      const archivePath = join(root, release.version, release.archive.name)
      await this.download(release.archive, archivePath)
      const installed = this.options.installArchive !== undefined
        ? (await this.options.installArchive(archivePath, release.version), true)
        : await replaceApplicationBundle(archivePath)
      if (!installed) {
        shell.showItemInFolder(archivePath)
        return this.publish({
          phase: 'error',
          version: release.version,
          message: 'application folder is not writable; install the unpacked app manually',
        })
      }
      this.available = undefined
      const ready = this.publish({ phase: 'ready', version: release.version })
      await this.options.beforeRestart?.()
      ;(this.options.relaunch ?? (() => { app.relaunch(); app.exit(0) }))()
      return ready
    } catch (error) {
      return this.publish({
        phase: 'error',
        version: release.version,
        message: error instanceof Error ? error.message : String(error),
      })
    }
  }

  private async download(asset: ReleaseAsset, target: string): Promise<void> {
    mkdirSync(dirname(target), { recursive: true })
    const response = await (this.options.fetchImpl ?? fetch)(asset.url, {
      headers: { 'user-agent': 'DeepSeek-Halyard' },
      redirect: 'follow',
    })
    if (!response.ok || response.body === null) {
      throw new Error(`download failed: HTTP ${String(response.status)}`)
    }
    await pipeline(Readable.fromWeb(response.body as import('node:stream/web').ReadableStream), createWriteStream(target))
  }
}
