# MkAgent

MkAgent is a cross-platform local agent application for Desktop, WebUI, and CLI. It uses Pi as its only agent backend while keeping the backend boundary extensible.

## Status

MkAgent is under active development. The implementation plan and product boundaries are documented in [plan.md](./plan.md).

## Architecture baseline

The project is built from a new Git history using selected architecture and code from [craft-agents-oss](https://github.com/craft-ai-agents/craft-agents-oss) `v0.11.2` (`a60ebc1a5a7c`). See [NOTICE](./NOTICE) for attribution.

## Product identifiers

- Website: <https://mkagent.app>
- Package scope: `@mkagent/*`
- Configuration root: `~/.mkagent`
- URL scheme: `mkagent://`

## License

Apache License 2.0. See [LICENSE](./LICENSE) and [NOTICE](./NOTICE).
