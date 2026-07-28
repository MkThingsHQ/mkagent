# Workspaces

MkAgent creates `default` on first startup. Each local workspace isolates sessions, Skills, permissions, Views, and project context. Desktop windows bind to one workspace; WebUI and CLI send the workspace identifier in the same RPC handshake.

Workspace creation and switching stay visible during MVP validation. Remote workspace federation and transfer are intentionally absent. Deleting a workspace is a destructive local operation and must never delete a path outside the configured workspace root.
