# MkAgent CLI Guide

`mkagent` is the preferred interface for managing workspace config domains such as labels, sources, skills, and automations.

## Usage

```bash
mkagent <entity> <action> [args] [--flags] [--json '<json>'] [--stdin]
```

### Global flags
- `mkagent --help`
- `mkagent --version`
- `mkagent --discover`

### Input modes
- Flat flags for simple values
- `--json` for structured inputs
- `--stdin` for piped JSON object input

---

<!-- cli:label:start -->
## Label

Manage workspace labels stored under `labels/`.

### Commands
- `mkagent label list`
- `mkagent label get <id>`
- `mkagent label create --name "<name>" [--color "<color>"] [--parent-id <id|root>] [--value-type string|number|date]`
- `mkagent label update <id> [--name "<name>"] [--color "<color>"] [--value-type string|number|date|none] [--clear-value-type]`
- `mkagent label delete <id>`
- `mkagent label move <id> --parent <id|root>`
- `mkagent label reorder [--parent <id|root>] <ordered-id-1> <ordered-id-2> ...`
- `mkagent label auto-rule-list <id>`
- `mkagent label auto-rule-add <id> --pattern "<regex>" [--flags "gi"] [--value-template "$1"] [--description "..."]`
- `mkagent label auto-rule-remove <id> --index <n>`
- `mkagent label auto-rule-clear <id>`
- `mkagent label auto-rule-validate <id>`

### Examples

```bash
mkagent label list
mkagent label get bug
mkagent label create --name "Bug" --color "accent"
mkagent label create --name "Priority" --value-type number
mkagent label update bug --json '{"name":"Bug Report","color":"destructive"}'
mkagent label update priority --value-type none
mkagent label move bug --parent root
mkagent label reorder --parent root development content bug
mkagent label auto-rule-add linear-issue --pattern "\\b([A-Z]{2,5}-\\d+)\\b" --value-template "$1"
mkagent label auto-rule-list linear-issue
mkagent label auto-rule-validate linear-issue
```

### Notes
- Use `--json` / `--stdin` for nested or bulk updates.
- IDs are stable slugs generated from name on create.
- Use `--value-type none` or `--clear-value-type` to remove a label value type.
<!-- cli:label:end -->

---

<!-- cli:source:start -->
## Source

Manage workspace sources stored under `sources/{slug}/`.

### Commands
- `mkagent source list [--include-builtins true|false]`
- `mkagent source get <slug>`
- `mkagent source create` (see flags below)
- `mkagent source update <slug> --json '{...}'`
- `mkagent source delete <slug>`
- `mkagent source validate <slug>`
- `mkagent source test <slug>`
- `mkagent source init-guide <slug> [--template generic|mcp|api|local]`
- `mkagent source init-permissions <slug> [--mode read-only]`
- `mkagent source auth-help <slug>`

### Flags for `source create`

| Flag | Description |
|------|-------------|
| `--name "<name>"` | **(required)** Source display name |
| `--provider "<provider>"` | **(required)** Provider identifier (e.g., `linear`, `github`) |
| `--type mcp\|api\|local` | **(required)** Source type |
| `--enabled true\|false` | Enable/disable source (default: `true`) |
| `--icon "<url-or-emoji>"` | Icon URL (auto-downloaded) or emoji |
| **MCP-specific** | |
| `--url "<url>"` | MCP server URL |
| `--transport http\|stdio` | MCP transport type |
| `--auth-type oauth\|bearer\|none` | MCP authentication type |
| **API-specific** | |
| `--base-url "<url>"` | **(required for api)** API base URL (must have trailing slash) |
| `--auth-type bearer\|header\|query\|basic\|none` | **(required for api)** API auth type |
| **Local-specific** | |
| `--path "<path>"` | **(required for local)** Filesystem path |

### Examples

```bash
mkagent source list
mkagent source get linear
# MCP source with flat flags
mkagent source create --name "Linear" --provider "linear" --type mcp --url "https://mcp.linear.app/sse" --auth-type oauth
# MCP source with --json for nested config
mkagent source create --name "Linear" --provider "linear" --type mcp --json '{"mcp":{"transport":"http","url":"https://mcp.linear.app/sse","authType":"oauth"}}'
# API source
mkagent source create --name "Exa" --provider "exa" --type api --base-url "https://api.exa.ai/" --auth-type header
# Local source
mkagent source create --name "Docs Folder" --provider "filesystem" --type local --path "~/Documents"
mkagent source update linear --json '{"enabled":false}'
mkagent source validate linear
mkagent source test linear
mkagent source init-guide linear --template mcp
mkagent source init-permissions linear --mode read-only
mkagent source auth-help linear
```

### Notes
- Use flat flags for simple values or `--json` for type-specific nested config fields (`mcp`, `api`, `local`).
- `init-guide` scaffolds a practical `guide.md` based on source type.
- `init-permissions` scaffolds read-only `permissions.json` patterns for Explore mode.
- `auth-help` returns the recommended in-session auth tool and mode.
- `test` is lightweight CLI validation; for full in-session auth/connection probing use `source_test` MCP tool.
<!-- cli:source:end -->

