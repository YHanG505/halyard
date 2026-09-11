---
description: "打包桌面应用的更新提示：侧边栏页脚操作，基于壳层的版本更新桥；面向桌面应用的用户与维护者。"
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-update

[English](README.md) | 中文

## 概述

本包渲染打包版 DeepSeek Halyard 桌面应用的更新提示：当 Electron 壳层发现 GitHub Releases 上有更新版本时，在侧边栏页脚显示一个操作按钮，并驱动壳层完成下载、替换应用包与重启。在普通浏览器中或没有可用更新时，它不渲染任何内容。所有副作用由壳层负责，本包只提供提示界面。

## 目录

- [使用本包](#use-this-package)
- [模型体验](#model-experience)
- [已知限制与后续工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="use-this-package"></a>
## 使用本包

将本插件与运行时一起挂载。在打包后的桌面应用中，预加载桥会暴露 `globalThis.dshDesktop.updates`；该操作订阅发布的状态，在挂载时请求一次检查，并显示带目标版本号的 primary 按钮。点击调用 `install()`；安装期间按钮禁用，并通过 `installing` 与 `ready` 阶段更新文案。安装失败时显示简短的手动下载提示。

<a id="model-experience"></a>
## 模型体验

无——该浏览器端界面只渲染壳层发布的版本状态。

#### KV Cache 影响

无；本包从不组装或发送提供方请求。

<a id="known-limitations-and-deferred-work"></a>
## 已知限制与后续工作

- **桥仅存在于桌面应用**——浏览器与源码运行壳层不渲染。
- **无内联详情视图**——壳层返回的 `ready`、`error` 与 `idle` 消息只通过本地化按钮文案显示。

<a id="dev-note"></a>
### 开发备注

该操作以结构化方式读取壳层桥（`globalThis.dshDesktop.updates`），不导入桌面应用的任何代码。客户端测试用假桥挂载它，断言可见性、安装点击与阶段文案。
