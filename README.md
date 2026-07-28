# MkAgent

MkAgent is a cross-platform local agent application for Desktop, WebUI, and CLI. It uses Pi as its only agent backend while keeping the backend boundary extensible.

## Quick start

```bash
bun install
bun run electron:start
```

Start the local WebUI server with `bun run server:prod`, or run the CLI with `bun run apps/cli/src/index.ts --help`. MkAgent creates the `default` workspace under `~/.mkagent/workspaces/default`.

## Architecture baseline

The project is built from a new Git history using selected architecture and code from [craft-agents-oss](https://github.com/craft-ai-agents/craft-agents-oss) `v0.11.2` (`a60ebc1a5a7c`). See [NOTICE](./NOTICE) for attribution.

## Product identifiers

- Website: <https://mkagent.app>
- Package scope: `@mkagent/*`
- Configuration root: `~/.mkagent`
- URL scheme: `mkagent://`

## Documentation

- [Architecture](./docs/architecture.md) and [development](./docs/development.md)
- [Connections and models](./docs/connections.md), including [Ollama](./docs/ollama.md)
- [Workspaces](./docs/workspaces.md), [sessions](./docs/sessions.md), and [Skills](./docs/skills.md)
- [Permissions](./docs/permissions.md), [network proxy](./docs/network-proxy.md), [Browser](./docs/browser.md), and [attachments](./docs/attachments.md)
- [Document tools](./docs/document-tools.md), [updates/releases](./docs/releases.md), [data directory](./docs/data-directory.md), and [testing](./docs/testing.md)
- [Feature matrix](./docs/feature-matrix.md) and [upstream synchronization](./docs/upstream-sync.md)

## License

Apache License 2.0. See [LICENSE](./LICENSE) and [NOTICE](./NOTICE).