---

<!-- cli:skill:start -->
## Skill

Manage workspace skills stored under `skills/{slug}/SKILL.md`.

### Commands
- `mkagent skill list [--workspace-only] [--project-root <path>]`
- `mkagent skill get <slug> [--project-root <path>]`
- `mkagent skill where <slug> [--project-root <path>]`
- `mkagent skill create` (see flags below)
- `mkagent skill update <slug> --json '{...}' [--project-root <path>]`
- `mkagent skill delete <slug>`
- `mkagent skill validate <slug> [--source workspace|project|global] [--project-root <path>]`

### Flags for `skill create`

| Flag | Description |
|------|-------------|
| `--name "<name>"` | **(required)** Skill display name |
| `--description "<desc>"` | **(required)** Brief description (1-2 sentences) |
| `--slug "<slug>"` | Custom slug (auto-generated from name if omitted) |
| `--body "..."` | Skill content/instructions (markdown body) |
| `--icon "<url>"` | Icon URL (auto-downloaded to `icon.*`) |
| `--globs "*.ts,*.tsx"` | Comma-separated glob patterns for auto-suggestion |
| `--always-allow "Bash,Write"` | Comma-separated tool names to always allow |
| `--required-sources "linear,github"` | Comma-separated source slugs to auto-enable |

### Examples

```bash
mkagent skill list
mkagent skill list --workspace-only
mkagent skill where commit-helper
mkagent skill create --name "Commit Helper" --description "Generate conventional commits" --slug commit-helper
mkagent skill create --name "Code Review" --description "Review PRs" --globs "*.ts,*.tsx" --always-allow "Bash" --required-sources "github"
mkagent skill update commit-helper --json '{"requiredSources":["github"],"body":"Use concise, imperative commit messages."}'
mkagent skill validate commit-helper
mkagent skill validate commit-helper --source global
mkagent skill delete commit-helper
```

### Notes
- `create` / `update` write `SKILL.md` frontmatter and content body.
- Use `where` to inspect project/workspace/global resolution precedence.
- `--project-root` scopes resolution to a project directory (defaults to cwd).
<!-- cli:skill:end -->

---

<!-- cli:automation:start -->
## Automation

Manage workspace automations stored in `automations.json`.

### Commands
- `mkagent automation list`
- `mkagent automation get <id>`
- `mkagent automation create` (see flags below)
- `mkagent automation update <id>` (same flags as create, all optional)
- `mkagent automation delete <id>`
- `mkagent automation enable <id>`
- `mkagent automation disable <id>`
- `mkagent automation duplicate <id>`
- `mkagent automation history [<id>] [--limit <n>]`
- `mkagent automation last-executed <id>`
- `mkagent automation test <id> [--match "..."]`
- `mkagent automation lint`
- `mkagent automation validate`

### Flags for `automation create` / `update`

| Flag | Description |
|------|-------------|
| `--event <EventName>` | **(required for create)** Event trigger (e.g., `UserPromptSubmit`, `SchedulerTick`, `LabelAdd`) |
| `--name "<name>"` | Display name for the automation |
| `--matcher "<regex>"` | Regex pattern for event matching |
| `--cron "<expression>"` | Cron expression (for `SchedulerTick` events) |
| `--timezone "<tz>"` | IANA timezone (e.g., `Europe/Budapest`) |
| `--permission-mode safe\|ask\|allow-all` | Permission level for created sessions |
| `--enabled true\|false` | Enable/disable the automation |
| `--labels "label1,label2"` | Comma-separated labels for created sessions |
| `--prompt "..."` | Prompt text (creates a prompt action automatically) |
| `--llm-connection "<slug>"` | LLM connection slug for the created session |
| `--model "<model-id>"` | Model ID for the created session |

### Examples

```bash
mkagent automation list
mkagent automation validate
# Simple prompt automation with flat flags
mkagent automation create --event UserPromptSubmit --prompt "Summarize this prompt"
# Scheduled automation with flat flags
mkagent automation create --event SchedulerTick --cron "0 9 * * 1-5" --timezone "Europe/Budapest" --prompt "Give me a morning briefing" --labels "Scheduled" --permission-mode safe
# Complex automation with --json
mkagent automation create --event SchedulerTick --json '{"cron":"0 9 * * 1-5","actions":[{"type":"prompt","prompt":"Daily summary"}]}'
mkagent automation update abc123 --name "Morning Report" --prompt "Updated prompt"
mkagent automation update abc123 --enabled false
mkagent automation enable abc123
mkagent automation duplicate abc123
mkagent automation history abc123 --limit 10
mkagent automation last-executed abc123
mkagent automation test abc123 --match "UserPromptSubmit"
mkagent automation lint
mkagent automation delete abc123
```

