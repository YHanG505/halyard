/**
 * Project-free conversation directories: one uniquely named folder per
 * conversation under the configured output root, named from the first topic
 * phrase. The name is a filesystem-safe single segment — separators, control
 * characters, and traversal prefixes never survive — and collisions take a
 * numeric suffix so conversations never share a directory.
 * @module @deepseek-ai/dsh-api-session-controller/project-free-dir
 */

import { existsSync, mkdirSync } from 'node:fs'
import { join, resolve, sep } from 'node:path'

/** Longest base name kept from a topic phrase, in code points. */
const MAX_BASE_CODE_POINTS = 48

/**
 * Derive one filesystem-safe directory name from a topic phrase. Unicode
 * letters and digits (including CJK) survive; path separators, control
 * characters, and reserved punctuation collapse to single dashes, and an
 * empty or punctuation-only phrase falls back to `session`.
 * @param phrase - the first user message or another topic phrase.
 * @returns a directory base name without separators or traversal.
 */
export function projectFreeDirName(phrase: string): string {
  const collapsed = phrase.normalize('NFKC')
    .replace(/[\\/:*?"<>|\u0000-\u001f\u007f]+/g, '-')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[.\-\s]+|[.\-\s]+$/g, '')
  const base = Array.from(collapsed).slice(0, MAX_BASE_CODE_POINTS).join('')
  return base === '' ? 'session' : base
}

/**
 * Allocate and create one unique conversation directory under the root.
 * @param root - absolute project-free output root.
 * @param phrase - topic phrase for the directory name.
 * @returns the created absolute directory path.
 */
export function createProjectFreeDirectory(root: string, phrase: string): string {
  const resolvedRoot = resolve(root)
  const base = projectFreeDirName(phrase)
  let candidate = join(resolvedRoot, base)
  for (let suffix = 2; existsSync(candidate); suffix += 1) {
    candidate = join(resolvedRoot, `${base}-${suffix}`)
  }
  /* v8 ignore next 3 -- defensive: the sanitized base is always one segment
     under the resolved root; this guards a future name rule from escaping it. */
  if (!candidate.startsWith(resolvedRoot + sep)) {
    throw new Error(`project-free directory escaped its root: ${candidate}`)
  }
  mkdirSync(candidate, { recursive: true })
  return candidate
}
