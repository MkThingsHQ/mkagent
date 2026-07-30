# Browser

The Browser pane is available from the desktop chat surface and from session tools. One `BrowserPaneManager` instance is allocated per session (keyed by `sessionId`) and shared across the Browser button, the BrowserPane component, and Pi's `browser` tool.

## Where the Browser appears

| Surface | Location |
|---|---|
| Desktop chat | top-right Browser button on the chat header |
| Session tools | `mcp__session__browser` is registered in `@mkagent/session-tools-core` |
| Settings | Browser tooling toggle (`browserToolEnabled`) in the per-workspace settings |
| WebUI | Browser pane is host-delegated; no remote Browser pane is created |

The Browser button is a UI affordance over `BrowserPaneManager.toggleForSession(...)`. The session tools form is `mcp__session__browser` — Pi calls it the same way it does `mcp__session__list_sessions`.

## BrowserPaneManager responsibilities

```text
BrowserPaneManager
  ├─ per-session state (current URL, history, focused selectors, control hints)
  ├─ lifecycle: bind to window, focus, navigate, close, cleanup
  ├─ session binding: one instance per (sessionId, workspaceId)
  ├─ remote bridge: headless server hosts the pane; desktop attaches as a view
  └─ permission integration: Browser-tool calls go through the permission engine
```

The manager survives the lifecycle of the session; closing the Browser button only hides the surface.

## `web_search` and `web_fetch`

In addition to the Browser pane, MkAgent ships two non-interactive retrieval tools:

| Tool | Purpose | Implementation |
|---|---|---|
| `web_search` | keyword or natural-language search | provider-agnostic; falls back to DuckDuckGo if no key is configured |
| `web_fetch` | retrieve and parse a URL | provider-agnostic; uses Pi-side renderer when content negotiation is needed |

Both obey session permissions and reuse the same network proxy.

## Browser tools obey session permissions

`mcp__session__browser` is a session tool: its handler runs in `packages/server-core` and uses the same permission engine as the rest of the session. A `deny` on a Browser action appears as a `permission_requested` event with the matching policy and a denied grant.

## WebUI delegation

WebUI delegates browser capabilities to a connected host. The connection reuses the same RPC channel as sessions; there is no extra surface to authenticate. This **does not** turn the WebUI into a remote-workspace product: WebUI still operates one local workspace.

## What is intentionally absent

The Craft "Browser remote control for shared sessions" flow (Viewer / public link / paired device) is intentionally not implemented.
