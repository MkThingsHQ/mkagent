# Network proxy

Settings can enable HTTP and HTTPS proxy URLs plus a comma-separated no-proxy list.

## Where the proxy applies

| Layer | Uses the proxy |
|---|---|
| Electron network session | yes |
| Model requests (Pi subprocess) | yes |
| `web_search`, `web_fetch` retrieval | yes |
| Browser pane (Renderer process) | yes |
| Pi SDK subprocess outbound HTTPS | yes |
| Localhost / `127.0.0.1` requests | no (treated as `no_proxy`) |
| `localhost`-only Ollama | no |

## Redaction guarantee

Proxy credentials are sensitive. They must not appear in:

- Server logs (`~/.mkagent/logs/mkagent-server-*.log`)
- Sentry breadcrumbs
- Session JSONL
- Session exports

The shared network interceptor redacts the following keys before any I/O:

```text
authorization, cookie, set-cookie, x-api-key, token, key, secret,
password, credential, auth
```

(See [`releases.md`](./releases.md#telemetry-sentry) for the related Sentry behavior.)

## Configuring

Per-workspace settings → "Network proxy":

```text
HTTP proxy:        http://user:pass@proxy.example:8080
HTTPS proxy:       (optional; falls back to HTTP proxy)
No proxy:          localhost,127.0.0.1,.local
```

`No proxy` is parsed as a comma-separated host/CIDR list. Wildcards (`*.local`) and CIDR ranges (`10.0.0.0/8`) are supported.

## Environment override

The proxy settings page can be temporarily overridden by exporting the standard env vars before launching the app:

| Variable | Layer |
|---|---|
| `HTTP_PROXY` / `http_proxy` | Used by Node-side HTTP clients in the headless server |
| `HTTPS_PROXY` / `https_proxy` | Same, for HTTPS |
| `NO_PROXY` / `no_proxy` | Comma-separated no-proxy list |
| `ALL_PROXY` | Default when `HTTP_PROXY`/`HTTPS_PROXY` is unset |

Electron itself respects these env vars when launching. Once the app is running, the in-app setting wins for connections that MkAgent opens itself; only system-level requests (auto-update, Sentry) keep using the env vars.

## Sandbox notes

On macOS, NSLocalNetworkUsageDescription is set so the Browser pane can reach LAN addresses with explicit user permission. Without the prompt, LAN access is silently denied and never appears in the privacy pane.

## Prefer the OS proxy

If a custom application proxy is unnecessary, prefer the operating system proxy:

- macOS: System Settings → Network → Proxies
- Linux: `HTTP_PROXY` env var via systemd user environment
- Windows: Settings → Network & Internet → Proxy

This avoids dragging credentials into MkAgent's setting file and keeps them out of any future import/export scenario.
