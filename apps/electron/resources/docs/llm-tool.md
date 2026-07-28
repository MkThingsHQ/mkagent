# Mini model calls

MkAgent uses the configured Pi connection for lightweight model work such as mini chat, title generation, summaries, and inline editing. There is no subscription or OAuth authentication path.

Supported connection forms:

- Pi provider presets authenticated with an API key
- OpenAI-compatible Completions endpoints
- Anthropic Messages-compatible endpoints
- Local Ollama endpoints without authentication

Mini calls use the selected connection and an available lightweight model. API keys remain in encrypted credential storage and are never written to session JSONL, exported sessions, logs, or telemetry.

If a mini call cannot find a usable model, the caller must fail clearly or fall back to deterministic UI behavior; it must not silently use a credential from another connection.
