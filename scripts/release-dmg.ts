/**
 * Build and publish the local DMG + ZIP as a GitHub release.
 *
 * Usage:
 *   pnpm run release:dsh 0.1.5-rc.2.halyard.1   # bump the family version first
 *   GITHUB_TOKEN=<token> pnpm run release:dmg    # build and upload at that version
 *
 * The release version is the workspace version, so the runtime, the app, and
 * the update check agree end to end. It must sort above the currently
 * installed build in semver order: prerelease identifiers compare
 * alphabetically after the shared prefix, so `0.1.5-rc.2.halyard.2` is newer
 * than `0.1.5-rc.2.halyard.1`, and both are newer than `0.1.5-rc.2`.
 * @module scripts/release-dmg
 */

import { createReadStream, existsSync, readFileSync, readdirSync } from 'node:fs'
import { basename, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const repoRoot = resolve(fileURLToPath(new URL('.', import.meta.url)), '..')
const defaultRepo = 'YHanG505/halyard'

/** One asset uploaded to the release. */
interface ReleaseAsset {
  readonly path: string
  readonly contentType: string
}

/** Read `--repo owner/name` from argv. */
function resolveRepo(): string {
  const index = process.argv.indexOf('--repo')
  if (index < 0) return defaultRepo
  const value = process.argv[index + 1]
  if (value === undefined || !value.includes('/')) throw new Error('release-dmg: --repo needs an owner/name value')
  return value
}

/** Send one GitHub API request with the bearer token. */
async function github(url: string, token: string, init: RequestInit = {}): Promise<Response> {
  const response = await fetch(url, {
    ...init,
    headers: {
      accept: 'application/vnd.github+json',
      authorization: `Bearer ${token}`,
      'user-agent': 'DeepSeek-Halyard',
      ...init.headers,
    },
  })
  return response
}

/** Find or create the release for one tag. */
async function resolveRelease(repo: string, tag: string, token: string, version: string): Promise<{ id: number; html_url: string }> {
  const existing = await github(`https://api.github.com/repos/${repo}/releases/tags/${encodeURIComponent(tag)}`, token)
  if (existing.ok) return await existing.json() as { id: number; html_url: string }
  if (existing.status !== 404) {
    throw new Error(`release-dmg: release lookup failed with HTTP ${String(existing.status)}`)
  }
  const created = await github(`https://api.github.com/repos/${repo}/releases`, token, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      tag_name: tag,
      name: `DeepSeek Halyard ${version}`,
      body: `Unsigned macOS build of DeepSeek Halyard ${version}. First launch needs right-click → Open.`,
      draft: false,
      prerelease: false,
    }),
  })
  if (!created.ok) {
    throw new Error(`release-dmg: release creation failed with HTTP ${String(created.status)}: ${await created.text()}`)
  }
  return await created.json() as { id: number; html_url: string }
}

/** Upload one asset unless the release already carries that file name. */
async function uploadAsset(repo: string, releaseId: number, token: string, asset: ReleaseAsset): Promise<void> {
  const name = basename(asset.path)
  const listed = await github(`https://api.github.com/repos/${repo}/releases/${releaseId}/assets?per_page=100`, token)
  if (!listed.ok) throw new Error(`release-dmg: asset listing failed with HTTP ${String(listed.status)}`)
  const assets = await listed.json() as readonly { name?: unknown }[]
  if (assets.some(entry => entry.name === name)) {
    console.log(`release-dmg: ${name} already uploaded; leaving it in place`)
    return
  }
  const response = await github(
    `https://uploads.github.com/repos/${repo}/releases/${String(releaseId)}/assets?name=${encodeURIComponent(name)}`,
    token,
    {
      method: 'POST',
      headers: { 'content-type': asset.contentType },
      body: createReadStream(asset.path) as unknown as BodyInit,
      duplex: 'half',
    } as RequestInit & { duplex: 'half' },
  )
  if (!response.ok) {
    throw new Error(`release-dmg: upload of ${name} failed with HTTP ${String(response.status)}: ${await response.text()}`)
  }
  console.log(`release-dmg: uploaded ${name}`)
}

async function main(): Promise<void> {
  const token = process.env.GITHUB_TOKEN
  if (token === undefined || token === '') throw new Error('release-dmg: set GITHUB_TOKEN to a token with repo release access')
  const repo = resolveRepo()
  const manifest = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8')) as { version: string }
  const version = manifest.version
  if (process.env.HALYARD_VERSION !== undefined && process.env.HALYARD_VERSION !== version) {
    throw new Error(
      `release-dmg: HALYARD_VERSION ${process.env.HALYARD_VERSION} differs from the workspace version ${version}; `
      + `run "pnpm run release:dsh ${process.env.HALYARD_VERSION}" first`,
    )
  }

  const build = spawnSync('pnpm', ['run', 'dmg'], { cwd: repoRoot, stdio: 'inherit' })
  if (build.error !== undefined) throw build.error
  if (build.status !== 0) throw new Error(`release-dmg: dmg build exited with ${String(build.status ?? build.signal)}`)

  const outputRoot = join(repoRoot, 'dist', 'dmg')
  if (!existsSync(outputRoot)) throw new Error(`release-dmg: ${outputRoot} is missing`)
  const files = readdirSync(outputRoot)
  const assets: ReleaseAsset[] = []
  for (const name of files) {
    if (name.endsWith('.dmg')) assets.push({ path: join(outputRoot, name), contentType: 'application/x-apple-diskimage' })
    else if (name.endsWith('.zip')) assets.push({ path: join(outputRoot, name), contentType: 'application/zip' })
  }
  if (assets.length === 0) throw new Error(`release-dmg: no DMG or ZIP found under ${outputRoot}`)

  const tag = `v${version}`
  const release = await resolveRelease(repo, tag, token, version)
  for (const asset of assets) await uploadAsset(repo, release.id, token, asset)
  console.log(`release-dmg: published ${release.html_url}`)
}

await main()
