# Ollama

Start Ollama locally, pull a model, then add a custom connection in Settings.

## Add the connection

```text
Provider:        Custom
Name:            Local Ollama (or anything)
Base URL:        http://127.0.0.1:11434/v1
Protocol:        openai-completions
API key:         (empty)
Default model:   the installed Ollama model name, e.g. llama3.2
```

Save and click "Test". A successful test reports back the model list.

## How MkAgent uses Ollama

Ollama is registered as a `openai-completions` connection. At session startup, Pi's provider resolves the connection id and routes every model call through that endpoint with empty auth. Streaming, thinking-level prompts, tool calls, permission prompts, cancel, and resume are all Pi-managed; Ollama does not get any custom path in MkAgent.

This means:

- A session attached to Ollama uses Pi's tool calls (`bash`, `read`, `edit`, `grep`, …) plus the model the connection declares.
- A tool-capable Ollama model is required when you need tool use; non-tool models will refuse tools.
- Streaming and reasoning-style output fall back to whatever the model emits; Ollama-side "thinking" is not parsed into the renderer.

## Verifying

```bash
# Sanity check from the shell
curl http://127.0.0.1:11434/v1/models

# Verify via MkAgent CLI
bun run apps/cli/src/index.ts connections list
bun run apps/cli/src/index.ts connections test <id>
bun run apps/cli/src/index.ts run "Hello" \
  --provider ollama --base-url http://127.0.0.1:11434/v1 --model llama3.2
```

## Permissions

A connection using Ollama still passes through the shared permission engine. Tools that read or write outside the configured allowlist will prompt even though the model itself runs locally.

## Limitations

- Ollama's OpenAI-compatible surface misses a few fields that MkAgent may send (notably parallel tool calls and certain reasoning payloads). Tool calls may be reported as plain text by some Ollama models; prefer a tool-capable model for agentic sessions.
- Network access is local; the proxy is not used for `127.0.0.1` even when configured.
- A multi-model connection cannot be split across providers; create one connection per Ollama base URL.
