/** Built macOS application identity; run after `pack:macos`. */
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { test } from 'node:test'

const root = fileURLToPath(new URL('../dist-macos/DeepSeek Halyard.app/', import.meta.url))
const plist = JSON.parse(execFileSync('/usr/bin/plutil', [
  '-convert', 'json', '-o', '-', join(root, 'Contents/Info.plist'),
], { encoding: 'utf8' }))

test('the installed identity owns a Mach-O executable and Electron frameworks', () => {
  assert.equal(plist.CFBundleIdentifier, 'io.github.yhang505.halyard')
  assert.equal(plist.CFBundleName, 'DeepSeek Halyard')
  const binary = readFileSync(join(root, 'Contents/MacOS', plist.CFBundleExecutable))
  assert.equal(binary.readUInt32LE(0), 0xfeedfacf)
  assert.ok(existsSync(join(root, 'Contents/Frameworks/Electron Framework.framework')))
})

test('Finder and runtime use the same product icon assets', () => {
  assert.deepEqual(readFileSync(join(root, 'Contents/Resources', plist.CFBundleIconFile)),
    readFileSync(new URL('../assets/icon.icns', import.meta.url)))
  assert.ok(existsSync(join(root, 'Contents/Resources/app/package.json')))
  for (const name of ['icon-light.png', 'icon-dark.png']) {
    assert.deepEqual(readFileSync(join(root, 'Contents/Resources/icons', name)),
      readFileSync(new URL(`../assets/${name}`, import.meta.url)))
  }
})
