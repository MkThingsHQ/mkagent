# Releases, updates, and telemetry

Tagged releases in the open-source repository build macOS DMG/ZIP, Windows NSIS, Linux AppImage, the headless server for each platform, and the Bun-based CLI bundle. Source code and downloadable artifacts live together in [MkThingsHQ/mkagent](https://github.com/MkThingsHQ/mkagent/releases/latest). Signing credentials are optional: a zero-secret release produces ad-hoc-signed macOS packages and unsigned Windows installers, while complete platform credentials automatically enable Apple Developer ID signing/notarization or Windows Authenticode. The workflow publishes with the repository-scoped GitHub Actions token.

## Release pipeline

```text
  main ──▶ release:prepare ──▶ reviewed version commit ──▶ annotated v* tag
                                                          │
                                                          ▼
                                              validation + multi-platform builds
                                                       │
                                                       ▼
                         sign when complete credentials are available
                  otherwise ad-hoc sign macOS and package Windows unsigned
                                                       │
                                                       ▼
                  upload installers + manifests + blockmaps + checksums
                          to MkThingsHQ/mkagent GitHub Releases
                                                       │
                                                       ▼
                         electron-updater reads the same repository
```

Installers, manifest files (for example `latest-mac.yml`, `latest.yml`, and `latest-linux.yml`), blockmaps, checksums, and release notes live in the main repository's GitHub Releases rather than being committed to Git. A separate release-only repository is no longer used.

Pull requests and pushes to `main` run the unsigned packaging matrix for macOS arm64, Windows x64, and Linux x64. Those validation packages and matching headless-server archives are retained as GitHub Actions artifacts for 7 days. Only a reviewed `v*` tag promotes the verified asset matrix to a durable GitHub Release; signing is upgraded automatically when the complete credentials for a platform are configured.

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
| macOS arm64                | DMG + ZIP                | `MkAgent-0.1.0-arm64.{dmg,zip}`    | ad-hoc or Developer ID + notarization  | no-certificate builds disable Hardened Runtime and require manual updates              |
| macOS x64                  | DMG + ZIP                | `MkAgent-0.1.0-x64.{dmg,zip}`      | same                                    | for Intel Macs                                                                         |
| Windows x64                | NSIS                     | `MkAgent-0.1.0-x64.exe`            | unsigned or Authenticode                | unsigned builds may trigger SmartScreen; per-user install under `%LOCALAPPDATA%\Programs\` |
| Linux x64                  | AppImage                 | `MkAgent-0.1.0-x64.AppImage`       | none                                  | desktop category: Utility                                                              |
| Headless server (per-arch) | `bun build --compile`    | `mkagent-server-<platform>-<arch>` | none                                  | consumed by WebUI and external CLI users                                               |
| CLI                        | `bun build --target=bun` | `MkAgent-cli-bun.tar.gz`           | none                                  | JavaScript bundle; requires Bun on the user's machine                                  |

`bun run electron:dist:dev:mac` produces a local ad-hoc-signed build and disables automatic updates. Release jobs also set `CSC_IDENTITY_AUTO_DISCOVERY=false`, `mac.identity=-`, and `hardenedRuntime=false` explicitly when Apple credentials are absent. Ad-hoc signing satisfies Apple Silicon code-integrity requirements but does not establish a trusted developer identity, so Gatekeeper warnings remain.

## Updates

The Electron app uses `electron-updater` against the GitHub Releases API on `MkThingsHQ/mkagent`. The public repository and its update manifests require no client-side GitHub token.

| Field        | Where it is set                                              |
| ------------ | ------------------------------------------------------------ |
| `appId`      | `apps/electron/electron-builder.yml` → `app.mkagent.desktop` |
| Provider     | `github`                                                     |
| Owner / repo | `MkThingsHQ` / `mkagent`                                     |
| Manifest     | auto-generated by electron-builder at release time           |

When a downgrade is required, the user must install an older build manually; auto-update only moves forward.

macOS automatic updates require a Developer ID-signed application. Ad-hoc macOS builds therefore skip startup update checks and reject manual in-app update attempts with a link to the latest GitHub Release. Users update those builds by downloading the next DMG manually. Windows and Linux continue to use their normal updater targets.

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

The workflow works with no signing secrets. To enable trusted platform builds, create a protected Actions environment named `release` and configure one complete credential group:

| Secret                                                     | Purpose                                                                               |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `CSC_LINK`, `CSC_KEY_PASSWORD`                             | Developer ID certificate and password; must be paired with all Apple fields            |
| `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID` | Apple notarization; all five Apple secrets enable signed/notarized macOS builds         |
| `WIN_CSC_LINK`, `WIN_CSC_KEY_PASSWORD`                     | Both secrets enable Windows Authenticode                                                |

Missing credential groups select the no-certificate mode: ad-hoc signing on macOS and unsigned Windows installers. Partially configured groups fail before builds start so a typo cannot silently downgrade an intended trusted release. Every Release records the resolved platform trust modes in its notes and `SIGNING_STATUS.txt`; that file is also covered by `SHA256SUMS`. The workflow uses its repository-scoped `GITHUB_TOKEN` with `contents: write` to create a draft release, uploads and verifies the complete asset matrix plus checksums, and only then publishes it as Latest. Re-running a failed workflow may update an existing draft, but it will not overwrite an already published release.

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

Release is published only when all of the above pass on the tag commit. Before tagging, either configure each desired signing group completely or leave that entire group empty for a deliberate unsigned release.
