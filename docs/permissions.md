# Permissions

Pi tool calls pass through the shared permission engine. There is no Sources/MCP-specific rule path: those products are not part of MkAgent.

## Modes

| Mode | Behavior |
|---|---|
| `safe` | Read-oriented policy is allowed by default. Anything that writes files, mutates shell state, navigates a Browser, or makes a network request outside the configured allowlist asks the user before proceeding |
| `allow-all` | All tool calls run without asking. Only safe for trusted workspaces; the UI surfaces a permanent banner |
| `plan` (workflow-only) | Pi must call `submit_plan` first; user accepts/modifies/rejects before any non-plan tool runs |

Workspace settings control the default mode and the cyclable list (`cyclablePermissionModes`). The shipped default is `safe` with `["safe", "allow-all"]` cyclable.

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

Source, MCP, and Source-OAuth allowlists are not loaded — the corresponding schema fields exist only for backwards-compatible reads and no-op. LLM subscription OAuth credentials use the credential manager and are not permission allowlists.

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
