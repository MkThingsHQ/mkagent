# 连接与模型

连接在 Settings 中配置，凭据不会以明文形式写入配置文件。API key 由凭证管理器写入，会话 JSONL 和导出包中只包含连接和模型的标识。

支持的连接形式包括 Pi 的 API key provider 预设、自定义 `openai-completions`、自定义 `anthropic-messages`，以及无鉴权的本地 Ollama。UI 支持新增、编辑、删除、测试、模型同步、手工模型和默认连接。

MkAgent 不提供订阅或 OAuth 登录。自定义端点不会回退使用其他连接的 key。在为会话选择连接之前，请先使用测试动作验证。
