# Ollama

Start Ollama locally, pull a model, then add a custom connection in Settings:

- Base URL: `http://127.0.0.1:11434/v1`
- Protocol: `openai-completions`
- API key: empty
- Model: the installed Ollama model name

Ollama remains a Pi connection, so streaming, tools, permissions, cancellation, and resume use the same session pipeline. Model capabilities vary; select a tool-capable model when tool use is required.
