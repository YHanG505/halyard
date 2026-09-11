---
description: "Web usage dashboard: the 用量 settings section and sidebar balance card over the host usage Remote; for users and maintainers of the usage surface."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-usage

English | [中文](README.zh.md)

## Summary

Browser plugin registering the **用量** settings section: a mobile-responsive dashboard over the host `usage` Remote. Sections: balance card (or unavailable copy), range picker (今天/本周/本月/全部), totals, by-model table, and by-day list, plus daily cost and model-share charts. The sidebar footer shows today’s estimated spend and balance with a top-up link. Chinese is primary; English ships as the locale secondary. Both views use the application theme’s background, border, and button tokens.

## Table of Contents

- [Use this package](#use-this-package)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Use this package

The plugin registers a `settings.section` entry (`id: usage`, `order: 20`) once ui-settings declares the slot. It requires the `usage` Remote on the gateway (mounted by `@deepseek-ai/dsh-api-remotes`). The sidebar card polls once per minute and on window focus; the settings section loads when the range changes or the user retries.

<a id="model-experience"></a>
## Model Experience

None, as the plugin only renders already-computed usage and balance values for a human.

#### KV Cache effect

None; the package never assembles or sends provider requests.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- **Poll-on-open only** — the section loads when the range changes or the user retries; no background push invalidation for new sessions.
- **No standalone `/usage` route** — v1 is a settings page. A top-level nav entry can reuse the same component later.

<a id="dev-note"></a>
### Dev Note

Client tests mount the section with fixture snapshots for the balance, totals, by-model, and by-day states, and assert the unavailable copy. Remote calls resolve through the standard test runtime.
