/**
 * Build a local unsigned `DeepSeek Halyard` app and DMG from this checkout.
 *
 * The official `apps/desktop` pipeline packs every workspace `dsh` package,
 * downloads the pinned Node runtime once, and assembles a self-contained
 * Electron app. This script runs it in the unsigned macOS mode, ad-hoc signs
 * the result, and writes DMG + ZIP next to each other under `dist/dmg/`.
 *
 * Usage:
 *   pnpm run dmg            # host architecture (arm64 on Apple Silicon)
 *   pnpm run dmg -- x64     # explicit architecture
 *
 * The first run downloads the Node runtime and third-party packages; later
 * runs reuse the caches under `apps/desktop/.desktop-build/`.
 * @module scripts/local-dmg
 */

import { spawnSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, symlinkSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const appRoot = join(repoRoot, 'apps', 'desktop')
const appId = 'io.github.yhang505.halyard'
const appName = 'DeepSeek Halyard'

/** Run one command to completion, inheriting stdio, or throw. */
function run(command: string, args: readonly string[], env: NodeJS.ProcessEnv, cwd = repoRoot): void {
  const result = spawnSync(command, [...args], { cwd, env, stdio: 'inherit' })
  if (result.error !== undefined) throw result.error
  if (result.status !== 0) throw new Error(`${command} ${args.join(' ')} exited with ${String(result.status ?? result.signal)}`)
}

function main(): void {
  const archArgument = process.argv[2] ?? (process.arch === 'arm64' ? 'arm64' : 'x64')
  if (archArgument !== 'arm64' && archArgument !== 'x64') {
    throw new Error(`local-dmg: unsupported architecture ${JSON.stringify(archArgument)}; use arm64 or x64`)
  }
  // Every workspace package shares the release-family version, and the bundle
  // verification binds it end to end; a release bumps it first through
  // `pnpm run release:dsh <version>`.
  const manifest = JSON.parse(readFileSync(join(appRoot, 'package.json'), 'utf8')) as { version: string }
  const version = manifest.version
  const buildEnv: NodeJS.ProcessEnv = {
    ...process.env,
    DSH_DESKTOP_APP_ID: process.env.DSH_DESKTOP_APP_ID ?? appId,
    DSH_DESKTOP_UNSIGNED: '1',
    DSH_DESKTOP_TARGET_PLATFORM: 'darwin',
    DSH_DESKTOP_TARGET_ARCH: archArgument,
    DSH_DESKTOP_REGISTRY: process.env.DSH_DESKTOP_REGISTRY ?? 'https://registry.npmmirror.com',
    // GitHub-hosted builder tool downloads are unreliable behind the local
    // proxy; the mirrors carry the same pinned artifacts.
    ELECTRON_MIRROR: process.env.ELECTRON_MIRROR ?? 'https://npmmirror.com/mirrors/electron/',
    ELECTRON_BUILDER_BINARIES_MIRROR: process.env.ELECTRON_BUILDER_BINARIES_MIRROR
      ?? 'https://npmmirror.com/mirrors/electron-builder-binaries/',
  }

  console.log(`local-dmg: building ${appName} ${version} (mac-${archArgument}, unsigned)`)
  run('pnpm', [
    '--dir', 'apps/desktop',
    'exec', 'tsx', 'scripts/package-target.ts', `mac-${archArgument}`, '--unsigned',
  ], buildEnv)

  const appPath = join(appRoot, '.desktop-build', 'targets', `mac-${archArgument}`, 'unsigned-artifacts', `mac-${archArgument}`, `${appName}.app`)
  if (!existsSync(appPath)) {
    throw new Error(`local-dmg: packaged app not found at ${appPath}`)
  }

  console.log('local-dmg: ad-hoc signing the application bundle')
  run('xattr', ['-cr', appPath], process.env)
  run('codesign', ['--force', '--deep', '--sign', '-', '--timestamp=none', appPath], process.env)
  run('codesign', ['--verify', '--deep', '--strict', appPath], process.env)

  const outputRoot = join(repoRoot, 'dist', 'dmg')
  rmSync(outputRoot, { recursive: true, force: true })
  mkdirSync(outputRoot, { recursive: true })
  const artifactBase = `DeepSeek-Halyard-${version}-mac-${archArgument}`

  const stage = join(appRoot, '.desktop-build', 'local-dmg-stage')
  rmSync(stage, { recursive: true, force: true })
  mkdirSync(stage, { recursive: true })
  cpSync(appPath, join(stage, `${appName}.app`), { recursive: true, verbatimSymlinks: true })
  symlinkSync('/Applications', join(stage, 'Applications'))
  const dmgPath = join(outputRoot, `${artifactBase}.dmg`)
  run('hdiutil', [
    'create',
    '-volname', appName,
    '-srcfolder', stage,
    '-ov',
    '-format', 'UDZO',
    dmgPath,
  ], process.env)
  rmSync(stage, { recursive: true, force: true })

  const zipPath = join(outputRoot, `${artifactBase}.zip`)
  run('ditto', ['-c', '-k', '--sequesterRsrc', '--keepParent', appPath, zipPath], process.env)

  console.log(`local-dmg: wrote ${dmgPath}`)
  console.log(`local-dmg: wrote ${zipPath}`)
  console.log('local-dmg: first launch needs right-click → Open (unsigned build)')
}

main()
