# 连接与模型

连接在 Settings 中配置,凭证不会以明文形式写入配置文件。API key 通过凭证管理器写入;会话 JSONL 与导出包中只包含连接与模型标识。

## 支持的连接形式

| 形式 | Provider 预设 | 备注 |
|---|---|---|
| Pi provider 预设 | `@earendil-works/pi-ai` 0.80.6 自带的全部 preset(anthropic、openai、google、deepseek、xai、mistral、groq、openrouter 等) | 通过 API key 鉴权 |
| 自定义 `openai-completions` | 用户自行提供 base URL | API key 可选(Ollama 留空) |
| 自定义 `anthropic-messages` | 用户自行提供 base URL | API key 可选 |
| 本地 Ollama | `http://127.0.0.1:11434/v1` | 无鉴权,使用 OpenAI-completions 协议 |

订阅 / OAuth(Anthropic Max、ChatGPT Plus、GitHub Copilot、Craft gateway)被刻意不支持;没有 token refresh、callback server、deep-link 处理器。

## 连接类型 vs 认证类型

这两个字段来自 `packages/shared/src/config/llm-connections.ts` 中的 `LlmConnection`,共同决定 MkAgent 如何连上一个模型。

| 字段 | 取值 | 决定 |
|---|---|---|
| `providerType` | `pi`、`pi_compat` | Pi 用哪种传输方式去访问模型 |
| `authType` | `api_key`、`api_key_with_endpoint`、`none` | 凭证如何提供 |
| `customEndpoint.api` | `openai-completions`、`anthropic-messages` | `pi_compat` 用哪种 HTTP 协议 |

`pi` 是 Pi 的原生传输:Pi SDK 内置认识 OpenAI、Anthropic、Google、DeepSeek、xAI、Mistral、Groq、OpenRouter 等 provider。`pi_compat` 给其他所有情况(Ollama、vLLM、DashScope、Azure OpenAI 部署、私有网关)用,必须额外给一个 `baseUrl`,并指定走哪种通用协议。`authType` 只描述随请求一起带过去的凭证。上面那张"支持的连接形式"表格里的 4 种形式,可以重新对应到这三个字段:

| 形式 | `providerType` | `authType` | `customEndpoint.api` |
|---|---|---|---|
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
Settings UI
   │  form: name, baseUrl, protocol, apiKey
   ▼
@mkagent/shared/credentials
   │  持久化到 OS keychain(Keychain / libsecret / Credential Vault)
   ▼
连接记录(不存明文 key)
   │
   ▼
运行时:Pi SDK provider 取凭证引用
```

删除一条连接时,如果其他连接仍在使用,凭证引用不会被清除。测试通过注入假的凭证 provider,绝不真写 keychain;见 `packages/shared/src/credentials/__tests__/`。

## 限制

- MkAgent 不把环境变量当作凭证存储的替代,只在 CLI 的 `--api-key` 与 `LLM_API_KEY` 自包含 run 模式下读取。Desktop / WebUI 始终从凭证管理器读。
- 不支持 workspace 级连接;连接注册表是全局的,workspace 只能 pin 一个 `defaultConnectionId`。
- 配额与限流监控交给 provider;MkAgent 原样透传 provider 上报的 error。

## 刻意不实现的部分

`authType` 目前只允许 API key、带端点的 API key,以及 none。OAuth 登录(Anthropic Max、ChatGPT Plus、GitHub Copilot、Craft gateway)被刻意不支持,因此没有 token refresh、callback server、deep-link 处理器。要补 OAuth 需要扩展 `LlmAuthType` 枚举、在 `CredentialManager` 增加 OAuth token 存储路径,以及为每个 provider 加刷新逻辑;feature-matrix 上下文参见 `docs/zh/comparison-with-craft.md`。

## 在 CLI 中验证连接

```bash
bun run apps/cli/src/index.ts connections list
bun run apps/cli/src/index.ts connections test <id>
bun run apps/cli/src/index.ts connections default <id>
bun run apps/cli/src/index.ts connections add \
  --provider anthropic --name "Work" --api-key "$ANTHROPIC_API_KEY"
```

四条命令读取的是和 Desktop / WebUI 同一份连接注册表。
