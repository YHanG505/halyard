#!/usr/bin/env node
/**
 * Compile the Electron main process to plain JavaScript under `dist/`.
 *
 * Electron cannot load TypeScript at runtime through tsx: esbuild's service
 * binary fails to spawn from Electron's main process (ENOEXEC). Compiling
 * ahead of launch keeps the Electron process loader-free.
 * @module @deepseek-ai/dsh-desktop/build
 */

import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const packageDir = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const require = createRequire(import.meta.url)
const tsc = require.resolve('typescript/bin/tsc')

const result = spawnSync(process.execPath, [tsc, '-p', join(packageDir, 'tsconfig.build.json')], {
  stdio: 'inherit',
  cwd: packageDir,
})
if (result.status !== 0) {
  console.error('dsh-desktop: main-process compilation failed')
  process.exit(result.status ?? 1)
}

console.log(`dsh-desktop: built ${join(packageDir, 'dist/main.js')}`)
