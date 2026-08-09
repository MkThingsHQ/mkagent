# 架构

MkAgent 是一个 Bun monorepo，三种客户端共用同一套经过鉴权的 WebSocket RPC 协议。唯一注册的 backend 是 `pi`。OpenConnector 是单独的 Desktop sidecar，不是另一个 agent backend。

## 分层拓扑

```text
+-----------------------------------------------------------+
| apps/electron       apps/webui         apps/cli           |
|   Electron             浏览器            RPC 客户端        |
|   (Browser 面板、      adapter(通过      (连接已运行的      |
|   OpenConnector、      头部握手加载      server,或在        |
|   Sentry、自动         同一份 React)     --run 模式下       |
|   更新、IPC)                          启动一次性 server)  |
+---------|----------------|--------------------|-------------+
          v                v                    v
   Browser adapter  ──>  preload Client API  ──> RPC client
                         (window.MkAgent)        (rpc-client.ts)
                                                       |
                                                  WebSocket (wss://)
                                                       v
+-----------------------------------------------------------+
| packages/server-core                                      |
|   transport (WS server + JWT) / SessionManager /           |
|   handlers / services / webui (HTTP+sessions) /            |
|   model-fetchers / sessions                               |
+---------|---------------------------------------|
          v                                       |
   packages/server (headless `MKAGENT_SERVER_TOKEN` 服务)
          v                                       |
+-----------------------------------------------------------+
| packages/shared                                           |
|   config / credentials / prompts / Skills /               |
|   workspaces / views / theme / i18n / AgentEvent /         |
|   backend registry(仅 `pi`)                               |
+-----------------------------------------------------------+
          |
          v
+-----------------------------------------------------------+
| packages/pi-agent-server                                  |
|   Bun 子进程，stdio 上的 JSONL,与 Pi SDK 通信              |
+-----------------------------------------------------------+
          v
+-----------------------------------------------------------+
| packages/ui            packages/session-tools-core        |
|   React primitives、    LLM 驱动的会话工具                |
|   markdown/doc         (plan、skill、mermaid、             |
|   renderer、IPC、       convert、mini LLM、browser、        |
|   设置页                session info/list 等)             |
+-----------------------------------------------------------+
```

三种客户端操作同一份 workspace 与 JSONL 会话。OpenConnector 是明确的存储例外：它的数据库、连接与自动生成的 secrets 位于 `$CONFIG_DIR/connectors/open-connector/`，并且只供 Electron 使用。

## Apps

- `apps/electron` 内嵌本地 server,通过 preload 暴露 Client API,负责窗口、Browser 面板、OpenConnector sidecar/控制台、代理集成、自动更新与 Sentry。
- `apps/webui` 通过浏览器 adapter 加载同一份 React 应用。headless server 同时托管其静态资源与经过鉴权的附件端点。
- `apps/cli` 使用同一套 RPC 方法,可以连接到已运行的 server,也可以在 `--run` 时启动一次性本地实例。

## Desktop 专用 OpenConnector 边界

Electron 会在 loopback 上启动固定为 `v1.3.5` 的 OpenConnector runtime，并嵌入其 Providers/Actions/Runs Web 控制台。Pi 会话 bridge 只从这个 sidecar 发现五个固定工具。WebUI、headless server 与 CLI 都不会注册这条路径。

```text
Electron main
  ├─ 嵌入: Providers / Actions / Runs 控制台
  ├─ 启动: vendor/open-connector sidecar (127.0.0.1)
  │           ├─ 已鉴权 HTTP 控制台
  │           └─ 已鉴权 MCP endpoint
  └─ 把五个 mcp__open_connector__* 工具桥接到 Desktop Pi 会话
```

sidecar 的 MCP transport 只是这条固定 bridge 的实现细节。MkAgent 仍然没有通用 Source registry、用户可配置的 MCP pool，也没有 Craft 的 session/bridge MCP server。详见 [`open-connector.md`](./open-connector.md)。

## 共享 package

