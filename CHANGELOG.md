# Changelog

All notable changes to MkAgent are documented in this file. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and versions follow
[Semantic Versioning](https://semver.org/).

## [Unreleased]

Add user-visible changes here before running `bun run release:prepare <version>`.

## [0.2.4] - 2026-10-26

### Added

- Per-session Coding mode with a lean prompt and coding tool profile, workspace default, CLI `--coding`, composer chip and session glyph. Started conversations continue in a new session with a summary when changing modes.
- Coding repository picker for recent folders, workspace repositories and GitHub CLI repositories; create an isolated `codex/` branch/worktree from the latest default branch, with clone and checkout failure cleanup.
- Coding chat-header PR status and details through the existing GitHub CLI login, adaptive polling, Git/turn refresh and hidden-window pause; Resolve/Fix/Fix CI prompts keep changes local.

### Fixed

- Fetch Git branch names asynchronously and hide detached HEAD, including empty paths, errors and timeouts.
- Keep the Coding header usable on narrow panels without restoring excluded metadata features.

### Improved

- Synchronize applicable Craft v0.15.3 → v0.15.4 changes while preserving Pi 1.1.0, existing local configuration, MkAgent branding and Lite boundaries.

## [0.2.3] - 2026-10-26

### Added

- Automatically convert HEIC/HEIF attachments to JPEG for previews, thumbnails and Pi model input; preserve original file metadata and report decode failures.
- OpenCode Go connection preset with its endpoint, branding and editable model IDs.
- Configurable endpoint output caps (`customEndpoint.maxTokens`), including long-session compaction budgets; legacy connections retain the 8192 default.
- Pi “Compact context at” setting with 100K–1M presets/custom values, model-aware triggers and existing-session restart support.

### Improved

- Synchronize applicable Craft v0.15.2 → v0.15.3 changes, preserving Pi 1.1.0, MkAgent branding and Lite boundaries.
- Revalidate existing rich Chat Starters, Skill invocation, live settings refresh and session usage accounting.

## [0.2.2] - 2026-10-16

### Added

- Configurable Chat Starters in Settings → AI: up to three workspace prompts with separate labels, Skill mentions and automatic fallback when cleared.

### Fixed

- Count every Pi API call in a turn, accumulate billing across turns and restarts, and keep branch/child-session billing independent of the parent.
- Preserve Anthropic tool schemas with `additionalProperties: false` through Pi's network interceptor.
- Allow overflowing session information panels to scroll on Desktop and mobile, with cumulative output tokens and estimated session cost.
- Keep Pi forks at the selected reply even when the SDK message has no id.
- Preserve known API usage when Stop ends a later streaming reply in the same turn.

### Improved

- Keep child-session tasks narrow with passed context, ranged reads and short results or output files.
- Synchronize only applicable Craft v0.15.1 → v0.15.2 changes while preserving the Pi 1.1.0 and Lite product boundary.

## [0.2.1] - 2026-10-16

### Improved

- Synchronized applicable Craft v0.15.1 fixes while retaining MkAgent's Pi 1.1.0 and Lite product boundary.
- Made clicks, keys, dropdowns and fresh screenshots reliable in hidden browser windows, including direct element click fallback and Linux capture positioning.
- Confirmed real security challenges before bringing the browser forward, deduplicated website sign-in popups, and trimmed screenshot, console and network output.
- Kept browser password entries out of completed tool inputs, stored transcripts and session exports; fixed commands containing apostrophes.
- Preserved background commands and child sessions when stopping a reply, reported interrupted turns as cancelled, and identified automatic completion follow-ups clearly.
- Counted shell reads of browser and Skill guides toward prerequisites, including cat, head and sed.
- Checked attachment sizes against the connected server's limit before reading/sending, with file-specific limits and preserved drafts.

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
[0.2.4]: https://github.com/MkThingsHQ/mkagent/releases/tag/v0.2.4
[0.2.3]: https://github.com/MkThingsHQ/mkagent/releases/tag/v0.2.3
[0.2.2]: https://github.com/MkThingsHQ/mkagent/releases/tag/v0.2.2
[0.2.1]: https://github.com/MkThingsHQ/mkagent/releases/tag/v0.2.1
[0.2.0]: https://github.com/MkThingsHQ/mkagent/releases/tag/v0.2.0
[0.1.3]: https://github.com/MkThingsHQ/mkagent/releases/tag/v0.1.3
[0.1.2]: https://github.com/MkThingsHQ/mkagent/releases/tag/v0.1.2
[0.1.1]: https://github.com/MkThingsHQ/mkagent/releases/tag/v0.1.1
[0.1.0]: https://github.com/MkThingsHQ/mkagent/releases/tag/v0.1.0
