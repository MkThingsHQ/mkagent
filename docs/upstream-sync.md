# Upstream synchronization

MkAgent derives its architecture, UI, and runtime from [Craft Agents OSS](https://github.com/craft-ai-agents/craft-agents-oss). This document defines the workflow for absorbing new Craft changes while staying inside the Lite boundary.

## Baseline (current)

| Item | Value |
|---|---|
| Repository | `craft-ai-agents/craft-agents-oss` |
| Tag | `v0.15.5` |
| Commit | `cede6ea49e0c4a42933ed0f1bc129db698fc581f` |

## Latest evaluated release

| Item | Value |
|---|---|
| Evaluated on | `2026-10-26` |
| Upstream tag | `v0.15.5` |
| Upstream commit | `cede6ea49e0c4a42933ed0f1bc129db698fc581f` |

MkAgent 0.2.5 synchronizes **only v0.15.4 → v0.15.5**. [The inventory](./sync/0.15.5-inventory.json) classifies all 57 changed paths; [validation](./sync/0.15.5-validation.md) distinguishes automation and actual UI evidence.

Default window zoom (80–150%) persists on this computer, applies to new windows and Reset Zoom, and uses direct Electron main IPC rather than remote RPC. WebUI retains browser zoom. User-message copy supports hover, keyboard focus and touch, copying original input while preserving attachment/rich display. Workspace removal confirms its folder, file-manager action and reopen instructions; unregistering preserves sessions and legacy data, and workspaces open in any app window cannot be removed. Production Desktop context menus offer editing, selected-text/link copy and spelling; Inspect remains development-only. Unread groups paginate independently; date groups retain chronological global pagination. Statuses/projects remain absent.

MkAgent installation/release links remain under MkThingsHQ. Existing documentation has no stale Docker image references; no unpublished MkAgent container image or Craft installation is advertised. Preserve v0.15.4 Coding/worktree/PR status/async Git, Pi 1.1.0, HEIC/HEIF, maxTokens, compaction, Skills, usage/fork billing, browser/Stop and local config. Claude SDK, Sources/MCP, Pages, Projects/conductor, Automations, public sharing, labels/custom statuses and messaging remain excluded; Decision/Guarded stay deferred. No v0.15.6 multi-PR, automated review fixes or asynchronous mode handoff is imported.

```bash
# Fetch and check out only an independent disposable reference clone.
git clone --no-checkout https://github.com/craft-ai-agents/craft-agents-oss.git /tmp/craft-v0155
git -C /tmp/craft-v0155 fetch origin refs/tags/v0.15.5
git -C /tmp/craft-v0155 checkout --detach cede6ea49e0c4a42933ed0f1bc129db698fc581f
export CRAFT_AGENT_SOURCE=/tmp/craft-v0155
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
