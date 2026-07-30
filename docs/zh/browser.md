# Browser

Browser 面板可以在 Desktop 的 Chat 界面和会话工具中打开。Browser 实例可以绑定到会话，支持导航、聚焦、检查和关闭，统一通过共享的 Browser 管理器操作。`web_search` 与 `web_fetch` 仍然保留，用于非交互式信息获取。

Browser 工具遵循会话权限。WebUI 把 Browser 能力委托给所连接的宿主，不会把远程 Workspace 包装成产品功能。
