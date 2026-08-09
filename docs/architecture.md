# Architecture

MkAgent is a Bun monorepo with three clients sharing one authenticated WebSocket RPC protocol. Only the `pi` agent backend is registered. OpenConnector is a separate, desktop-only sidecar rather than another agent backend.

## Layered topology

```text
+-----------------------------------------------------------+
| apps/electron       apps/webui         apps/cli           |
|   Electron             Browser            RPC client       |
|   (Browser pane,       adapter (loads    (connects to      |
|   OpenConnector,       the same React    running server    |
|   Sentry, auto-        app via header    or spawns a       |
|   update, IPC)         handshake)        one-shot server)  |
+---------|----------------|--------------------|-------------+
          v                v                    v
   Browser adapter  ──>  preload Client API  ──> RPC client
                          (window.MkAgent)         (rpc-client.ts)
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
   packages/server (headless `MKAGENT_SERVER_TOKEN` server)
          v                                       |
+-----------------------------------------------------------+
| packages/shared                                           |
|   config / credentials / prompts / Skills /               |
|   workspaces / views / theme / i18n / AgentEvent /         |
|   backend registry (only `pi`)                            |
+-----------------------------------------------------------+
          |
          v
+-----------------------------------------------------------+
| packages/pi-agent-server                                  |
|   Bun subprocess, JSONL on stdio, talks to Pi SDK         |
+-----------------------------------------------------------+
          v
+-----------------------------------------------------------+
| packages/ui            packages/session-tools-core        |
|   React primitives,    LLM-backed session tools            |
|   markdown/doc         (plan, skill, mermaid,             |
|   renderers, IPC,      convert, mini LLM, browser,         |
|   settings pages       session info/list, etc.)           |
+-----------------------------------------------------------+
```

All three clients operate the same workspace and JSONL sessions. OpenConnector is the explicit storage exception: its database, connections, and generated secrets live under `$CONFIG_DIR/connectors/open-connector/` and are used only by Electron.

## Apps

- `apps/electron` embeds the local server, exposes the Client API through preload, and owns windows, Browser panes, the OpenConnector sidecar/console, proxy integration, auto-update, and Sentry.
- `apps/webui` loads the same React application through a browser adapter. The headless server serves its static files and the authenticated attachment endpoint.
- `apps/cli` uses the same RPC methods and can connect to an existing server or start a temporary local instance for `run`.

## Desktop-only OpenConnector boundary

Electron starts the pinned OpenConnector `v1.3.5` runtime on loopback and embeds its Providers/Actions/Runs web console. The Pi session bridge discovers exactly five fixed tools from that sidecar. This path is not registered by WebUI, the headless server, or the CLI.

```text
Electron main
  ├─ embeds: Providers / Actions / Runs console
  ├─ spawns: vendor/open-connector sidecar (127.0.0.1)
  │           ├─ authenticated HTTP console
  │           └─ authenticated MCP endpoint
  └─ bridges five mcp__open_connector__* tools into Desktop Pi sessions
```

The sidecar's MCP transport is an implementation detail of this pinned bridge. MkAgent still has no generic Source registry, user-configurable MCP pool, or Craft session/bridge MCP server. See [`open-connector.md`](./open-connector.md).

## Shared packages

- `packages/server-core` owns transport, handlers, `SessionManager`, and platform-neutral services. Subpackages: `bootstrap/`, `domain/`, `handlers/`, `model-fetchers/`, `runtime/`, `services/`, `sessions/`, `transport/`, `utils/`, `webui/`.
- `packages/shared` owns protocol DTOs (`@mkagent/shared/protocol`), config, credentials, Skills, prompts, the backend registry, workspace storage, and the Pi client.
- `packages/pi-agent-server` runs Pi in a separate Bun subprocess (`packages/pi-agent-server/dist/index.js`) and communicates through JSONL. Same SDK is used in development and in packaged builds; `bun run server:build:subprocess` produces the bundle.
- `packages/ui` and `packages/session-tools-core` provide shared rendering and session-level tools. They are platform-neutral: Electron, WebUI, and CLI reuse them.

## Backend registry

Only the `pi` backend is registered. Custom endpoints (`openai-completions`, `anthropic-messages`) and Ollama are connection variants executed through Pi rather than separate backends. The registry is initialized by `registerPiModelResolver(...)` inside `packages/server/src/index.ts` and `apps/electron/src/main`.

## Auth handshake

1. The server binds on `MKAGENT_RPC_HOST:MKAGENT_RPC_PORT` (default `127.0.0.1:9100`).
2. The bearer token is read from `MKAGENT_SERVER_TOKEN` (Electron generates one automatically on launch; the headless server requires it to be passed in).
3. The token is exchanged for a short-lived JWT used on every subsequent WebSocket frame (`@mkagent/server-core/webui`).
4. WebUI and CLI additionally support `MKAGENT_WEBUI_PASSWORD` (falls back to `MKAGENT_SERVER_TOKEN`) and an optional `MKAGENT_TLS_CA` for TLS pinning.
5. The handshake binds a workspace id; later RPC commands are scoped to that workspace and only see its sessions, Skills, permissions, and Views.

## Subprocess boundary

The Pi subprocess is isolated from the main process:

```text
main process (Bun)
  └─ spawns: bun packages/pi-agent-server/dist/index.js
              ↕ JSONL on stdio (one JSON object per turn event)
              Pi SDK ↔ provider (HTTPS)
```

Abort, model switching, thinking-level change, permission responses, and session resume are all routed through the same JSONL stream. Pi recovery files are stored under `~/.mkagent/workspaces/<slug>/sessions/<id>/`.

## Packaging surface

- Desktop app: macOS arm64 / x64 (DMG + ZIP), Windows x64 (NSIS), Linux x64 (AppImage). Build entry: `bun run electron:dist[:dev][:mac|:win|:linux]`.
- OpenConnector sidecar: `vendor/open-connector` is pinned at `v1.3.5`; Electron resource builds prepare and copy its production runtime and web console into the Desktop package.
- Headless server: per-platform Bun binary under `apps/cli` and `packages/server`; built with `bun run scripts/build-server.ts`.
- CLI: `bun run cli:build` produces `dist/mkagent`.
- Pi subprocess: `bun run server:build:subprocess` produces `packages/pi-agent-server/dist/index.js`.

`mkagent-public` (the public release artifact repo) receives DMG/ZIP/NSIS/AppImage plus `latest-mac.yml` / `latest-linux.yml` / `latest.yml` manifests and blockmaps. `electron-updater` reads those manifests and never embeds a GitHub token in the client.

## What is intentionally absent

Craft Agents bundles broad OAuth and generic Sources integrations, a Slack/Teams/Lark messaging gateway, a WhatsApp worker backed by Baileys, a session MCP server, a bridge MCP server, and an `apps/viewer` Electron app for public sharing. MkAgent retains only the ChatGPT and Claude LLM OAuth flows from that surface; those generic Sources/MCP components remain absent. The dedicated OpenConnector sidecar is independently pinned and does not restore them. Although Craft's underlying `pi-ai` dependency contains an OpenRouter image-generation API, neither Craft nor MkAgent registers it as an agent tool. See [`comparison-with-craft.md`](./comparison-with-craft.md) for an evidence-backed side-by-side; its installer-size figures are dated snapshots and must be remeasured after adding bundled OpenConnector resources.
