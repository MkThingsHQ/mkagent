# MkAgent CLI

CLI 通过 WebSocket 连接到 MkAgent headless server。`run` 还可以临时启动一个本地 server，创建会话、流式完成一轮后清理。

```bash
bun run apps/cli/src/index.ts --help
DEEPSEEK_API_KEY=... bun run apps/cli/src/index.ts run "Summarize this repository"
```

## 连接选项

| 参数 | 环境变量 | 默认值 |
|---|---|---|
| `--url <ws-url>` | `MKAGENT_SERVER_URL` | `run` 模式下使用临时 server |
| `--token <secret>` | `MKAGENT_SERVER_TOKEN` | 为临时 server 自动生成 |
| `--workspace <id>` | `MKAGENT_WORKSPACE` | 优先 `default`，否则取第一个 workspace |
| `--timeout <ms>` | — | `10000` |
| `--send-timeout <ms>` | — | `300000` |
| `--tls-ca <path>` | `MKAGENT_TLS_CA` | — |
| `--json` | — | `false` |

## 命令

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

`send` 与 `run` 把文本和工具开始事件流式输出到 stdout。`--output-format stream-json` 每行写入一条会话事件。在支持 `--json` 的命令上，它会返回一条机器可读的结果。中断的轮次会以状态码 130 退出。

## 自包含运行

默认 provider 是 DeepSeek。API key 会按 `--api-key`、`LLM_API_KEY` 或 provider 专属环境变量的顺序解析，并复用已配置的 DeepSeek 连接。

```bash
DEEPSEEK_API_KEY=... mkagent run "Explain the failing tests"
OPENAI_API_KEY=... mkagent --provider openai --model gpt-4o run "Review this project"
mkagent --provider ollama --base-url http://127.0.0.1:11434/v1 --model llama3.2 run "Hello"
```

运行选项：

| 参数 | 默认值 | 说明 |
|---|---|---|
| `--workspace-dir <path>` | — | 注册并使用一个本地 workspace 目录 |
| `--mode <mode>` | `allow-all` | 会话权限模式 |
| `--output-format <text|stream-json>` | `text` | 流式输出格式 |
| `--no-cleanup` | `false` | 保留临时会话 |
| `--server-entry <path>` | bundled/local server | 覆盖 server 入口 |
| `--provider <name>` | `deepseek` | Pi provider 预设 |
| `--model <id>` | provider 默认 | 模型 ID |
| `--api-key <key>` | provider 环境变量 | API 凭证 |
| `--base-url <url>` | — | 自定义 provider 端点 |
| `--protocol <openai-completions|anthropic-messages>` | 派生自 provider | 自定义端点协议 |

## 连接已运行 server

```bash
mkagent --url ws://127.0.0.1:9100 --token "$MKAGENT_SERVER_TOKEN" workspaces
mkagent --url ws://127.0.0.1:9100 --token "$MKAGENT_SERVER_TOKEN" session create --name review
mkagent --url ws://127.0.0.1:9100 --token "$MKAGENT_SERVER_TOKEN" send <session-id> "Run tests"
```

CLI 会在执行会话命令前绑定所选 workspace，确保事件流能正确路由到客户端。通过 TLS 连接时请使用 `wss://` 并提供 `--tls-ca`。
