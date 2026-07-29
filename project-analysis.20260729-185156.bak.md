# MkAgent 源码迁移与质量审计报告

## Project Thesis

MkAgent 不是另一套重新设计的 Agent 桌面端，而是以 Craft Agents OSS 为固定上游、保留 Desktop/WebUI/CLI 与 WebSocket RPC 架构、裁掉非核心产品面的 Pi-only Lite 版本。当前最重要的工程约束是：共享架构和 UI 组件尽量与 Craft 同路径同实现，差异只允许来自品牌替换、被明确裁剪的功能和 MkAgent 运行边界。

| 字段 | 值 |
|---|---|
| 项目 | MkAgent |
| 仓库 | `mkagent/` |
| 固定上游 | `../craft-agents-oss` @ `a60ebc1a5a7cb0a6af7a77d5eed0512c5fc07658` |
| 主要语言 | TypeScript / React |
| 协议 | Apache-2.0 |
| 审计日期 | 2026-07-29 |

## Repository Shape

这是一个 Bun workspace monorepo，桌面端、WebUI、CLI、运行时与共享组件按应用和包分层，而不是把所有逻辑塞进 Electron renderer。

| 层 | 路径 | 职责 |
|---|---|---|
| 可运行应用 | `apps/electron` | 原生桌面窗口、preload、IPC/WS transport、Craft 风格 UI |
| 可运行应用 | `apps/webui` | 浏览器端共享 UI 与远程会话入口 |
| 可运行应用 | `apps/cli` | WebSocket RPC 命令行客户端 |
| Agent runtime | `packages/pi-agent-server` | Pi SDK 子进程与工具执行 |
| 业务服务 | `packages/server-core`, `packages/server` | 会话、设置、RPC handler 与 WebUI server |
| 共享层 | `packages/core`, `packages/shared`, `packages/ui` | 协议、配置、模型、会话类型和 Craft UI 组件 |

依赖主线为 `Electron/WebUI/CLI → WebSocket RPC → server-core → shared/core → Pi runtime`。Electron preload 只暴露类型化 API，renderer 不直接访问 Node。

## Tech Stack

项目沿用 Craft 的 TypeScript-first 技术栈，以相同构建与组件基础降低迁移漂移。

| 类别 | 技术 | 版本 | 架构作用 |
|---|---|---:|---|
| Runtime | Bun | 当前 workspace runtime | workspace、测试、构建脚本、Pi 子进程 |
| Desktop | Electron | `^39.2.7` | macOS/Windows/Linux 原生壳层与 preload 隔离 |
| UI | React | `^18.3.1` | Electron renderer 与 WebUI 的组件模型 |
| Build | Vite | `^6.2.4` | renderer/WebUI 构建与 dev HMR |
| Language | TypeScript | `^5.0.0` | 跨 preload/RPC/server 的类型契约 |
| Components | Tailwind v4 + Radix | workspace versions | 复用 Craft token、布局与交互原语 |
| Testing | Bun test + unittest | Bun / Python 3 | TS 单测、isolated 测试与文档工具 smoke test |

## Architecture Design

MkAgent 是共享服务核心驱动的模块化桌面应用；Electron、WebUI 和 CLI 是同一 RPC 能力面的不同客户端。

```text
Electron renderer ─┐
WebUI ──────────────┼─> WebSocket RPC ─> server-core ─> shared/core ─> Pi agent runtime
CLI ────────────────┘          │
                               └─> filesystem config / workspace sessions / skills
```

可信执行路径：

```text
Dev desktop: bun run electron:dev:terminal
WebUI:       bun run server:dev:webui (requires MKAGENT_SERVER_TOKEN)
Build:       bun run electron:build && bun run webui:build
Test:        bun run test
CI audit:    bun run validate:ci
```

这次验证发现并修复了多实例 dev 的真实缺口：端口和 `MKAGENT_CONFIG_DIR` 已隔离，但 Electron `userData` 未隔离，导致 `requestSingleInstanceLock()` 退出。现在多实例模式会使用独立 `--user-data-dir`；可选 `MKAGENT_REMOTE_DEBUGGING_PORT` 只在显式设置时开启，便于自动视觉检查。

## Craft Migration Audit

Electron 源码闭包现在是受控迁移，而不是原先 598 个散落未跟踪文件的原始镜像。

| 指标 | 结果 |
|---|---:|
| 审计范围 | `apps/electron/src` 104 个文件 |
| 与 Craft 字节一致 | 42 |
| 仅品牌/包名替换后等价 | 22 |
| Lite 必要适配 | 34 |
| 无上游同路径文件 | 6（全部为 MkAgent 品牌资源/图标） |
| 当前 Electron 测试文件 | 26 |
| 当前未跟踪文件 | 55（从原 598 个收敛） |

适配集中在四个边界：

