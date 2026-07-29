# Development

Requirements are Bun 1.3.14, Python 3.12, and `uv`. Install dependencies with `bun install --frozen-lockfile`.

Common commands:

```bash
bun run electron:start
bun run server:dev:webui
bun run apps/cli/src/index.ts --help
bun run typecheck:all
bun run lint
bun run test
```

Use the existing package boundaries and naming before adding an abstraction. Keep reference checkouts read-only. A module change should include its tests and documentation and pass `git diff --check` before commit.

Override the data directory only for isolated development or tests:

```bash
MKAGENT_CONFIG_DIR=/tmp/mkagent-dev bun run server:dev:webui
```
