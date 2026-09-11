---
description: "Web 用量面板：基于宿主 usage Remote 的设置页与侧边栏余额卡；面向用量界面的用户与维护者。"
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-usage

[English](README.md) | 中文

## 概述

浏览器插件，注册 **用量** 设置页：基于宿主 `usage` Remote 的移动响应式仪表盘。区块：余额卡（或不可用文案）、时间范围选择（今天/本周/本月/全部）、合计、按模型表、按日列表，以及每日成本与模型占比图表。侧边栏页脚显示今日估算消耗与余额，并带充值入口。中文为主文案；英文作为 locale 副本。两种视图都使用应用主题的背景、边框与按钮代币。

## 目录

- [使用本包](#use-this-package)
- [模型体验](#model-experience)
- [已知限制与延期工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="use-this-package"></a>
## 使用本包

ui-settings 声明插槽后，本插件注册一个 `settings.section` 条目（`id: usage`，`order: 20`）。它需要网关上的 `usage` Remote（由 `@deepseek-ai/dsh-api-remotes` 挂载）。侧边栏卡片每分钟及窗口聚焦时轮询；设置页在切换范围或用户重试时加载。

<a id="model-experience"></a>
## 模型体验

无——插件只渲染已计算好的用量与余额值供人阅读。

#### KV Cache 影响

无；本包从不组装或发送提供方请求。

## 已知限制与延期工作

<a id="known-limitations-and-deferred-work"></a>

- **仅打开时轮询**——设置页在切换范围或用户重试时加载；新会话没有后台推送失效。
- **没有独立的 `/usage` 路由**——v1 是设置页。顶栏导航条目可以复用同一组件。

<a id="dev-note"></a>
### 开发备注

客户端测试用固定快照挂载各个区块，覆盖余额、合计、按模型与按日状态，并断言不可用文案。Remote 调用经由标准测试运行时解析。
