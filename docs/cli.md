# MkAgent CLI

The CLI connects to the MkAgent headless server over WebSocket. `run` can also start a temporary local server, create a session, stream one turn, and clean it up.

```bash
bun run apps/cli/src/index.ts --help
DEEPSEEK_API_KEY=... bun run apps/cli/src/index.ts run "Summarize this repository"
```

## Connection options

| Flag | Environment variable | Default |
|---|---|---|
| `--url <ws-url>` | `MKAGENT_SERVER_URL` | temporary server for `run` |
| `--token <secret>` | `MKAGENT_SERVER_TOKEN` | generated for a temporary server |
| `--workspace <id>` | `MKAGENT_WORKSPACE` | workspace named `default`, then first workspace |
| `--timeout <ms>` | — | `10000` |
| `--send-timeout <ms>` | — | `300000` |
| `--tls-ca <path>` | `MKAGENT_TLS_CA` | — |
| `--json` | — | `false` |

## Commands

```text
run <prompt>
workspace [list|create <name>]
session [list|create|messages|rename|delete|flag|unflag|archive|unarchive]
session export <id> [file]
session import <file> [fork|move]
session branch <id> <message-id>
send <session-id> <prompt>
cancel <session-id>
connections [list|add|test|delete|default]
config validate
ping | health | versions
invoke <channel> [json-args...]
listen <channel>
```

`send` and `run` stream text and tool starts to stdout. `--output-format stream-json` writes one session event per line. `--json` returns a single machine-readable result where the command supports it. An interrupted turn exits with status 130.

## Self-contained run

The default provider is DeepSeek. An API key is resolved from `--api-key`, `LLM_API_KEY`, or the provider-specific environment variable. Existing configured DeepSeek connections are reused.

```bash
DEEPSEEK_API_KEY=... mkagent run "Explain the failing tests"
OPENAI_API_KEY=... mkagent --provider openai --model gpt-4o run "Review this project"
mkagent --provider ollama --base-url http://127.0.0.1:11434/v1 --model llama3.2 run "Hello"
```

Run options:

| Flag | Default | Description |
|---|---|---|
| `--workspace-dir <path>` | — | Register and use a local workspace directory |
| `--mode <mode>` | `allow-all` | Session permission mode |
| `--output-format <text|stream-json>` | `text` | Streaming output format |
| `--no-cleanup` | `false` | Keep the temporary session |
| `--server-entry <path>` | bundled/local server | Override the server entrypoint |
| `--provider <name>` | `deepseek` | Pi provider preset |
| `--model <id>` | provider default | Model ID |
| `--api-key <key>` | provider environment | API credential |
| `--base-url <url>` | — | Custom provider endpoint |
| `--protocol <openai-completions|anthropic-messages>` | provider-derived | Custom endpoint protocol |

## Existing server

```bash
mkagent --url ws://127.0.0.1:9100 --token "$MKAGENT_SERVER_TOKEN" workspaces
mkagent --url ws://127.0.0.1:9100 --token "$MKAGENT_SERVER_TOKEN" session create --name review
mkagent --url ws://127.0.0.1:9100 --token "$MKAGENT_SERVER_TOKEN" send <session-id> "Run tests"
```

The CLI binds the selected workspace before session commands so streamed events are delivered to the client. Use `wss://` and `--tls-ca` when connecting through TLS.
