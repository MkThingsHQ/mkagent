# 连接与模型

连接在 Settings 中配置,凭证不会以明文形式写入配置文件。API key 通过凭证管理器写入;会话 JSONL 与导出包中只包含连接与模型标识。

## 支持的连接形式

| 形式 | Provider 预设 | 备注 |
|---|---|---|
| ChatGPT Plus | `openai-codex` | 复用 Craft ChatGPT OAuth，由 Pi 执行 |
| Claude Pro/Max | `anthropic` | 复用 Craft Claude OAuth，由 Pi 执行 |
| Pi provider 预设 | `@earendil-works/pi-ai` 0.81.1 自带的全部 preset(anthropic、openai、google、deepseek、xai、mistral、groq、openrouter、moonshotai 等) | 通过 API key 鉴权 |
| 自定义 `openai-completions` | 用户自行提供 base URL | API key 可选(Ollama 留空) |
| 自定义 `anthropic-messages` | 用户自行提供 base URL | API key 可选 |
| 本地 Ollama | `http://127.0.0.1:11434/v1` | 无鉴权,使用 OpenAI-completions 协议 |

GitHub Copilot、Craft gateway、Sources OAuth 与通用 OAuth 连接仍不支持。两种保留订阅复用 Craft 的 OAuth 实现；项目不安装 Claude Agent SDK 或 Copilot SDK。

## 连接类型 vs 认证类型

这两个字段来自 `packages/shared/src/config/llm-connections.ts` 中的 `LlmConnection`,共同决定 MkAgent 如何连上一个模型。

| 字段 | 取值 | 决定 |
|---|---|---|
| `providerType` | `pi`、`pi_compat` | Pi 用哪种传输方式去访问模型 |
| `authType` | `oauth`、`api_key`、`api_key_with_endpoint`、`none` | 凭证如何提供 |
| `customEndpoint.api` | `openai-completions`、`anthropic-messages` | `pi_compat` 用哪种 HTTP 协议 |

`pi` 是 Pi 的原生传输:Pi SDK 内置认识 OpenAI、Anthropic、Google、DeepSeek、xAI、Mistral、Groq、OpenRouter 等 provider。`pi_compat` 给其他所有情况(Ollama、vLLM、DashScope、Azure OpenAI 部署、私有网关)用,必须额外给一个 `baseUrl`,并指定走哪种通用协议。`authType` 只描述随请求一起带过去的凭证。上面那张"支持的连接形式"表格里的 4 种形式,可以重新对应到这三个字段:

| 形式 | `providerType` | `authType` | `customEndpoint.api` |
|---|---|---|---|
| ChatGPT Plus | `pi` | `oauth` | — |
| Claude Pro/Max | `pi` | `oauth` | — |
| Pi provider 预设 | `pi` | `api_key` | — |
| 自定义 `openai-completions` | `pi_compat` | `api_key_with_endpoint` | `openai-completions` |
| 自定义 `anthropic-messages` | `pi_compat` | `api_key_with_endpoint` | `anthropic-messages` |
| 本地 Ollama | `pi_compat` | `none` | `openai-completions` |

### 连接记录示例

直接使用 Anthropic 官方 API(Pi preset):

```json
{
  "slug": "anthropic-api",
  "providerType": "pi",
  "authType": "api_key",
  "piAuthProvider": "anthropic"
}
```

ChatGPT Plus 通过 Pi OAuth 运行:

```json
{
  "slug": "chatgpt-plus",
  "providerType": "pi",
  "authType": "oauth",
  "piAuthProvider": "openai-codex"
}
```

Claude Pro/Max 使用相同结构，`slug` 为 `claude-max`，`piAuthProvider` 为 `anthropic`。

通过自定义端点访问 DeepSeek:

```json
{
  "slug": "deepseek",
  "providerType": "pi_compat",
  "authType": "api_key_with_endpoint",
  "baseUrl": "https://api.deepseek.com",
  "customEndpoint": { "api": "openai-completions" },
  "piAuthProvider": "openai"
}
```

本地 Ollama,无鉴权:

```json
{
  "slug": "ollama-local",
  "providerType": "pi_compat",
  "authType": "none",
  "baseUrl": "http://localhost:11434",
  "customEndpoint": { "api": "openai-completions" },
  "models": ["llama3.1:8b", "qwen2.5-coder:7b"]
}
```

## 操作

| 操作 | 入口 | 效果 |
|---|---|---|
| 新增 | Settings → Connections | 写入 base URL、protocol、模型列表、凭证引用 |
| 编辑 | Settings → Connections | 更新同一条记录;只有显式清除才会删掉旧凭证引用 |
| 删除 | Settings → Connections | 删除记录与凭证引用 |
| 测试 | 行的右侧按钮 | 通过 Pi 发一个 ping,首个 token 即视为成功 |
| 同步模型 | 行的右侧按钮 | 重新拉取 provider 的模型列表 |
| 手工模型 | 添加模型的表单 | 插入 provider 没有 advertise 的模型 |
| 默认 | toggle | 设置会话无 override 时使用的连接 |

自定义端点不会回退使用其他连接的 key。在为会话选择连接前请先点 "测试"。

## 凭证生命周期

```text
Settings UI / Craft OAuth flow
   │  API key 或 OAuth access + refresh + expiry
   ▼
@mkagent/shared/credentials
   │  持久化到 OS keychain(Keychain / libsecret / Credential Vault)
   ▼
连接记录(不存明文 key)
   │
   ▼
运行时:完整凭证注入 Pi AuthStorage
   │
   ▼
Pi 刷新:新 OAuth 凭证回传父进程并持久化
```

删除一条连接时,如果其他连接仍在使用,凭证引用不会被清除。测试通过注入假的凭证 provider,绝不真写 keychain;见 `packages/shared/src/credentials/__tests__/`。

## 限制

- MkAgent 不把环境变量当作凭证存储的替代,只在 CLI 的 `--api-key` 与 `LLM_API_KEY` 自包含 run 模式下读取。Desktop / WebUI 始终从凭证管理器读。
- 不支持 workspace 级连接;连接注册表是全局的,workspace 只能 pin 一个 `defaultConnectionId`。
- 配额与限流监控交给 provider;MkAgent 原样透传 provider 上报的 error。

## 刻意不实现的部分

OAuth 仅限 ChatGPT Plus 与 Claude Pro/Max。GitHub Copilot、Craft gateway、Sources OAuth、通用 OAuth provider 与 Claude Agent SDK 仍物理删除。Desktop 负责 ChatGPT localhost callback；WebUI 可以使用已经存储的 ChatGPT 订阅，但不能发起新的 ChatGPT 登录。

## 在 CLI 中验证连接

```bash
bun run apps/cli/src/index.ts connections list
bun run apps/cli/src/index.ts connections test <id>
bun run apps/cli/src/index.ts connections default <id>
bun run apps/cli/src/index.ts connections add \
  --provider anthropic --name "Work" --api-key "$ANTHROPIC_API_KEY"
```

四条命令读取的是和 Desktop / WebUI 同一份连接注册表。
