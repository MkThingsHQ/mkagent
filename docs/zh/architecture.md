# 架构

MkAgent 是一个 Bun monorepo，三种客户端共用同一套经过鉴权的 WebSocket RPC 协议。

- `apps/electron` 内嵌本地 server，通过 preload 暴露 Client API，并负责窗口、Browser 面板、代理集成、自动更新和 Sentry。
- `apps/webui` 通过浏览器适配层加载同一份 React 应用。静态资源与经过鉴权的附件端点由 headless server 同源托管。
- `apps/cli` 使用同一套 RPC 方法，可以连接到已运行的 server，也可以临时启动一个本地实例。
- `packages/server-core` 负责 transport、handler、`SessionManager` 与跨平台服务。
- `packages/shared` 负责协议 DTO、配置、凭证、Skills、提示词、backend 注册表与 Pi 客户端。
- `packages/pi-agent-server` 在独立的 Bun 子进程中运行 Pi，通过 JSONL 与主进程通信。
- `packages/ui` 与 `packages/session-tools-core` 提供共享的渲染组件与会话级工具。

唯一注册的 backend 是 `pi`。自定义端点和 Ollama 都是通过 Pi 执行的连接变体，不构成独立的 backend。Desktop、WebUI 与 CLI 因此操作同一份 workspace 与 JSONL 会话，不存在客户端特定的存储。
