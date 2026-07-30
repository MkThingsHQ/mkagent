# 上游同步

## 基线

- 仓库：<https://github.com/craft-ai-agents/craft-agents-oss>
- Tag：`v0.11.2`
- Commit：`a60ebc1a5a7c`

## 策略

- 日常开发中 `upstream` remote 保持只读 fetch。
- 按既有模块审查上游变更；在职责未变时沿用上游的文件名和符号名。
- 以小颗粒、按模块的提交形式合入变更。
- 不得重新引入 [feature-matrix.md](./feature-matrix.md) 中列为"删除"的功能。
- 接受同步前必须运行受影响的上游测试和 MkAgent 集成测试。
- MkAgent 工作过程中不得修改本地 craft、echo 或 xagent 的参考 checkout。
