# OpenConnector

MkAgent Desktop bundles [OpenConnector](https://github.com/oomol-lab/open-connector) as a loopback sidecar. The integration is pinned to OpenConnector `v1.3.5` through the `vendor/open-connector` Git submodule and is available only in the Electron app. WebUI, the headless server, and the CLI do not start the sidecar, show its console, or advertise its tools.

## Console

Open **OpenConnector** in the Desktop sidebar, then choose one of three sections:

| Section | Purpose |
|---|---|
| Providers | Browse providers and configure their connections |
| Actions | Find available actions and inspect their input guide |
| Runs | Review action executions and results before retrying an uncertain external operation |

The console is served by the bundled sidecar on `127.0.0.1` and embedded in MkAgent. MkAgent creates the local authentication material automatically; no token needs to be copied into the UI.

## Pi tools

Desktop Pi sessions expose exactly five OpenConnector tools:

| Model-visible tool | Access |
|---|---|
| `mcp__open_connector__list_apps` | Read-only discovery |
| `mcp__open_connector__list_connections` | Read-only discovery |
| `mcp__open_connector__search_actions` | Read-only discovery |
| `mcp__open_connector__get_action_guide` | Read-only discovery |
| `mcp__open_connector__execute_action` | May mutate an external service; permission-gated |

The four discovery tools are allowed as read-only operations in `safe` / Explore mode. `execute_action` is blocked in that mode. In Ask mode it produces a permission prompt scoped to the action and connection; `allow-all` / Execute mode remains an explicit opt-in that skips the prompt. The prompt identifies the action and connection without copying action input values into the permission key.

If an `execute_action` call loses its response, MkAgent does not retry it automatically because the external result may be unknown. Check **Runs** before deciding whether to retry.

## Data and secrets

OpenConnector keeps its database and generated secrets under:

```text
$CONFIG_DIR/connectors/open-connector/
```

With the default configuration root, this is `~/.mkagent/connectors/open-connector/`. The automatically generated `secrets.json` contains the admin token, runtime token, and encryption key. Do not edit, share, or commit this file. MkAgent applies directory mode `0700` and file mode `0600` where the platform supports POSIX permissions.

## Development preparation

After cloning or changing the submodule pointer, prepare the pinned runtime from the repository root:

```bash
bun run open-connector:prepare
```

The command initializes `vendor/open-connector` when necessary, installs its locked npm dependencies, regenerates its catalog and provider registries, typechecks/builds the runtime, and builds the web console. `bun run electron:dev` and Electron resource builds invoke the same preparation automatically.

## Product boundary

This dedicated integration does **not** restore Craft's generic Sources product. MkAgent still has no API Source UI, user-configurable MCP Source or MCP pool, Source OAuth flow, `session-mcp-server`, or `bridge-mcp-server`. Only the pinned OpenConnector sidecar and the five fixed Pi tools above are added.
