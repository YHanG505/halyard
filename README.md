# DeepSeek Halyard

DeepSeek Halyard（简称 Halyard）是 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（由 [DeepSeek AI](https://deepseek.com) 开发，MIT 许可）的社区分支，应用内显示名称为 **DeepSeek Halyard**。

> Halyard 是非官方分支，与 DeepSeek 无关联、未获其赞助或背书。“DeepSeek”、“DeepSeek Harness”及鲸鱼标识归其所有者，这里仅用于指代上游项目。

## 相比原版新增

- **用量面板**：侧边栏余额卡、今日消耗估算，以及按范围统计的账号消耗；精确账单可跳转 `platform.deepseek.com/usage`。
- **归档对话管理**：恢复或永久删除；删除后立即从归档列表消失（不再残留“无标题”行）。
- **启动设置**：打开应用时创建新对话、新对话默认项目。
- **无项目对话（按话题分文件夹）**：不必先选项目即可开始；首条消息自动创建 `~/Documents/Halyard/<话题>` 作为该会话的工作目录，不同对话的文件互不混用，侧边栏仍显示为「未分组」。
- **Session ID 徽标**：会话头部显示并可一键复制（走官方 Toast 提示）。
- **自包含桌面 App + 一键打包**：`pnpm run dmg` 产出免开发环境的 DMG/ZIP；App 内置运行时与全部定制包，安装后无需本仓库即可运行。
- **应用内更新**：桌面 App 检测 GitHub Releases，有新版时侧边栏出现 DeepSeek 蓝「更新」按钮，点击自动下载、替换并重启（未签名构建，首次安装需右键 → 打开）。
- **折叠支持**：可选安装第三方插件 [dsh-fold](https://github.com/Yancey2023/dsh-fold) 折叠连续工具调用。
- **稳定性修复**：桌面端固定端口（浏览器本地设置重启不丢）、无项目会话的历史读取与 `{{cwd}}`、归档删除清理、发布构建在 iCloud 目录下的完整性校验等。

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

`pnpm dsh web` 默认在 `http://127.0.0.1:3080` 提供 Web UI；`--no-open` 可不自动打开浏览器，`--port <n>` 可修改端口。真实模型运行会读取环境变量或根目录 `.env` 中的 `DEEPSEEK_API_KEY`。

### 桌面 App（自包含 DMG）

```sh
pnpm run dmg            # writes dist/dmg/DeepSeek-Halyard-<version>-mac-<arch>.dmg and .zip
pnpm run dmg -- x64     # explicit architecture (host architecture by default)
```

首次打包会下载并缓存 Node 运行时与依赖；产物未签名，首次打开需右键 → 打开。

### 发布新版本

```sh
pnpm run release:dsh 0.1.5-rc.2.halyard.1   # bump the whole family and commit
GITHUB_TOKEN=<token> pnpm run release:dmg    # build and upload DMG/ZIP to the GitHub release
```

版本必须使用 `0.1.5-rc.2.halyard.N` 形式的递增版本，用户端才会收到更新提示。

## 文档

- 上游文档：<https://deepseek-harness.github.io/deepseek-harness/>
- 仓库指南：[docs/development.zh.md](docs/development.zh.md)、[docs/architecture.zh.md](docs/architecture.zh.md)
- 面向 Agent：[AGENTS.md](AGENTS.md)

## 致谢

- [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)——DeepSeek AI 的上游项目与鲸鱼标识；
- [dsh-fold](https://github.com/Yancey2023/dsh-fold)——Yancey2023（MIT）的第三方可选客户端插件，用于折叠连续工具调用；通过 `dsh plugin --profile web add github:Yancey2023/dsh-fold` 安装到 profile，本仓库不内置，感谢作者提供独立的折叠 UI；
- [Cordis](https://github.com/cordiverse/cordis) 与 vendor 的框架库（见 [vendor/README.md](vendor/README.md)）。

## 许可证

[MIT](LICENSE)，Copyright (c) 2026 DeepSeek，Halyard 贡献者的修改见 [NOTICE](NOTICE)。

第三方依赖及其许可证见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。
