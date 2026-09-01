<p align="center">
  <img src="./apps/electron/resources/icon.png" alt="MkAgent" width="96" height="96" />
</p>

<h1 align="center">MkAgent</h1>

<p align="center">
  面向桌面端、WebUI 和 CLI 的本地优先、由 Pi 驱动的 AI Agent 工作区。
</p>

<p align="center">
  <a href="./LICENSE"><img src="https://img.shields.io/badge/license-Apache--2.0-blue.svg" alt="Apache License 2.0" /></a>
  <a href="https://bun.sh"><img src="https://img.shields.io/badge/Bun-1.3.14%2B-f9f1e1?logo=bun&amp;logoColor=000" alt="Bun 1.3.14 或更高版本" /></a>
  <a href="https://www.electronjs.org"><img src="https://img.shields.io/badge/Electron-39-47848F?logo=electron&amp;logoColor=white" alt="Electron 39" /></a>
</p>

<p align="center">
  <a href="https://mkagent.app">官网</a> ·
  <a href="./docs/zh/README.md">中文文档</a> ·
  <a href="./README.md">English README</a> ·
  <a href="#快速开始">快速开始</a> ·
  <a href="https://mksaas.link/discord">社区</a> ·
</p>

MkAgent 是一个开源、本地优先的 AI Agent 工作区，适合希望更好掌控 AI 工作方式的用户。你可以通过桌面应用、WebUI 或 CLI 下载使用，也可以基于其开源基础构建自己的桌面 Agent 产品。它由 [Pi](https://github.com/badlogic/pi-mono) Agent 运行时驱动，把可持久化的本地工作区、灵活的模型连接、浏览器工具和文档工具整合在一个应用中。应用状态保存在本地数据目录，凭据通过操作系统凭据管理器存储。

[![MkAgent 本地优先、由 Pi 驱动的 AI Agent 工作区](./docs/assets/mkagent-homepage.png)](https://mkagent.app)

## 功能特性

- **本地优先工作区** — 会话、文件、设置和工作区历史都保留在你的设备上。
- **灵活的模型连接** — 支持 ChatGPT Plus、Claude Pro/Max、Provider API key、OpenAI 兼容或 Anthropic 兼容端点，以及本地 Ollama 模型。
- **桌面应用、WebUI 和 CLI** — 通过 Electron 应用、基于浏览器的渲染界面，或由同一运行时支撑的 RPC 命令行客户端工作。
- **Agent 工作流** — 创建和分支会话、制定计划、使用 Skills、恢复工作、管理后续任务，并运行多个窗口。
- **内置工具** — 浏览网页、处理附件、渲染 Markdown 和代码，以及检查或转换常见文档格式。
- **明确的控制权** — 选择 Explore、Ask 或 Execute 权限模式，配置网络代理，并在英文与简体中文之间切换。

## 技术栈

- [Bun](https://bun.sh) — 工作区运行时、包管理器、脚本和测试工具。
- [Electron](https://www.electronjs.org) — 跨平台桌面应用外壳。
- [React](https://react.dev/) 和 [TypeScript](https://www.typescriptlang.org/) — 共享用户界面与类型化应用代码。
- [Vite](https://vite.dev/) 和 [Tailwind CSS](https://tailwindcss.com/) — 渲染界面构建工具和样式方案。
- [Pi](https://github.com/badlogic/pi-mono) — Agent 运行时、模型 Provider、会话和工具执行。

## 使用界面

| 界面 | 适用场景 | 命令 |
| --- | --- | --- |
| Desktop | 完整的本地体验和 Browser 面板 | `bun run electron:dev` |
| WebUI | 在浏览器中访问 headless server | `bun run server:prod` |
| CLI | 脚本化、远程控制和终端工作流 | `bun run apps/cli/src/index.ts --help` |

## 快速开始

### 前置要求

- [Bun](https://bun.sh) 1.3.14 或更高版本
- Node.js 18 或更高版本
- Git
- Python 3.12 和 [`uv`](https://docs.astral.sh/uv/)，用于完整的文档工具测试套件

### 运行桌面应用

```bash
git clone https://github.com/MkThingsHQ/mkagent.git
cd mkagent
bun install --frozen-lockfile
bun run electron:dev
```

MkAgent 会在 `~/.mkagent/workspaces/default` 创建默认工作区。开发或测试时，可通过 `CONFIG_DIR=/path/to/directory` 隔离配置根目录。

### 常用命令

| 命令 | 说明 |
| --- | --- |
| `bun run electron:dev` | 启动 Electron 开发环境 |
| `bun run electron:start` | 构建并单次启动 Electron |
| `bun run server:prod` | 构建并启动带 WebUI 的 headless server |
| `bun run cli:build` | 构建 CLI bundle |
| `bun run test` | 运行单元测试和隔离测试 |
| `bun run validate:ci` | 运行完整的类型、测试、文档工具和本地化检查 |

更多命令和环境变量请参阅[开发指南](./docs/zh/development.md)。

## 架构

MkAgent 是一个 Bun workspace，三个使用界面共用同一套运行时和渲染层：

```text
apps/
  electron/              Electron main、preload、renderer 和 Browser 面板
  webui/                 共享 renderer 的浏览器适配层
  cli/                   RPC 命令行客户端
packages/
  core/                  稳定的 DTO、事件和错误合约
  shared/                配置、凭据、提示词、Skills、主题和 i18n
  ui/                    共享 React UI 和内容渲染器
  server-core/           RPC 传输、会话和运行时编排
  server/                Headless server
  pi-agent-server/       Pi Agent 子进程
  session-tools-core/    计划、Skills、浏览器和会话工具
```

有关运行时边界、进程职责和数据流，请阅读[架构指南](./docs/zh/architecture.md)。

## 文档

完整文档提供[英文版](./docs/README.md)和[简体中文版](./docs/zh/README.md)。

| 范畴 | 指南 |
| --- | --- |
| 从这里开始 | [开发](./docs/zh/development.md)、[架构](./docs/zh/architecture.md)、[测试](./docs/zh/testing.md) |
| 模型 | [连接](./docs/zh/connections.md)、[Ollama](./docs/zh/ollama.md) |
| 工作方式 | [工作区](./docs/zh/workspaces.md)、[会话](./docs/zh/sessions.md)、[Skills](./docs/zh/skills.md) |
| 工具 | [Browser](./docs/zh/browser.md)、[附件](./docs/zh/attachments.md)、[文档工具](./docs/zh/document-tools.md) |
| 运行时 | [CLI](./docs/zh/cli.md)、[权限](./docs/zh/permissions.md)、[网络代理](./docs/zh/network-proxy.md) |
| 项目 | [功能](./docs/zh/featues.md)、[发布](./docs/zh/releases.md)、[上游同步](./docs/zh/upstream-sync.md) |

## 参与贡献

欢迎贡献。请先 Fork 仓库，创建聚焦的分支；行为变更请同时提交测试和文档，并在创建 pull request 前运行相关检查。完整的本地检查命令为：

```bash
bun run validate:ci
git diff --check
```

请通过 [GitHub Issues](https://github.com/MkThingsHQ/mkagent/issues) 提交 bug 和功能建议。

## 链接

- [官网](https://mkagent.app) — 了解更多 MkAgent 信息。
- [英文文档](./docs/README.md) — 查看安装、架构、模型、工具和开发指南。
- [中文文档](./docs/zh/README.md) — 阅读简体中文指南。
- [Discord](https://mksaas.link/discord) — 加入社区并获取帮助。
- [GitHub Issues](https://github.com/MkThingsHQ/mkagent/issues) — 报告 bug 或提出功能需求。

## 项目沿革

MkAgent 起步于 [Craft Agents OSS](https://github.com/craft-ai-agents/craft-agents-oss)，当前选择性同步基线为 `v0.12.1`（`d7592c481216`），并保持独立的 Git 历史与产品边界。MkAgent 与上游项目不存在关联，也未获其认可。归属说明请参阅 [NOTICE](./NOTICE)，当前差异请参阅[对比指南](./docs/zh/comparison-with-craft.md)。

## 作者

[OpenFox](https://mksaas.link/fox-x) 是一位独立开发者，专注于构建产品和开发者工具。其产品包括：

- [MkAgent](https://mkagent.app) — 面向 Desktop、WebUI 和 CLI 的本地优先、由 Pi 驱动的 AI Agent 工作区。
- [TanStarter](https://tanstarter.dev) — 基于 TanStack 快速交付，借助 Cloudflare 降低成本。
- [MkSaaS](https://mksaas.com) — 在一个周末做出你的 AI SaaS 产品。
- [MkImage](https://mkimage.ai) — 让任何图像成为可能。
- [Mkdirs](https://mkdirs.com) — 30 分钟上线 AI 驱动的目录站。
- [MkDollar](https://mkdollar.com) — 帮助你赚到第一桶金的一体化平台。

## 许可证

本项目采用 [Apache License 2.0](./LICENSE) 许可。你可以在遵守许可条款和 [NOTICE](./NOTICE) 中归属声明的前提下使用、修改和分发代码，包括用于商业用途。
