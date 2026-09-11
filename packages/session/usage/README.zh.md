---
description: "宿主用量服务：把跨会话 token 用量折叠为人民币成本估算，并读取 DeepSeek 账户余额；面向用量能力的用户与维护者。"
kind: "package-reference"
---

# @deepseek-ai/dsh-usage

[English](README.md) | 中文

## 概述

宿主服务（`ctx.usage`）：把跨会话 token 用量折叠为成本估算，并读取 DeepSeek 账户余额。聚合按需遍历 session-persistence 的 `list()` + `load()`，并使用 30 秒进程内缓存；不建立并行用量库。两个操作都是 Typert Remote（`usage.summary`、`usage.balance`），浏览器经网关访问。

## 目录

- [使用本包](#use-this-package)
- [模型体验](#model-experience)
- [已知限制与延期工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="use-this-package"></a>
## 使用本包

本服务注入 `sessionPersistence`，并通过 `ctx.get('credentials')` 可选读取凭据；没有凭据接缝的组合仍能提供汇总，并把余额报告为不可用。

```yaml
- id: usage
  name: '@deepseek-ai/dsh-usage'
  config:
    apiKeyEnv: DEEPSEEK_API_KEY   # default
    baseURL: https://api.deepseek.com
    # pricing: override the whole table (CNY per million tokens)
```

### 宿主 API

- `summary(range: 'today' | 'week' | 'month' | 'all'): Promise<UsageSummary>`——合计、按模型与按日（北京日历）以及当前价格表下的 `estimatedCostCny`。
- `balance(): Promise<BalanceInfo>`——`{ isAvailable: true, totalBalance, chargedBalance, grantedBalance }` 或 `{ isAvailable: false, reason }`。凭据缺失、网络失败、非 OK HTTP 与载荷畸形都会降级为不可用；该方法从不抛错。

### 成本估算

`input_miss * p_in_miss + cache_hit * p_in_hit + output * p_out`，费率单位为人民币/百万 token。高峰/非高峰取自请求时间戳的北京时间（周一至周五 09:00–12:00 与 14:00–18:00 为高峰，其余为非高峰）。内置默认值覆盖 `deepseek-v4-flash` 与 `deepseek-v4-pro`；别名（`deepseek-flash`、`deepseek-v4-flash-vision-exp` 等）路由后按 flash 计费。费率跟随提供方的官方 Models & Pricing 表。

<a id="model-experience"></a>
## 模型体验

无——本服务只读取已记录的会话事件并调用平台余额端点，从不发送模型请求。

#### KV Cache 影响

无；本服务从不组装或发送提供方请求。

## 已知限制与延期工作

<a id="known-limitations-and-deferred-work"></a>

- **重算而非仓库**——v1 在缓存未命中时重新读取所有已实体化的会话日志；超大存储会付出首次读取成本。SQLite 账单投影推迟。
- **未列出的模型计零**——token 仍然计数，但价格表之外的 id 会贡献 `estimatedCostCny: 0`，直到价格表扩展。
- **`/user/balance` 尽力而为**——端点有文档（API Reference: Get User Balance），但任何失败都降级为 `unavailable`，这是 UI 的一等状态。
- **用量只统计最终消息**——没有后续 `assistant/message` 的 usage chunk 不计费（避免对同一次流重复计数）。

<a id="dev-note"></a>
### 开发备注

宿主测试用桩 fetch 覆盖价格表、范围窗口、别名路由与余额降级；客户端面板的预期位于 `@deepseek-ai/dsh-client-ui-usage`。
