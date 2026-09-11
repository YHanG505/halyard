/**
 * Release-update plugin, browser half: contributes one sidebar footer action
 * that surfaces the desktop shell's update state and installs an available
 * release. The shell owns checking, downloading, and the relaunch; this entry
 * only renders the prompt.
 */
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import { UpdateAction } from './UpdateAction.tsx'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import { en, NS, zh, type UpdateKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Release-update prompt copy. */
    'update': UpdateKey
  }
}

export type { DesktopUpdateState, DesktopUpdatesBridge, UpdateActionProps } from './UpdateAction.tsx'

/** Required services for locale registration and the sidebar footer slot. */
export const inject = ['slots', 'locale']

/**
 * Client plugin body: register the dictionaries and the footer action.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-update: dictionaries')
  ctx.slots.inject(
    'sidebar.footer.action',
    () => ctx.slots.register({
      name: 'sidebar.footer.action',
      id: 'update',
      order: 10,
      locale: NS,
    }, UpdateAction),
  )
}
