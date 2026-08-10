# MkAgent Craft Lite 功能迁移执行记录

> 历史记录：本文记录 2026-07-30 的迁移闭包与验证结果。它保留当时的数字和提交背景；当前状态请以 `docs/architecture.md`、`docs/connections.md`、`docs/testing.md` 和现行 CI 为准。

## 2026-07-30：恢复两种 LLM 订阅，保持 Pi-only

本轮边界只恢复 ChatGPT Plus 与 Claude Pro/Max，不恢复 GitHub Copilot 或 Sources/MCP。实现遵循以下闭包：

- OAuth 登录、PKCE、callback page/server、provider 配置和订阅 UI 直接复用 Craft 同路径源码；仅替换 MkAgent 品牌与宿主接线。
- 两种连接的 `providerType` 都是 `pi`。ChatGPT 使用 `piAuthProvider: openai-codex`，Claude 使用 `piAuthProvider: anthropic`；仓库不新增 `@anthropic-ai/claude-agent-sdk`。
- 安全存储保留 access token、refresh token、expiry 与可选 ID token。父进程把完整 OAuth credential 传给 Pi；Pi 自动刷新后通过子进程协议回传，父进程按 connection slug 串行写回。
- Desktop 负责 ChatGPT localhost callback；Claude 继续使用 Craft 的手工 authorization-code 流程。WebUI 可以复用已存储凭证，但不发起 ChatGPT localhost 登录。
- 设置与 onboarding 只显示 Claude、ChatGPT、API key 和本地模型入口；没有 Copilot 或 Sources 入口、RPC、依赖与资源。

审查仍使用 [`migration-audit.md`](./migration-audit.md) 的逐文件血缘、UI 同步、测试覆盖、类型检查、全量测试、lint 与构建门禁。

## 1. 文档目的

本文记录 MkAgent 从“Craft Agent 的 MVP/Lite 实现”到“代码、功能、UI、架构均以 Craft 源码为基础做减法”的完整执行过程，说明本轮如何清理被隐藏但未删除的功能、验证源码继承关系、补齐会话运行时，以及建立与 Craft 对齐的测试和验收边界。

本轮使用的规划文档如下：

- [`migration-mvp.md`](./migration-mvp.md)：产品定位、保留/删除范围和 MVP 架构。
- [`migration-plan.md`](./migration-plan.md)：从 Craft 源码实施 MkAgent 的迁移计划。
- [`migration-ui.md`](./migration-ui.md)：UI 对齐复盘、源码复用原则和验收规范。

核心原则始终是：

> MkAgent 是 Craft Agent 的 Lite 发行版。保留能力直接复用 Craft 的代码、架构、功能和 UI；排除能力从所有层级物理删除；只在品牌、Pi-only 后端和 Lite 产品边界上做少量定制。

## 2. 迁移前状态

此前已经完成 Pi-only MVP 和多轮 UI 对齐，但仍有两个结构性问题：

1. 一部分明确排除的功能只从界面入口隐藏，组件、Hook、类型、RPC、配置、权限、文案、测试或依赖仍然存在。
2. 保留能力虽然可以编译，但缺少对 Craft 源码继承关系和真实会话链路的系统验证，无法排除局部重新实现、空实现或未接线的风险。

因此，本轮没有继续做局部视觉修补，而是同时审查 MkAgent 与同级 Craft 源码，从产品边界、源码血缘、运行时和测试四个维度重新收敛。

## 3. 执行方法

### 3.1 建立三类源码边界

现存代码按以下三类处理：

| 分类 | 处理方式 | 验证方式 |
|---|---|---|
| 严格复用区 | 文件路径和实现直接来自 Craft，只允许品牌/包名等机械差异 | 归一化后逐字比较 |
| Lite 定制缝 | 从 Craft 文件中删除排除分支，或接入 Pi-only/Lite 接口 | 显式登记并进行语义审查、类型检查和测试 |
| 已删除功能 | UI、路由、状态、RPC、schema、运行时、文案、测试和依赖全部删除 | 路径、关键调用和构建闭包检查 |

该分类避免了两种错误：一是重新实现一个“看起来像 Craft”的版本；二是通过 feature flag、空数组、no-op 或不可达 JSX 保留完整产品代码。

### 3.2 以用户流程和依赖闭包为单位迁移

审查不再只看页面或单个组件，而是沿完整依赖链处理：

```text
导航/UI
  → renderer state/hooks/types
  → preload/transport/RPC
  → server handlers/SessionManager
  → shared schema/config/tool registry
  → Pi subprocess
  → tests/build/package dependencies
```

删除一个产品功能时检查整条链；保留一个能力时也必须证明整条链真实可用。

## 4. 第一阶段：收敛 Lite 产品边界

第一阶段提交：`2119849 refactor: enforce Craft Lite product boundary`

这一阶段的目标是把此前“UI 隐藏”的处理改成物理删除。主要工作包括：

