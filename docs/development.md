# Development

This page summarizes how to set up an MkAgent development environment and which commands match which release artifact.

## Requirements

| Tool | Version | Why |
|---|---|---|
| Bun | 1.3.14+ | Workspace, runtime, builds (`bun.lock`) |
| Node | ≥ 18 (Bun ships it for fallbacks) | TypeScript toolchain |
| Python | 3.12 | Document-tool smoke tests |
| `uv` | latest compatible for development; `0.10.6` in desktop release builds | Runs document-tool smoke tests and prepares assets; packaged artifacts bundle their target-platform binary |
| Git | any modern version | `pre-commit`-style checks via husky are opt-in |

`bun` is the only workspace linker; npm/yarn are not used to install dependencies because `bun.lock` is the source of truth.

## First-time setup

```bash
git clone https://github.com/open-fox/mkagent.git
cd mkagent
bun install --frozen-lockfile
bun run validate:dev
```

If you have to add or upgrade a dependency, edit the appropriate `package.json`, run `bun install` (without `--frozen-lockfile`) to refresh `bun.lock`, and re-run `bun install --frozen-lockfile` to confirm deterministic resolution.

## Workspace layout

```text
apps/
  electron/    # Electron desktop (main, preload, renderer, Browser pane)
  webui/       # Loads the same renderer through a browser adapter
  cli/         # RPC CLI (`run`, `session`, `workspace`, `send`, ...)
packages/
  core/                # Stable DTOs, AgentEvent, error codes
  shared/              # Config, credentials, prompts, Skills, theme, i18n
  ui/                  # React primitives, markdown/code/doc renderers
  server-core/         # Transport, RPC, SessionManager, runtime
  server/              # Headless MKAGENT_SERVER_TOKEN server
  pi-agent-server/     # Pi SDK subprocess (Bun, JSONL on stdio)
  session-tools-core/  # Plan / Skill / mini LLM / browser / session info / list
docs/                  # English-language documentation
docs/zh/               # Chinese translation
scripts/               # Dev / build / lint / audit
migration/             # Migration plan, audit, UI history
```

`apps/online-docs` is intentionally outside the workspace globs.

## Common commands

| Goal | Command |
|---|---|
| Install dependencies (CI-mode) | `bun install --frozen-lockfile` |
| Quick offline install | `bun install --force` (rare, recovers a broken lockfile) |
| Run Electron in dev (vite + electron) | `bun run electron:dev` |
| Run Electron from a prebuilt `apps/electron/dist/` | `bun run electron:start` |
| Start the headless server with the WebUI dev bundle | `bun run server:dev:webui` |
| Production headless server (WebUI bundled, Pi built) | `bun run server:prod` |
| Build the CLI binary | `bun run cli:build` (output: `apps/cli/dist/mkagent`) |
| Build the Pi subprocess | `bun run server:build:subprocess` |
| Build a dev-signed macOS arm64 .app | `bun run electron:dist:dev:mac` |
| Run all unit + isolated tests | `bun run test` |
| Validate (typecheck + tests + shared suite + doc tool smoke + lint) | `bun run validate:ci` |
| Audit MkAgent ↔ Craft reuse | `bun run audit:craft-reuse` |
| Audit Craft test coverage | `bun run lint:craft-test-coverage` |
| Lint English/Chinese locale parity | `bun run lint:i18n:parity` |
| Sort locales | `bun run sort-locales` (check-only: `bun run lint:i18n:sorted`) |

## Isolate the config directory

The configuration root defaults to `~/.mkagent` but can be redirected for parallel development or isolated tests:

```bash
MKAGENT_CONFIG_DIR=/tmp/mkagent-dev bun run server:dev:webui
```

`MKAGENT_CONFIG_DIR` is read once at module-load (`packages/shared/src/config/paths.ts`) and influences every downstream path (workspaces, credentials, logs, tool icons). Tests inject the env var explicitly; they do not create files in `$HOME`.

## Useful environment variables

| Variable | Default | Effect |
|---|---|---|
| `MKAGENT_CONFIG_DIR` | `~/.mkagent` | Override the configuration root (also called the "data directory") |
| `MKAGENT_SERVER_TOKEN` | — | Required bearer token for headless server RPC auth |
| `MKAGENT_RPC_HOST` / `MKAGENT_RPC_PORT` | `127.0.0.1` / `9100` | Server bind address / port |
| `MKAGENT_RPC_TLS_CERT` / `_KEY` / `_CA` | — | Enable `wss://` with PEM-encoded cert/key; CA is optional |
| `MKAGENT_HEALTH_PORT` | `0` (off) | Bind a sidecar HTTP health endpoint |
| `MKAGENT_APP_ROOT` | repo root (dev) | Where the server reads bundled assets |
| `MKAGENT_RESOURCES_PATH` | same as app root | Override the resources directory |
| `MKAGENT_BUNDLED_ASSETS_ROOT` | unset | Dev-only override that points the headless server at `apps/electron` resources |
| `MKAGENT_IS_PACKAGED` | `false` | Set to `true` inside production builds |
| `MKAGENT_VERSION` | `package.json#version` | Override the reported server version |
| `MKAGENT_DEBUG` | unset | Enable extra debug logging |
| `MKAGENT_WEBUI_DIR` | unset | Enable WebUI assets on the RPC port |
| `MKAGENT_WEBUI_PASSWORD` / `_SECURE_COOKIE` / `_WS_URL` | unset | WebUI login password, cookie `Secure` flag override, and browser-side `ws://` URL |
| `MKAGENT_PI_MODEL_API` | unset | Interceptor-level Pi model hint |
| `MKAGENT_UV` / `MKAGENT_BUN` / `MKAGENT_NODE` | unset | Override script runtimes; packaged launchers normally inject absolute bundled paths, while development may fall back to PATH |
| `MKAGENT_DEV_RUNTIME` | unset | Set to `1` to skip code-signing during local packaging |
| `SENTRY_ELECTRON_INGEST_URL` | empty (inert) | Required to enable Sentry uploads in the Electron app |
| `MKAGENT_SERVER_URL` / `MKAGENT_TLS_CA` | unset | CLI connection options |
| `MKAGENT_WORKSPACE` | `default` | CLI workspace override |
| `LLM_API_KEY` / provider env var | unset | CLI self-contained `run` API credential |

## Conventions

- Reuse existing package boundaries and naming before adding new abstractions.
- Reference checkouts (`craft-agents-oss`, `echo`, `xagent`) are read-only; never commit changes to them.
- Every module change ships with its tests and a documentation update.
- Run `git diff --check` before commit and confirm the changed files are only what you intended.

## Clean-worktree validation pattern

When working on a detached or fresh worktree, dependencies are not hoisted by default:

```bash
bun install --force --frozen-lockfile
bun run validate:ci
```

This combination has passed MkAgent's full gate on a clean checkout (see `migration/migration-features.md`, "最终验证结果"). Audio/screen-recording permissions are not required because the gate never starts a GUI.
