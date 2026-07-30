# Connections and models

Connections are configured in Settings and stored without plaintext credentials in the configuration files. API keys are written through the credential manager; session JSONL and exports contain only connection/model identifiers.

## Supported connection forms

| Form | Provider preset | Notes |
|---|---|---|
| ChatGPT Plus | `openai-codex` | Craft ChatGPT OAuth; executed by Pi |
| Claude Pro/Max | `anthropic` | Craft Claude OAuth; executed by Pi |
| Pi provider preset | any preset bundled with `@earendil-works/pi-ai` 0.80.6 (anthropic, openai, google, deepseek, xai, mistral, groq, openrouter, …) | Auth via API key |
| Custom `openai-completions` | user-supplied base URL | API key optional (Ollama uses empty key) |
| Custom `anthropic-messages` | user-supplied base URL | API key optional |
| Local Ollama | `http://127.0.0.1:11434/v1` | No auth, OpenAI-completions protocol |

GitHub Copilot, Craft gateway, Sources OAuth, and generic OAuth connections are not supported. The two retained subscription flows use Craft's OAuth implementation; no Claude Agent SDK or Copilot SDK is installed.

## Connection type vs authentication type

These two fields come from `LlmConnection` in `packages/shared/src/config/llm-connections.ts` and together describe how MkAgent reaches a model.

| Field | Code values | Decides |
|---|---|---|
| `providerType` | `pi`, `pi_compat` | Which transport Pi uses to talk to the model |
| `authType` | `oauth`, `api_key`, `api_key_with_endpoint`, `none` | How the credential is supplied |
| `customEndpoint.api` | `openai-completions`, `anthropic-messages` | Which HTTP protocol `pi_compat` speaks |

`pi` is Pi's native transport: the Pi SDK already knows OpenAI, Anthropic, Google, DeepSeek, xAI, Mistral, Groq, and OpenRouter. `pi_compat` is used for everything else (Ollama, vLLM, DashScope, an Azure OpenAI deployment, a private gateway) — you must give Pi a `baseUrl` and tell it which generic protocol to use. `authType` only describes the credential that accompanies the request. The four "forms" above map onto those three fields as follows.

| Form | `providerType` | `authType` | `customEndpoint.api` |
|---|---|---|---|
| ChatGPT Plus | `pi` | `oauth` | — |
| Claude Pro/Max | `pi` | `oauth` | — |
| Pi provider preset | `pi` | `api_key` | — |
| Custom `openai-completions` | `pi_compat` | `api_key_with_endpoint` | `openai-completions` |
| Custom `anthropic-messages` | `pi_compat` | `api_key_with_endpoint` | `anthropic-messages` |
| Local Ollama | `pi_compat` | `none` | `openai-completions` |

### Example connection records

A direct Anthropic API key (Pi preset):

```json
{
  "slug": "anthropic-api",
  "providerType": "pi",
  "authType": "api_key",
  "piAuthProvider": "anthropic"
}
```

ChatGPT Plus through Pi OAuth:

```json
{
  "slug": "chatgpt-plus",
  "providerType": "pi",
  "authType": "oauth",
  "piAuthProvider": "openai-codex"
}
```

Claude Pro/Max through Pi OAuth uses the same shape with `slug: "claude-max"` and `piAuthProvider: "anthropic"`.

DeepSeek through a custom endpoint:

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

Local Ollama, no auth:

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

## Operations

| Operation | Where | Effect |
|---|---|---|
| Add | Settings → Connections | Stores base URL, protocol, model list, and credential reference |
| Edit | Settings → Connections | Updates the same record; old credential reference is removed only when explicitly cleared |
| Delete | Settings → Connections | Removes the record and the credential reference |
| Test | per-row button | Sends a "ping" via Pi; succeeds on first token |
| Sync models | per-row button | Re-fetches the provider's model list |
| Manual model | add-model form | Inserts a model the provider did not advertise |
| Default | toggle | Sets the connection used when a session has no override |

A custom endpoint does not fall back to a key from another connection. Use the test action before selecting a connection for a session.

## Credential lifecycle

```text
Settings UI / Craft OAuth flow
   │  API key or OAuth access + refresh + expiry
   ▼
@mkagent/shared/credentials
   │  persist via OS keychain (Keychain / libsecret / Credential Vault)
   ▼
connection record (no plaintext key)
   │
   ▼
runtime: full credential injected into Pi AuthStorage
   │
   ▼
Pi refresh: updated OAuth credential returned to the parent and persisted
```

When you delete a connection, the credential reference is removed from the keychain *iff* no other connection still uses it. Tests inject fake credential providers rather than creating real keychain entries; see `packages/shared/src/credentials/__tests__/`.

## Limitations

- MkAgent does not look at environment variables as a substitute for storing credentials, except for the CLI's `--api-key` and `LLM_API_KEY` self-contained run mode. The Desktop and WebUI always read from the credential manager.
- Per-workspace connections are not implemented; the registry is global. A workspace can still pin a single `defaultConnectionId`.
- Quota and rate-limit monitoring is delegated to the provider; MkAgent surfaces provider-reported errors verbatim.

## What is intentionally absent

The OAuth surface is restricted to ChatGPT Plus and Claude Pro/Max. GitHub Copilot, Craft gateway, Sources OAuth, generic OAuth providers, and the Claude Agent SDK remain physically absent. Desktop owns the ChatGPT localhost callback; WebUI can use an already stored ChatGPT subscription but cannot start a new ChatGPT login.

## Verifying a connection from the CLI

```bash
bun run apps/cli/src/index.ts connections list
bun run apps/cli/src/index.ts connections test <id>
bun run apps/cli/src/index.ts connections default <id>
bun run apps/cli/src/index.ts connections add \
  --provider anthropic --name "Work" --api-key "$ANTHROPIC_API_KEY"
```

All four commands read the same connection registry as Desktop and WebUI.