- 删除 Automations、Messaging、Projects/Kanban、Sources 产品面、Labels、自定义 Statuses/Views、Viewer/公开分享、Session transfer、远程 Workspace 产品绑定、OAuth/subscription、Claude backend 和 Playground/sample UI。
- 删除对应 renderer 页面、组件、atoms、hooks、路由、事件、shared modules、RPC handlers、i18n、测试残留和资源。
- 删除为缺失 RPC 注入 no-op 的 renderer 兼容层；保留 API 必须连接真实 channel，排除 API 必须从类型和调用点消失。
- 保留后台 Agent/Shell task 运行能力，但删除 Projects/Kanban/Tasks Conductor 产品组织层。
- 保留 WebUI 的远程 WebSocket transport，但删除 Craft 的远程 Workspace picker/binding 产品面。

该提交涉及 311 个文件，增加 1,696 行、删除 54,560 行，主体是从 Craft 完整产品代码中做减法。

## 5. 第二阶段：清理非 UI 代码并补齐运行时

第二阶段提交：`6aae198 refactor: align Lite runtime and tests with Craft`

### 5.1 清理跨层残留

第二阶段继续删除 UI 之外的失效实现：

- 侧栏菜单中残留的 Sources、Labels、Projects、Automations、自定义 Views 和用户 Status 分支。
- 帮助菜单中指向已删除产品文档的入口。
- PromptBuilder 中的 Source state 注入参数。
- 配置写入检测中的 Sources、Labels 和 Statuses 路径。
- permissions schema、设置页和运行时中的 Source/API endpoint allowlist。
- 仅供 Labels/Statuses 使用的 colors 模块。
- Source 图标解析、缓存和 favicon 路由，仅保留 Skill 图标能力。
- 自定义状态排序删除后遗留的 `sortable-list`、DnD 依赖和失效的 Playground 启动脚本。
- Bedrock IAM、STS 和未被 Pi 连接 DTO 支持的输入/文案分支。

这些修改都以 Craft 文件为起点，只裁掉 Lite 不需要的分支，没有创建平行实现。

### 5.2 恢复 Craft transport 和测试结构

恢复并复用 Craft 的 transport 薄封装与测试，包括：

- WebSocket server、codec、transport index。
- transport success/error/reconnect/unknown channel 测试。
- session event/message/turn grouping parity 测试。
- annotations、配置、prompt、bundle、persistence、内容校验和工作区 slug 测试。

### 5.3 补齐 SessionManager 与 Pi 会话能力

恢复 Craft 的 retained session wiring，并仅删除完整产品耦合：

- 后台 task/workflow 的注册、进度、完成事件和空闲结果提示。
- `get_session_info`、`list_sessions`、`list_background_tasks`、`send_agent_message` 和精简 `spawn_session` 回调。
- Browser session tool 到 BrowserPaneManager 的桥接。
- 附件路径与安全校验。
- annotation 数量、payload 大小、selector、目标 message 和更新约束。
- PiAgent 在实时 turn 之外接收后台事件时向 SessionManager 转发。
- BaseAgent 空 working directory 行为与 Craft 对齐。

这一阶段修复的关键问题不是 UI，而是此前保留的 session tools 虽有定义却没有全部连接到宿主运行时。

## 6. Craft 源码复用验证

`bun run audit:craft-reuse` 对 MkAgent 和同级 Craft checkout 的 tracked source 做同路径比较，只归一化包 scope、URL scheme、配置目录和品牌字符串。

最终结果：

| 指标 | 结果 |
|---|---:|
| MkAgent 源码文件 | 1,163 |
| 与 Craft 同相对路径 | 1,116（96.0%） |
| 归一化后逐字一致 | 686（59.0%） |
| Craft 派生并经过 Lite 修改 | 430 |
| MkAgent 独有源码 | 47 |
| Craft 有而 MkAgent 无 | 606 |

96.0% 的同路径率证明 MkAgent 沿用了 Craft 的模块布局和架构。59.0% 是最严格的逐字一致下界；其余同路径文件主要包含删除分支、品牌替换、Pi-only 接线和恢复的测试，并不代表重新实现。

Renderer 另有更严格的边界守卫：386 个现存文件中，170 个必须与 Craft 归一化后完全一致，211 个是显式登记的 Lite 定制缝，5 个是 MkAgent 品牌资产。

## 7. 测试对齐方法

新增 `lint:craft-test-coverage`，逐一检查 Craft 的 tracked test。每个 Craft 测试必须满足以下条件之一：

1. MkAgent 同路径保留；
2. 因品牌或 Lite schema 使用明确的替代测试；
3. 对应产品功能已被物理删除，并登记具体排除原因。

最终分类：

| 分类 | 数量 |
|---|---:|
| Craft 测试总数 | 373 |
| MkAgent 同路径保留 | 246 |
| 品牌/Lite 替代 | 6 |
| 随删除功能排除 | 121 |
| 无解释缺失 | 0 |

