# Architecture

MkAgent is a Bun monorepo with three clients over one authenticated WebSocket RPC protocol.

- `apps/electron` embeds the local server, exposes the Client API through preload, and owns windows, Browser panes, proxy integration, updates, and Sentry.
- `apps/webui` loads the same React application through a browser adapter. The headless server serves its static files and authenticated attachment endpoint.
- `apps/cli` uses the same RPC methods and can connect to an existing server or start a temporary local instance.
- `packages/server-core` owns transport, handlers, `SessionManager`, and platform-neutral services.
- `packages/shared` owns protocol DTOs, config, credentials, Skills, prompts, the backend registry, and the Pi client.
- `packages/pi-agent-server` runs Pi in a separate Bun subprocess and communicates through JSONL.
- `packages/ui` and `packages/session-tools-core` provide shared rendering and tools.

Only the `pi` backend is registered. Custom endpoints and Ollama are connection variants executed through Pi rather than separate backends. Desktop, WebUI, and CLI therefore operate the same workspace and JSONL sessions without client-specific storage.
