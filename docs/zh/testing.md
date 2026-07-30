# 测试

本地验证与 CI 遵循同一套边界：

```bash
bun run typecheck:all
bun run lint
bun run validate:ci
bun run test
bun run test:doc-tools
bun run electron:build
```

协议与 SessionManager 测试覆盖本地 workspace 隔离、持久化、导入/恢复、分支、未读/状态事件、Pi 注册、权限、工具以及连接变体。CI 额外覆盖 macOS、Windows、Linux 的解包 Desktop 构建与 headless 打包。

测试或构建失败必须与"未配置签名凭证"分开报告。稳定的公开 Release 必须先配置好 Apple 签名/公证和 Windows 签名 secret。
