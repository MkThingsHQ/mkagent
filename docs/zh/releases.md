# 发布、更新与遥测

私有源码仓库的发布流水线会构建 macOS DMG/ZIP、Windows NSIS、Linux AppImage、headless server 和 CLI。Release 环境需要 Apple 与 Windows 签名凭证，以及一个只能向 `open-fox/mkagent-public` 写入的最小权限 token。

公开仓库接收安装包、更新清单、blockmap、校验文件和下载说明。`electron-updater` 从该 GitHub 仓库读取元数据；客户端不包含任何 GitHub token。

Sentry 沿用 Desktop 的基线实现：未提供 `SENTRY_ELECTRON_INGEST_URL` 时 main 与 renderer 初始化为空操作。敏感头和形似凭证的 breadcrumb 字段会被脱敏。Source map 仅生成用于本地调试，不会上传。
