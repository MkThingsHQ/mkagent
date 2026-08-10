# MkAgent documentation (English)

MkAgent is a cross-platform local Lite distribution derived from [Craft Agents OSS](https://github.com/craft-ai-agents/craft-agents-oss) `v0.11.2`. It registers the Pi agent backend only and supports ChatGPT Plus and Claude Pro/Max subscriptions through Craft's OAuth flows. It does not include the Claude Agent SDK, GitHub Copilot subscription, external messaging channels, product automations, session labels, projects/Kanban, Craft's generic Sources/MCP product, the Craft Viewer, or image generation capabilities. Its sole connector integration is the desktop-only [OpenConnector](./open-connector.md) sidecar with a fixed five-tool Pi bridge.

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
| Feature matrix (kept vs. removed) | [feature-matrix.md](./feature-matrix.md) |
| Network proxy | [network-proxy.md](./network-proxy.md) |
| Ollama | [ollama.md](./ollama.md) |
| OpenConnector | [open-connector.md](./open-connector.md) |
| Permissions | [permissions.md](./permissions.md) |
| Releases, updates, and telemetry | [releases.md](./releases.md) |
| Sessions | [sessions.md](./sessions.md) |
| Skills | [skills.md](./skills.md) |
| Testing | [testing.md](./testing.md) |
| Upstream synchronization | [upstream-sync.md](./upstream-sync.md) |
| Workspaces | [workspaces.md](./workspaces.md) |

## Companion documents in `migration/`

| Topic | Document |
| --- | --- |
| Planning and audit history | [migration/migration-audit.md](./migration/migration-audit.md), [migration/migration-features.md](./migration/migration-features.md), [migration/migration-mvp.md](./migration/migration-mvp.md), [migration/migration-plan.md](./migration/migration-plan.md), [migration/migration-ui.md](./migration/migration-ui.md) |
| Plain-language index | [migration/README.md](./migration/README.md) |

## Translation conventions

- Markdown headings, links, and code remain in English. Explanatory prose is localized.
- "Lite" is rendered as "精简版 / 精简发行版" in narrative Chinese and kept in English inside product names, config keys, file names, and code.
- "Craft Agent" and "Craft" are preserved or paraphrased as "上游 Craft" depending on context.
- Commands, file names, JSON fields, protocol headers, and variable names stay in English so they can be copy-pasted directly.
- If the Chinese translation diverges from English, treat the English source as authoritative and file a revision.
