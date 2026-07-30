# MkAgent Craft Lite 源码复用与裁剪审计报告

> 历史快照说明：本文的统计与“OAuth 已删除”结论对应 2026-07-29 的 Lite 边界。2026-07-30 起，MkAgent 在保持 Pi-only 的前提下恢复 ChatGPT Plus 与 Claude Pro/Max 两种 LLM OAuth；Claude Agent SDK、GitHub Copilot 和 Sources/MCP 仍不恢复。当前状态见 [`README.md`](./README.md) 与 [`migration-features.md`](./migration-features.md)。

## Project Thesis

MkAgent 不是一套重新实现的 Agent 产品，而是以 Craft Agents OSS 为固定上游、完整沿用其 Desktop/WebUI/CLI、WebSocket RPC、会话和 UI 组件架构，只保留 Pi Agent 核心能力并删除完整产品功能面的 Lite 发行版。

本轮结论：此前的实现确实以 Craft 大规模源码导入为基础，不是从零重写；但 UI 对齐阶段把许多明确排除的功能“隐藏”而没有删除，并用兼容层为不存在的 RPC 返回空值。当前改动已把这些功能从文件、路由、状态、事件、协议、设置和文案层物理移除，并为后续同步增加可执行的复用边界检查。

| 字段 | 当前值 |
|---|---|
| MkAgent 基线 | `5c8308b6b12fa065ed072cb31372608dfda129dc` |
| Craft 固定上游 | `a60ebc1a5a7cb0a6af7a77d5eed0512c5fc07658`（v0.11.2） |
| 上游路径 | `../craft-agents-oss` |
| 主要语言 | TypeScript / React |
| 协议 | Apache-2.0 |
| 审计日期 | 2026-07-29 |

> 上游工作树当前有一处原有的 `bun.lock` 修改；本轮只读取上游源码，没有修改 Craft checkout。所有 SHA 与复用统计均以文件内容和 HEAD 为依据。

## Repository Shape

MkAgent 是 Bun workspace monorepo，保持 Craft 的应用层、共享层、服务层与运行时分层。

| 层级 | 路径 | 职责 | 复用策略 |
|---|---|---|---|
| Desktop | `apps/electron` | Electron main/preload/renderer、窗口、Browser Pane | Craft 同路径源码；Lite 壳层是登记过的裁剪缝 |
| WebUI | `apps/webui` | 浏览器端交互式会话 UI | 复用同一 renderer API 与 WebSocket RPC |
| CLI | `apps/cli` | 命令行会话客户端 | 复用协议与 server，不建立第二套运行时 |
| Server | `packages/server`, `packages/server-core` | RPC、会话、工作区、设置 | Craft 服务架构，删除产品功能 handler |
| Pi runtime | `packages/pi-agent-server` | Pi SDK 子进程与工具执行 | MkAgent 唯一 Agent backend |
| Shared | `packages/core`, `packages/shared` | 类型、协议、配置、权限、会话 | 尽量原样复用；裁掉排除域的模块与导出 |
| UI | `packages/ui` | Markdown、TurnCard、附件、预览 | Craft 组件复用；删除未使用的公开 Viewer 入口 |

仓库当前应用/包/脚本目录内有 1,052 个代码文件、约 195,744 行代码。主要行数来自 TypeScript（124,948）和 TSX（62,100）。

## Tech Stack

| 类别 | 技术 | 版本/来源 | 架构意义 |
|---|---|---|---|
| Runtime | Bun | workspace runtime | workspace、测试、构建、Pi 子进程 |
| Desktop | Electron | `^39.2.7` | 原生窗口、preload 隔离、系统能力 |
| UI | React | `^18.3.1` | Desktop/WebUI 的共享组件模型 |
| Build | Vite | `^6.2.4` | renderer 与 WebUI 生产构建 |
| State | Jotai | `^2.16.0` | 会话/面板/浏览器状态隔离 |
| Transport | WebSocket RPC | Craft 同源协议 | Desktop/WebUI/CLI 共用 server contract |
| Agent | Pi SDK | `0.80.6` | 唯一模型与工具运行后端 |
| Validation | TypeScript/Bun test/ESLint | workspace scripts | 跨包类型、行为和边界验证 |

## Architecture

```text
Electron Desktop ─┐
WebUI ────────────┼─> typed ElectronAPI / WebSocket RPC
CLI ──────────────┘                │
                                   v
                         server-core handlers
                                   │
                    ┌──────────────┼──────────────┐
                    v              v              v
                 sessions       config        browser/files
                    │
                    v
               PiAgent only
                    │
                    v
          packages/pi-agent-server subprocess
```

关键约束：

