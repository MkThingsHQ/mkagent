# Changelog

All notable changes to MkAgent are documented in this file. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and versions follow
[Semantic Versioning](https://semver.org/).

## [Unreleased]

Add user-visible changes here before running `bun run release:prepare <version>`.

## [0.2.0] - 2026-10-16

### Added

- Rebuilt Desktop and mobile WebUI around the Craft v0.15.0 design: a joined paper layout, quieter transcript, raised composer, shared settings pages, contrast-solved themes, and motion preferences.
- Added Cloudflare AI Gateway connections and shell Run actions with live task output and individual task cancellation through Pi.
- Added local files, web news, and Skills starter prompts.

### Changed

- Pinned the Pi SDK and coordinated runtime dependencies to 1.1.0; refreshed Sonnet/Haiku 5.5 and GPT-6.1 Sol models and provider-aware Luna/Haiku/Flash utility routing.
- Preserved MkAgent branding, existing local configuration, Pi/Lite features and the established excluded-module boundary.

### Fixed

- Isolated Pi main and utility sessions from project/global extensions and preserved failed tool results in model responses and transcripts.
- Fixed Azure provider renaming and edited endpoint hot updates, WebUI deep links/workspace parameters and login styling, mobile shortcut hints, and Windows window-material fallback.
- Replaced global command-line matching when stopping background shells with cancellation through the owning task.

## [0.1.3] - 2026-10-08

### Changed

- Selectively synchronized retained Pi/Lite functionality from Craft Agents OSS v0.14.1; Decision models and Guarded mode remain deferred.
- Upgraded Pi to 0.87.1, refreshed model presets, and improved utility-model fallback and delivery of queued steering messages.
- Added canonical context occupancy, clearer compaction status, and reliable pending-plan dispatch after manual compaction.
- Improved mobile composer sizing, focused-caret scrolling, browser popup cleanup, and nested-repository Git context.
- Added RTK 0.44 compatibility checks, command exclusions, and an exact-output escape hatch.

### Fixed

- Made remembered tool approvals respect exact commands and write folders, reject unsafe argument variants, and clamp child-agent permissions to the parent mode.
- Reused saved credentials when testing edited connections with masked API keys.
- Preserved configuration-directory overrides and bounded network debug logs by default.

## [0.1.2] - 2026-09-13

### Added

- Added GPT-6 Astra, Claude Opus 5, and Claude Fable 5.1 model options where supported by the configured Pi provider.

### Changed

- Upgraded the Pi runtime to 0.85.1 with automatic retry progress, failed-response recovery, isolated session settings, and bounded utility queries.
- Improved retry feedback across Desktop and CLI so discarded partial responses are not merged into recovered answers.

### Fixed

- Fixed What's New discovery so draft files cannot hide the latest versioned release notes.
- Fixed packaged headless runtimes accepting development PATH fallbacks when packaged mode is encoded as `true`.
- Made atomic configuration writes collision-safe when multiple processes write concurrently.

## [0.1.1] - 2026-09-02

### Added

- Added ChatGPT subscription-backed web search with resilient model and tool fallback.
- Added `archive_session` for archiving or restoring idle sessions in the current workspace.
- Added Moonshot AI and Kimi model presets, and restored Claude Opus 4.6 selection.

### Changed

- Upgraded the Pi runtime to 0.81.1 with the new model runtime and improved OAuth and custom endpoint compatibility.
- Updated in-app help links to open the maintained MkAgent documentation on GitHub.

### Fixed

- Improved update installation cleanup and recovery when the installer cannot take over.
- Fixed stale server-lock detection, encoded and Windows file paths, and empty streamed tool-call chunks.
- Disabled unwanted capitalization and autocorrection in the rich-text prompt editor.

## [0.1.0] - 2026-07-30

### Added

- Craft-derived workspace and session experience for Desktop and WebUI.
- OpenAI-compatible model connections through the Pi backend.
- Local skills, browser tools, document tools, permissions, themes, and workspace settings.
- Local session search, flags, archives, import, export, and branching.

[Unreleased]: https://github.com/MkThingsHQ/mkagent/releases
[0.2.0]: https://github.com/MkThingsHQ/mkagent/releases/tag/v0.2.0
[0.1.3]: https://github.com/MkThingsHQ/mkagent/releases/tag/v0.1.3
[0.1.2]: https://github.com/MkThingsHQ/mkagent/releases/tag/v0.1.2
[0.1.1]: https://github.com/MkThingsHQ/mkagent/releases/tag/v0.1.1
[0.1.0]: https://github.com/MkThingsHQ/mkagent/releases/tag/v0.1.0
