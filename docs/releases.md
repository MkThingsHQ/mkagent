# Releases, updates, and telemetry

Private source releases build macOS DMG/ZIP, Windows NSIS, Linux AppImage, headless servers, and the CLI. A release environment requires Apple and Windows signing credentials plus a minimal token that can write releases only to `open-fox/mkagent-public`.

The public repository receives installers, update manifests, blockmaps, checksums, and download notes. `electron-updater` reads that GitHub repository; the client contains no GitHub token.

Sentry follows the desktop baseline. Main and renderer initialization are inert unless `SENTRY_ELECTRON_INGEST_URL` is provided. Sensitive headers and credential-like breadcrumb fields are redacted. Source maps are generated for debugging but are not uploaded.
