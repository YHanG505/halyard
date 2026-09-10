#!/usr/bin/env node
/**
 * Build a double-clickable macOS .app that launches the live dsh web shell
 * from this repository, then optionally copy it to /Applications.
 *
 * Usage:
 *   node scripts/install-macos.mjs              # build + copy to /Applications
 *   node scripts/install-macos.mjs --build-only
 *   DSH_REPO=/abs/repo node scripts/install-macos.mjs
 * @module @deepseek-ai/dsh-desktop-live/install-macos
 */

import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const packageDir = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const repoRoot = resolve(packageDir, '../..')
const appName = 'DeepSeek Harness'
const appDirName = `${appName}.app`
const outRoot = join(packageDir, 'dist-macos')
const appRoot = join(outRoot, appDirName)
const applicationsPath = `/Applications/${appDirName}`
const buildOnly = process.argv.includes('--build-only')
const dshRepo = process.env.DSH_REPO !== undefined && process.env.DSH_REPO !== ''
  ? resolve(process.env.DSH_REPO)
  : repoRoot

const build = spawnSync(process.execPath, [join(packageDir, 'scripts/build.mjs')], { stdio: 'inherit' })
if (build.status !== 0) {
  console.error('install-macos: main-process build failed')
  process.exit(build.status ?? 1)
}

const electronBinary = join(packageDir, 'node_modules/electron/dist/Electron.app/Contents/MacOS/Electron')
if (!existsSync(electronBinary)) {
  console.error(`install-macos: missing Electron binary at ${electronBinary}`)
  console.error('run `pnpm install` in the workspace root, then `node apps/desktop-live/node_modules/electron/install.js` if needed')
  process.exit(1)
}

const pathEntries = [
  '/opt/homebrew/bin',
  '/usr/local/bin',
  '/usr/bin',
  '/bin',
  `${process.env.HOME ?? ''}/.local/bin`,
].filter(entry => entry.length > 0)

const electronApp = resolve(dirname(electronBinary), '../..')
const resources = join(appRoot, 'Contents/Resources')
const entryDir = join(resources, 'app')
const iconSource = join(packageDir, 'assets/icon.icns')
if (!existsSync(iconSource)) {
  throw new Error('install-macos: missing assets/icon.icns; run scripts/generate-icon.sh')
}

rmSync(appRoot, { recursive: true, force: true })
cpSync(electronApp, appRoot, { recursive: true, verbatimSymlinks: true })
mkdirSync(entryDir, { recursive: true })
cpSync(iconSource, join(resources, 'icon.icns'))
writeFileSync(join(entryDir, 'package.json'), JSON.stringify({
  name: 'dsh-desktop', productName: appName, version: '0.1.0', type: 'module', main: 'boot.mjs',
}, null, 2) + '\n')
writeFileSync(join(entryDir, 'boot.mjs'), `import { app, dialog } from 'electron'
app.setName(${JSON.stringify(appName)})
process.env.DSH_REPO = ${JSON.stringify(dshRepo)}
process.env.PATH = ${JSON.stringify(pathEntries.join(':'))} + ':' + (process.env.PATH ?? '')
try {
  await import(${JSON.stringify(pathToFileURL(join(packageDir, 'dist/main.js')).href)})
} catch (error) {
  await app.whenReady()
  dialog.showErrorBox(${JSON.stringify(appName)}, String(error))
  app.quit()
}
`)

const plist = join(appRoot, 'Contents/Info.plist')
for (const [key, value] of Object.entries({
  CFBundleDisplayName: appName,
  CFBundleName: appName,
  CFBundleIdentifier: 'com.deepseek.dsh-desktop',
  CFBundleIconFile: 'icon.icns',
})) {
  const result = spawnSync('/usr/bin/plutil', ['-replace', key, '-string', value, plist], { stdio: 'inherit' })
  if (result.status !== 0) throw new Error(`install-macos: failed to set ${key}`)
}
// iCloud adds Finder metadata to copied bundles; codesign rejects that metadata.
const metadata = spawnSync('/usr/bin/xattr', ['-dr', 'com.apple.FinderInfo', appRoot], { stdio: 'inherit' })
if (metadata.status !== 0) throw new Error('install-macos: could not remove copied Finder metadata')
const signing = spawnSync('/usr/bin/codesign', ['--force', '--deep', '--sign', '-', '--timestamp=none', appRoot], {
  stdio: 'inherit',
})
if (signing.status !== 0) throw new Error('install-macos: local ad-hoc signing failed')

console.log(`install-macos: built ${appRoot}`)
console.log(`install-macos: DSH_REPO=${dshRepo}`)

if (buildOnly) {
  process.exit(0)
}

try {
  rmSync(applicationsPath, { recursive: true, force: true })
  cpSync(appRoot, applicationsPath, { recursive: true, verbatimSymlinks: true })
  console.log(`install-macos: installed ${applicationsPath}`)
  console.log('Double-click it from Applications, Spotlight, or Launchpad.')
} catch (error) {
  const reason = error instanceof Error ? error.message : String(error)
  console.error(`install-macos: could not write ${applicationsPath}: ${reason}`)
  console.error('Try: sudo node scripts/install-macos.mjs  (from apps/desktop)')
  process.exit(1)
}