1. `renderer/App.tsx` 组合 Craft 的 `TopBar`、`LeftSidebar`、`PanelHeader`、`EntityRow`、`SettingsNavigator` 和 settings primitives，删除原自写 `mk-*` 外壳 CSS。
2. `settings-registry.ts`、`menu-schema.ts`、`SettingsIcons.tsx` 只移除 Labels、Sources、Projects、Automations、Messaging、Server 等 Lite 排除项。
3. Browser Pane 保留 Craft 能力，修复 popup 空值、销毁 cleanup 和 `emptyStateLaunch` channel 映射。
4. 测试仅对品牌、Pi-only provider、已删除 Sources/OAuth 和 BrowserView toolbar 差异作适配；两份连 Craft 当前实现也不再满足的旧 isolated 测试已删除。

已删除的 540 个未跟踪文件包括未使用 Craft logo、DMG 背景、release notes、bridge MCP、playground、被裁剪产品面和它们的过期测试。`apps/electron/src` 迁移范围内不再残留可见 Craft 产品文案或 Craft logo 资源；仓库其他位置仍保留上游归属、兼容协议名和历史安装迁移所需的 Craft 标识。

## Core Modules

工程重心位于共享服务和类型化 transport，而不是单一 renderer 页面。

### Electron shell `apps/electron/src`

- **职责**：窗口、preload、Browser Pane、原生通知、Craft 风格三栏 UI。
- **关键入口**：`main/index.ts`、`preload/bootstrap.ts`、`renderer/App.tsx`。
- **意义**：桌面端只负责平台能力与 UI，不复制服务端会话逻辑。

### RPC transport `apps/electron/src/transport` + `packages/server-core/src/transport`

- **职责**：将 renderer API 映射到 WS RPC channel，并接收 session events。
- **关键约束**：`channel-map-parity.test.ts` 防止类型声明有 API、运行映射却缺失。

### Session service `packages/server-core/src/sessions`

- **职责**：会话生命周期、分支、持久化、消息事件、模型连接刷新。
- **意义**：Electron/WebUI/CLI 共享同一行为，不允许 UI 侧各写一套。

### UI package `packages/ui` + Craft renderer components

- **职责**：消息渲染、Markdown、输入与 overlay；Electron 外壳复用 Craft renderer primitives。
- **意义**：主界面和设置页的视觉一致性来自同一组件和 token，而非截图仿写。

## Quality Signals & Risks

当前静态、单元、isolated、构建和运行验证均通过，但截图级回归还未固化为仓库测试。

| 验证项 | 当前结果 |
|---|---|
| `bun run test` | 2498 pass / 11 skip / 0 fail；额外 isolated 文件全部通过 |
| `bun run validate:ci` | 通过：全包 typecheck、共享配置测试、19 个文档工具 smoke、i18n parity/sort |
| Electron build | main、preload、renderer、resources、assets 全通过 |
| WebUI build | 3621 modules 构建通过；仅有大 chunk 警告 |
| Electron dev | 隔离实例成功创建窗口、WS server、sessions/skills IPC；renderer 0 error |
| WebUI runtime | 登录、主界面、8 个保留设置页全部渲染；console 0 error |

| 风险 | 严重度 | 证据 | 影响 |
|---|---|---|---|
| `renderer/App.tsx` 仍是组合层热点 | 中 | 单文件组合主界面、技能、设置内容 | 后续应继续按 Craft 页面边界拆分，避免再次出现自写大页 |
| 视觉回归未进入 CI | 中 | 本次通过 CDP/WebUI 人工自动化截图 | CSS/token 漂移可能在类型与单测全绿时漏出 |
| renderer/WebUI 主 chunk 超过 4 MB | 中 | Vite build warning | 首屏下载/解析时间与开发 HMR 成本偏高 |
| macOS vibrancy 截图带透明背景 | 低 | Electron `vibrancy: under-window` 与 RGBA capture | 自动截图必须提供合成底色，否则会误判为暗色主题 |
| macOS Computer Use 权限不可用 | 低 | 当前环境拒绝辅助功能读取 | 原生交通灯、窗口拖拽仍需人工或 CI runner 权限复核 |

Apache-2.0 允许商业使用、闭源组合、修改与再分发，但分发时需要保留许可证与 NOTICE（如有），说明修改，并遵守专利授权/终止条款。Craft 上游代码的具体归属与 NOTICE 应在发布制品中继续核对。

## Unknowns Worth Verifying

剩余不确定性集中在原生窗口像素回归和发布制品，而不是基本功能链路。

- **原生 macOS 最终像素**：当前 CDP 截图无法包含真实 vibrancy 合成和交通灯；需要有 Screen Recording/Accessibility 权限的 runner 做基线截图。
- **Windows/Linux 外观**：当前只在 macOS 运行；原生 frame、Mica/Acrylic 与字体指标需要平台 CI。
- **真实 LLM 端到端**：隔离验证没有写入 API key，也没有发起模型请求；连接设置与消息流的真实供应商测试仍需测试凭据。
- **发布包签名**：本次验证 build 未做签名/公证；`electron:dist:dev:mac` 仍只适合内部测试。
