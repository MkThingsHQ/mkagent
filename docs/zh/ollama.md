# Ollama

先在本地启动 Ollama，拉取所需模型，再在 Settings 中添加一条自定义连接：

- Base URL：`http://127.0.0.1:11434/v1`
- 协议：`openai-completions`
- API key：留空
- Model：已安装的 Ollama 模型名

Ollama 仍然是 Pi 的一种连接，因此流式输出、工具调用、权限、取消和恢复都走同一套会话管线。不同模型能力差异较大，需要使用工具时请选择具备工具能力的模型。
