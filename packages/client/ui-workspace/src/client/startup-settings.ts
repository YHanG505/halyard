/**
 * Browser-local startup preferences for session creation, stored under the
 * `dsh.appStartup.*` localStorage keys. The rows rendered by
 * ui-settings-general write the same keys; both packages agree on the string
 * names, so keep them in sync when either side changes.
 */

/** Startup policy for the first page load. */
export interface StartupSettings {
  /** Open a fresh session on app open instead of restoring the last one. */
  newSessionOnOpen: boolean
  /** New sessions attach to the chosen default Workspace; otherwise project-free. */
  useDefaultWorkspace: boolean
  /** Workspace chosen as the New Session default. */
  defaultWorkspaceId: string
}

/** localStorage keys owned by the startup settings pair. */
export const STARTUP_KEYS = {
  newSessionOnOpen: 'dsh.appStartup.newSessionOnOpen',
  useDefaultWorkspace: 'dsh.appStartup.useDefaultWorkspace',
  defaultWorkspaceId: 'dsh.appStartup.defaultWorkspaceId',
} as const

/** The policy in force before any user choice. */
export const DEFAULT_STARTUP_SETTINGS: StartupSettings = {
  newSessionOnOpen: false,
  useDefaultWorkspace: false,
  defaultWorkspaceId: '',
}

/** localStorage when a browser provides it; storage access can itself throw. */
function browserStorage(): Storage | undefined {
  try {
    return typeof localStorage === 'undefined' ? undefined : localStorage
  } catch {
    return undefined
  }
}

/**
 * Read the stored startup policy.
 * @returns the stored values, or the defaults when storage is unavailable.
 */
export function readStartupSettings(): StartupSettings {
  const storage = browserStorage()
  if (storage === undefined) return { ...DEFAULT_STARTUP_SETTINGS }
  return {
    newSessionOnOpen: storage.getItem(STARTUP_KEYS.newSessionOnOpen) === '1',
    useDefaultWorkspace: storage.getItem(STARTUP_KEYS.useDefaultWorkspace) === '1',
    defaultWorkspaceId: storage.getItem(STARTUP_KEYS.defaultWorkspaceId) ?? '',
  }
}
