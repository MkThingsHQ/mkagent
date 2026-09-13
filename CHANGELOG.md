# Changelog

All notable changes to MkAgent are documented in this file. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and versions follow
[Semantic Versioning](https://semver.org/).

## [Unreleased]

Add user-visible changes here before running `bun run release:prepare <version>`.

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
[0.1.2]: https://github.com/MkThingsHQ/mkagent/releases/tag/v0.1.2
[0.1.1]: https://github.com/MkThingsHQ/mkagent/releases/tag/v0.1.1
[0.1.0]: https://github.com/MkThingsHQ/mkagent/releases/tag/v0.1.0
