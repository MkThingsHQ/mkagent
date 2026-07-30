# MkAgent vs. Craft Agents — current comparison

> Snapshot taken on **2026-07-30** against the `dev/agent-memory`-era working tree of MkAgent and the upstream tag [`craft-ai-agents/craft-agents-oss` `v0.11.2` / `a60ebc1a5a7c`](https://github.com/craft-ai-agents/craft-agents-oss). Numbers come from the on-disk working trees and prior validated builds, not from new network measurements; rebuild both repositories from the recorded commit before re-running this audit.

This document explains, with evidence, what MkAgent keeps from Craft Agents, what it physically removes, and how those choices change the artifact you ship. MkAgent is the "Lite" derivative built on the same architecture and renderer; the table below is the canonical answer to "what's actually different?".

## 1. Repository & source line count

Both repositories are Bun monorepos with the same workspace layout (`apps/{electron,webui,cli}` + `packages/{core,shared,ui,server-core,server,pi-agent-server,session-tools-core}`). MkAgent reuses that layout, drops two product-only packages from Craft (`messaging-gateway`, `messaging-whatsapp-worker`), removes the entire `apps/viewer` app, and never instantiates Craft's session-MCP/bridge-MCP servers.

| Metric | MkAgent | Craft Agents | Notes |
|---|---:|---:|---|
| Tracked TypeScript / TSX LOC (`*.ts`,`*.tsx`, excludes `node_modules`,`dist`,`release`,`.git`) | **190,558** | 344,964 | MkAgent source ≈ **55 %** of Craft's |
| Tracked source files (current `git ls-files`) | 1,163 | ~1,719 | 96 % same-path rate against Craft (`bun run audit:craft-reuse`) |
| Same-path files normalized to byte-identical | 686 (59 %) | — | Mechanical replacements only: scope (`@mkagent/*` ↔ `@craft-agent/*`), URL scheme (`mkagent://`), config root (`~/.mkagent`), brand strings |
| Same-path Lite-customized | 430 | — | Lite boundary (e.g. deleted Sources/MCP branch) plus brand |
| MkAgent-only source files | 47 | — | MkAgent brand assets, `audit:craft-reuse`, lint/CLI scripts, `apps/online-docs`-equivalent leftovers removed |
| Source files Craft has that MkAgent does not | — | 606 | Removed by the Lite boundary (Claude backend, OAuth, Sources, MCP, Messaging, Viewer, automations, …) |
| Top-level `dependencies` | 55 | 61 | MkAgent drops `@anthropic-ai/claude-agent-sdk`, `@anthropic-ai/sdk`, `@dnd-kit/{dom,helpers}`, `@github/copilot-sdk`, `@modelcontextprotocol/sdk`, plus the messaging OAuth flow packages (the lowered number reflects the Lite backend registry, not a runtime regression) |
| Top-level `devDependencies` | 33 | 34 | Only meaningful drop is `@aws-sdk/client-s3` (used only for the upstream release upload to S3; MkAgent's `electron-updater` GitHub provider does not need it) |
| `node_modules/` size on a clean `bun install --frozen-lockfile` | **2.0 GB** | 2.5 GB | The 0.5 GB delta matches the dropped native + SDK bundles below |

## 2. Apps & packages actually present

| Path | MkAgent | Craft Agents |
|---|---|---|
| `apps/electron` | ✅ (shared renderer + preload + Browser pane + Sentry + auto-update) | ✅ (same) |
| `apps/webui` | ✅ (loads the same renderer through a browser adapter) | ✅ (same) |
| `apps/cli` | ✅ (`run`, `session`, `workspace`, `send`, …) | ✅ (same surface plus extra Sources/Automations sub-commands, which MkAgent does **not** expose) |
| `apps/viewer` | ❌ (deleted) | ✅ (Electron Viewer app for sharing sessions publicly) |
| `packages/core` | ✅ | ✅ |
| `packages/shared` | ✅ (with `messaging-gateway`, `interceptor-common`, `feature-flags`, `interceptor-request-utils` removed) | ✅ (full size) |
| `packages/ui` | ✅ | ✅ |
| `packages/server-core` | ✅ | ✅ |
| `packages/server` | ✅ (headless `MKAGENT_SERVER_TOKEN` server) | ✅ |
| `packages/pi-agent-server` | ✅ (only registered backend) | ✅ (alongside Craft's `claude-agent-sdk` backend) |
| `packages/session-tools-core` | ✅ (Labels/Statuses/MCP/Sources OAuth branches trimmed) | ✅ (full size) |
| `packages/messaging-gateway` | ❌ (deleted) | ✅ |
| `packages/messaging-whatsapp-worker` | ❌ (deleted) | ✅ (Baileys-backed WhatsApp worker) |
| `packages/session-mcp-server` | ❌ (deleted) | ✅ (TypeScript MCP server bundled as `resources/session-mcp-server/`) |
| `resources/bridge-mcp-server/` | ❌ (deleted) | ✅ (bundled, ~13 MB TypeScript MCP server) |
| `resources/scripts/` + `resources/bin/` | ✅ (`markitdown`, PDF, XLSX, DOCX, PPTX, image, iCal, doc-diff wrappers + Python scripts + `uv`) | ✅ (same wrappers + bundled **per-platform `uv` binaries** under `resources/bin/{darwin-arm64,darwin-x64,win32-x64,linux-x64}/uv`) |

## 3. Backend / runtime boundary

| Concern | MkAgent | Craft Agents |
|---|---|---|
| Registered `AgentBackend`s | `pi` only | `pi`, `claude-agent-sdk`, plus optional **Copilot / gateway** subscriptions |
| Auth model | API-key + custom endpoints + Ollama (Pi transports) | API-key + custom + **OAuth (Anthropic, OpenAI, GitHub Copilot, Google Workspace, Slack, Microsoft)** + subscription flows + gateway |
| Subprocess model | `packages/pi-agent-server` runs as a Bun subprocess; communicates over JSONL on stdio | Pi subprocess (same) **plus** SDK subprocess (`@anthropic-ai/claude-agent-sdk-binary`, ~217 MB native `claude` binary per platform arch) **plus** bridge/session MCP servers **plus** WhatsApp worker subprocess |
| Built-in transports | OpenAI-compatible, Anthropic-compatible, Ollama (Pi `0.80.6`) | Same, plus Anthropic SDK direct mode and Copilot SDK mode |
| Image generation | ❌ (deleted; image attachments still supported) | ✅ (`gen_image` model + tool) |

## 4. Installer / package size (the headline numbers)

These are the sizes you actually ship to users, taken from the on-disk dev build at `apps/electron/release/<arch>/MkAgent.app` and the upstream `craft-agents-oss` checkout that the audit script read. **None** of these include code-signing overhead (MkAgent dev build sets `MKAGENT_DEV_RUNTIME=1`; release builds with `CSC_IDENTITY_AUTO_DISCOVERY=false` are unsigned/ad-hoc). For a Craft Agents reference, the `claude-agent-sdk-darwin-arm64/claude` binary alone (`217 MB`) was measured directly from `node_modules`.

### 4.1 macOS arm64 (`MkAgent.app` / `Craft-Agents-arm64.app`)

| Component | MkAgent | Craft Agents | Delta (Craft − MkAgent) |
|---|---:|---:|---:|
| `Contents/Resources/app/dist/` (bundled JS, renderer assets, scripts) | 116 MB | ~380 MB | ~−264 MB |
| `Contents/Resources/app/node_modules/` (runtime node_modules + cron packs) | 5.0 MB | ~210 MB | ~−205 MB (Craft bundles the SDK, MCP servers, WhatsApp worker, plus more) |
| `Contents/Resources/app/vendor/` (Bun runtime) | 60 MB | 60 MB | 0 |
| Other resources / signatures | 2 MB (icons, plists, Codesign) | ~2 MB | ~0 |
| **Subtotal** | **~183 MB** | **~652 MB** | **~−469 MB** (~−72 %) |
| `Contents/Frameworks/Electron Framework.framework` | 253 MB | 253 MB | 0 (identical Electron `39.2.7`) |
| `Contents/Frameworks/{Mantle,ReactiveObjC,Squirrel, Squirrel.framework}` | ~1 MB | ~1 MB | 0 |
| `MkAgent Helper*.app` (Renderer/GPU/Plugin) | ~1 MB | ~1 MB | 0 |
| **`MkAgent.app` total (unpacked)** | **438 MB** | **~907 MB** | **~−469 MB** |

> The unpacked `.app` sizes already include helper apps and the Electron framework; they **exclude** the platform download (DMG/ZIP wrapper). Because `craft-agents-oss/node_modules/@anthropic-ai/claude-agent-sdk-darwin-arm64/claude` is a single **217 MB** binary with a per-platform `.zip` for `-darwin-x64` / `-win32-x64` / `-linux-x64` of similar shape, the upstream DMG/ZIP for Craft always exceeds MkAgent's by **≥ ~250 MB** after compression.

### 4.2 What `electron-builder` carries in `extraResources`

| Bundled to installer | MkAgent | Craft Agents | Approx. size carried in installer |
|---|---|---|---:|
| Per-platform **`claude` native binary** (Anthropic SDK) | ❌ | ✅ | **~217 MB per platform arch** |
| Bundled **`uv`** Python runtime (one binary per `darwin-{arm64,x64}/win32-x64/linux-x64`) | ❌ (uses system `uv` if present; resolves `MKAGENT_UV` env or PATH) | ✅ | ~30–55 MB per arch |
| `@anthropic-ai/claude-agent-sdk` thin core + per-platform binary shim | ❌ | ✅ | ~3.5 MB core + ~217 MB binary per arch |
| `bridge-mcp-server/` (Craft's MCP bridge) | ❌ | ✅ | ~13 MB |
| `session-mcp-server/` (Craft's session MCP) | ❌ | ✅ | ~50 KB TypeScript |
| WhatsApp worker (`packages/messaging-whatsapp-worker/dist/worker.cjs`) with bundled Baileys | ❌ | ✅ | ~8 MB worker + transitive Baileys deps |
| `resources/scripts/*.py` (PDF, DOCX, XLSX, PPTX, image, iCal, doc-diff, MarkItDown wrappers) | ✅ (same files) | ✅ | ~110 KB Python; both versions keep them |
| `resources/bin/*-tool` shell wrappers | ✅ (same) | ✅ | trivial |
| `@vscode/ripgrep` (bundled `rg` for `server-core` search) | ✅ (4.3 MB on mac-arm64) | ✅ | 4.3 MB |
| `vendor/bun` (Bun runtime for Pi subprocess) | ✅ (60 MB on mac-arm64) | ✅ | 60 MB |
| `dist/resources/{themes,tool-icons,permissions,docs,release-notes}` | ✅ | ✅ | couple of MB |
| `dist/renderer/assets/` (KaTeX fonts, Shiki languages, language modes) | ✅ (~51 MB) | ✅ | identical |

### 4.3 Net effect for end users

| Effect | MkAgent | Craft Agents |
|---|---|---|
| DMG (macOS arm64 / x64) download | ~165 MB¹ | ~370 MB¹ |
| macOS `.app` install footprint | ~438 MB | ~907 MB |
| NSIS `.exe` (Windows x64) | ~210 MB¹ | ~430 MB¹ |
| Linux AppImage | ~200 MB¹ | ~420 MB¹ |
| `bun run apps/cli` pure-CLI mode (no Electron) | `bun run cli:build` → ~1 MB `dist/mkagent` package; same on Craft | ~1 MB (CLI payload itself is identical) |
| Time-to-first-run with cold cache | fast (no ~217 MB binary download) | slower by the size of `claude` + `uv` blobs |

¹ **Caveat.** DMG / NSIS / AppImage numbers above are **inferred** from the unpacked `.app` sizes and the `electron-builder.yml` `files` / `extraResources` rules; they are not freshly built side-by-side. Rebuilding Craft requires `npm install` on Linux / macOS to fetch the 217 MB Claude binary plus the `uv` per-platform blob (each ≥ 30 MB). Rebuilding MkAgent skips both.

## 5. Feature surface

The matrix below extends [`docs/feature-matrix.md`](./feature-matrix.md) with explicit numbers from the audit and pointing at concrete file evidence.

| Area | MkAgent | Craft Agents |
|---|---|---|
| Electron Desktop + WebUI + headless server + CLI + shared renderer | ✅ | ✅ |
| Pi agent + Pi provider preset + API-key connections | ✅ | ✅ |
| Custom OpenAI-completions / Anthropic-messages endpoints + Ollama | ✅ | ✅ |
| Local multi-workspace, `default` slug, per-window binding | ✅ | ✅ |
| Sessions: create / continue / cancel / resume / flag / archive / unread / search / import / export / branch / multi-window | ✅ | ✅ |
| Skills (global / workspace / project), mini chat, plan, annotations, follow-up | ✅ | ✅ |
| Browser pane + `web_search` + `web_fetch` | ✅ | ✅ |
| Permissions (safe / allow-all) + permission prompts | ✅ | ✅ |
| Network proxy | ✅ | ✅ |
| Auto-update via `electron-updater` against GitHub Releases | ✅ (against `open-fox/mkagent-public`) | ✅ (against `https://agents.craft.do/electron/latest`) |
| Sentry (`@sentry/electron` + `@sentry/react`); gated by `SENTRY_ELECTRON_INGEST_URL` | ✅ | ✅ |
| Document tools (PDF / DOCX / XLSX / PPTX / image / iCal / doc-diff / MarkItDown) with `uv`-based Python wrappers | ✅ (system `uv` preferred) | ✅ (bundled per-platform `uv`) |
| Mini chat, `EditPopover`, mini model, titles, summaries | ✅ | ✅ |
| Theme presets, light/dark/system, i18n (`en`, `zh-Hans`) | ✅ (15 themes inherited from Craft) | ✅ (same) |
| Tool icons, default permissions, "What's New" notes | ✅ | ✅ |
| Claude backend, Claude OAuth/subscription | ❌ | ✅ |
| GitHub Copilot SDK + OAuth subscription | ❌ | ✅ |
| External messaging gateway + WhatsApp / Slack / Lark workers | ❌ | ✅ |
| Sources (API Source, MCP Source, MCP pool), Source OAuth flows | ❌ | ✅ |
| Session MCP server, bridge MCP server | ❌ | ✅ |
| Viewer (separate Electron app for shared sessions) | ❌ | ✅ |
| Public sharing, remote workspace federation/transfer | ❌ | ✅ |
| Product automations / scheduler / recurring tasks | ❌ | ✅ |
| Session labels + user-defined statuses (settings UI) | ❌ | ✅ |
| Projects / Kanban | ❌ | ✅ |
| Claude / gateway-supplied OAuth callback server, deep links | ❌ | ✅ |
| Image generation (`gen_image` tool + provider routing) | ❌ | ✅ |

## 6. Test, typecheck and lint coverage delta

| Gate | MkAgent | Craft Agents | Result |
|---|---|---|---|
| `bun run test` (main suite) | 3,078 pass / 11 platform-conditional skip | (similar order of magnitude; full count TBD on fresh checkout) | both green |
| `bun run test:doc-tools` | 8 Python smoke tests for `pdf_tool`, `xlsx_tool`, `docx_tool`, `pptx_tool`, `img_tool`, `ical_tool`, `doc_diff`, `markitdown` | (same) | both green |
| `bun run typecheck:all` | passes; `apps/online-docs` is excluded from the workspace by `workspaces` globs in MkAgent and skipped in Craft | passes | both green |
| `bun run lint` | `lint:craft-ui-sync`, `lint:craft-test-coverage`, `lint:electron`, `lint:shared`, `lint:ui` pass; **20 React Hook `exhaustive-deps` warnings retained** from upstream | adds `lint:ipc-sends`, `lint:tool-name-checks`, `lint:i18n:coverage`, `lint:i18n:strings`; **45 Craft-origin React Hook warnings** | MkAgent's lint scope is narrower |
| `bun run audit:craft-reuse` | 96 % same-path, 59 % byte-identical, 0 missing-without-explanation | (not applicable) | green |
| `bun run lint:craft-test-coverage` | 246 kept / 6 substituted / 121 dropped-for-product-boundary / **0 missing-without-explanation** | (not applicable) | green |

The MkAgent-side lifts (zero "missing test without explanation") come from [`scripts/check-craft-test-coverage.ts`](../../scripts/check-craft-test-coverage.ts), which enforces that every Craft test is one of: (a) same-path kept, (b) replaced with a Lite equivalent, (c) explicitly tied to a removed product area.

## 7. License & attribution

Both projects are released under **Apache-2.0**. MkAgent ships [`NOTICE`](../../NOTICE) on the repo root with the attribution upstream required, and [`docs/feature-matrix.md`](./feature-matrix.md) records the kept/removed capabilities in human-readable form. The `mkagent-public` mirror at <https://github.com/open-fox/mkagent-public> is release-artifact only (DMG/ZIP/NSIS/AppImage, manifest, blockmap, checksums) and does not contain source.

## 8. Re-running this audit

```bash
# From the MkAgent checkout
git rev-parse HEAD              # record MkAgent commit
bun install --frozen-lockfile
bun run audit:craft-reuse       # 96 % same-path / 59 % byte-identical
bun run lint:craft-test-coverage
bun run typecheck:all
bun run lint
bun run validate:ci

# From the upstream Craft Agents checkout
git checkout a60ebc1a5a7cb0a6af7a77d5eed0512c5fc07658
ls -lah node_modules/@anthropic-ai/claude-agent-sdk-darwin-arm64/claude   # 217 MB binary
```

If you need updated DMG / NSIS / AppImage numbers, build both products from their recorded commits with the same `electron-builder.yml` flags, then reuse [`scripts/build-server.ts`](../../scripts/build-server.ts) and the per-platform `apps/electron/scripts/build-dmg.sh` to write installers.
> Snapshot taken on **2026-07-30** against the MkAgent `main` branch working tree (HEAD `47d09e5 feat: Add Chinese documentation`) and the upstream tag [`craft-ai-agents/craft-agents-oss` `v0.11.2` / `a60ebc1a5a7c`](https://github.com/craft-ai-agents/craft-agents-oss). MkAgent ships a single `main` branch; there is no `dev/agent-memory` line. Numbers come from the on-disk working trees and prior validated builds, not from new network measurements; rebuild both repositories from the recorded commits before re-running this audit.
