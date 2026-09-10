/**
 * Usage dashboard plugin, browser half: the 用量 settings section over the
 * usage Remote namespace.
 * @module @deepseek-ai/dsh-client-ui-usage/client
 */

import type { Context as ClientContext } from '@deepseek-ai/cordis'
// Type-only: pulls the generated Remote API and ctx.remote merge.
import type {} from '@deepseek-ai/dsh-api-remotes/client'
// Type-only: pulls the ui-settings SlotMap merge (settings.section).
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
// Type-only: pulls the SlotRegistry service merge (ctx.slots).
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
// Type-only: pulls the ui-sidebar SlotMap merge (sidebar.footer.action).
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
// Type-only: pulls the locale plugin's Context merge (ctx.locale).
import type {} from '@deepseek-ai/dsh-client-locale/client'
import { UsageSection } from './UsageSection.tsx'
import type { UsageRemote, UsageSectionInjected } from './UsageSection.tsx'
import { UsageSidebarCard } from './UsageSidebarCard.tsx'
import { en, zh } from './locales.ts'

export type { UsageRemote, UsageSectionInjected, UsageSectionProps } from './UsageSection.tsx'
export type { UsageKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Usage dashboard copy. */
    'settings.usage': typeof en
  }
}

/** Dictionary namespace owned by this plugin. */
const NS = 'settings.usage'

/** Required services: slot registry, locale, and the usage Remote namespace. */
export const inject = ['slots', 'locale', 'remote', 'remote.usage']

/**
 * Register the 用量 settings section once the `settings.section` declaration
 * is on the ledger.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-usage: dictionaries')

  const t = ctx.locale.bind(NS) as UsageSectionInjected['t']
  const usageRemote = ctx.remote.usage as unknown as UsageRemote
  const injected = (): UsageSectionInjected => ({
    remote: usageRemote,
    t,
  })

  ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section',
    id: 'usage',
    order: 20,
    label: () => t('nav'),
    inject: injected,
  }, UsageSection))

  ctx.slots.inject('sidebar.footer.action', () => ctx.slots.register({
    name: 'sidebar.footer.action',
    id: 'usage',
    order: 10,
    inject: injected,
  }, UsageSidebarCard))
}
