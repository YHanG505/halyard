/** Project-free conversation directory naming: safe single segments, unique allocation. */

import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createProjectFreeDirectory, projectFreeDirName } from '../src/project-free-dir.ts'

const roots: string[] = []
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }) })

function tempRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'project-free-dir-'))
  roots.push(root)
  return root
}

describe('projectFreeDirName', () => {
  it('keeps topic phrases readable, including CJK', () => {
    expect(projectFreeDirName('答辩ppt')).toBe('答辩ppt')
    expect(projectFreeDirName('Fix the login bug')).toBe('Fix-the-login-bug')
  })

  it('collapses separators, control characters, and reserved punctuation', () => {
    expect(projectFreeDirName('a/b\\c:d*e?f"g<h>i|j')).toBe('a-b-c-d-e-f-g-h-i-j')
    expect(projectFreeDirName('tab\tand\nnewline')).toBe('tab-and-newline')
    expect(projectFreeDirName('  spaced   out  ')).toBe('spaced-out')
  })

  it('never keeps traversal or leading/trailing dots', () => {
    expect(projectFreeDirName('../..')).toBe('session')
    expect(projectFreeDirName('.hidden.')).toBe('hidden')
  })

  it('falls back to session for empty or punctuation-only phrases', () => {
    expect(projectFreeDirName('')).toBe('session')
    expect(projectFreeDirName('///')).toBe('session')
  })

  it('truncates by code points so surrogate pairs stay whole', () => {
    expect(projectFreeDirName('a'.repeat(80))).toBe('a'.repeat(48))
    expect(Array.from(projectFreeDirName('😀'.repeat(80)))).toHaveLength(48)
    expect(projectFreeDirName('😀'.repeat(80))).not.toContain('\uFFFD')
  })
})

describe('createProjectFreeDirectory', () => {
  it('creates the topic directory under the root', () => {
    const root = tempRoot()
    const dir = createProjectFreeDirectory(root, '答辩ppt')
    expect(dir).toBe(join(root, '答辩ppt'))
    expect(existsSync(dir)).toBe(true)
  })

  it('suffixes collisions instead of reusing one directory', () => {
    const root = tempRoot()
    const first = createProjectFreeDirectory(root, 'topic')
    writeFileSync(join(first, 'kept.txt'), 'first')
    const second = createProjectFreeDirectory(root, 'topic')
    expect(second).toBe(join(root, 'topic-2'))
    expect(existsSync(join(first, 'kept.txt'))).toBe(true)
    expect(existsSync(second)).toBe(true)
    const third = createProjectFreeDirectory(root, 'topic')
    expect(third).toBe(join(root, 'topic-3'))
  })

  it('creates the root when it does not exist yet', () => {
    const root = join(tempRoot(), 'nested', 'output')
    const dir = createProjectFreeDirectory(root, 'topic')
    expect(dir).toBe(join(root, 'topic'))
    expect(existsSync(dir)).toBe(true)
  })

  it('keeps malicious topic phrases inside the root', () => {
    const root = tempRoot()
    const dir = createProjectFreeDirectory(root, '../../etc/passwd')
    expect(dir.startsWith(`${root}/`)).toBe(true)
    expect(dir).toBe(join(root, 'etc-passwd'))
  })
})
