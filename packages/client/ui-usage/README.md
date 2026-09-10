# @deepseek-ai/dsh-client-ui-usage

English | [中文](README.zh.md)

Browser plugin registering the **用量** settings section: a mobile-responsive dashboard over the host `usage` Remote. Sections: balance card (or unavailable copy), range picker (今天/本周/本月/全部), totals, by-model table, and by-day list. Chinese is primary; English ships as the locale secondary.

## Composition

Registered as a `settings.section` entry (`id: usage`, `order: 20`) once ui-settings declares the slot. Requires the `usage` Remote on the gateway (mounted by `@deepseek-ai/dsh-api-remotes`).

The sidebar footer shows today’s estimated spend and balance with a top-up link. The section also includes daily cost and model-share charts. Both views use the application theme’s background, border and button tokens; the footer polls once per minute and on window focus.

## Model Experience

None — the plugin only renders already-computed usage and balance values.

#### KV Cache effect

None.

## Known Limitations and Deferred Work

- **Poll-on-open only** — the section loads when the range changes or the user retries; no background push invalidation for new sessions.
- **No standalone `/usage` route** — v1 is a settings page. A top-level nav entry can reuse the same component later.
