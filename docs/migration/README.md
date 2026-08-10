# MkAgent 迁移文档总览

本目录记录 MkAgent 从零起步，基于 [Craft Agents OSS](https://github.com/craft-ai-agents/craft-agents-oss) `v0.11.2` / `a60ebc1a5a7c` 派生 Lite 产品的完整迁移过程，包含产品边界、阶段计划、UI 对齐、功能裁剪、代码审计与质量验证。

- **上游基线**：`craft-agents-oss` `v0.11.2` / `a60ebc1a5a7c`
- **产品定位**：Pi-only 的本地跨平台 Agent Lite 发行版，保留 Craft 架构、UI 组件和 Pi Agent；恢复 ChatGPT Plus 与 Claude Pro/Max 两种 LLM 订阅 OAuth，但继续删除 Claude Agent SDK、GitHub Copilot、Sources/MCP、外部 Messaging、Automations、Labels、Projects/Kanban、Viewer、图片生成等产品功能面。
- **代码来源**：96.0% 与 Craft 同路径，59.0% 在最小归一化（包 scope、协议、数据目录、品牌字符串）后完全一致；其余为 Lite 裁剪、品牌替换、Pi-only 接线与恢复的上游测试。

## 阅读顺序建议

| 阶段 | 推荐先读 | 说明 |
| --- | --- | --- |
| 1. 建立产品边界 | [migration-mvp.md](./migration-mvp.md) | 产品定位、MVP 范围、保留/删除清单、分阶段实施与风险控制 |
| 2. 实施计划 | [migration-plan.md](./migration-plan.md) | 标准化实施阶段、提交纪律与质量门禁 |
| 3. UI 对齐 | [migration-ui.md](./migration-ui.md) | UI 对齐复盘、源码复用原则与验收规范 |
| 4. 功能迁移 | [migration-features.md](./migration-features.md) | Lite 功能裁剪、运行时恢复与两阶段提交记录 |
| 5. 代码审计 | [migration-audit.md](./migration-audit.md) | 逐文件血缘、审核流程、本轮结果与历史经验 |
| 6. 审计报告 | [project-analysis.md](./project-analysis.md) / [project-analysis.html](./project-analysis.html) | 仓库结构、架构、Craft 复用统计、物理裁剪清单与质量信号 |

## 文档要点

### [migration-mvp.md](./migration-mvp.md)

> 状态：第三版，产品边界已确认，可按阶段进入实施

包含 18 节内容，从目标与原则、参考基线、MVP 范围、Views 定义、目标 monorepo、运行架构、Pi-only 与模型连接、工具、Workspace 与存储、共享 UI、品牌替换机制、构建打包与 Sentry、文档策略、上游同步、分阶段实施、自动化测试到风险控制。第三版的关键决策：保留 mini chat，简化 MVP；保留后台 Agent/Shell task 但删除 Projects/Kanban；保留远程 WebSocket transport 但删除远程 Workspace 产品绑定。

### [migration-plan.md](./migration-plan.md)

将 [migration-mvp.md](./migration-mvp.md) 的 18 节内容收敛为标准的 5 段实施文档：总体方案、阶段化实施、公共接口与数据边界、测试与质量门禁、已锁定默认值。强调"按 package allowlist 迁移并立即裁剪"，明确不通过 feature flag 隐藏废弃功能。

### [migration-ui.md](./migration-ui.md)

复盘 MVP 到三轮 UI 对齐的实施过程：

1. **MVP**："参考 Craft"被误解为"实现 Craft 风格界面"，大量细节偏差。
2. **第一轮 (`c7f9aa9`)**：复用粒度太小，复制叶子组件而不复制完整页面。
3. **第二轮 (`526d455`)**：仍是"看着源码实现相似版本"，持续追赶 Craft。
4. **第三轮 (`a12f513`)**：复用范围太大，把整个 Craft renderer 都搬了过来，用 `product-profile.ts` 过滤入口和 `craft-renderer-compat.ts` 注入 no-op，UI 源码复用基本正确但产品范围裁剪不正确。

明确后续 UI 对齐的正确流程：以保留功能完整依赖闭包为单位直接复用，以显式 allowlist 管理上游同步，以物理删除落实产品范围，并用源码、视觉、功能和自动化四层证据完成验收。

### [migration-features.md](./migration-features.md)

记录从"UI 隐藏"到"物理删除"的两个关键提交：

- `2119849 refactor: enforce Craft Lite product boundary` —— 311 个文件，删除 54,560 行，把"UI 隐藏"的排除功能改为物理删除。
- `6aae198 refactor: align Lite runtime and tests with Craft` —— 清理非 UI 残留、恢复 Craft transport 与测试结构、补齐 SessionManager 与 Pi 会话能力。

包含 Pi 会话集成测试的完整链路、4 条构建链验证结果，以及后续同步规则。

### [migration-audit.md](./migration-audit.md)

定义逐文件血缘审核流程，分 8 个阶段执行：

- 阶段 A 冻结现场 → B 先修明确问题 → C 生成完整文件清单 → D 按目录逐文件语义审核 → E UI 专项审核 → F 测试覆盖对齐 → G 分层验证 → H 提交前自检。

记录本轮关键问题、最终验证结果（3,153 pass / 11 skip / 0 fail；isolated 37 pass）和 10 条核心经验，强调"对齐的最小可信单位是单个文件，功能验收的最小可信单位是完整依赖闭包"。

### [project-analysis.md](./project-analysis.md) / [project-analysis.html](./project-analysis.html)

同一份审计报告的 Markdown 与 HTML 呈现。包含仓库结构、架构图、技术栈、Craft 源码血缘统计（1,163 文件 / 1,116 同路径 / 686 完全一致 / 430 派生修改 / 47 独有 / 606 Craft-only 删除）、物理删除的功能面清单、保留能力、关键决策、质量信号、风险与未验证项。

## 关键决策摘要

| 主题 | 决策 |
| --- | --- |
| Agent backend | 仅注册 `pi`，自定义协议与 Ollama 都是 Pi 连接变体 |
| 鉴权 | API key、无鉴权 Ollama、ChatGPT Plus OAuth、Claude Pro/Max OAuth；OAuth credential 统一交给 Pi，刷新结果回写安全存储 |
| 仓库 | 源码与发布产物统一放在 `MkThingsHQ/mkagent`（public） |
| 数据目录 | `~/.mkagent`，仅 `CONFIG_DIR` 可覆盖，不读取或迁移其他产品 |
| 默认 workspace | slug 为 `default`，首次启动统一 `ensureDefaultWorkspace()` |
| AppID/Bundle | `app.mkagent.desktop` |
| 协议 | `mkagent://` |
| 环境变量前缀 | `MKAGENT_` |
| i18n | 仅 `en` 与 `zh-Hans` |
| Sentry | 与 craft 对齐；`SENTRY_ELECTRON_INGEST_URL` 存在时启用；不增加设置开关；source map 不上传 |
| 自动更新 | `electron-updater` + `MkThingsHQ/mkagent` GitHub provider；客户端不含 token |
| 排除功能 | Claude Agent SDK backend、GitHub Copilot、两种 LLM 订阅以外的 OAuth、外部 Messaging、Automations、Labels、自定义 Statuses、Projects/Kanban、Sources/MCP、Viewer/公开分享、Session transfer、远程 Workspace 产品绑定、图片生成模型 |

## 复现命令

```bash
# Craft 复用与 UI 同步检查
bun run audit:craft-reuse
bun run lint:craft-ui-sync
bun run lint:craft-test-coverage

# 类型、测试与验证
bun run typecheck:all
bun run test
bun run validate:ci
bun run lint

# 四条构建链
bun run electron:build
bun run webui:build
bun run cli:build
bun run server:build:subprocess
```

需通过 `CRAFT_AGENT_SOURCE` 指向 craft checkout，例如：

```bash
CRAFT_AGENT_SOURCE=/Users/javayhu/workspace/agents/craft-agents-oss \
  bun run audit:craft-reuse
```

## 相关参考仓库（只读）

- `craft-agents-oss` `a60ebc1a5a7c`（v0.11.2）—— 唯一架构、UI、功能与测试基线
- `echo` `fc38d0d49166` —— 参考在主架构上增加产品模块的方式；Connectors 不进入 MVP
- `xagent` `59d1fdf20b16` —— 参考物理删除 Claude/Messaging/MCP、品牌替换、图标生成、默认 workspace 修复

以上仓库仅作只读参考，任何 MkAgent 工作的修改不得触碰这些 checkout。
