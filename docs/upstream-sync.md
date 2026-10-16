# Upstream synchronization

MkAgent derives its architecture, UI, and runtime from [Craft Agents OSS](https://github.com/craft-ai-agents/craft-agents-oss). This document defines the workflow for absorbing new Craft changes while staying inside the Lite boundary.

## Baseline (current)

| Item | Value |
|---|---|
| Repository | `craft-ai-agents/craft-agents-oss` |
| Tag | `v0.15.0` |
| Commit | `20e98eed968b9663d80f9efd40c10d363ea0b781` |

## Latest evaluated release

| Item | Value |
|---|---|
| Evaluated on | `2026-10-16` |
| Upstream tag | `v0.15.0` |
| Upstream commit | `20e98eed968b9663d80f9efd40c10d363ea0b781` |

MkAgent 0.2.0 synchronizes the applicable v0.15.0 release from the previous v0.14.1 baseline (`332533f3096d12500012fe089c3f155e32af1c44`). No v0.15.1/v0.15.2 changes are included. The complete changed-path inventory is in [the review ledger](./sync/0.15.0-inventory.json); tests and verification boundaries are recorded in [the validation report](./sync/0.15.0-validation.md).

The new UI includes the navigator canvas and joined paper card, pinned sidebar footer, shared row grid, chat header actions, quiet work log and answer/footer, sunken code/diff wells, shell Run buttons, raised composer with mode/model/context chips, single-column settings/details, dialogs, notifications, motion preferences and contrast-solved themes. Compact WebUI retains touch targets, larger input text and keyboard-aware sizing. The Lite header/list omit configurable status/label and project controls rather than restoring those modules.

Pi and its coordinated dependencies are pinned to 1.1.0. This includes the model catalog (Sonnet/Haiku 5.5, GPT-6.1 Sol), provider-aware utility models (Luna/Haiku/Flash), Cloudflare AI Gateway, Azure provider-id translation and endpoint hot updates, real tool failure results, and isolated main/utility resource loading. Pi's native Bash lacks Claude's background flag, so a permission-gated adapter runs the existing Pi Bash implementation with an owned abort controller and live output file. Stopping one task never scans global command lines. Its running/completed chips and output use the new upstream UI. Windows opaque-window fallback, paths with spaces, WebUI login styling, deep-link restoration and workspace slug routing are retained.

Decision models/Guarded, Claude SDK and its source-tool fixes, Sources/MCP, Pages/Claude artifacts, Projects/task conductor, Automations/timezone and failure hooks, public sharing, labels/status editing and messaging remain excluded. Credential-prompt cancellation is part of the excluded Sources auth UI; local LLM OAuth/API-key setup remains covered by MkAgent's retained tests. Starter prompts use local files, web news and Skills instead of offering unavailable email/source setup.

```bash
# Fetch and check out only an independent disposable reference clone.
git clone --no-checkout https://github.com/craft-ai-agents/craft-agents-oss.git /tmp/craft-v0150
git -C /tmp/craft-v0150 fetch origin refs/tags/v0.15.0
git -C /tmp/craft-v0150 checkout --detach 20e98eed968b9663d80f9efd40c10d363ea0b781
export CRAFT_AGENT_SOURCE=/tmp/craft-v0150
```

When upstream publishes a new tag worth evaluating:

1. Record the new tag and commit: `git -C ../craft-agents-oss rev-parse HEAD && git -C ../craft-agents-oss describe --tags --always`.
2. Add the commit to this document so the "current baseline" stays a single source of truth.
3. Move through the steps below using the new commit.

Reference checkouts (`../craft-agents-oss`, `../echo`, `../xagent`) stay read-only during MkAgent work.

## Sync procedure

```text
  ┌──────────────────────────────────────────────────────────────────┐
  │ 1. Lock the baseline                                              │
  │    git -C "$CRAFT_AGENT_SOURCE" checkout <commit>                  │
  │    git -C "$CRAFT_AGENT_SOURCE" status --short   # must be clean    │
  │                                                                  │
  │ 2. Update the audit                                               │
  │    bun run audit:craft-reuse                                      │
  │       → reviewed lineage with no unregistered differences             │
  │    bun run lint:craft-test-coverage                              │
  │       → 0 missing-without-explanation expected                    │
  │                                                                  │
  │ 3. Pull upstream changes file-by-file                            │
  │    for each upstream commit touching a same-path file:           │
  │      classify:  STRICT_REUSE  |  LITE_SEAM  |  REMOVED_FEATURE    │
  │      STRICT_REUSE:  take the file as-is, regenerate hashes       │
  │      LITE_SEAM:     merge manually, keep MkAgent seams            │
  │      REMOVED_FEATURE: do not import; document why in the seam    │
  │                                                                  │
  │ 4. Add upstream-only features that fit MkAgent                    │
  │      new feature scope → mkagent migration-review issue           │
  │      outside scope     → keep MkAgent Lite                        │
  │                                                                  │
  │ 5. Validate                                                       │
  │    bun run typecheck:all                                          │
  │    bun run lint                                                   │
  │    bun run validate:ci                                            │
  │    bun run audit:craft-reuse     # hash-stable post-merge         │
  │    bun run test                                                    │
  │    bun run electron:build                                         │
  │    bun run webui:build                                            │
  │    bun run cli:build                                              │
  │    bun run server:build:subprocess                                │
  │                                                                  │
  │ 6. GUI smoke against a fresh config dir                           │
  │    rm -rf /tmp/mkagent-smoke && CONFIG_DIR=/tmp/mkagent-smoke \│
  │       bun run electron:dist:dev:mac                              │
  │    + headless smoke: bun run server:dev:webui                     │
  └──────────────────────────────────────────────────────────────────┘
```

## File-seam classification

| Class | Rule | Validation |
|---|---|---|
| `STRICT_REUSE` | Same relative path, mechanical differences only (scope, URL scheme, config root, brand strings) | `audit:craft-reuse` byte-equal after normalization |
| `LITE_SEAM` | Same relative path with branches removed for excluded features, or wired into MkAgent-only interfaces | Manual semantic review; targeted unit/integration tests; typecheck |
| `REMOVED_FEATURE` | File is removed entirely from MkAgent because the corresponding product area is gone | Path, call sites, build closure, and `lint:craft-test-coverage` tag |

Adding upstream-only features starts with the Lite question first; only features that fit the Lite boundary should be picked up.

## Override manifests

Two source-of-truth files record which MkAgent files deviate from Craft:

- `scripts/craft-source-overrides.json` (tracking all `apps/`, `packages/` source files)
- `scripts/craft-ui-overrides.json` (renderer-focused reviewed subset)

After any sync, both files **must** be regenerated and reviewed. The intent is that `audit:craft-reuse` only passes because the deviation is justified, not because the hash table was bumped to match.

## What is not eligible for sync

- Claude Agent SDK backend and the `claude-agent-sdk*` packages; keep the retained Claude OAuth flow routed through Pi
- GitHub Copilot, generic/Sources OAuth, and their SDKs
- External messaging gateway and workers
- Sources, MCP server, bridge MCP server, MCP-related UI
- Image generation models and `gen_image`
- Public sharing, Viewer app
- Product automations and the scheduler UI
- Sources API/Settings UI, session labels, user-defined statuses
- WhatsApp worker

These are recorded as Lite-boundary deletions in [`comparison-with-craft.md`](./comparison-with-craft.md) and the [`migration/`](./migration/README.md) archive.

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| `audit:craft-reuse` reports a file diverged unexpectedly | You forgot to refresh override hashes after a seam change | regenerate `scripts/craft-source-overrides.json`, audit the diff before accepting |
| `lint:craft-test-coverage` shows a "missing" tag | A Craft test moved or was added without classification | update the seam classification in `scripts/check-craft-test-coverage.ts` |
| Type error in `apps/electron/src/main` only after a sync | Upstream introduced a new env var or platform helper | confirm it survives the Lite seam; document before commit |
| Renderer asset 404 in packaged build | New Craft asset added without updating `scripts/copy-assets.ts` | add the asset to the copy list and rebuild |
| `electron:build` succeeds but `MkAgent Helper` lacks a Claude/Sources plugin | Confirm `appId` is `app.mkagent.desktop` and `@mkagent/*` is the only scope in `extraResources` | check `apps/electron/electron-builder.yml` |
