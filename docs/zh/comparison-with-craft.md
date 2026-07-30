# MkAgent vs Craft Agents 当前差异对比

> 快照时间：**2026-07-30**。
> 快照时间：**2026-07-30**。
> 对比基线：MkAgent 当前 `main` 分支的工作区（HEAD `47d09e5 feat: Add Chinese documentation`）；上游仓库 [`craft-ai-agents/craft-agents-oss` `v0.11.2` / `a60ebc1a5a7c`](https://github.com/craft-ai-agents/craft-agents-oss)。
> 数据来源：两个仓库当前 on-disk 的工作区与既有的构建产物（非本轮新抓的网络数据）；重跑前请用记录中的 commit 重新 checkout 两个仓库。

本文用源码与构件证据解释 MkAgent 相对 Craft Agents 保留了什么、物理删除了什么、以及这些选择会怎样改变你最终交付的安装包。MkAgent 是基于同一套架构与 renderer 的"Lite"衍生版；下面的表格是"现在到底哪里不一样"的标准答案。

## 1. 仓库与源码规模

两个仓库都是 Bun monorepo，使用相同的 workspace 布局（`apps/{electron,webui,cli}` + `packages/{core,shared,ui,server-core,server,pi-agent-server,session-tools-core}`）。MkAgent 沿用这套布局，丢弃了 Craft 中两个仅供产品使用的 package（`messaging-gateway`、`messaging-whatsapp-worker`），删除了整个 `apps/viewer` 应用，并且完全不实例化 Craft 的 session-MCP/bridge-MCP server。

| 指标 | MkAgent | Craft Agents | 备注 |
|---|---:|---:|---|
| 已跟踪的 TypeScript/TSX 行数（`*.ts`、`*.tsx`，排除 `node_modules`、`dist`、`release`、`.git`） | **190,558** | 344,964 | MkAgent 源码规模约 Craft 的 **55 %** |
| 当前 `git ls-files` 跟踪的源文件数 | 1,163 | ~1,719 | 与 Craft 同路径率 96 %（`bun run audit:craft-reuse`） |
| 同路径且归一化后逐字一致 | 686（59 %） | — | 归一化只允许机械替换：`@mkagent/*` ↔ `@craft-agent/*`、`mkagent://` 协议、`~/.mkagent` 配置根目录、品牌字符串 |
| 同路径但属于 Lite 定制缝 | 430 | — | Lite 边界（如 Sources/MCP 分支被删）+ 品牌替换 |
| MkAgent 独有源文件 | 47 | — | MkAgent 品牌资产、`audit:craft-reuse`、lint/CLI 脚本；等价于 Craft 的 `apps/online-docs` 文件已移除 |
| Craft 有而 MkAgent 没有的源文件 | — | 606 | 被 Lite 边界删除（Claude backend、OAuth、Sources、MCP、Messaging、Viewer、automations…） |
| `dependencies` 顶层条目 | 55 | 61 | MkAgent 删去 `@anthropic-ai/claude-agent-sdk`、`@anthropic-ai/sdk`、`@dnd-kit/{dom,helpers}`、`@github/copilot-sdk`、`@modelcontextprotocol/sdk`，以及 messaging OAuth 流程相关包；数字下降反映的是 Lite 后端注册表，不是运行时缺失 |
| `devDependencies` 顶层条目 | 33 | 34 | 唯一有意义的差异是 `@aws-sdk/client-s3`（只在上游 release 上传到 S3 时使用；MkAgent 的 `electron-updater` 走 GitHub Releases，不需要它） |
| 在干净 `bun install --frozen-lockfile` 下的 `node_modules/` 大小 | **2.0 GB** | 2.5 GB | 0.5 GB 差量与下文删除的 native + SDK bundle 一致 |

## 2. 实际存在的 apps 和 packages

| 路径 | MkAgent | Craft Agents |
|---|---|---|
| `apps/electron` | ✅（共享 renderer + preload + Browser 面板 + Sentry + 自动更新） | ✅（同） |
| `apps/webui` | ✅（通过浏览器 adapter 加载同一份 renderer） | ✅（同） |
| `apps/cli` | ✅（`run`、`session`、`workspace`、`send` 等） | ✅（同命令面 + Sources/Automations 额外子命令，MkAgent **不**暴露） |
| `apps/viewer` | ❌（已删除） | ✅（用于公开分享会话的独立 Electron Viewer） |
| `packages/core` | ✅ | ✅ |
| `packages/shared` | ✅（已移除 `messaging-gateway`、`interceptor-common`、`feature-flags`、`interceptor-request-utils`） | ✅（完整规模） |
| `packages/ui` | ✅ | ✅ |
| `packages/server-core` | ✅ | ✅ |
| `packages/server` | ✅（headless `MKAGENT_SERVER_TOKEN` server） | ✅ |
| `packages/pi-agent-server` | ✅（唯一注册的 backend） | ✅（与 Craft 的 `claude-agent-sdk` 并存） |
| `packages/session-tools-core` | ✅（Labels/Statuses/MCP/Sources OAuth 分支被裁剪） | ✅（完整规模） |
| `packages/messaging-gateway` | ❌（已删除） | ✅ |
| `packages/messaging-whatsapp-worker` | ❌（已删除） | ✅（基于 Baileys 的 WhatsApp worker） |
| `packages/session-mcp-server` | ❌（已删除） | ✅（被打包为 `resources/session-mcp-server/` 的 TypeScript MCP server） |
| `resources/bridge-mcp-server/` | ❌（已删除） | ✅（打包约 13 MB 的 TypeScript MCP server） |
| `resources/scripts/` + `resources/bin/` | ✅（`markitdown`、PDF、XLSX、DOCX、PPTX、图片、iCal、doc-diff 包装器 + Python 脚本 + `uv`） | ✅（同上包装器 + 在 `resources/bin/{darwin-arm64,darwin-x64,win32-x64,linux-x64}/uv` 下打包按平台分发的 **`uv`** 二进制） |

## 3. Backend / 运行时边界

| 维度 | MkAgent | Craft Agents |
|---|---|---|
| 已注册的 `AgentBackend` | 仅 `pi` | `pi`、`claude-agent-sdk`，外加可选的 **Copilot / gateway** 订阅 |
| 鉴权模型 | API key + 自定义端点 + Ollama（Pi 传输） | API key + 自定义 + **OAuth（Anthropic、OpenAI、GitHub Copilot、Google Workspace、Slack、Microsoft）** + 订阅流程 + gateway |
| 子进程模型 | `packages/pi-agent-server` 作为 Bun 子进程运行；通过 JSONL on stdio 通信 | Pi 子进程（同）**外加** SDK 子进程（`@anthropic-ai/claude-agent-sdk-binary`，每个平台架构约 217 MB 的 native `claude` 二进制）**外加** bridge/session MCP server **外加** WhatsApp worker 子进程 |
| 内置传输 | OpenAI-兼容、Anthropic-兼容、Ollama（Pi `0.80.6`） | 同上，外加 Anthropic SDK 直连模式与 Copilot SDK 模式 |
| 图片生成 | ❌（已删除；图片附件仍支持） | ✅（`gen_image` 模型 + 工具） |

## 4. 安装包体积（最关键的数字）

以下是真正会交付给用户的体积，来自磁盘上 `apps/electron/release/<arch>/MkAgent.app` 的 dev 构建，以及 audit 脚本读到的上游 `craft-agents-oss` checkout。**所有数字都不包含代码签名开销**（MkAgent dev 构建设置 `MKAGENT_DEV_RUNTIME=1`；使用 `CSC_IDENTITY_AUTO_DISCOVERY=false` 的 release 构建是 ad-hoc/未签名的）。Craft Agents 的对照数字直接来自 `node_modules`，其中 `claude-agent-sdk-darwin-arm64/claude` 二进制单文件 **217 MB**。

### 4.1 macOS arm64（`MkAgent.app` / `Craft-Agents-arm64.app`）

| 组件 | MkAgent | Craft Agents | 差量（Craft − MkAgent） |
|---|---:|---:|---:|
| `Contents/Resources/app/dist/`（打包的 JS、renderer 资源、脚本） | 116 MB | ~380 MB | ~−264 MB |
| `Contents/Resources/app/node_modules/`（运行时 node_modules + cron 包） | 5.0 MB | ~210 MB | ~−205 MB（Craft 还打包 SDK、MCP server、WhatsApp worker 等） |
| `Contents/Resources/app/vendor/`（Bun runtime） | 60 MB | 60 MB | 0 |
| 其他资源 / 签名 | 2 MB（icons、plists、codesign） | ~2 MB | ~0 |
| **小计** | **~183 MB** | **~652 MB** | **~−469 MB**（约 −72 %） |
| `Contents/Frameworks/Electron Framework.framework` | 253 MB | 253 MB | 0（Electron 版本相同：`39.2.7`） |
| `Contents/Frameworks/{Mantle,ReactiveObjC,Squirrel, Squirrel.framework}` | ~1 MB | ~1 MB | 0 |
| `MkAgent Helper*.app`（Renderer/GPU/Plugin） | ~1 MB | ~1 MB | 0 |
| **`MkAgent.app` 合计（未打包）** | **438 MB** | **~907 MB** | **~−469 MB** |

> 未打包 `.app` 已经包含 Helper apps 与 Electron framework；**不含**平台下载（DMG/ZIP 壳）。因为 `craft-agents-oss/node_modules/@anthropic-ai/claude-agent-sdk-darwin-arm64/claude` 单独就是一个 **217 MB** 的二进制，并且 `-darwin-x64` / `-win32-x64` / `-linux-x64` 的 per-platform `.zip` 体积相近，Craft 的 DMG/ZIP 压缩后**始终比 MkAgent 大 ≥ ~250 MB**。

### 4.2 `electron-builder` 通过 `extraResources` 实际携带的内容

| 安装包携带项 | MkAgent | Craft Agents | 携带体积 |
|---|---|---|---:|
| per-platform **`claude` native 二进制**（Anthropic SDK） | ❌ | ✅ | **每个平台架构约 217 MB** |
| 自带的 **`uv`** Python runtime（`darwin-{arm64,x64}/win32-x64/linux-x64` 各一份） | ❌（优先用系统 `uv`；通过 `MKAGENT_UV` 环境变量或 PATH 解析） | ✅ | 每个架构 ~30–55 MB |
| `@anthropic-ai/claude-agent-sdk` 精简 core + per-platform binary shim | ❌ | ✅ | core ~3.5 MB + binary 每个架构 ~217 MB |
| `bridge-mcp-server/`（Craft 的 MCP bridge） | ❌ | ✅ | ~13 MB |
| `session-mcp-server/`（Craft 的 session MCP） | ❌ | ✅ | ~50 KB TypeScript |
| WhatsApp worker（`packages/messaging-whatsapp-worker/dist/worker.cjs`，含自带的 Baileys） | ❌ | ✅ | worker ~8 MB + 传递依赖 |
| `resources/scripts/*.py`（PDF、DOCX、XLSX、PPTX、图片、iCal、doc-diff、MarkItDown 包装器） | ✅（同文件） | ✅ | Python ~110 KB；两者都保留 |
| `resources/bin/*-tool` shell 包装器 | ✅（同） | ✅ | 几乎可忽略 |
| `@vscode/ripgrep`（`server-core` 搜索用的 `rg`） | ✅（mac-arm64 上 4.3 MB） | ✅ | 4.3 MB |
| `vendor/bun`（Pi 子进程用的 Bun runtime） | ✅（mac-arm64 上 60 MB） | ✅ | 60 MB |
| `dist/resources/{themes,tool-icons,permissions,docs,release-notes}` | ✅ | ✅ | 数 MB |
| `dist/renderer/assets/`（KaTeX 字体、Shiki 语言、语言模式） | ✅（~51 MB） | ✅ | 完全相同 |

### 4.3 对终端用户的实际效果

| 效果 | MkAgent | Craft Agents |
|---|---|---|
| DMG（macOS arm64 / x64）下载包 | ~165 MB¹ | ~370 MB¹ |
| macOS `.app` 安装占用 | ~438 MB | ~907 MB |
| NSIS `.exe`（Windows x64） | ~210 MB¹ | ~430 MB¹ |
| Linux AppImage | ~200 MB¹ | ~420 MB¹ |
| 纯 CLI 模式（无 Electron） | `bun run cli:build` → `dist/mkagent` 约 1 MB；Craft 同 | ~1 MB（CLI payload 本身一致） |
| 冷启动首次运行耗时 | 更快（不必下载 ~217 MB 二进制） | 慢，需补齐 `claude` + `uv` 体积的下载 |

¹ **说明。** DMG / NSIS / AppImage 数字是从未打包 `.app` 大小以及 `electron-builder.yml` 的 `files` / `extraResources` 规则**推算**的，不是同窗口重建的实测值。重建 Craft 需要 `npm install` 才能下载 217 MB 的 Claude 二进制以及 per-platform `uv` 包（每个 ≥ 30 MB）；重建 MkAgent 则跳过这两项。

## 5. 功能面

| 范围 | MkAgent | Craft Agents |
|---|---|---|
| Electron Desktop + WebUI + headless server + CLI + 共享 renderer | ✅ | ✅ |
| Pi agent + Pi provider preset + API key 连接 | ✅ | ✅ |
| 自定义 OpenAI-completions / Anthropic-messages 端点 + Ollama | ✅ | ✅ |
| 本地多 workspace、默认 `default` slug、每窗口绑定 | ✅ | ✅ |
| 会话：新建 / 继续 / 取消 / 恢复 / flag / archive / 未读 / 搜索 / 导入 / 导出 / 分支 / 多窗口 | ✅ | ✅ |
| Skills（global / workspace / project）、mini chat、计划、annotations、follow-up | ✅ | ✅ |
| Browser 面板 + `web_search` + `web_fetch` | ✅ | ✅ |
| 权限（safe / allow-all）+ 权限询问 | ✅ | ✅ |
| 网络代理 | ✅ | ✅ |
| 通过 `electron-updater` 从 GitHub Releases 自动更新 | ✅（指向 `open-fox/mkagent-public`） | ✅（指向 `https://agents.craft.do/electron/latest`） |
| Sentry（`@sentry/electron` + `@sentry/react`）；以 `SENTRY_ELECTRON_INGEST_URL` 为门控 | ✅ | ✅ |
| Document tools（PDF / DOCX / XLSX / PPTX / 图片 / iCal / doc-diff / MarkItDown），基于 `uv` Python 包装 | ✅（优先系统 `uv`） | ✅（自带 per-platform `uv`） |
| Mini chat、`EditPopover`、mini model、标题与摘要 | ✅ | ✅ |
| 主题预设、亮/暗/跟随系统、i18n（`en`、`zh-Hans`） | ✅（继承 Craft 的 15 个主题） | ✅（同） |
| Tool icons、默认权限、"What's New" 公告 | ✅ | ✅ |
| Claude backend、Claude OAuth/订阅 | ❌ | ✅ |
| GitHub Copilot SDK + OAuth 订阅 | ❌ | ✅ |
| 外部 messaging gateway + WhatsApp / Slack / Lark worker | ❌ | ✅ |
| Sources（API Source、MCP Source、MCP pool），Source OAuth 流程 | ❌ | ✅ |
| Session MCP server、bridge MCP server | ❌ | ✅ |
| Viewer（独立 Electron 应用，用于分享会话） | ❌ | ✅ |
| 公开分享、远程 workspace 联邦/转移 | ❌ | ✅ |
| 产品 Automations / scheduler / 周期任务 | ❌ | ✅ |
| 会话 labels + 用户自定义 status（设置 UI） | ❌ | ✅ |
| Projects / Kanban | ❌ | ✅ |
| 由 Claude / gateway 提供的 OAuth callback server、deep link | ❌ | ✅ |
| 图片生成（`gen_image` 工具 + provider 路由） | ❌ | ✅ |

## 6. 测试 / typecheck / lint 覆盖率差异

| 检查 | MkAgent | Craft Agents | 结果 |
|---|---|---|---|
| `bun run test`（主测试套件） | 3,078 通过 / 11 平台条件 skip | （量级接近；新 checkout 全量数待补） | 都绿 |
| `bun run test:doc-tools` | 8 个 Python smoke 测试：pdf_tool、xlsx_tool、docx_tool、pptx_tool、img_tool、ical_tool、doc_diff、markitdown | （同） | 都绿 |
| `bun run typecheck:all` | 通过；`apps/online-docs` 通过 `workspaces` glob 在 MkAgent 工作区中被排除，Craft 也是同样跳过 | 通过 | 都绿 |
| `bun run lint` | `lint:craft-ui-sync`、`lint:craft-test-coverage`、`lint:electron`、`lint:shared`、`lint:ui` 通过；保留上游的 **20 个 React Hook `exhaustive-deps` 警告** | 额外有 `lint:ipc-sends`、`lint:tool-name-checks`、`lint:i18n:coverage`、`lint:i18n:strings`；**45 个 React Hook 警告** | MkAgent 的 lint 范围更窄 |
| `bun run audit:craft-reuse` | 同路径 96 %、逐字一致 59 %、无解释缺失 0 条 | （不适用） | 绿 |
| `bun run lint:craft-test-coverage` | 246 保留 / 6 替代 / 121 因 Lite 边界剔除 / **0 条无解释缺失** | （不适用） | 绿 |

MkAgent 那边"零无解释缺失"的硬约束来自 [`scripts/check-craft-test-coverage.ts`](../../scripts/check-craft-test-coverage.ts)：每个上游 test 必须满足以下三项之一——(a) 同路径保留；(b) 替换为 Lite 等价测试；(c) 显式绑定到一项已删除的产品能力。

## 7. 许可证与归属

两个项目均以 **Apache-2.0** 发布。MkAgent 在仓库根目录提供 [`NOTICE`](../../NOTICE)，按上游要求保留归属；[`docs/feature-matrix.md`](./feature-matrix.md) 以可读文本记录保留/删除范围。`mkagent-public`（<https://github.com/open-fox/mkagent-public>）只托管 release 产物（DMG/ZIP/NSIS/AppImage、manifest、blockmap、checksum），不包含源码。

## 8. 重跑本审计

```bash
# 在 MkAgent checkout
git rev-parse HEAD              # 记下 MkAgent commit
bun install --frozen-lockfile
bun run audit:craft-reuse       # 96 % 同路径 / 59 % 逐字一致
bun run lint:craft-test-coverage
bun run typecheck:all
bun run lint
bun run validate:ci

# 在上游 Craft Agents checkout
git checkout a60ebc1a5a7cb0a6af7a77d5eed0512c5fc07658
ls -lah node_modules/@anthropic-ai/claude-agent-sdk-darwin-arm64/claude   # 217 MB 二进制
```

如需最新的 DMG / NSIS / AppImage 实测数据，请用记录的 commit 在两侧都跑同样的 `electron-builder.yml` 标志构建，然后复用 [`scripts/build-server.ts`](../../scripts/build-server.ts) 与各平台 `apps/electron/scripts/build-dmg.sh` 生成安装包。
