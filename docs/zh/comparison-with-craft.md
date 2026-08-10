# MkAgent vs Craft Agents 当前差异对比

> 数字快照时间：**2026-07-30**。
> 对比基线：MkAgent `main` 工作区（HEAD `47d09e5 feat: Add Chinese documentation`）；上游仓库 [`craft-ai-agents/craft-agents-oss` `v0.11.2` / `a60ebc1a5a7c`](https://github.com/craft-ai-agents/craft-agents-oss)。能力章节已同步 Desktop 专用 OpenConnector `v1.3.5` 集成，但下文 LOC、测试数量与安装包体积仍是接入 OpenConnector 前记录的快照。重新构建和测量之前，不应把这些数字当作当前值；本文也不声明当前分支拓扑。
> 数据来源：两个仓库记录时的 on-disk 工作区与既有构建产物（非本轮新抓的网络数据）；重跑前请用记录中的 commit 重新 checkout 两个仓库。

本文用源码与构件证据解释 MkAgent 相对 Craft Agents 保留了什么、物理删除了什么、以及这些选择会怎样改变你最终交付的安装包。MkAgent 是基于同一套架构与 renderer 的"Lite"衍生版；下面的表格是"现在到底哪里不一样"的标准答案。

## 1. 仓库与源码规模

两个仓库都是 Bun monorepo，使用相同的 workspace 布局（`apps/{electron,webui,cli}` + `packages/{core,shared,ui,server-core,server,pi-agent-server,session-tools-core}`）。MkAgent 沿用这套布局，丢弃了 Craft 中两个仅供产品使用的 package（`messaging-gateway`、`messaging-whatsapp-worker`），删除了整个 `apps/viewer` 应用，并且完全不实例化 Craft 的 session-MCP/bridge-MCP server。MkAgent 另外把 OpenConnector `v1.3.5` 固定为 `vendor/open-connector`；它不是恢复的 Craft package。

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
| `apps/electron` | ✅（共享 renderer + preload + Browser 面板 + OpenConnector 控制台/sidecar + Sentry + 自动更新） | ✅（相同基础应用，但没有 MkAgent 的 OpenConnector 集成） |
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
| `vendor/open-connector` | ✅（`v1.3.5` submodule；仅 Electron 的内置 sidecar） | ❌ |
| `resources/scripts/` + `resources/bin/` | ✅（`markitdown`、PDF、XLSX、DOCX、PPTX、图片、iCal、doc-diff 包装器 + Python 脚本 + 内置的 **per-platform `uv`**） | ✅（相同包装器与 per-platform `uv` 布局） |

## 3. Backend / 运行时边界

| 维度 | MkAgent | Craft Agents |
|---|---|---|
| 已注册的 `AgentBackend` | 仅 `pi` | `pi`、`claude-agent-sdk`，外加可选的 **Copilot / gateway** 订阅 |
| 鉴权模型 | API key + 自定义端点 + Ollama + **ChatGPT/Claude 订阅 OAuth**，全部通过 Pi | API key + 自定义 + **OAuth（Anthropic、OpenAI、GitHub Copilot、Google Workspace、Slack、Microsoft）** + 订阅流程 + gateway |
| 子进程模型 | `packages/pi-agent-server` 作为 Bun 子进程通过 JSONL 通信；Electron 还会启动内置 OpenConnector `v1.3.5` loopback sidecar | Pi 子进程（同）**外加** SDK 子进程（`@anthropic-ai/claude-agent-sdk-binary`，每个平台架构约 217 MB 的 native `claude` 二进制）**外加** bridge/session MCP server **外加** WhatsApp worker 子进程 |
| 内置传输 | OpenAI-兼容、Anthropic-兼容、Ollama（Pi `0.80.6`） | 同上，外加 Anthropic SDK 直连模式与 Copilot SDK 模式 |
| 图片生成 | ❌（未接入生图工具；图片附件仍支持） | ❌（未注册生图工具；底层 `pi-ai` 依赖包含未接入的 OpenRouter 图片生成 API） |

这里的“图片生成”指 Agent 可调用的产品能力，而不是依赖包是否包含相关 API。MkAgent 与当前对照的 Craft 源码都没有 `gen_image` 的实现或工具注册；两者使用的 `@earendil-works/pi-ai` 依赖虽然提供独立的 `ImagesModel` / `generateImages()` 抽象及 OpenRouter provider，但 Craft 只接入了普通模型目录和对话调用链。`supportsImages` 则表示对话模型能否接收图片附件，属于图片输入/视觉能力，也不代表能够生成图片。

## 4. Agent tools —— 模型实际能调用的工具

两边都通过三个基础通道把工具暴露给 LLM：(a) Pi SDK 自带的工具，在 `packages/pi-agent-server/src/index.ts` 的 `builtinDefs` 里实例化；(b) Web 工具，同一文件里通过 `createSearchTool` + `createWebFetchTool` 声明；(c) 会话级工具，由主进程通过 `register_tools` 消息注册到 Pi 子进程，模型侧以 `mcp__session__<name>` 前缀看到（详见 `packages/session-tools-core/src/tool-defs.ts`）。MkAgent Desktop 通过专用 sidecar bridge，把五个固定 `mcp__open_connector__*` 定义追加到同一条注册消息。这不是 `mcpPool`：Craft 还会从 `mcpPool` 暴露任意已配置 Source，而 MkAgent 仍然没有 pool，也没有 `registerPoolToolsWithSubprocess()` 调用。

### 4.1 Pi SDK 内置工具（两边完全一致）

两份仓库都从 `@earendil-works/pi-coding-agent` 导入同一组 helper，按相同顺序实例化：

| Tool | 用途 |
|---|---|
| `read` | 读文件内容 |
| `bash` | 执行 shell 命令 |
| `edit` | 就地编辑文件 |
| `write` | 创建或覆盖文件 |
| `grep` | 在文件内容里搜索 |
| `find` | 按名称模式定位文件 |
| `ls` | 列目录内容 |

`packages/pi-agent-server/src/index.ts:30–36` 导入 `createReadToolDefinition`、`createBashToolDefinition`、`createEditToolDefinition`、`createWriteToolDefinition`、`createGrepToolDefinition`、`createFindToolDefinition`、`createLsToolDefinition`；607–614 用 `cwd` 实例化。Craft 中同样 offset 的位置导出的是同一组 import。

### 4.2 Web 工具（两边完全一致）

| Tool | 源文件 | 备注 |
|---|---|---|
| `web_search` | `packages/pi-agent-server/src/tools/search/create-search-tool.ts:61` | provider-agnostic；没有 key 时回退到 DuckDuckGo |
| `web_fetch` | `packages/pi-agent-server/src/tools/web-fetch.ts:338` | 最多 50 MB；通过 Turndown 转 Markdown；最多返回 50 000 字符 |

### 4.3 会话级 `mcp__session__*` 工具 —— 真正的砍点

`packages/session-tools-core/src/tool-defs.ts` 的 `SESSION_TOOL_DEFS` 是单一来源。模型看到的每个条目都带 `mcp__session__` 前缀。MkAgent 保留 **15** 个，Craft 暴露 **27** 个。

| 工具（模型侧名称） | MkAgent | Craft | 作用 / MkAgent 删除原因 |
|:---:|:---:|:---:|:---|
| `mcp__session__SubmitPlan` | ✅ | ✅ | 计划评审；提交 plan 文件并暂停当前 turn |
| `mcp__session__browser_tool` | ✅ | ✅ | 控制 Browser 面板 |
| `mcp__session__call_llm` | ✅ | ✅ | 内部 mini-LLM 调用（标题、摘要、脚本） |
| `mcp__session__config_validate` | ✅ | ✅ | 在保存前校验 workspace `config.json` 补丁 |
| `mcp__session__get_session_info` | ✅ | ✅ | 读会话元数据 |
| `mcp__session__list_background_tasks` | ✅ | ✅ | 列出在飞的后台任务 |
| `mcp__session__list_sessions` | ✅ | ✅ | 列出当前 workspace 的兄弟会话 |
| `mcp__session__mermaid_validate` | ✅ | ✅ | 校验 Mermaid 源码 |
| `mcp__session__script_sandbox` | ✅ | ✅ | 在沙盒化的 `uv` 环境里跑 Python 脚本 |
| `mcp__session__send_agent_message` | ✅ | ✅ | 把消息转发到兄弟或派生会话 |
| `mcp__session__send_developer_feedback` | ✅ | ✅ | 发送反馈通道 |
| `mcp__session__skill_validate` | ✅ | ✅ | 校验 Skill 的 frontmatter 与正文 |
| `mcp__session__spawn_session` | ✅ | ✅ | 派生一个子会话（精简版，没有完整 conductor） |
| `mcp__session__transform_data` | ✅ | ✅ | 对数据应用 transform 表达式 |
| `mcp__session__update_user_preferences` | ✅ | ✅ | 持久化用户偏好覆写 |
| `mcp__session__create_task` | ❌ | ✅ | Tasks conductor 入口。产品级 Automations 已删除；底层 task 注册表保留以支撑后台工作，但没有模型侧入口。 |
| `mcp__session__list_messaging_channels` | ❌ | ✅ | 列出已绑定的外部 messaging channel。和 messaging gateway 一起删除。 |
| `mcp__session__unbind_messaging_channel` | ❌ | ✅ | `list_messaging_channels` 的对应动作；同上。 |
| `mcp__session__render_template` | ❌ | ✅ | 模板渲染助手。属于会话工具渲染禁用的一部分删除；见 `migration/migration-features.md`。 |
| `mcp__session__set_session_labels` | ❌ | ✅ | 在会话上设置用户自定义 label。MkAgent 没有 label 产品面。 |
| `mcp__session__set_session_status` | ❌ | ✅ | 在会话上设置用户自定义 status。MkAgent 没有用户自定义 status。 |
| `mcp__session__source_credential_prompt` | ❌ | ✅ | Source 的 OAuth 凭证输入。和 Sources 一起删除。 |
| `mcp__session__source_oauth_trigger` | ❌ | ✅ | 通用 Source OAuth 触发器。 |
| `mcp__session__source_google_oauth_trigger` | ❌ | ✅ | Google OAuth Source 触发器。 |
| `mcp__session__source_microsoft_oauth_trigger` | ❌ | ✅ | Microsoft OAuth Source 触发器。 |
| `mcp__session__source_slack_oauth_trigger` | ❌ | ✅ | Slack OAuth Source 触发器。 |
| `mcp__session__source_test` | ❌ | ✅ | 在一个 turn 里探测一个 Source。 |

### 4.4 Source pool / MCP 工具

Craft 在 `mcpPool` 里注册所有 Source（API Source、MCP Source）暴露的 proxy 工具，并通过第二个 `register_tools` 消息把这些 tool 定义发到 Pi 子进程（`packages/shared/src/agent/pi-agent.ts` 的 `registerPoolToolsWithSubprocess`）。同时 Craft 自带 `bridge-mcp-server` 和 `session-mcp-server` 两个 MCP server 包。MkAgent 没有 `mcpPool`，也不带这两个 MCP 包。

| Source / MCP 通道 | MkAgent | Craft | 备注 |
|:---:|:---:|:---:|:---|
| API Source 代理（HTTP / GraphQL 等） | ❌ | ✅ | 通过 Sources UI 配置的真实 API 端点 |
| MCP Source 代理（stdio MCP server） | ❌ | ✅ | 每个 Source 一个独立 MCP 进程，自带权限 |
| `bridge-mcp-server`（Craft 自带 MCP bridge，约 13 MB） | ❌ | ✅ | 放在 `resources/bridge-mcp-server/` 下的 TypeScript MCP server |
| `session-mcp-server`（Craft 自带 session MCP） | ❌ | ✅ | 放在 `resources/session-mcp-server/` 下的 TypeScript MCP server |
| Source 凭证输入和 OAuth 流程 | ❌ | ✅ | 由上面的 `source_credential_prompt` 与四个 `source_*_oauth_trigger` 工具驱动 |

### 4.5 专用 OpenConnector 工具（仅 MkAgent Desktop）

Electron bridge 会校验固定 OpenConnector `v1.3.5` sidecar 返回的工具清单；缺少工具或出现未预期名称都会拒绝注册。MkAgent WebUI、headless server 与 CLI 不会暴露这些工具，也不会因此允许用户配置任意 MCP server。

| 模型侧工具名 | MkAgent Desktop | 其他 MkAgent 客户端 | Craft | 行为 |
|---|:---:|:---:|:---:|---|
| `mcp__open_connector__list_apps` | ✅ | ❌ | ❌ | 只读 provider/app 发现 |
| `mcp__open_connector__list_connections` | ✅ | ❌ | ❌ | 只读 connection 发现 |
| `mcp__open_connector__search_actions` | ✅ | ❌ | ❌ | 只读 action 搜索 |
| `mcp__open_connector__get_action_guide` | ✅ | ❌ | ❌ | 只读 action/输入指南 |
| `mcp__open_connector__execute_action` | ✅ | ❌ | ❌ | 外部修改路径；`safe` 中拦截，Ask mode 中询问权限，只有显式 `allow-all` 才绕过询问 |

控制台、数据路径、secrets 与重试行为见 [`open-connector.md`](./open-connector.md)。

### 4.6 Claude backend 工具（只在 Craft 存在）

Craft 注册的第二个 backend 是 `claude-agent-sdk`，自带的 Claude Code 风格工具，Pi 并不定义。MkAgent 没有 Claude backend，因此这些工具全部不存在。Claude backend 绑定在仓库里物理删除 —— `packages/shared/src/agent/backend/internal/drivers/` 下没有 `claude-agent-sdk` driver —— 即便在系统 prompt 里看到一个 Claude 工具名，MkAgent 也没有执行路径。

| Tool | 所属 backend | MkAgent | Craft |
|---|---|:---:|:---:|
| `TodoWrite` | claude-agent-sdk | ❌ | ✅ |
| `NotebookEdit` | claude-agent-sdk | ❌ | ✅ |
| `MultiEdit` | claude-agent-sdk | ❌ | ✅ |
| Claude SDK 原生的 `Read` / `Write` / `Edit` / `Bash` / `Grep` / `Glob` / `WebFetch` / `WebSearch` | claude-agent-sdk | ❌ | ✅ |

### 4.7 一个 turn 里模型实际能调用的工具数

只统计运行时模型可调用的工具，假设 Craft 没有用户配置 Source，并且 MkAgent Desktop 的内置 sidecar 可用：

| 工具来源 | MkAgent | Craft |
|---|---:|---:|
| Pi SDK 内置（§4.1） | 7 | 7 |
| Web 工具（§4.2） | 2 | 2 |
| 会话级 `mcp__session__*` | 15 | 27 |
| 专用 OpenConnector bridge（§4.5） | Desktop 为 5；WebUI/headless/CLI 为 0 | 0 |
| Source / MCP pool（`mcpPool`） | 0 | 0（Craft 会按配置的 Source 动态增长） |
| Claude SDK 工具 | 0 | 每个 session 不固定 |
| **默认基线** | **Desktop 为 29；WebUI/headless/CLI 为 24** | **36** |

被砍掉的 12 个 `mcp__session__*` 工具仍然一对一落在 Lite 边界删除清单上（通用 Sources/MCP、OAuth、labels、statuses、messaging、task conductor、template renderer）。五个 OpenConnector 工具属于另一条固定、仅 Desktop 的 bridge，不代表撤销这些删除项。


## 5. 安装包体积（最关键的数字）

以下是磁盘上 `apps/electron/release/<arch>/MkAgent.app` dev 构建与 audit 脚本读取的上游 `craft-agents-oss` checkout 所记录的**接入 OpenConnector 前**体积。它们已不能代表当前 MkAgent Desktop 安装包，因为现在还会打包 OpenConnector runtime 与 Web 控制台。**所有数字都不包含代码签名开销**（记录时的 MkAgent dev 构建设置 `MKAGENT_DEV_RUNTIME=1`；使用 `CSC_IDENTITY_AUTO_DISCOVERY=false` 的 release 构建是 ad-hoc/未签名的）。Craft Agents 的对照数字直接来自 `node_modules`，其中 `claude-agent-sdk-darwin-arm64/claude` 二进制单文件 **217 MB**。

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
| 自带的 **`uv`** Python launcher（位于 `resources/bin/<platform-arch>/`） | ✅（`uv 0.10.6`；通过 `MKAGENT_UV` 注入） | ✅ | 每个安装包携带目标架构约 ~30–55 MB |
| `@anthropic-ai/claude-agent-sdk` 精简 core + per-platform binary shim | ❌ | ✅ | core ~3.5 MB + binary 每个架构 ~217 MB |
| `bridge-mcp-server/`（Craft 的 MCP bridge） | ❌ | ✅ | ~13 MB |
| `session-mcp-server/`（Craft 的 session MCP） | ❌ | ✅ | ~50 KB TypeScript |
| OpenConnector `v1.3.5` runtime + Web 控制台（`dist/resources/open-connector`） | ✅（仅 Desktop） | ❌ | 本快照未测量 |
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
| `uv` 缓存为空时首次调用文档工具 | 可能按需下载 Python 3.12 与脚本声明的依赖 | 相同 |

¹ **说明。** DMG / NSIS / AppImage 数字是从旧的未打包 `.app` 大小以及 `electron-builder.yml` 的 `files` / `extraResources` 规则推算的**接入 OpenConnector 前数值**，不是同窗口重建的实测值，也不包含新的 OpenConnector payload。两边的 release pipeline 都会下载或复制目标平台的 `uv`；Craft 还会引入约 217 MB 的 Claude SDK 二进制，MkAgent 跳过的是这部分 backend payload，而不是 `uv`。发布新的体积对比前，必须重新构建所有目标格式。

## 6. 功能面

| 范围 | MkAgent | Craft Agents |
|---|---|---|
| Electron Desktop + WebUI + headless server + CLI + 共享 renderer | ✅ | ✅ |
| Pi agent + Pi provider preset + API key 连接 | ✅ | ✅ |
| 自定义 OpenAI-completions / Anthropic-messages 端点 + Ollama | ✅ | ✅ |
| 本地多 workspace、默认 `default` slug、每窗口绑定 | ✅ | ✅ |
| 会话：新建 / 继续 / 取消 / 恢复 / flag / archive / 未读 / 搜索 / 导入 / 导出 / 分支 / 多窗口 | ✅ | ✅ |
| Skills（global / workspace / project）、mini chat、计划、annotations、follow-up | ✅ | ✅ |
| Browser 面板 + `web_search` + `web_fetch` | ✅ | ✅ |
| OpenConnector `v1.3.5` Providers/Actions/Runs 控制台 + 五个固定 Pi 工具 | ✅（仅 Electron Desktop） | ❌ |
| 权限（Explore/safe、Ask、Execute/allow-all）+ 权限询问 | ✅ | ✅ |
| 网络代理 | ✅ | ✅ |
| 通过 `electron-updater` 从 GitHub Releases 自动更新 | ✅（指向 `MkThingsHQ/mkagent`） | ✅（指向 `https://agents.craft.do/electron/latest`） |
| Sentry（`@sentry/electron` + `@sentry/react`）；以 `SENTRY_ELECTRON_INGEST_URL` 为门控 | ✅ | ✅ |
| Document tools（PDF / DOCX / XLSX / PPTX / 图片 / iCal / doc-diff / MarkItDown），基于 `uv` Python 包装 | ✅（自带 per-platform `uv`；开发期可从 PATH 回退） | ✅（自带 per-platform `uv`） |
| Mini chat、`EditPopover`、mini model、标题与摘要 | ✅ | ✅ |
| 主题预设、亮/暗/跟随系统、i18n（`en`、`zh-Hans`） | ✅（继承 Craft 的 15 个主题） | ✅（同） |
| Tool icons、默认权限、"What's New" 公告 | ✅ | ✅ |
| Claude Agent SDK backend | ❌ | ✅ |
| Claude Pro/Max OAuth 订阅 | ✅（Pi） | ✅（默认 Claude SDK） |
| ChatGPT Plus OAuth 订阅 | ✅（Pi） | ✅（Pi） |
| GitHub Copilot SDK + OAuth 订阅 | ❌ | ✅ |
| 外部 messaging gateway + WhatsApp / Slack / Lark worker | ❌ | ✅ |
| 通用 Sources（API Source、MCP Source、用户可配置 MCP pool），Source OAuth 流程 | ❌；固定 OpenConnector bridge 不是通用 Source | ✅ |
| Session MCP server、bridge MCP server | ❌ | ✅ |
| Viewer（独立 Electron 应用，用于分享会话） | ❌ | ✅ |
| 公开分享、远程 workspace 联邦/转移 | ❌ | ✅ |
| 产品 Automations / scheduler / 周期任务 | ❌ | ✅ |
| 会话 labels + 用户自定义 status（设置 UI） | ❌ | ✅ |
| Projects / Kanban | ❌ | ✅ |
| LLM 订阅 OAuth callback | ✅（ChatGPT Desktop callback；Claude code flow） | ✅ |
| 通用 / Sources / gateway OAuth | ❌ | ✅ |
| 产品级图片生成工具 | ❌ | ❌（底层依赖有未接入的图片生成 API） |

## 7. 测试 / typecheck / lint 覆盖率差异

下面的数量同样来自 2026-07-30 快照，因此不包含后来新增的 OpenConnector sidecar、工具 contract、权限与 Electron 集成测试。

| 检查 | MkAgent | Craft Agents | 结果 |
|---|---|---|---|
| `bun run test`（主测试套件） | 3,078 通过 / 11 平台条件 skip | （量级接近；新 checkout 全量数待补） | 都绿 |
| `bun run test:doc-tools` | 8 个 Python smoke 测试：pdf_tool、xlsx_tool、docx_tool、pptx_tool、img_tool、ical_tool、doc_diff、markitdown | （同） | 都绿 |
| `bun run typecheck:all` | 通过；`apps/online-docs` 通过 `workspaces` glob 在 MkAgent 工作区中被排除，Craft 也是同样跳过 | 通过 | 都绿 |
| `bun run lint` | `lint:craft-ui-sync`、`lint:craft-test-coverage`、`lint:electron`、`lint:shared`、`lint:ui` 通过；保留上游的 **20 个 React Hook `exhaustive-deps` 警告** | 额外有 `lint:ipc-sends`、`lint:tool-name-checks`、`lint:i18n:coverage`、`lint:i18n:strings`；**45 个 React Hook 警告** | MkAgent 的 lint 范围更窄 |
| `bun run audit:craft-reuse` | 同路径 96 %、逐字一致 59 %、无解释缺失 0 条 | （不适用） | 绿 |
| `bun run lint:craft-test-coverage` | 246 保留 / 6 替代 / 121 因 Lite 边界剔除 / **0 条无解释缺失** | （不适用） | 绿 |

MkAgent 那边"零无解释缺失"的硬约束来自 [`scripts/check-craft-test-coverage.ts`](../../scripts/check-craft-test-coverage.ts)：每个上游 test 必须满足以下三项之一——(a) 同路径保留；(b) 替换为 Lite 等价测试；(c) 显式绑定到一项已删除的产品能力。

## 8. 许可证与归属

两个项目均以 **Apache-2.0** 发布。MkAgent 在仓库根目录提供 [`NOTICE`](../../NOTICE)，按上游要求保留归属；[`docs/feature-matrix.md`](./feature-matrix.md) 以可读文本记录保留/删除范围。源码与 release 产物（DMG/ZIP/NSIS/AppImage、manifest、blockmap、checksum）现在统一放在 `MkThingsHQ/mkagent`，不再维护仅存放产物的镜像仓库。

## 9. 重跑本审计

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
