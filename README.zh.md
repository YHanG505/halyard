# Halyard（DeepSeek Halyard）

[English](README.md) | 中文

Halyard 是 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)
（由 [DeepSeek AI](https://deepseek.com) 开发）的社区分支，按 MIT 许可证发布。
应用内显示名称为 **DeepSeek Halyard**。

> Halyard 是非官方分支，与 DeepSeek 无关联、未获其赞助或背书。“DeepSeek”、“DeepSeek Harness”
> 及鲸鱼标识归其所有者，这里仅用于指代上游项目。

Halyard 保留上游「一切皆插件」架构（由 [Cordis](https://github.com/cordiverse/cordis) 驱动），并新增：

- 用量面板：侧边栏展示余额、当日消耗估算与按范围统计的账号消耗；
- 会话管理：启动设置（打开应用时创建新对话、默认项目）、可恢复或永久删除的归档管理、
  可复制的 Session ID 徽标；
- 本机 macOS 桌面应用，直接运行本仓库源码（`apps/desktop-live`）；
- 基于上游 `0.1.5-rc.2` 的修复，包括桌面端固定端口，让浏览器本地偏好能在重启后保留。

已完成轮次由产品自身的转录压缩折叠。若需要 Codex 风格的「连续工具调用折叠」，请把第三方客户端插件
[dsh-fold](https://github.com/Yancey2023/dsh-fold) 安装到 profile——见下文致谢部分。

## 开发者预览

Halyard 跟随快速迭代的上游开发者预览版，**会有破坏兼容性的改动**。

运行前请阅读上游的[安全声明](SAFETY.zh.md)。

## 运行

要求：Node.js `^22.19 || >=24` 与 pnpm。

```sh
pnpm install
pnpm run build
pnpm dsh web
```

`pnpm dsh web` 默认在 `http://127.0.0.1:3080` 提供 Web UI；`--no-open` 可不自动打开浏览器，
`--port <n>` 可修改端口。真实模型运行会读取环境变量或根目录 `.env` 中的 `DEEPSEEK_API_KEY`。

### 桌面应用（macOS）

```sh
node apps/desktop-live/scripts/install-macos.mjs
```

脚本会构建 `DeepSeek Halyard.app`，它从本仓库启动 `pnpm dsh web` 并打开带令牌的 URL。

## 文档

- 上游文档：<https://deepseek-harness.github.io/deepseek-harness/>
- 仓库指南：[docs/development.zh.md](docs/development.zh.md)、[docs/architecture.zh.md](docs/architecture.zh.md)
- 面向 Agent：[AGENTS.md](AGENTS.md)

## 致谢

- [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)——DeepSeek AI 的上游项目与鲸鱼标识；
- [dsh-fold](https://github.com/Yancey2023/dsh-fold)——Yancey2023（MIT）的第三方可选客户端插件，
  用于折叠连续工具调用；通过 `dsh plugin --profile web add github:Yancey2023/dsh-fold` 安装到
  profile，本仓库不内置，感谢作者提供独立的折叠 UI；
- [Cordis](https://github.com/cordiverse/cordis) 与 vendor 的框架库（见
  [vendor/README.md](vendor/README.md)）。

## 许可证

[MIT](LICENSE)，Copyright (c) 2026 DeepSeek，Halyard 贡献者的修改见 [NOTICE](NOTICE)。

第三方依赖及其许可证见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。
