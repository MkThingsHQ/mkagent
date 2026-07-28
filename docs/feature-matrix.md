# Feature matrix

This document records MkAgent's intentional product boundary relative to the upstream baseline.

## Retained

- Electron Desktop, WebUI, CLI, headless server, shared renderer and WebSocket RPC
- Pi agent backend and API-key model connections
- Custom OpenAI-compatible and Anthropic-compatible endpoints, plus Ollama
- Local multi-workspace support and the `default` workspace
- Sessions, flag, archive, unread, search, import/export, branch and multi-window
- Skills, mini chat, plans, annotations and follow-ups
- Browser, `web_search`, `web_fetch`, attachments and document tools
- Permissions, network proxy, themes, English and Simplified Chinese
- Auto-update and Sentry integration

## Removed

- Claude backend and all subscription/OAuth authentication
- External messaging channels
- Product automations and schedulers
- Session labels and user-defined statuses
- Projects and Kanban
- Sources and MCP
- Viewer, public sharing and remote workspaces
- Image generation

## Reference policy

Retained modules follow the upstream directory layout, public names, coding style and tests. Product-specific identifiers are changed to MkAgent. Reference repositories are read-only.
