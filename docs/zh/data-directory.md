# 数据目录

默认数据根目录是 `~/.mkagent`。可以通过设置 `MKAGENT_CONFIG_DIR` 隔离测试或开发环境。MkAgent 不会读取或迁移其他产品的数据。

根目录下包含全局配置、加密凭证存储、日志、工具图标、全局 Skills 和 `workspaces/`。每个 workspace 下包含会话、Pi 恢复文件、workspace 级 Skills、权限以及相关的本地状态。

备份该目录时请确保应用已停止，或在会话落盘后再执行。
