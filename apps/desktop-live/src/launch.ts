/**
 * Pure launch helpers for the desktop shell: repo-root resolution, free-port
 * selection, spawn argument construction, rebuild gating, and health polling.
 * Unit-tested without Electron.
 * @module @deepseek-ai/dsh-desktop/launch
 */

import { createServer } from 'node:net'
import { dirname, join, resolve } from 'node:path'

/** Product title used by the BrowserWindow and document.title. */
export const PRODUCT_TITLE = 'DeepSeek Halyard'

/** Default bind host for the spawned `dsh web` server. */
export const DEFAULT_HOST = '127.0.0.1'

/**
 * Preferred loopback port for the spawned `dsh web` server. Browser-local
 * preferences (localStorage) are origin-scoped, so a port that changes per
 * launch presents a fresh, empty origin and silently drops them.
 */
export const APP_PORT = 47654

/** Filesystem operations injected into pure path helpers for unit tests. */
export interface LaunchFs {
  /** Whether a path exists as a readable file or directory entry. */
  exists(path: string): boolean
  /** Read a UTF-8 file. */
  read(path: string): string
}

/** A process spawn plan: command, argv, and working directory. */
export interface SpawnPlan {
  /** Executable name resolved through PATH. */
  command: string
  /** Argument vector after the command. */
  args: readonly string[]
  /** Working directory for the child. */
  cwd: string
}

/**
 * Resolve the repository root that owns `pnpm dsh`.
 * Prefers `DSH_REPO`; otherwise walks up from `startDir` to the nearest
 * `package.json` whose `workspaces` field is present.
 * @param startDir - absolute directory to begin the upward walk.
 * @param env - process environment (or a test double).
 * @param fs - filesystem probe used for existence and manifest reads.
 * @returns absolute repository root.
 */
export function resolveRepoRoot(
  startDir: string,
  env: { DSH_REPO?: string | undefined },
  fs: LaunchFs,
): string {
  const fromEnv = env.DSH_REPO
  if (fromEnv !== undefined && fromEnv !== '') {
    const root = resolve(fromEnv)
    if (!fs.exists(join(root, 'package.json'))) {
      throw new Error(`DSH_REPO=${fromEnv} has no package.json`)
    }
    return root
  }
  let dir = resolve(startDir)
  for (;;) {
    const manifestPath = join(dir, 'package.json')
    if (fs.exists(manifestPath)) {
      let parsed: unknown
      try {
        parsed = JSON.parse(fs.read(manifestPath))
      } catch {
        throw new Error(`${manifestPath} is not valid JSON`)
      }
      if (parsed !== null && typeof parsed === 'object' && 'workspaces' in parsed) {
        return dir
      }
    }
    const parent = dirname(dir)
    if (parent === dir) {
      throw new Error(`no workspace package.json found above ${startDir}; set DSH_REPO`)
    }
    dir = parent
  }
}

/**
 * Probe one loopback port by binding and releasing it.
 * @param host - bind address.
 * @param port - port to bind; 0 selects an ephemeral port.
 * @returns the bound port.
 */
function probePort(host: string, port: number): Promise<number> {
  return new Promise((resolvePort, reject) => {
    const server = createServer()
    server.once('error', reject)
    server.listen(port, host, () => {
      const address = server.address()
      if (address === null || typeof address === 'string') {
        server.close(() => { reject(new Error('probePort: unexpected server address')) })
        return
      }
      const bound = address.port
      server.close((error) => {
        if (error) reject(error)
        else resolvePort(bound)
      })
    })
  })
}

/**
 * Bind an ephemeral loopback port and return it after the listener closes.
 * @param host - bind address; defaults to 127.0.0.1.
 * @returns a port that was free at sample time.
 */
export async function pickFreePort(host: string = DEFAULT_HOST): Promise<number> {
  return probePort(host, 0)
}

