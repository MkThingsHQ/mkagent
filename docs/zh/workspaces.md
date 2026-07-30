# Workspace

MkAgent 在首次启动时创建 `default` workspace。每个本地 workspace 隔离会话、Skills、权限、Views 和项目上下文。Desktop 窗口绑定到一个 workspace；WebUI 与 CLI 在同一套 RPC 握手中发送 workspace 标识。

MVP 阶段保留 workspace 的创建和切换入口。远程 workspace federation 和 transfer 被刻意省略。删除 workspace 是破坏性的本地操作，绝不能删除 workspace 根目录之外的路径。
