# Connections and models

Connections are configured in Settings and stored without plaintext credentials in the configuration files. API keys are written through the credential manager; session JSONL and exports contain only connection/model identifiers.

Supported forms are Pi API-key provider presets, custom `openai-completions`, custom `anthropic-messages`, and unauthenticated local Ollama. The UI supports add, edit, delete, test, model sync, manual models, and a default connection.

MkAgent has no subscription or OAuth login. A custom endpoint does not fall back to a key from another connection. Use the test action before selecting a connection for a session.