这项检查关注测试集合是否完整，不用少量新增测试掩盖大量上游测试缺失。

## 8. Agent 会话链路验证

本轮增加确定性的 Pi 会话集成测试，使用本地 OpenAI-compatible SSE 服务，但启动的是真实 Pi 子进程。完整流程如下：

```text
创建 PiAgent
  → 启动 packages/pi-agent-server
  → 向本地 OpenAI-compatible endpoint 发起模型请求
  → 模型返回 mcp__session__get_session_info 调用
  → 主进程通过 session callback 执行工具
  → 工具结果回传 Pi 子进程
  → 发起第二次模型请求
  → 返回最终 assistant 文本
  → renderer 处理 tool_start/tool_result/text_complete/complete
```

同时验证：

- 连接配置、模型、Pi provider、自定义兼容端点和 Ollama 的 schema/保存逻辑。
- Browser session tool 能调用 Craft BrowserPaneManager contract。
- session self-management 只暴露已注册的 retained callbacks。
- renderer 能按顺序展示工具调用、工具结果和最终回答。
- annotation、后台任务、cold session metadata 和 workflow progress 能正确持久化/广播。

该测试不依赖外部 API key，可以稳定覆盖协议和运行时；但它不能替代真实第三方 provider 的账号、额度、网络和服务端兼容性验收。

## 9. 最终验证结果

| 验证 | 结果 |
|---|---|
| `bun run test` | 主测试 3,078 pass，11 个平台条件 skip；4 组 isolated 共 23 pass |
| `bun run validate:ci` | 通过；包含全仓类型、共享配置、19 个文档工具 smoke 和 i18n |
| `bun run lint` | 0 error；保留 70 个 Craft 同源 React Hook warning |
| `bun run lint:craft-ui-sync` | 通过 |
| `bun run lint:craft-test-coverage` | 通过 |
| `bun run audit:craft-reuse` | 通过 |
| Electron build | main、preload、renderer、resources、assets 全部通过 |
| WebUI build | 通过 |
| CLI build | 通过，入口为 `dist/mkagent` |
| Pi subprocess build | 通过，3,655 modules bundled |

从 UI 对齐基线开始，两阶段累计涉及 389 个文件，增加 6,315 行、删除 56,761 行。新增内容主要是恢复的 Craft 测试、运行时接线和审计工具；删除内容主要是完整产品功能面。

## 10. 执行中暴露的问题及处理

| 问题 | 根因 | 处理 |
|---|---|---|
| UI 已隐藏但功能代码仍在 | 迁移按页面处理，没有跟踪依赖闭包 | 沿 UI、state、RPC、schema、runtime、test、dependency 全链删除 |
| 保留的 session tools 没有全部生效 | tool definition 与宿主 callback 注册脱节 | 恢复 Craft SessionManager callback wiring 并增加绑定测试 |
| Annotation isolated 测试失败 | 简化实现缺失 Craft 的 payload/数量/selector 校验 | 直接恢复 Craft annotation 校验与事件发送逻辑 |
| Source/API 权限仍出现在设置和 schema | 只删除了 Sources 页面 | 同步删除 schema、validator、权限 UI、运行时分支和 i18n |
| 删除自定义状态后仍有 DnD 依赖 | UI 分支删除但通用组件未检查调用者 | 删除孤立组件、依赖和 lockfile 条目 |
| 构建发现静态资源引用失效 | 类型检查不验证资源闭包 | 将 Electron/WebUI/CLI/Pi production build 纳入最终门禁 |

## 11. 后续同步规则

后续吸收 Craft 更新时应继续遵循以下顺序：

1. 记录 Craft 上游版本或 SHA。
2. 先运行 Lite 边界和 Craft test coverage 检查。
3. 对严格复用区直接同步上游实现。
4. 对 Lite 定制缝逐文件做语义合并，不全量覆盖。
5. 新增上游功能先判断是否在 MkAgent 产品范围内；排除功能不得带回不可达代码。
6. 运行源码复用审计、全套测试、CI 校验和四条构建链。
7. 发布前使用全新用户目录和真实外部 provider 凭证执行一次 GUI smoke。

## 12. 复现命令

```bash
bun run audit:craft-reuse
bun run lint:craft-ui-sync
bun run lint:craft-test-coverage
bun run typecheck:all
bun run test
bun run validate:ci
bun run lint
bun run electron:build
bun run webui:build
bun run cli:build
bun run server:build:subprocess
```

## 13. 提交记录

- `2119849 refactor: enforce Craft Lite product boundary`
- `6aae198 refactor: align Lite runtime and tests with Craft`

详细的架构、风险和源码血缘数据另见 [`project-analysis.md`](./project-analysis.md) 与 [`project-analysis.html`](./project-analysis.html)。