- `packages/server-core` 负责 transport、handler、`SessionManager` 与跨平台服务,内含子目录: `bootstrap/`、`domain/`、`handlers/`、`model-fetchers/`、`runtime/`、`services/`、`sessions/`、`transport/`、`utils/`、`webui/`。
- `packages/shared` 负责协议 DTO(`@mkagent/shared/protocol`)、配置、凭证、Skills、提示词、backend registry、workspace 存储与 Pi 客户端。
- `packages/pi-agent-server` 在独立 Bun 子进程(`packages/pi-agent-server/dist/index.js`)中运行 Pi,通过 JSONL 通信。开发与打包产物共用同一 SDK;`bun run server:build:subprocess` 负责打包。
- `packages/ui` 与 `packages/session-tools-core` 提供共享渲染与会话级工具。Electron、WebUI、CLI 都复用它们,和平台无关。

## Backend registry

唯一注册的是 `pi` backend。自定义端点(`openai-completions`、`anthropic-messages`)和 Ollama 都是通过 Pi 执行的连接变体,不构成独立 backend。注册表在 `packages/server/src/index.ts` 与 `apps/electron/src/main` 中通过 `registerPiModelResolver(...)` 初始化。

## 鉴权握手

1. server 绑定 `MKAGENT_RPC_HOST:MKAGENT_RPC_PORT`(默认 `127.0.0.1:9100`)。
2. bearer token 从 `MKAGENT_SERVER_TOKEN` 读取(Electron 启动时会自动生成;headless server 必须显式传入)。
3. token 兑换为短生命周期 JWT,后续每个 WebSocket 帧都使用(`@mkagent/server-core/webui`)。
4. WebUI 与 CLI 额外支持 `MKAGENT_WEBUI_PASSWORD`(回退到 `MKAGENT_SERVER_TOKEN`)和可选的 `MKAGENT_TLS_CA` 用于 TLS pinning。
5. 握手时绑定 workspace id;后续 RPC 命令都作用域在该 workspace 内,只会看到它自己的会话、Skills、权限与 Views。

## 子进程边界

Pi 子进程与主进程隔离:

```text
主进程 (Bun)
  └─ spawns: bun packages/pi-agent-server/dist/index.js
              ↕ JSONL on stdio(每个 turn 事件一个 JSON 对象)
              Pi SDK ↔ provider (HTTPS)
```

取消、模型切换、thinking level 调整、权限响应、会话恢复全部走同一 JSONL 流。Pi 恢复文件保存在 `~/.mkagent/workspaces/<slug>/sessions/<id>/` 下。

## 打包面

- Desktop 应用:macOS arm64 / x64(DMG + ZIP)、Windows x64(NSIS)、Linux x64(AppImage)。构建入口 `bun run electron:dist[:dev][:mac|:win|:linux]`。
- OpenConnector sidecar:`vendor/open-connector` 固定为 `v1.3.5`;Electron 资源构建会准备其生产 runtime 与 Web 控制台,并复制到 Desktop 安装包。
- Headless server:每平台 Bun 二进制,放在 `apps/cli` 与 `packages/server`;通过 `bun run scripts/build-server.ts` 构建。
- CLI:`bun run cli:build` 输出 `dist/mkagent`。
- Pi 子进程:`bun run server:build:subprocess` 输出 `packages/pi-agent-server/dist/index.js`。

`mkagent-public`(public 仅 release 仓库)接收 DMG/ZIP/NSIS/AppImage 以及 `latest-mac.yml` / `latest.yml` / `latest-linux.yml` manifest 与 blockmap。`electron-updater` 读取这些 manifest,客户端不带任何 GitHub token。

## 刻意不存在的部分

Craft Agents 自带广泛的 OAuth 与通用 Sources 集成、Slack/Teams/Lark messaging gateway、基于 Baileys 的 WhatsApp worker、session MCP server、bridge MCP server 和独立 `apps/viewer` Electron 应用。MkAgent 在这一范围内仅保留 ChatGPT 与 Claude 的 LLM OAuth 流程；这些通用 Sources/MCP 组件仍不打包。独立固定版本的 OpenConnector sidecar 不会恢复它们。Craft 使用的底层 `pi-ai` 依赖虽然包含 OpenRouter 图片生成 API，但 Craft 和 MkAgent 都没有把它注册为 Agent 工具。具体对比见 [`comparison-with-craft.md`](./comparison-with-craft.md)；其中安装包体积是日期快照，加入 OpenConnector 打包资源后需要重新测量。
