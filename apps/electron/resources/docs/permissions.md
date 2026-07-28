# Permissions

MkAgent applies workspace permission rules before Pi runs tools. The default policy is bundled with the app; workspace overrides are stored under the local workspace directory.

Permission modes:

- `safe`: read-oriented operations run automatically; commands and writes require approval according to the policy.
- `allow-all`: tools run without individual approval. Use only in a trusted workspace.

The session header shows the active mode. A permission request pauses the turn until the user allows, always allows, or denies it. The response is sent back to the same Pi session so execution can resume without losing context.

Rules cover shell commands, write paths, browser operations, and network/API access. MkAgent does not load Source- or MCP-specific permission patterns.
