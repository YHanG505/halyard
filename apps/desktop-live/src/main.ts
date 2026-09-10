/**
 * Electron main process for the Halyard desktop shell.
 * Owns window chrome only: it spawns the live `dsh web` server from the
 * resolved repository, waits for health, loads the URL, and tears the child
 * process tree down on quit.
 * @module @deepseek-ai/dsh-desktop/main
 */

import { spawn, type ChildProcess } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { app, BrowserWindow } from 'electron'
import {
  buildDshWebSpawn,
  buildRebuildSpawn,
  DEFAULT_HOST,
  parseWebReadyLine,
  pickStablePort,
  PRODUCT_TITLE,
  resolveRepoRoot,
  shouldRebuild,
  waitForHealth,
  type SpawnPlan,
} from './launch.ts'

/** Grace period after SIGTERM before SIGKILL on the process group. */
const KILL_GRACE_MS = 5_000

/** Health-poll deadline for the spawned server. */
const HEALTH_TIMEOUT_MS = 60_000

/** Health-poll interval. */
const HEALTH_INTERVAL_MS = 250

/** Launch-time filesystem probe. */
const launchFs = {
  exists: (path: string) => existsSync(path),
  read: (path: string) => readFileSync(path, 'utf8'),
}

/** This file's directory (apps/desktop/src), used as the repo-walk start. */
const entryDir = dirname(fileURLToPath(import.meta.url))

/** The same artwork supplies the bundle icon and the source-mode Dock icon. */
const dockIconPath = join(entryDir, '../assets/icon.png')

/** Apply the product artwork when running Electron directly from source. */
function applyAppIcon(): void {
  if (process.platform === 'darwin' && launchFs.exists(dockIconPath)) {
    app.dock?.setIcon(dockIconPath)
  }
}

let server: ChildProcess | undefined
let killTimer: ReturnType<typeof setTimeout> | undefined

/**
 * Run one spawn plan to completion, streaming stdio to this process.
 * @param plan - command, args, and cwd.
 * @returns a promise that resolves on exit code 0 and rejects otherwise.
 */
function runToCompletion(plan: SpawnPlan): Promise<void> {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(plan.command, [...plan.args], {
      cwd: plan.cwd,
      stdio: ['ignore', 'inherit', 'inherit'],
      env: process.env,
    })
    child.once('error', reject)
    child.once('close', (code) => {
      if (code === 0) resolvePromise()
      else reject(new Error(`${plan.command} ${plan.args.join(' ')} exited with code ${String(code)}`))
    })
  })
}

/**
 * Start `dsh web` in its own process group so quit can signal the whole tree.
 * @param plan - spawn plan from {@link buildDshWebSpawn}.
 * @returns the detached child with piped stdout.
 */
function spawnServer(plan: SpawnPlan): ChildProcess {
  return spawn(plan.command, [...plan.args], {
    cwd: plan.cwd,
    detached: true,
    stdio: ['ignore', 'pipe', 'inherit'],
    env: process.env,
  })
}

/**
 * Resolve the URL announced on the spawned server's stdout. The line carries
 * the session token the Web surface requires, so the constructed host:port
 * URL alone would be rejected.
 * @param child - the spawned `dsh web` process.
 * @param timeoutMs - deadline for the readiness line.
 * @returns the announced URL, token included.
 */
function waitForReadyUrl(child: ChildProcess, timeoutMs: number): Promise<string> {
  return new Promise((resolvePromise, reject) => {
    let buffer = ''
    const timer = setTimeout(() => {
      cleanup()
      reject(new Error(`dsh web did not announce its URL within ${String(timeoutMs)}ms`))
    }, timeoutMs)
    const onData = (chunk: Buffer | string): void => {
      const text = String(chunk)
      process.stdout.write(text)
      buffer += text
      for (;;) {
        const index = buffer.indexOf('\n')
        if (index < 0) return
        const line = buffer.slice(0, index)
        buffer = buffer.slice(index + 1)
        const url = parseWebReadyLine(line)
        if (url !== undefined) {
          cleanup()
          resolvePromise(url)
          return
        }
      }
    }
    const onExit = (): void => {
      cleanup()
      reject(new Error('dsh web exited before announcing its URL'))
    }
    const cleanup = (): void => {
      clearTimeout(timer)
      child.stdout?.off('data', onData)
      child.off('exit', onExit)
    }
    child.stdout?.on('data', onData)
    child.once('exit', onExit)
  })
}

/** Escalate SIGTERM → SIGKILL against the child's process group. */
function killServerTree(): void {
  const child = server
  server = undefined
  if (child?.pid === undefined) return
  const pid = child.pid
  const signalGroup = (signal: NodeJS.Signals): void => {
    try {
      if (process.platform === 'win32') {
        spawn('taskkill', ['/pid', String(pid), '/T', '/F'], { stdio: 'ignore' })
      } else {
        process.kill(-pid, signal)
      }
    } catch {
      // Process group already gone.
    }
  }
  signalGroup('SIGTERM')
  killTimer = setTimeout(() => { signalGroup('SIGKILL') }, KILL_GRACE_MS)
  killTimer.unref()
}

/** Create the product window once the server URL is healthy. */
function openWindow(url: string): void {
  const window = new BrowserWindow({
    title: PRODUCT_TITLE,
    width: 1280,
    height: 840,
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  })
  void window.loadURL(url)
}

/** Boot: single-instance lock, optional rebuild, spawn, health, window. */
async function main(): Promise<void> {
  const gotLock = app.requestSingleInstanceLock()
  if (!gotLock) {
    app.quit()
    return
  }
  app.on('second-instance', () => {
    const [window] = BrowserWindow.getAllWindows()
    if (window !== undefined) {
      if (window.isMinimized()) window.restore()
      window.focus()
    }
  })

  await app.whenReady()
  applyAppIcon()

  const repoRoot = resolveRepoRoot(entryDir, process.env, launchFs)
  if (shouldRebuild(process.env)) {
    console.log('dsh-desktop: DSH_DESKTOP_REBUILD=1 — running pnpm run build')
    await runToCompletion(buildRebuildSpawn(repoRoot))
  }

  const port = await pickStablePort(DEFAULT_HOST)
  const plan = buildDshWebSpawn(repoRoot, port, DEFAULT_HOST)
  console.log(`dsh-desktop: starting ${plan.command} ${plan.args.join(' ')} in ${plan.cwd}`)
  server = spawnServer(plan)
  const launched = server
  server.once('exit', (code) => {
    if (server !== undefined) {
      console.error(`dsh-desktop: dsh web exited unexpectedly with code ${String(code)}`)
      app.quit()
    }
  })

  let url: string
  try {
    url = await waitForReadyUrl(launched, HEALTH_TIMEOUT_MS)
    await waitForHealth(url, { timeoutMs: HEALTH_TIMEOUT_MS, intervalMs: HEALTH_INTERVAL_MS })
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    console.error(reason)
    killServerTree()
    app.quit()
    return
  }

  openWindow(url)

  app.on('window-all-closed', () => {
    app.quit()
  })
  app.on('before-quit', () => {
    killServerTree()
  })
}

void main().catch((error: unknown) => {
  const reason = error instanceof Error ? error.message : String(error)
  console.error(`dsh-desktop: ${reason}`)
  killServerTree()
  app.exit(1)
})