### Notes
- Use flat flags for simple automations or `--json` for complex matchers with multiple `actions`.
- `--prompt` is a shortcut that auto-wraps the text as a prompt action. Use `--json` with `actions` for multi-action automations.
- `lint` provides quick matcher/action hygiene checks (regex validity, missing actions, oversized prompt mention sets).
- `history` and `last-executed` read from `automations-history.jsonl` when present.
- `validate` runs full schema and semantic checks.
<!-- cli:automation:end -->

---

<!-- cli:permission:start -->
## Permission

Manage Explore mode permissions stored in `permissions.json` (workspace-level and per-source).

### Commands
- `mkagent permission list`
- `mkagent permission get [--source <slug>]`
- `mkagent permission set [--source <slug>] --json '{...}'`
- `mkagent permission add-mcp-pattern "<pattern>" [--comment "..."] [--source <slug>]`
- `mkagent permission add-api-endpoint --method GET|POST|... --path "<regex>" [--comment "..."] [--source <slug>]`
- `mkagent permission add-bash-pattern "<pattern>" [--comment "..."] [--source <slug>]`
- `mkagent permission add-write-path "<glob>" [--source <slug>]`
- `mkagent permission remove <index> --type mcp|api|bash|write-path|blocked [--source <slug>]`
- `mkagent permission validate [--source <slug>]`
- `mkagent permission reset [--source <slug>]`

### Scope

Without `--source`: operates on workspace-level `permissions.json` (global rules).
With `--source <slug>`: operates on that source's `permissions.json` (auto-scoped).

### Examples

```bash
# List all permissions files (workspace + sources)
mkagent permission list
# Get workspace permissions
mkagent permission get
# Get source-specific permissions
mkagent permission get --source linear
# Add read-only MCP patterns for a source
mkagent permission add-mcp-pattern "list" --comment "List operations" --source linear
mkagent permission add-mcp-pattern "get" --comment "Get operations" --source linear
mkagent permission add-mcp-pattern "search" --comment "Search operations" --source linear
# Add API endpoint rules
mkagent permission add-api-endpoint --method GET --path ".*" --comment "All GET requests" --source stripe
# Add bash patterns
mkagent permission add-bash-pattern "^ls\\s" --comment "Allow ls"
# Add write path globs
mkagent permission add-write-path "/tmp/**"
# Remove a rule by index and type
mkagent permission remove 1 --type mcp --source linear
# Replace entire config
mkagent permission set --source github --json '{"allowedMcpPatterns":[{"pattern":"list","comment":"List ops"}]}'
# Validate all permissions
mkagent permission validate
# Validate source-specific
mkagent permission validate --source linear
# Delete permissions file (revert to defaults)
mkagent permission reset --source linear
```

### Notes
- Source-level MCP patterns are auto-scoped at runtime (e.g., `list` becomes `mcp__<slug>__.*list`).
- `remove` uses 0-based index within the specified rule type array. Use `get` to see indices.
- `validate` runs schema + regex validation. Without `--source`, validates workspace + all sources.
- `reset` deletes the permissions file, reverting to defaults.
<!-- cli:permission:end -->

---

<!-- cli:theme:start -->
## Theme

Manage app-level and workspace-level theme settings.

### Commands
- `mkagent theme get`
- `mkagent theme validate [--preset <id>]`
- `mkagent theme list-presets`
- `mkagent theme get-preset <id>`
- `mkagent theme set-color-theme <id>`
- `mkagent theme set-workspace-color-theme <id|default>`
- `mkagent theme set-override --json '{...}'`
- `mkagent theme reset-override`

### Examples

```bash
# Inspect current theme state
mkagent theme get

# Validate app override file
mkagent theme validate

# Validate one preset file
mkagent theme validate --preset nord

# List available presets
mkagent theme list-presets

# Inspect a specific preset
mkagent theme get-preset dracula

# Set app default preset
mkagent theme set-color-theme nord

# Set workspace override
mkagent theme set-workspace-color-theme dracula

# Clear workspace override (inherit app default)
mkagent theme set-workspace-color-theme default

# Replace app-level theme.json override
mkagent theme set-override --json '{"accent":"oklch(0.62 0.21 293)","dark":{"accent":"oklch(0.68 0.21 293)"}}'

# Remove app-level override file
mkagent theme reset-override
```

### Notes
- `set-color-theme` and `set-workspace-color-theme` require an existing preset ID (`default` is always valid).
- `set-override` validates `theme.json` shape before writing.
- Workspace override is stored in `workspace/config.json` under `defaults.colorTheme`.
- App override is stored in `~/.mkagent/theme.json`.
<!-- cli:theme:end -->

---

## Output contract

All commands return a single JSON envelope on stdout.

### Success
```json
{ "ok": true, "data": {}, "warnings": [] }
```

### Error
```json
{
  "ok": false,
  "error": {
    "code": "USAGE_ERROR",
    "message": "...",
    "suggestion": "..."
  },
  "warnings": []
}
```

Exit codes:
- `0` success
- `1` execution/internal failure
- `2` usage/validation/input failure