/**
 * Keep the stable app port when it is free, else fall back to an ephemeral
 * one. The stable origin is what lets browser-local preferences survive an
 * app restart.
 * @param host - bind address; defaults to 127.0.0.1.
 * @param preferred - port to keep when free; defaults to APP_PORT.
 * @returns the port the web server should bind.
 */
export async function pickStablePort(
  host: string = DEFAULT_HOST,
  preferred: number = APP_PORT,
): Promise<number> {
  try {
    return await probePort(host, preferred)
  } catch {
    return pickFreePort(host)
  }
}

/**
 * Build the `pnpm dsh web` spawn plan against a live repository root.
 * @param repoRoot - absolute repository root.
 * @param port - free port the server should bind.
 * @param host - bind host; defaults to 127.0.0.1.
 * @returns the spawn plan for the web server child.
 */
export function buildDshWebSpawn(repoRoot: string, port: number, host: string = DEFAULT_HOST): SpawnPlan {
  return {
    command: 'pnpm',
    args: ['dsh', 'web', '--host', host, '--port', String(port), '--no-open'],
    cwd: repoRoot,
  }
}

/**
 * Build the optional rebuild spawn plan (`pnpm run build`).
 * @param repoRoot - absolute repository root.
 * @returns the spawn plan for a full workspace build.
 */
export function buildRebuildSpawn(repoRoot: string): SpawnPlan {
  return {
    command: 'pnpm',
    args: ['run', 'build'],
    cwd: repoRoot,
  }
}

/**
 * Whether this launch should rebuild before starting the server.
 * @param env - process environment.
 * @returns true when `DSH_DESKTOP_REBUILD` is exactly `1`.
 */
export function shouldRebuild(env: { DSH_DESKTOP_REBUILD?: string | undefined }): boolean {
  return env.DSH_DESKTOP_REBUILD === '1'
}

/**
 * Canonical loopback URL for the window.
 * @param port - listening port.
 * @param host - bind host; defaults to 127.0.0.1.
 * @returns the health-checked URL.
 */
export function webUrl(port: number, host: string = DEFAULT_HOST): string {
  return `http://${host}:${String(port)}`
}

/** Match the readiness line `dsh web` prints after the Loader tree settles. */
const READY_LINE = /^dsh web: (https?:\/\/\S+)/u

/**
 * Extract the announced URL from one stdout line of `dsh web`.
 * @param line - a single stdout line (trailing newline optional).
 * @returns the announced URL, or undefined when the line is not a readiness signal.
 */
export function parseWebReadyLine(line: string): string | undefined {
  const match = READY_LINE.exec(line.trim())
  return match?.[1]
}

/** Options for {@link waitForHealth}. */
export interface WaitForHealthOptions {
  /** Overall deadline in milliseconds. */
  timeoutMs: number
  /** Delay between probes in milliseconds. */
  intervalMs: number
  /** Injectable fetch for unit tests. */
  fetchImpl?: typeof fetch
  /** Injectable sleep for unit tests. */
  sleepImpl?: (ms: number) => Promise<void>
  /** Injectable clock for unit tests. */
  nowImpl?: () => number
}

/**
 * Poll a URL until any HTTP response arrives (connection refused keeps polling).
 * @param url - absolute URL to probe.
 * @param options - deadline, interval, and optional injectables.
 * @returns the URL once ready; rejects when the deadline expires.
 */
export async function waitForHealth(url: string, options: WaitForHealthOptions): Promise<string> {
  const fetchImpl = options.fetchImpl ?? fetch
  const sleep = options.sleepImpl ?? ((ms: number) => new Promise<void>((done) => { setTimeout(done, ms) }))
  const now = options.nowImpl ?? Date.now
  const deadline = now() + options.timeoutMs
  for (;;) {
    try {
      await fetchImpl(url, { method: 'GET' })
      return url
    } catch {
      if (now() >= deadline) {
        throw new Error(`dsh-desktop: health check timed out for ${url} after ${String(options.timeoutMs)}ms`)
      }
      await sleep(options.intervalMs)
    }
  }
}
