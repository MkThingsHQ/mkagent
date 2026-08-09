# Permissions

Pi tool calls pass through the shared permission engine. Craft's generic Sources/MCP rule path is not part of MkAgent. The desktop-only OpenConnector bridge instead has one fixed classification: four discovery tools are read-only, while `execute_action` is mutation-capable and gated.

## Modes

| Mode | Behavior |
|---|---|
| `safe` / Explore | Read-oriented policy is allowed by default; mutation-capable operations are blocked rather than prompted |
| `ask` / Ask | Read-only operations run directly; mutation-capable operations enter the permission-prompt pipeline |
| `allow-all` / Execute | All tool calls run without asking. Only safe for trusted workspaces; the UI surfaces a permanent banner |
| `plan` (workflow-only) | Pi must call `submit_plan` first; user accepts/modifies/rejects before any non-plan tool runs |

Workspace settings control the default mode and the cyclable list (`cyclablePermissionModes`). The Desktop bundle ships with `safe` as the default and `["safe", "allow-all"]` as the cyclable list; users can add Ask mode in workspace settings.

## Engine architecture

```text
                  Pi tool call (read/write/bash/edit/web_search/...)
                                  │
                                  ▼
            shared permission engine (@mkagent/shared/agent/permissions-config)
                                  │
       ┌──────────────────┬───────┴────────┬────────────────────────┐
       ▼                  ▼                ▼                        ▼
   policy table    workspace overrides   user prompt     tool-specific check
   (defaults)      (workspaces/<slug>/   (headless/cli    (BrowserPaneManager,
                    permissions/)         server)          document-tool wrappers)
                                  │
                                  ▼
                       grant  /  deny  /  prompt
```

The engine is shared by Electron and headless server. The renderer is the only place that decides to show a prompt; headless server blocks until the user replies via a permission RPC.

## Bundled policy

| Tool | What `safe` allows | What `safe` blocks |
|---|---|---|
| File read (`read`) | relative + whitelisted absolute paths | network paths, working directory outside `workingDirectory` |
| File write (`write`, `edit`) | workspace `workingDirectory` and `/tmp/mkagent-*` | everything outside that |
| Bash | explicit allowlisted commands | everything else |
| Browser actions | same-origin and explicit cross-origin list | cookie writes, downloads, arbitrary scripts |
| Network | configured proxy, plus `localhost` | ports outside the configured allowlist |
| OpenConnector discovery (`list_apps`, `list_connections`, `search_actions`, `get_action_guide`) | the four fixed read-only tools | any unexpected OpenConnector tool name |
| OpenConnector `execute_action` | — | every external action; use Ask mode for a permission prompt or explicitly choose `allow-all` / Execute mode |

Generic Source, MCP, and Source-OAuth allowlists are not loaded — the corresponding schema fields exist only for backwards-compatible reads and no-op. OpenConnector does not use those allowlists; its five model-visible names are validated against the pinned sidecar contract. LLM subscription OAuth credentials use the credential manager and are not permission allowlists.

## OpenConnector action gate

- `mcp__open_connector__list_apps`, `list_connections`, `search_actions`, and `get_action_guide` are auto-allowed as read-only discovery in `safe` / Explore mode.
- `mcp__open_connector__execute_action` is blocked in `safe` / Explore mode because an action may create, update, delete, publish, or send data in an external service.
- Ask mode prompts with the action ID and connection name. An approval is scoped to that pair and does not put action input values in the permission key.
- `allow-all` / Execute mode bypasses that prompt and should be used only for a trusted workspace and trusted connector configuration.

See [`open-connector.md`](./open-connector.md) for the complete fixed tool surface and local secrets path.

## Prompt lifecycle

1. Pi calls a tool.
2. The engine returns `prompt` with the policy ID; the renderer shows `<PermissionPrompt>`.
3. The user picks Grant / Deny / Allow for session.
4. The reply is delivered to Pi over the JSONL stream and the same turn continues.
5. A "Grant" inside a tight tool loop is recorded in the JSONL stream as `permission_granted` for replay safety.

## Workspace overrides

`~/.mkagent/workspaces/<slug>/permissions/` stores overrides that take precedence over the bundled policy. Override changes apply to new tool calls only; in-flight turns keep the policy they had when the turn started.

## CLI overrides

`mkagent run --mode <mode>` sets the initial mode of the temporary session. `send` and the live CLI inherit the workspace's default mode unless `--mode` is provided.

## Auditing permission decisions

Permission prompts and grants are part of the session JSONL. To audit a session:

```bash
bun run apps/cli/src/index.ts session messages <id> | grep -E 'permission_'
```

The renderer also surfaces a dedicated "Permissions" timeline inside the session detail view.

## Limitations

- There is no per-tool rate limit; Pi is expected to throttle itself.
- "Persistent grant" for cross-session is intentionally absent. Grant-for-session is the only persistent scope.
- Auto-grants on file edits use Bash, not the GUI; the engine still insists on user intent.