1. renderer 不直接访问 Node，通过 preload 或 WebUI adapter 获得同形 API。
2. Desktop、WebUI、CLI 不各自实现业务逻辑，而是调用相同 RPC handler。
3. `AgentProvider` 只有 `pi`，API key、Ollama 和兼容端点都路由到 Pi。
4. Lite 差异集中在路由、AppShell、设置、onboarding 和功能注册表，而不是复制出第二套 UI 基础设施。

## Craft Source Lineage

`bun run audit:craft-reuse` 对 MkAgent 与 Craft 的 tracked source 做同路径比较，并仅归一化包 scope、URL scheme、数据目录与品牌字符串。

| 指标 | 数量 | 比例/解释 |
|---|---:|---|
| MkAgent tracked source | 1,163 | 报告与生成物不计入 |
| 与 Craft 同相对路径 | 1,116 | 96.0% |
| 归一化后逐字一致 | 686 | 占 MkAgent 源码 59.0% |
| Craft 派生但有修改 | 430 | 主要是 Lite 裁剪、品牌、Pi-only 适配和恢复的 Craft 测试 |
| MkAgent 独有源码 | 47 | CI、文档、品牌、Pi 元数据、集成测试与审计脚本 |
| Craft 有而 MkAgent 无 | 606 | 主要是被裁掉的完整产品功能 |

这组数据支持“基于 Craft 做减法”的定位：96.0% 的 MkAgent 源码沿用 Craft 的文件结构；59.0% 在最小归一化后完全相同。430 个修改文件不等于重写，其中大量改动是删除 import/union 分支、恢复上游测试，以及为 Pi-only 会话运行时接入 Craft 的回调；从 UI 对齐基线起累计变更 389 个文件、增加 6,315 行、删除 56,761 行，整体仍是明确的源码减法。

Renderer 另有更严格的边界检查：

- 386 个现存 renderer 文件。
- 170 个文件必须与 Craft 归一化后完全一致。
- 211 个文件位于显式登记的 Lite 裁剪缝。
- 5 个 MkAgent-only 文件是图标/品牌资产。
- 排除功能路径、OAuth/远程工作区/产品元数据事件关键调用会直接让 lint 失败。

## Removed Product Surfaces

本轮不是继续隐藏入口，而是删除实现和跨层依赖。共删除 203 个 tracked 文件。

| 功能面 | 物理处理 |
|---|---|
| Automations | 删除 atoms、hooks、页面、组件、Playground、文案和测试残留 |
| Messaging | 删除 Telegram/WhatsApp/Lark UI、状态、设置、图标和文案 |
| Projects / Kanban / Tasks Conductor | 删除 board/editor/cards、project 页面、状态字段和导航分支 |
| Sources / MCP product UI | 删除列表、详情、selector、图标、共享模块和 Sources 事件 |
| Labels / custom statuses / views | 删除组件、hooks、shared modules、RPC handlers、过滤元数据 |
| Viewer / public sharing | 删除分享菜单/事件/URL及未被应用引用的只读 SessionViewer |
| Session transfer | 删除对话框、target helpers、API 类型和 transfer context wrapper |
| Remote workspace product binding | 删除 picker/connect UI、`remoteServer` 镜像匹配和远程配置文案 |
| OAuth/subscription | 删除 OAuth UI/API、Copilot 资源、重复账户和 re-auth 分支 |
| Claude backend | Agent factory 保持 Pi-only；连接 UI 不再暴露多 backend 分支 |
| Playground/sample UI | 删除完整 Playground 和仅用于演示的二进制样例 |

同时删除了 `craft-renderer-compat.ts`。该兼容层此前为缺失 RPC 注入 no-op，能让 UI 编译但不能证明功能真实存在。现在 retained API 必须映射到真实 channel；排除 API 则从类型和调用点删除。

## Retained Lite Capabilities

- Pi API key、多上游 provider、自定义兼容端点与 Ollama/local endpoint。
- 本地多工作区、会话创建/删除/重命名/归档/标记/未读。
- 会话导入、导出、分支、多面板和新窗口。
- Skills 列表、详情、编辑 mini-agent 与文件/目录/Skill mentions。
- Plan Review、权限模式、thinking/model selection、annotations。
- Browser Pane、web search/fetch、文件附件与 PDF/Office/代码富预览。
- Desktop/WebUI/CLI 共用 WebSocket RPC、代理、更新、主题、i18n。
- Pi 会话从连接/模型请求、SSE 事件、session tool 执行、工具结果回传到 renderer 最终展示的完整链路。

## Distinctive Decisions

### 1. Allowlist-based upstream reuse

不再把“整个 Craft renderer”当成同步目标。现存文件先经过排除面扫描，再按“严格复用区 / Lite 定制缝 / MkAgent-only 品牌资产”分类。这样上游新增完整产品页面不会被静默带回 MkAgent。

