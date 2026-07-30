# Data directory

The default root is `~/.mkagent` (resolved from `$HOME` or `%USERPROFILE%` at first launch). Set `MKAGENT_CONFIG_DIR` to isolate tests, run multiple instances, or back up to a custom location. MkAgent never reads or migrates data from any other product.

## Layout

```text
~/.mkagent/
  config.json                       # global preferences (theme, language, browser tool, ...)
  credentials/                      # credential storage (encrypted by the OS keychain)
  permissions/                      # global permission policies
  themes/                           # theme presets (~15 shipped)
  tool-icons/                       # icons for known tools
  logs/                             # rotating server logs (`mkagent-server-*.log`)
  updates/                          # staging for `electron-updater` downloads
  skills/                           # global Skills (discovered in priority global < workspace < project)
  workspaces/
    default/
      config.json                   # workspace settings (default mode, thinking level, ...)
      skills/                       # workspace-scoped Skills
      permissions/                  # workspace permission overrides
      views.json                    # built-in View definitions
      sessions/                     # each session has its own directory
        <session-id>/
          session.jsonl
          .pi-sessions/
          attachments/
```

## What is encrypted

| Field | Where it lives | Encryption |
|---|---|---|
| API keys, OAuth tokens (none in MkAgent) | `credentials/` | OS keychain via the shared `CredentialManager` |
| Proxy credentials | settings page | OS keychain |
| Workspace settings | `workspaces/<slug>/config.json` | plaintext, but credential-shaped fields are referenced, not inlined |
| Session JSONL | `workspaces/<slug>/sessions/<id>/session.jsonl` | plaintext, but credential-shaped fields are redacted before they reach the file |
| Session exports | download path | credential fields stripped |

## What is *not* encrypted

- Theme and theme tokens.
- Tool icons and other `resources/` assets.
- Skill Markdown and the YAML frontmatter inside `SKILL.md`.
- Crash and request logs that do not carry credential-shaped fields (redaction runs in `main` and the network interceptor before any I/O).

## Backup

Back up the directory only while the application is stopped or after sessions have been flushed. A safe backup does not require a special flush in development; production users should quit MkAgent, copy `~/.mkagent`, and restart.

## Per-platform notes

- macOS: `~/` expands to `/Users/<you>`; the directory is hidden.
- Linux: `~/.mkagent`; if `$XDG_DATA_HOME` is set the renderer still defaults to `~/.mkagent` for backwards compatibility (the change is documented in `migration/migration-features.md`).
- Windows: `%USERPROFILE%\.mkagent` (resolves to `C:\Users\<you>\.mkagent`).

## Recovering from a broken config

The first `mkagent` launch that finds `~/.mkagent/config.json` unreadable backs the file up as `config.json.broken-<timestamp>` and falls back to `apps/electron/resources/config-defaults.json`. The same applies to a per-workspace `config.json`; the workspace is recreated with defaults rather than loaded.
