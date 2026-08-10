# Testing

Local validation follows the same boundaries as CI. Three layers run together: unit/integration, isolated subprocess tests, and the deterministic Pi session integration. Each layer is selected deliberately.

## Required commands

```bash
bun run typecheck:all
bun run lint
bun run validate:ci
bun run test
bun run test:doc-tools
bun run electron:build
bun run audit:craft-reuse
bun run lint:craft-test-coverage
```

`bun run validate:ci` is the gate: it includes `typecheck:all`, the shared-package targeted suites (`test:shared:all`), the document-tool smoke tests (`test:doc-tools`), and the i18n parity/sorted lint checks.

## Test layers

| Layer | Files | What it covers |
|---|---|---|
| Unit + integration | `bun test` against `*.test.ts` | Workspace isolation, JSONL persistence, import/resume, branching, unread/state events, Pi registration, permission schemas, config migrations, connection variants, transport (success/error/reconnect/unknown channel), session event/message/turn grouping, renderer parity |
| Isolated subprocess | every `*.isolated.ts` (CI runs each in its own process) | Tests that touch `process.exit`, the Bun subprocess boundary, or any global state that would leak between `bun test` workers |
| Document tools (Python) | `bun run test:doc-tools` | Eight Python smoke tests: `pdf_tool`, `xlsx_tool`, `docx_tool`, `pptx_tool`, `img_tool`, `ical_tool`, `doc_diff`, `markitdown`. Runs the wrappers end-to-end with a fixture in `apps/electron/resources/scripts/tests/` |
| Pi session integration | `packages/pi-agent-server` deterministic harness | Spins up the real Pi subprocess against a local OpenAI-compatible SSE fixture and verifies tool calls, tool results, event ordering, and renderer wiring |

## Hermeticity rules

- Tests inject `CONFIG_DIR` rather than reading `$HOME`. See `packages/shared/src/config/__tests__/preferences-ui-language.test.ts` for the canonical injection pattern.
- The shared Prerequisite Manager retains Browser documentation and Skill instruction prerequisites only. Test setups override `pathExists`, `browserToolEnabled`, and `browserToolsDocPath`.
- Tests that exercise the credential layer use a fake `CredentialManager`. No real keychain writes.
- Tests that exercise the network interceptor use a mocked fetch; the real interceptor is only loaded on Electron main.

## Coverage discipline

`bun run lint:craft-test-coverage` walks every test in the Craft checkout and tags it as one of:

1. same-path kept,
2. substituted for a Lite/branded equivalent,
3. removed because the corresponding product feature is gone.

A "missing" tag — a test that silently dropped — is a lint error. Current snapshot: **246 kept, 5 substituted, 122 removed-for-boundary, 0 missing-without-explanation.** Refresh this count after changing the upstream baseline.

## Build verification

```bash
bun run electron:build           # main + preload + renderer + resources + assets
bun run webui:build              # vite build for the shared renderer
bun run cli:build                # produces apps/cli/dist/mkagent
bun run server:build:subprocess  # packages/pi-agent-server/dist/index.js
bun run electron:dist:dev:mac    # macOS arm64 dev .app, ad-hoc signed
```

CI adds macOS, Windows, and Linux unpacked desktop builds plus a headless assembly step on each platform. macOS/Windows signing secrets are environmental; **a test or build failure must be reported separately from the absence of those secrets.**

## Clean-worktree validation

```bash
git clone <this repo> /tmp/mkagent-clean
cd /tmp/mkagent-clean
bun install --force --frozen-lockfile
bun run validate:ci
bun run electron:build
bun run lint
bun run audit:craft-reuse
```

This is the routine that passed on the recorded commit (see `migration/migration-features.md`).
