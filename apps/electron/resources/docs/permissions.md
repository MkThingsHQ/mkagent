# Permissions Configuration Guide

MkAgent keeps Craft's three permission modes and workspace permission rules. The bundled default policy is installed at `~/.mkagent/permissions/default.json`; a workspace can extend it with `<workspace>/permissions.json`.

## Permission modes

| Mode | Behavior |
|------|----------|
| Explore (`safe`) | Read-only exploration. Write tools and mutating commands are blocked except for plans, session data, and explicitly allowed paths. |
| Ask (`ask`) | Read operations run freely; file writes and mutating commands request approval. |
| Execute (`allow-all`) | Tools run without individual approval. Use only in a trusted workspace. |

Permission responses are routed back to the same Pi session so a paused turn can resume without losing context.

## `permissions.json` schema

```json
{
  "allowedBashPatterns": [
    { "pattern": "^git\\s+status$", "comment": "Allow git status" },
    "^npm\\s+test$"
  ],
  "allowedWritePaths": [
    "/tmp/**",
    "<workspace>/generated/**"
  ],
  "blockedTools": [
    "dangerous_tool"
  ],
  "blockedCommandHints": [
    {
      "command": "sed",
      "reason": "Only print-only sed is allowed by default.",
      "whenNotMatching": "^sed\\s+-n\\b",
      "tryInstead": ["Use sed -n for read-only output", "Switch to Ask mode"]
    }
  ]
}
```

All fields are optional. Pattern entries accept either a regex string or an object with `pattern` and an optional `comment`.

## Rule types

### `allowedBashPatterns`

Regex patterns for additional Bash commands that are safe in Explore mode.

```json
{
  "allowedBashPatterns": [
    { "pattern": "^git\\s+(status|log|diff|branch)", "comment": "Read-only git" },
    { "pattern": "^bun\\s+run\\s+typecheck$", "comment": "TypeScript validation" }
  ]
}
```

### `allowedWritePaths`

Glob patterns for extra locations that write tools may modify in Explore mode. Session plan and data folders are already allowed.

```json
{
  "allowedWritePaths": [
    "/tmp/**",
    "/absolute/project/generated/**"
  ]
}
```

### `blockedTools`

Additional tool names or patterns to block. Core write tools are already blocked in Explore mode.

```json
{
  "blockedTools": ["dangerous_tool"]
}
```

### `blockedCommandHints`

Command-specific guidance shown when a Bash command is blocked.

Fields:

- `command` (required): base command name
- `reason` (required): primary explanation
- `context` (optional): policy or risk context
- `tryInstead` (optional): suggested alternatives
- `example` (optional): safe example
- `whenNotMatching` (optional): apply the hint only when the command does not match this regex

## Explore-mode defaults

Allowed by default:

- Read, Glob, and Grep
- WebFetch and WebSearch
- read-only Browser actions
- writes to the session plans and data folders
- read-only Bash commands validated by the shell parser

Blocked by default:

- Write, Edit, MultiEdit, and NotebookEdit outside allowed folders
- mutating Bash commands
- browser or network mutations classified as unsafe
- commands containing unsafe shell constructs

### Read-only Bash commands

The bundled policy includes Craft's retained read-only command categories:

| Category | Examples |
|----------|----------|
| File exploration | `ls`, `tree`, `cat`, `head`, `tail`, `file`, `stat`, `wc`, `du`, `df` |
| Search | `find`, `grep`, `rg`, `fd`, `locate`, `which` |
| Git | `git status`, `git log`, `git diff`, `git show`, `git branch`, `git blame` |
| Package inspection | `npm ls`, `yarn list`, `pip list`, `cargo tree` |
| Validation | `bun run typecheck`, `tsc --noEmit`, `npm run typecheck` |
| System information | `pwd`, `whoami`, `env`, `ps`, `uname`, `hostname`, `date` |
| Text processing | safe forms of `awk`, `jq`, `sort`, `uniq`, `cut`, `column` |
| Network diagnostics | `ping`, `dig`, `nslookup`, `netstat` |

Compound commands using `&&`, `||`, and pipes are allowed only when every part is read-only.

The following constructs stay blocked even when the base command is allowed:

- background execution (`&`)
- redirects (`>`, `>>`)
- command substitution (`$()`, backticks, process substitution)
- embedded control characters and newlines

## Rule precedence

The bundled defaults load first and workspace rules extend them. Rules are additive; workspace configuration can allow additional safe operations and add blocked tools, but it does not remove the mandatory core safeguards.

## Planning in Explore mode

Explore mode can still create an implementation plan:

1. Write the plan in the session plans folder.
2. Call `SubmitPlan` with the plan path.
3. The user reviews and accepts the plan.
4. The session switches to an execution mode before implementation begins.

Use narrow patterns, anchor regexes where possible, explain exceptions with comments, and grant only the minimum required access.
