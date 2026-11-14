# Upstream synchronization

MkAgent derives its architecture, UI, and runtime from [Craft Agents OSS](https://github.com/craft-ai-agents/craft-agents-oss). This document defines the workflow for absorbing new Craft changes while staying inside the Lite boundary.

## Baseline (current)

| Item | Value |
|---|---|
| Repository | `craft-ai-agents/craft-agents-oss` |
| Tag | `v0.15.8` |
| Commit | `1627c43e93bb4f5b1532116b8eb092c0ada4b23f` |

## Latest evaluated release

| Item | Value |
|---|---|
| Evaluated on | `2026-11-14` |
| Upstream tag | `v0.15.8` |
| Upstream commit | `1627c43e93bb4f5b1532116b8eb092c0ada4b23f` |

MkAgent 0.2.7 synchronizes **v0.15.6 → v0.15.8**. The public upstream history has no v0.15.7 tag/commit; its MCP OAuth release notes are included in v0.15.8 and remain outside Lite. [The inventory](./sync/0.15.8-inventory.json) covers all 153 changed paths; [validation](./sync/0.15.8-validation.md) records local checks and their limits.

Child sessions and branches nest in collapsible families. Date/unread grouping, pagination, keyboard navigation and multi-selection keep families together; per-workspace collapse state persists. Coding gains the built-in browser behind its setting, Mermaid validation, data transformations, focused LLM calls, spawn/get/list session tools and the same preview/document instructions as standard sessions. Children inherit their folder, model and Coding mode while permissions remain clamped.

Pi branches fork only once, preserve their cutoff and reopen their own conversation after restart or tool changes. Proxy tools replace the complete previous set; rebuilds wait for compaction. macOS HEIC conversion uses ImageIO with upright pixels and sRGB colors, with a portable fallback. Session discovery uses bounded async header reads, cloud-eviction detection and timeouts, retaining MkAgent's complete first-line reader for large PR metadata. The Lite manager retains its existing single initialization gate so list consumers still wait for disk loading. Explore rejects unknown tools and isolated agents; Monitor shell commands get Bash checks.

Preserve MkAgent branding/configuration, Pi 1.1.0 and all previous synchronized functionality. Sources/MCP, Claude SDK and refusal fallback, Pages, Projects, board Tasks, Automations, public sharing and messaging remain excluded; Decision/Guarded remain deferred. This baseline records reviewed scope, not complete Craft feature parity.

```bash
git clone --no-checkout https://github.com/craft-ai-agents/craft-agents-oss.git /tmp/mkagent-craft-0158
git -C /tmp/mkagent-craft-0158 checkout --detach 1627c43e93bb4f5b1532116b8eb092c0ada4b23f
export CRAFT_AGENT_SOURCE=/tmp/mkagent-craft-0158
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