### 2. Compile errors as dependency discovery

先删除排除 API 和模块，再用全仓 typecheck 暴露真实依赖。例如远程 WorkspacePicker、Sources OAuth 卡片和 background task output 的缺失 API 都是在此过程中被识别并处理。

### 3. Background runtime and product Tasks are separate

Pi 的后台 Agent/Shell task chip 属于运行能力，继续保留；Craft 的 Projects/Kanban/Tasks Conductor 是产品组织层，已删除。此前菜单中的“查看输出”依赖 MkAgent 后端未实现的 RPC，已删除死入口而没有伪造实现。

### 4. Remote transport and remote workspace product are separate

WebUI 通过远程 WebSocket transport 连接 server 是保留架构；Craft 的 remote workspace binding/picker 是被排除的产品功能。当前代码保留前者，删除后者。

## Quality Signals

| 验证 | 结果 | 范围 |
|---|---|---|
| `bun run typecheck:all` | 通过 | core/shared/server/server-core/session-tools/Pi/Electron/UI |
| `bun run test` | 通过 | 全仓 Bun tests 与 isolated tests |
| `bun run validate:ci` | 通过 | 类型、共享配置测试、19 个文档工具 smoke、i18n |
| `bun run lint` | 通过 | 0 errors；70 个 Craft 同源 React Hook warnings |
| Craft retained-test coverage | 通过 | Craft 373 个测试：246 同路径、6 个裁剪替代、121 个随删除功能排除，0 个无解释缺失 |
| Pi conversation integration | 通过 | 实际启动 Pi 子进程，经本地 OpenAI-compatible SSE 端点完成模型 → session tool → 工具结果 → 最终文本 |
| Craft Lite boundary | 通过 | 严格复用区、定制缝、排除面扫描 |
| Electron build | 通过 | main/preload/renderer/resources/assets |
| WebUI build | 通过 | Vite production build |
| CLI build | 通过 | `dist/mkagent` |
| Pi subprocess build | 通过 | 3,655 modules bundled |

构建过程中曾发现 Copilot SVG 已删除但 provider map 仍静态 import 的真实闭包问题；清除映射后四条构建链全部通过。

## Risks

### Medium: Lite customization seam remains broad

AppShell、导航、onboarding 和输入组件是结构性减法集中区，211 个 renderer 文件被登记为 override。它们仍来自 Craft，但不能用逐字一致自动判定。后续应按功能切片继续缩小 override prefix，逐步提升严格复用文件数量。

### Medium: Upstream sync requires semantic review

Craft 新增功能可能落进现有共享模块，也可能修改 Lite 裁剪缝。同步时必须先运行边界检查，再人工判断 retained capability 是否需要吸收，不能再执行全量复制。

### Low: Lint warnings inherited from Craft UI

当前 lint 没有 error，但有 70 个 React Hook dependency warnings。它们不是本轮删除导致的阻塞项，但对长期维护和并发状态正确性有价值，适合单独修复，避免与本次大规模删除混在一个变更中。

### Low: No packaged-app manual interactive smoke in this run

生产构建、类型/单测/RPC parity 与确定性的真实 Pi 子进程会话链路均已通过，但本轮没有在打包后的 Electron GUI 中用真实外部 provider 凭证手工完成首次启动、创建会话、发送消息、打开 Skill、导入导出等点击链路。它仍是发布前最后一层验证。

## Commercial Use and Reuse

仓库声明 Apache-2.0。该协议通常允许商业使用、修改、再分发与闭源组合，但必须保留许可证和必要声明，并遵守专利条款。实际发布仍应同时核对 Craft 上游、第三方依赖、字体/图标和模型 SDK 的各自许可证；本报告不是法律意见。

## Unknowns Worth Verifying

1. 发布签名前应在全新用户目录执行一次 Electron onboarding 与真实外部 Pi provider API 调用；自动化已覆盖本地兼容端点，不等同于验证第三方账户/配额。
2. WebUI 应在独立 server 上验证文件选择、Browser Pane 与重连，而不只是 production build。
3. 若未来吸收新的 Craft 版本，应记录上游 SHA，并通过 `audit:craft-reuse` 比较复用率变化。
4. 当前上游 checkout 的 `bun.lock` 是既有 dirty 状态；升级依赖时应先用干净上游基线重跑审计。

## Reproducible Commands

```bash
bun run audit:craft-reuse
bun run lint:craft-ui-sync
bun run typecheck:all
bun run test
bun run validate:ci
bun run lint
bun run electron:build
bun run webui:build
bun run cli:build
bun run server:build:subprocess
```
