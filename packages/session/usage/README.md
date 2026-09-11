---
description: "Host usage service: folds cross-session token usage into CNY cost estimates and reads the DeepSeek account balance; for users and maintainers of the usage capability."
kind: "package-reference"
---

# @deepseek-ai/dsh-usage

English | [中文](README.zh.md)

## Summary

Host service (`ctx.usage`) that folds cross-session token usage into cost estimates and reads the DeepSeek account balance. Aggregation walks session-persistence `list()` + `load()` on demand with a 30s process-local cache; there is no parallel usage store. Both operations are Typert Remotes (`usage.summary`, `usage.balance`), so the browser reaches them through the gateway.

## Table of Contents

- [Use this package](#use-this-package)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Use this package

The service injects `sessionPersistence` and reads credentials optionally through `ctx.get('credentials')`; assemblies without the credential seam still serve summaries and report balance unavailable.

```yaml
- id: usage
  name: '@deepseek-ai/dsh-usage'
  config:
    apiKeyEnv: DEEPSEEK_API_KEY   # default
    baseURL: https://api.deepseek.com
    # pricing: override the whole table (CNY per million tokens)
```

### Host API

- `summary(range: 'today' | 'week' | 'month' | 'all'): Promise<UsageSummary>` — totals, by-model, and by-day (Beijing calendar) with `estimatedCostCny` under the active pricing table.
- `balance(): Promise<BalanceInfo>` — `{ isAvailable: true, totalBalance, chargedBalance, grantedBalance }` or `{ isAvailable: false, reason }`. Missing credentials, network failure, non-OK HTTP, and malformed payloads degrade to unavailable; the method never throws.

### Cost estimate

`input_miss * p_in_miss + cache_hit * p_in_hit + output * p_out`, rates in CNY per million tokens. Peak vs off-peak comes from the request timestamp in Beijing time (Mon–Fri 09:00–12:00 and 14:00–18:00 peak; else off-peak). Published defaults cover `deepseek-v4-flash` and `deepseek-v4-pro`; aliases (`deepseek-flash`, `deepseek-v4-flash-vision-exp`, …) bill as flash after routing. Rates follow the provider's official Models & Pricing table.

<a id="model-experience"></a>
## Model Experience

None, as the service only reads already-logged session events and calls the platform balance endpoint; it never sends model requests.

#### KV Cache effect

None; the service never assembles or sends provider requests.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- **Recompute, not warehouse** — v1 reloads every materialized session log on cache miss; very large stores pay a first-read cost. A SQLite billing projection is deferred.
- **Unlisted models bill zero** — tokens still count, but an id absent from the pricing table contributes `estimatedCostCny: 0` until the table is extended.
- **`/user/balance` is best-effort** — the endpoint is documented (API Reference: Get User Balance), but any failure degrades to `unavailable`, a first-class UI state.
- **Usage counts finalized messages only** — a usage chunk without a later `assistant/message` is not billed (avoids double-counting a stream).

<a id="dev-note"></a>
### Dev Note

Host tests cover the pricing table, range windows, alias routing, and balance degradation with a stubbed fetch; the client dashboard's expectations live in `@deepseek-ai/dsh-client-ui-usage`.
