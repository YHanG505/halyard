# @deepseek-ai/dsh-usage

[English](README.md) | 中文

宿主服务（`ctx.usage`）：跨会话折叠 token 用量为成本估算，并读取 DeepSeek 账户余额。聚合按需遍历 session-persistence 的 `list()` + `load()`，进程内缓存 30 秒；不建立并行用量库。

## 宿主 API

- `summary(range: 'today' | 'week' | 'month' | 'all'): Promise<UsageSummary>` — 总计、按模型、按日（北京日历），在当前价目表下给出 `estimatedCostCny`。
- `balance(): Promise<BalanceInfo>` — `{ isAvailable: true, totalBalance, chargedBalance, grantedBalance }` 或 `{ isAvailable: false, reason }`。缺少凭证、网络失败、非 2xx HTTP、畸形载荷一律降级为不可用；方法从不抛出。

两个方法都是 Typert Remote（`usage.summary`、`usage.balance`），浏览器经网关调用。

## 成本估算

`input_miss * p_in_miss + cache_hit * p_in_hit + output * p_out`，单价为每百万 token 的人民币。峰谷按请求时间戳的北京时间判定（周一至周五 09:00–12:00、14:00–18:00 为峰；其余为谷）。默认价目覆盖 `deepseek-v4-flash` 与 `deepseek-v4-pro`；别名（`deepseek-flash`、`deepseek-v4-flash-vision-exp` 等）路由后按 flash 计费。费率取自提供方官方 Models & Pricing 价目表。

## 组合

```yaml
- id: usage
  name: '@deepseek-ai/dsh-usage'
  config:
    apiKeyEnv: DEEPSEEK_API_KEY   # default
    baseURL: https://api.deepseek.com
    # pricing: override the whole table (CNY per million tokens)
```

注入 `sessionPersistence`。凭证经 `ctx.get('credentials')` 可选解析；没有凭证缝的装配仍可提供 summary，并将余额报告为不可用。

## 模型体验

无——服务只读取已记录的会话事件并调用平台余额端点，从不发起模型请求。

#### KV Cache 影响

无。

## 已知限制与延后工作

- **重算而非仓库** — v1 在缓存过期后重新加载全部已物化会话日志；超大库首次读取代价高。SQLite 计费投影延后。
- **未列出的模型计费为零** — token 仍会计入，但价目表中不存在的 id 其 `estimatedCostCny` 为 0，直至扩展价目表。
- **`/user/balance` 尽力而为** — 该端点已有官方文档（API Reference：Get User Balance），但任何失败都会降级为 `unavailable` 这一等 UI 状态。
- **只统计已定稿消息的用量** — 只有 usage chunk 而没有后续 `assistant/message` 的样本不计费（避免流式双计）。
