# Testing

Local validation follows the same boundaries as CI:

```bash
bun run typecheck:all
bun run lint
bun run validate:ci
bun run test
bun run test:doc-tools
bun run electron:build
```

Protocol and SessionManager tests cover local workspace isolation, persistence, import/resume, branching, unread/state events, Pi registration, permissions, tools, and connection variants. CI adds macOS, Windows, and Linux unpacked desktop builds plus headless assembly.

A test or build failure must be reported separately from unsupported signing credentials. A stable public release requires configured Apple signing/notarization and Windows signing secrets.
