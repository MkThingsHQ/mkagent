<p align="center">
  <img src="./apps/electron/resources/icon.png" alt="MkAgent" width="96" height="96" />
</p>

<h1 align="center">MkAgent</h1>

<p align="center">
  A local-first AI agent workspace for Desktop, WebUI, and CLI.
</p>

<p align="center">
  <a href="https://github.com/MkThingsHQ/mkagent/blob/main/LICENSE"><img src="https://img.shields.io/github/license/MkThingsHQ/mkagent" alt="License" /></a>
  <a href="https://github.com/MkThingsHQ/mkagent/stargazers"><img src="https://img.shields.io/github/stars/MkThingsHQ/mkagent" alt="GitHub stars" /></a>
  <a href="https://bun.sh"><img src="https://img.shields.io/badge/Bun-1.3.14%2B-f9f1e1?logo=bun&amp;logoColor=000" alt="Bun 1.3.14 or later" /></a>
  <a href="https://www.electronjs.org"><img src="https://img.shields.io/badge/Electron-39-47848F?logo=electron&amp;logoColor=white" alt="Electron 39" /></a>
</p>

<p align="center">
  <a href="https://mkagent.app">Website</a> ·
  <a href="https://github.com/MkThingsHQ/mkagent/releases/latest">Download</a> ·
  <a href="./docs/README.md">Documentation</a> ·
  <a href="./docs/zh/README.md">中文文档</a> ·
  <a href="https://github.com/MkThingsHQ/mkagent/issues">Report a bug</a>
</p>

MkAgent is an open-source, cross-platform agent application powered by the
[Pi](https://github.com/badlogic/pi-mono) agent runtime. It combines persistent local workspaces,
multi-session workflows, model flexibility, browser tools, and document tools in one application.
Application state stays under your local data directory, and credentials are stored through the
operating system credential manager.

## Features

- **Local-first workspaces** — keep sessions, files, settings, and workspace history on your machine.
- **Flexible model connections** — use ChatGPT Plus, Claude Pro/Max, provider API keys,
  OpenAI-compatible or Anthropic-compatible endpoints, and local Ollama models.
- **Desktop, WebUI, and CLI** — work through the Electron app, a browser-based renderer, or an RPC
  command-line client backed by the same runtime.
- **Agent workflows** — create and branch sessions, build plans, use Skills, resume work, manage
  follow-ups, and run multiple windows.
- **Built-in tools** — browse the web, work with attachments, render Markdown and code, and inspect
  or transform common document formats.
- **Explicit control** — choose Explore, Ask, or Execute permission modes, configure a network
  proxy, and switch between English and Simplified Chinese.

See the [feature matrix](./docs/feature-matrix.md) for the exact supported product boundary.

## Interfaces

| Interface | Best for | Command |
| --- | --- | --- |
| Desktop | Full local experience and browser pane | `bun run electron:dev` |
| WebUI | Browser access to the headless MkAgent server | `bun run server:prod` |
| CLI | Scripting, remote control, and terminal workflows | `bun run apps/cli/src/index.ts --help` |

## Getting started

### Prerequisites

- [Bun](https://bun.sh) 1.3.14 or later
- Node.js 18 or later
- Git
- Python 3.12 and [`uv`](https://docs.astral.sh/uv/) for the complete document-tool test suite

### Run the Desktop app

```bash
git clone https://github.com/MkThingsHQ/mkagent.git
cd mkagent
bun install --frozen-lockfile
bun run electron:dev
```

MkAgent creates its default workspace at `~/.mkagent/workspaces/default`. The configuration root can
be isolated for development or testing with `CONFIG_DIR=/path/to/directory`.

### Common commands

| Command | Description |
| --- | --- |
| `bun run electron:dev` | Start the Electron development environment |
| `bun run electron:start` | Build and launch Electron once |
| `bun run server:prod` | Build and start the headless server with WebUI |
| `bun run cli:build` | Build the CLI bundle |
| `bun run test` | Run unit and isolated tests |
| `bun run validate:ci` | Run the full type, test, document-tool, and localization gate |

More commands and environment variables are documented in the
[development guide](./docs/development.md).

## Architecture

MkAgent is a Bun workspace with a shared runtime and renderer across its three interfaces:

```text
apps/
  electron/              Electron main, preload, renderer, and Browser pane
  webui/                 Browser adapter for the shared renderer
  cli/                   RPC command-line client
packages/
  core/                  Stable DTOs, events, and error contracts
  shared/                Configuration, credentials, prompts, Skills, theme, and i18n
  ui/                    Shared React UI and content renderers
  server-core/           RPC transport, sessions, and runtime orchestration
  server/                Headless server
  pi-agent-server/       Pi agent subprocess
  session-tools-core/    Plans, Skills, browser, and session tools
```

Read the [architecture guide](./docs/architecture.md) for runtime boundaries, process ownership, and
data flow.

## Documentation

The complete documentation is available in [English](./docs/README.md) and
[Simplified Chinese](./docs/zh/README.md).

| Area | Guides |
| --- | --- |
| Start here | [Development](./docs/development.md), [architecture](./docs/architecture.md), [testing](./docs/testing.md) |
| Models | [Connections](./docs/connections.md), [Ollama](./docs/ollama.md) |
| Work | [Workspaces](./docs/workspaces.md), [sessions](./docs/sessions.md), [Skills](./docs/skills.md) |
| Tools | [Browser](./docs/browser.md), [attachments](./docs/attachments.md), [document tools](./docs/document-tools.md) |
| Runtime | [CLI](./docs/cli.md), [permissions](./docs/permissions.md), [network proxy](./docs/network-proxy.md) |
| Project | [Feature matrix](./docs/feature-matrix.md), [releases](./docs/releases.md), [upstream synchronization](./docs/upstream-sync.md) |

## Contributing

Contributions are welcome. Fork the repository, create a focused branch, include tests and
documentation with behavioral changes, and run the relevant checks before opening a pull request.
For the complete local gate:

```bash
bun run validate:ci
git diff --check
```

Use [GitHub Issues](https://github.com/MkThingsHQ/mkagent/issues) for bugs and feature requests.

## Project lineage

MkAgent started from selected architecture and code in
[Craft Agents OSS](https://github.com/craft-ai-agents/craft-agents-oss) `v0.11.2`
(`a60ebc1a5a7c`) and continues with an independent Git history and product boundary. MkAgent is not
affiliated with or endorsed by the upstream project. See [NOTICE](./NOTICE) for attribution and the
[comparison guide](./docs/comparison-with-craft.md) for the current differences.

## About

MkAgent is built by [MkThingsHQ](https://github.com/MkThingsHQ). Other open-source projects from the
same maker include [Mkdirs](https://github.com/MkThingsHQ/mkdirs) and
[MkDocs](https://github.com/open-fox/mkdocs).

## License

Licensed under the [Apache License 2.0](./LICENSE). You may use, modify, and distribute the code,
including for commercial purposes, subject to the license terms and the attribution in
[NOTICE](./NOTICE).
