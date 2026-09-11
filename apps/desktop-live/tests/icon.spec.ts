/** Dock artwork follows appearance changes for the lifetime of the application. */
import { EventEmitter } from 'node:events'
import { describe, expect, it } from 'vitest'
import { installDockIcon } from '../src/icon.ts'

describe('Dock appearance', () => {
  it('updates when the system appearance changes and releases its listener', () => {
    const theme = Object.assign(new EventEmitter(), { shouldUseDarkColors: false })
    const paths: string[] = []
    const dispose = installDockIcon(theme, path => paths.push(path), '/icons')
    expect(paths).toEqual(['/icons/icon-light.png'])
    theme.shouldUseDarkColors = true
    theme.emit('updated')
    theme.shouldUseDarkColors = false
    theme.emit('updated')
    expect(paths).toEqual(['/icons/icon-light.png', '/icons/icon-dark.png', '/icons/icon-light.png'])
    dispose()
    theme.emit('updated')
    expect(paths).toHaveLength(3)
    expect(theme.listenerCount('updated')).toBe(0)
  })
})
