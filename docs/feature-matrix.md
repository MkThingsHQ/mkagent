# Feature matrix

This document records MkAgent's intentional product boundary relative to the upstream baseline. A side-by-side technical comparison with Craft Agents, including installer sizes, lives in [`comparison-with-craft.md`](./comparison-with-craft.md).

## Retained

- Electron Desktop, WebUI, CLI, headless server, shared renderer, and WebSocket RPC
- Pi agent backend, API-key model connections, and ChatGPT Plus / Claude Pro/Max subscriptions
- Custom OpenAI-compatible and Anthropic-compatible endpoints, plus Ollama
- Local multi-workspace support and the `default` workspace
- Sessions (create, continue, cancel, resume, search, rename, delete, flag, archive, unread, import/export, branch, multi-window)
- Skills, mini chat, plans, annotations, follow-ups
- Browser pane + `web_search` + `web_fetch`
- Desktop-only OpenConnector `v1.3.5` sidecar, Providers/Actions/Runs console, and five fixed Pi tools
- Attachments and document tools
- Permissions (Explore/safe, Ask, Execute/allow-all), network proxy, themes, English and Simplified Chinese
- Auto-update and Sentry integration (gated by `SENTRY_ELECTRON_INGEST_URL`)

## Removed

- Claude Agent SDK backend
- GitHub Copilot and all OAuth beyond the two retained LLM subscriptions
- External messaging channels and workers
- Product automations and schedulers
- Session labels and user-defined statuses
- Projects and Kanban
- Generic Sources (API Source, MCP Source), user-configurable MCP pools, and Craft's session/bridge MCP servers; the dedicated OpenConnector integration does not restore them
- Viewer app, public sharing, and remote workspaces
- Image generation (`gen_image`)

## Reference policy

Craft-derived retained modules follow the upstream directory layout, public names, coding style, and tests. Product-specific identifiers are changed to MkAgent (`@mkagent/*`, `~/.mkagent`, `MKAGENT_*`, `mkagent://`, `app.mkagent.desktop`). OpenConnector follows its separately pinned `vendor/open-connector` submodule. Reference repositories are read-only.

## Numerical anchors

These figures are the recorded 2026-07-30 Craft-reuse audit snapshot. They predate the OpenConnector integration and are retained for comparison; rerun the audit before treating them as current repository or package measurements.

| Metric | MkAgent | Notes |
|---|---:|---|
| Tracked source TS/TSX LOC | 190,558 | excludes `node_modules`, `dist`, `release`, `.git` |
| Source files audited against Craft | 1,163 | see [`comparison-with-craft.md`](./comparison-with-craft.md#1-repository--source-line-count) |
| Same-path rate | 96 % | byte-equal after normalization for 59 % |
| Top-level `dependencies` | 55 | drops 6 backend/OAuth/MCP/Copilot packages |
| License | Apache-2.0 | notice in `NOTICE` |

## Verifying the boundary

```bash
bun run audit:craft-reuse           # 1,116 of 1,163 same-path
bun run lint:craft-test-coverage    # 246 kept / 6 substituted / 121 removed-for-boundary / 0 missing-without-explanation
bun run lint:craft-ui-sync          # renderer-level seam check
```

A failed run means the Lite boundary has drifted — bring the audit narrative up to date or revert the offending change.
