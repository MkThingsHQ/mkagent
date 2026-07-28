# Permissions

Pi tool calls pass through the shared permission engine. `safe` mode asks for operations outside the read-oriented policy; `allow-all` is intended only for trusted workspaces. A permission request pauses and resumes the same turn.

Workspace settings control the defaults and cyclable modes. The bundled policy covers shell commands, file writes, Browser actions, and network access. Source- and MCP-specific rules are not loaded.
