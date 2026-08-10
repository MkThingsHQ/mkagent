# MkAgent documentation (English)

MkAgent is a cross-platform, local-first AI agent workspace derived from [Craft Agents OSS](https://github.com/craft-ai-agents/craft-agents-oss) `v0.11.2`. The current runtime is Pi-only: `@earendil-works/pi-coding-agent` runs in a dedicated Bun subprocess and serves the Electron app, WebUI, CLI, and headless server through one RPC contract. MkAgent supports API-key connections, custom OpenAI/Anthropic-compatible endpoints, Ollama, and the retained ChatGPT Plus / Claude Pro/Max subscription flows. It does not include the Claude Agent SDK, GitHub Copilot, external messaging, product automations, Projects/Kanban, Sources/MCP, Viewer/public sharing, or image generation.

This directory is the English-language user documentation. A Chinese translation lives under [`zh/`](./zh/README.md) and is kept in sync with the English source.

## Documentation index

| Topic | Document |
| --- | --- |
| Overall architecture | [architecture.md](./architecture.md) |
| Attachments | [attachments.md](./attachments.md) |
| Browser pane | [browser.md](./browser.md) |
| Command-line interface | [cli.md](./cli.md) |
| Connections and models | [connections.md](./connections.md) |
| Comparison with Craft (current) | [comparison-with-craft.md](./comparison-with-craft.md) |
| Data directory | [data-directory.md](./data-directory.md) |
| Development environment | [development.md](./development.md) |
| Document tools | [document-tools.md](./document-tools.md) |
| Features | [featues.md](./featues.md) |
| Network proxy | [network-proxy.md](./network-proxy.md) |
| Ollama | [ollama.md](./ollama.md) |
| Permissions | [permissions.md](./permissions.md) |
| Releases, updates, and telemetry | [releases.md](./releases.md) |
| Sessions | [sessions.md](./sessions.md) |
| Skills | [skills.md](./skills.md) |
| Testing | [testing.md](./testing.md) |
| Upstream synchronization | [upstream-sync.md](./upstream-sync.md) |
| Workspaces | [workspaces.md](./workspaces.md) |

For a clean start, read [development.md](./development.md), then use [connections.md](./connections.md), [permissions.md](./permissions.md), and [sessions.md](./sessions.md). The `migration/` directory is an implementation archive: its plans and audit snapshots are historical unless a section explicitly says it describes the current code.

## Translation conventions

- Markdown headings, links, and code remain in English. Explanatory prose is localized.
- "Lite" is rendered as "精简版 / 精简发行版" in narrative Chinese and kept in English inside product names, config keys, file names, and code.
- "Craft Agent" and "Craft" are preserved or paraphrased as "上游 Craft" depending on context.
- Commands, file names, JSON fields, protocol headers, and variable names stay in English so they can be copy-pasted directly.
- If the Chinese translation diverges from English, treat the English source as authoritative and file a revision.
