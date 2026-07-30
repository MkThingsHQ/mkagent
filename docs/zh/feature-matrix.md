# 功能矩阵

本文记录 MkAgent 相对上游基线明确划定的产品边界。

## 保留能力

- Electron Desktop、WebUI、CLI、headless server、共享 renderer 与 WebSocket RPC
- Pi agent backend 与 API key 模型连接
- 自定义 OpenAI 兼容与 Anthropic 兼容端点，以及 Ollama
- 本地多 workspace 支持，以及 `default` workspace
- 会话、flag、archive、unread、搜索、导入/导出、分支和多窗口
- Skills、mini chat、计划、annotations 与 follow-up
- Browser、`web_search`、`web_fetch`、附件和文档工具
- 权限、网络代理、主题、英文与简体中文
- 自动更新与 Sentry 集成

## 删除能力

- Claude backend 与所有订阅/OAuth 鉴权
- 外部消息渠道
- 产品 Automations 与定时任务
- 会话 labels 与用户自定义 statuses
- Projects 与 Kanban
- Sources 与 MCP
- Viewer、公开分享与远程 workspace
- 图片生成

## 参考仓库策略

保留模块沿用上游目录布局、公开命名、代码风格与测试。产品专属标识替换为 MkAgent。参考仓库保持只读。
