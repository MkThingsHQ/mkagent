# Workspaces

MkAgent creates the `default` workspace on first startup. Each local workspace isolates sessions, Skills, permissions, Views, and project context.

## Workspace directory

A workspace lives under `~/.mkagent/workspaces/<slug>/`. The slug is a URL-safe identifier derived from the workspace name; the `default` workspace always uses the literal slug `default`.

## Workspace `config.json`

```jsonc
{
  "id": "default",
  "name": "Default",
  "slug": "default",
  "defaults": {
    "permissionMode": "safe",
    "cyclablePermissionModes": ["safe", "allow-all"],
    "thinkingLevel": "think",
    "workingDirectory": "~"
    // Plus: model default, browser tool default, theme override, mini-model, language
  },
  "updatedAt": 1753820000000
}
```

`workingDirectory` is stored in portable form (`~`-relative) and expanded at load. `permissionMode` accepts the canonical or legacy mode name on read; legacy `'think'` is normalized to `'think'` on write.

## Discovery

1. `ensureDefaultWorkspacesDir()` creates the parent directory.
2. `ensureDefaultWorkspace()` reads `workspaces/<slug>/config.json`; if missing, it creates one with the bundle defaults.
3. Every server boot invokes this on the workspace the user bound; CLI `run` does the same implicitly on the workspace passed via `--workspace` or `--workspace-dir`.

A workspace present on disk but with a broken `config.json` is renamed `config.json.broken-<timestamp>` and recreated with defaults rather than loaded.

## Isolation guarantees

| Concern | Isolation boundary |
|---|---|
| Sessions | per-workspace `sessions/<id>/` |
| Skills | global < workspace < project; never cross-loads |
| Permissions | workspace-level overrides plus global defaults |
| Views | per-workspace `views.json` |
| Mini chat / mini model | per-workspace override of the global model |
| Themes | per-workspace color-theme override |
| Browser pane | one `RemoteBrowserPaneManager` instance per `(sessionId, workspaceId)` pair |

## Bind semantics

- Desktop windows bind to one workspace for their lifetime (re-opening binds to the same workspace).
- WebUI binds to one workspace per browser session; the workspace id rides on every RPC handshake.
- CLI binds whichever workspace was passed via `--workspace` or `--workspace-dir`; binding happens before any session command so that streamed events route correctly.

## Operations

| Operation | Where |
|---|---|
| Create | Settings → Workspaces → New; CLI `workspace create <name>` |
| Switch | Settings → Workspaces → Active; CLI flag |
| Rename | Settings → Workspaces → Rename; updates `config.json` |
| Delete | Settings → Workspaces → Delete; requires explicit "type the slug" confirmation; the directory is moved to `workspaces/.trash/` |
| Bind window | Desktop only; right-click the window title bar |

Deleting a workspace is a destructive local operation. The runtime confirms the path is under the configured workspaces root before doing anything.

## Remote workspaces

Remote workspace federation, transfer, and the Craft "Viewer" sharing flow are intentionally absent. See [`comparison-with-craft.md`](./comparison-with-craft.md).
