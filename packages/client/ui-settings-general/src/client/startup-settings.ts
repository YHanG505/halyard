/**
 * Browser-local startup preferences (the `dsh.appStartup.*` keys). The runtime's
 * workspaces service reads the same keys when it decides the startup policy and
 * the New Session target, so keep the string names in sync with
 * `packages/client/runtime/src/client/workspaces/startup-settings.ts`.
 */

/** The startup policy a settings row edits. */
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

/**
 * Persist one change to the startup policy.
 * @param patch - the fields to change.
 * @returns the stored policy after the write.
 */
export function writeStartupSettings(patch: Partial<StartupSettings>): StartupSettings {
  const next = { ...readStartupSettings(), ...patch }
  const storage = browserStorage()
  if (storage !== undefined) {
    storage.setItem(STARTUP_KEYS.newSessionOnOpen, next.newSessionOnOpen ? '1' : '0')
    storage.setItem(STARTUP_KEYS.useDefaultWorkspace, next.useDefaultWorkspace ? '1' : '0')
    storage.setItem(STARTUP_KEYS.defaultWorkspaceId, next.defaultWorkspaceId)
  }
  return next
}
