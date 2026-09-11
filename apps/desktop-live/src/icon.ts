/** System appearance subscription for the live desktop Dock artwork. */
import { join } from 'node:path'

/** Appearance events used by the desktop icon, supplied by Electron nativeTheme. */
export interface IconAppearance {
  readonly shouldUseDarkColors: boolean
  on(event: 'updated', listener: () => void): unknown
  removeListener(event: 'updated', listener: () => void): unknown
}

/**
 * Apply artwork immediately and after each system appearance update.
 * @param theme - Electron's system appearance source.
 * @param setIcon - Dock image setter.
 * @param assets - directory containing both appearance images.
 * @returns disposer for the appearance subscription.
 */
export function installDockIcon(theme: IconAppearance, setIcon: (path: string) => void, assets: string): () => void {
  const update = (): void => { setIcon(join(assets, theme.shouldUseDarkColors ? 'icon-dark.png' : 'icon-light.png')) }
  update()
  theme.on('updated', update)
  return () => { theme.removeListener('updated', update) }
}
