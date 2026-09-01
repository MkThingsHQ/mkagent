# Search Payload Contract

Last updated: 2026-08-25

This file documents the **known-good request shape** for provider-native web search calls in `pi-agent-server`.

## ChatGPT backend (openai-codex)

Implementation: [providers/chatgpt.ts](./providers/chatgpt.ts)

Endpoint:
- `POST https://chatgpt.com/backend-api/codex/responses`

Required headers:
- `Authorization: Bearer <oauth-access-token>`
- `chatgpt-account-id: <JWT claim https://api.openai.com/auth.chatgpt_account_id>`
- `OpenAI-Beta: responses=experimental`
- `Content-Type: application/json`

Known-good body fields for search:
- `model`: derived from the active connection, NOT hardcoded. The plumbed active-session model is tried first, then the shared `openai-codex` catalog (`PI_PREFERRED_DEFAULTS['openai-codex']`) as fallbacks, capped at 4 candidates total (`MAX_MODEL_CANDIDATES`) so a fully-rejecting account is bounded to 4 round-trips before the DDG fallback. A 400 counts as a model rejection only when the error names the model (`isModelRejectionError`) — a hosted-tool "is not supported" refusal takes the tool-type retry instead. Hardcoding a single model here previously caused a total search outage when that model was retired (craft-agents-oss#1023).
- `store: false`
- `stream: true`
- `instructions: string`
- `tools: [{ type: "web_search" }]` (fallback retry: `web_search_preview`)
- `tool_choice: "auto"`
- `parallel_tool_calls: true`
- `text: { verbosity: "medium" }`
- `input: [{ role, content: [{ type: "input_text", text }] }]`

### Why `stream: true` here?
The backend may reply with either JSON or SSE-like payloads depending on edge behavior. The provider parses both formats and treats parse failures as retryable across `web_search` → `web_search_preview` attempts before surfacing an aggregated error.

## Regression Checklist

If search starts failing again (HTTP or parse path):
1. Verify this payload shape in tests (`providers/chatgpt.test.ts`).
2. Compare against current upstream SDK behavior (`@earendil-works/pi-ai` codex responses provider).
3. Confirm the candidate models in `PI_PREFERRED_DEFAULTS['openai-codex']` are current — a stale/retired model at the top of the list means the first search attempt 400s (it then fails over to the next candidate, so this degrades latency rather than breaking search). Only the first 4 deduped candidates are tried (`MAX_MODEL_CANDIDATES`), so the working model must be near the front of the catalog.
4. Inspect error fingerprint in thrown error (`tool/model/stream/tool_choice/text.verbosity`) and parse metadata (`content-type`, compact response snippet).
