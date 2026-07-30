# Releases, updates, and telemetry

Private source releases build macOS DMG/ZIP, Windows NSIS, Linux AppImage, the headless server for each platform, and the Bun-based CLI bundle. The public download page is [open-fox/mkagent-public](https://github.com/open-fox/mkagent-public/releases/latest). A release environment requires Apple and Windows signing credentials plus a minimal token that can write releases only to that repository.

## Release pipeline

```text
  main ──▶ release:prepare ──▶ reviewed version commit ──▶ annotated v* tag
                                                          │
                                                          ▼
                                              validation + multi-platform builds
                                                       │
                                                       ▼
                                sign + notarize (Apple), sign (Windows)
                                                       │
                                                       ▼
                  upload installers + manifests + blockmaps + checksums
                            to open-fox/mkagent-public (release-only repo)
                                                       │
                                                       ▼
                              electron-updater reads the public repo
```

`mkagent-public` is a download portal: its Git history contains only the landing page, license, and contribution/security guidance. Installers, manifest files (for example `latest-mac.yml`, `latest.yml`, and `latest-linux.yml`), blockmaps, checksums, and release notes live in GitHub Releases rather than being committed to Git.

## Version and changelog policy

MkAgent uses semantic versions and `v<major>.<minor>.<patch>` Git tags. [`CHANGELOG.md`](../CHANGELOG.md) is the canonical cumulative changelog; `apps/electron/resources/release-notes/<version>.md` is the user-facing note bundled into the app and copied verbatim to the public GitHub Release.

Prepare a release only from a clean `main` branch:

```bash
# First replace the Unreleased placeholder in CHANGELOG.md with real entries.
bun run release:prepare 0.2.0
bun run release:check v0.2.0
git diff --check
git add CHANGELOG.md package.json bun.lock apps/*/package.json packages/*/package.json \
  apps/electron/resources/release-notes/0.2.0.md scripts/craft-source-overrides.json
git commit -m "chore(release): prepare v0.2.0"
git tag -a v0.2.0 -m "MkAgent v0.2.0"
git push origin main v0.2.0
```

`release:prepare` updates every workspace package version, refreshes `bun.lock`, moves the Unreleased changelog entries into a dated version section, and creates the bundled release-note file. The tag workflow independently rejects missing or inconsistent metadata.

## Installer matrix

| Platform                   | Build                    | Naming                             | Signing                               | Notes                                                                                  |
| -------------------------- | ------------------------ | ---------------------------------- | ------------------------------------- | -------------------------------------------------------------------------------------- |
| macOS arm64                | DMG + ZIP                | `MkAgent-0.1.0-arm64.{dmg,zip}`    | ad-hoc (dev) / Developer ID (release) | `hardenedRuntime: true`, `gatekeeperAssess: false`, NSLocalNetworkUsageDescription set |
| macOS x64                  | DMG + ZIP                | `MkAgent-0.1.0-x64.{dmg,zip}`      | same                                  | for Intel Macs                                                                         |
| Windows x64                | NSIS                     | `MkAgent-0.1.0-x64.exe`            | ad-hoc (dev) / Authenticode (release) | per-user install under `%LOCALAPPDATA%\Programs\`; `deleteAppDataOnUninstall: true`    |
| Linux x64                  | AppImage                 | `MkAgent-0.1.0-x64.AppImage`       | none                                  | desktop category: Utility                                                              |
| Headless server (per-arch) | `bun build --compile`    | `mkagent-server-<platform>-<arch>` | none                                  | consumed by WebUI and external CLI users                                               |
| CLI                        | `bun build --target=bun` | `MkAgent-cli-bun.tar.gz`           | none                                  | JavaScript bundle; requires Bun on the user's machine                                  |

`MKAGENT_DEV_RUNTIME=1` plus `CSC_IDENTITY_AUTO_DISCOVERY=false` produces a local installable build without any signing secrets.

## Updates

The Electron app uses `electron-updater` against the GitHub Releases API on `open-fox/mkagent-public`. The client contains no GitHub token; the manifest file is the only authentication it needs.

| Field        | Where it is set                                              |
| ------------ | ------------------------------------------------------------ |
| `appId`      | `apps/electron/electron-builder.yml` → `app.mkagent.desktop` |
| Provider     | `github`                                                     |
| Owner / repo | `open-fox` / `mkagent-public`                                |
| Manifest     | auto-generated by electron-builder at release time           |

When a downgrade is required, the user must install an older build manually; auto-update only moves forward.

## Telemetry: Sentry

Sentry follows the desktop baseline. Main and renderer initialization are inert unless `SENTRY_ELECTRON_INGEST_URL` is provided at build time.

| Layer            | What is captured                                                                                     |
| ---------------- | ---------------------------------------------------------------------------------------------------- |
| Main             | uncaught exceptions, breadcrumb events (with credential-shaped fields redacted), a hashed machine id |
| Renderer (React) | boundary errors, console errors, agent/input error reports                                           |
| Preload          | bridge-side errors                                                                                   |

Always-redacted breadcrumb/request header fields: `authorization`, `cookie`, `x-api-key`, `token`, `key`, `secret`, `password`, `credential`, `auth`. Source maps are generated but **not** uploaded today; restoring source-level stacks requires both Vite/esbuild plugin enablement and the Sentry CI variables.

## Cross-builder reproducibility

The `electron-builder.yml` `files` / `extraResources` blocks are first-class artifacts of the Lite boundary. They are what give MkAgent its smaller installer footprint; see [`comparison-with-craft.md`](./comparison-with-craft.md) for the concrete numbers. Any release-time change to either block must update both that document and `appId` / `productName` / `copyright` at the top of the same file.

## GitHub release environment

Create a protected Actions environment named `release` in the private source repository and configure these environment secrets:

| Secret                                                     | Purpose                                                                               |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `CSC_LINK`, `CSC_KEY_PASSWORD`                             | Developer ID certificate and password                                                 |
| `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID` | Apple notarization                                                                    |
| `WIN_CSC_LINK`, `WIN_CSC_KEY_PASSWORD`                     | Windows Authenticode certificate and password                                         |
| `MKAGENT_PUBLIC_RELEASE_TOKEN`                             | Fine-grained token with `Contents: Read and write` for `open-fox/mkagent-public` only |

The workflow creates the public release as a draft, uploads and verifies the complete asset matrix, and only then publishes it as Latest. Re-running a failed workflow may update an existing draft, but it will not overwrite an already published release.

## Pre-release checklist

```bash
git status --short                # clean working tree
git log -n 5 --oneline            # cross-check the version bump and its commit
bun run release:check v0.2.0
bun run validate:ci
bun run audit:craft-reuse
bun run lint:craft-test-coverage
bun run typecheck:all
bun run test
bun run electron:build
bun run webui:build
bun run cli:build
bun run server:build:subprocess
```

Release is published only when all of the above pass on the tag commit. Do not create the tag until the Apple, Windows, and public-repository credentials are configured: stable releases intentionally do not fall back to unsigned installers.
