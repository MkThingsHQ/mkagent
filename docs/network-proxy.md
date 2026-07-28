# Network proxy

Settings can enable HTTP and HTTPS proxy URLs plus a comma-separated no-proxy list. Electron applies the setting to its network session, while model, search, fetch, and Pi subprocess requests receive the corresponding proxy environment.

Proxy credentials are sensitive. They must not appear in logs, Sentry events, session JSONL, or exports. Prefer the operating system proxy when a custom application proxy is unnecessary.
