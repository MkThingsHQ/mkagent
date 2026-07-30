# Sessions

Sessions are append-oriented JSONL records with Pi recovery files in the same directory. The Desktop, WebUI, and CLI all read and write the same files; there is no separate per-client storage.

## On-disk layout

```text
~/.mkagent/workspaces/<slug>/
  config.json                              # workspace settings (theme, default mode, ...)
  skills/                                  # workspace-scoped Skills
  permissions/                             # default + workspace overrides
  sessions/
    <session-id>/
      session.jsonl                        # append-only transcript
      .pi-sessions/                        # Pi SDK recovery data
      attachments/                         # user-supplied attachments (scoped paths)
```

`session-id` is a UUIDv4 string; the same identifier is reused on resume, branch, and import.

Each JSONL line is a `SessionEvent` discriminated union defined in `@mkagent/shared/protocol/sessions`. Common variants include:

| Event | Purpose |
|---|---|
| `session_created` | title, model, working directory, timestamps |
| `message_added` | user/assistant/system message turn with id, content blocks, parentId |
| `tool_started` / `tool_result` | tool calls with id, name, args, status, payload |
| `permission_requested` / `permission_granted` | permission prompt lifecycle |
| `annotation_added` / `annotation_updated` | message-level annotations and follow-ups |
| `background_task_*` | internal scheduler that still powers background work even though the product-level Automations UI is removed |
| `session_completed` / `session_failed` | terminal status |

An import is accepted only when it materializes as a registered, openable session via the `sessions:import` RPC. Exports omit API keys, proxy credentials, and encrypted credential data.

## Lifecycle operations

- **Create:** `POST session.create` reserves the id and writes `session_created`.
- **Continue / resume:** `POST session.send` reads the JSONL tail and asks Pi for the next turn.
- **Cancel:** `POST session.cancel` stops the in-flight turn; Pi recovery files preserve unfinished tool calls.
- **Search:** a built-in index supports `query`, `in:title`, `state:`, and `view:` filters (Views are explained below).
- **Rename:** updates the `title` field on the latest `session_created` event.
- **Delete:** archives the directory under `~/.mkagent/workspaces/<slug>/sessions/.trash/` for the retention window, then removes it.
- **Flag / archive / unread:** metadata flags on the live event stream and stored in the latest `session_*` event for fast list rendering.
- **Import / export:** a portable bundle format that wraps `session.jsonl` plus attachments. Imports are validated through `SessionBundle` before being materialized.
- **Branch:** duplicate `session.jsonl` up to the chosen message id, assign a new session id, and rewind Pi recovery so the new branch can `Continue` from that point.
- **Multi-window:** the same session can be opened by multiple clients; the latest writer wins, but read-only views can tail the JSONL without locking.

## Technical states

| State | When |
|---|---|
| `idle` | No turn in flight |
| `processing` | A user/assistant turn is active or queued |
| `waiting_for_permission` | Pi requested permission; renderer shows a prompt |
| `failed` | Last turn ended with an unhandled error |
| `interrupted` | Process exited mid-turn (Electron quit, Pi crash) |

## Built-in Views

Views are stored as Filtrex expressions in `~/.mkagent/workspaces/<slug>/views.json`. The evaluator only allows fields that survive the Lite boundary:

```text
hasUnread == true            # 未读
isFlagged == true            # Flagged
isArchived == true           # Archived
isProcessing == true         # 运行中
hasPendingPlan == true       # 待计划审核
permissionMode == "safe"     # 当前 workspace 默认的只读
```

The schema accepts label/status conditions for backwards compatibility, but those conditions no-op because MkAgent does not have user-defined labels or statuses. The UI exposes a fixed set of buttons (Unread, Flagged, Running, Archived, Plan review) and **does not** ship a custom-View editor.

## Pi recovery

The Pi subprocess stores its own scratch state under `sessions/<id>/.pi-sessions/`. MkAgent does not parse those files; it only treats them as opaque recovery data handed back to Pi on resume. Tests that want hermetic recovery can override the recovery path through the `SessionManager` hook surface.

## Permissions inside sessions

Every Pi tool call passes through the shared permission engine (`@mkagent/shared/agent/permissions-config`). A denied call returns an error event to the JSONL stream and the turn ends in `failed`; a granted call continues. See [permissions.md](./permissions.md).

## Auditing a session

There is no CLI sub-command for replay yet; the canonical audit path is `bun run apps/cli/src/index.ts session messages <id>` and `session export <id>`. Both commands preserve event ordering but redact credential-like fields.
