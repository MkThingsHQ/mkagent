# MkAgent MVP 标准实施计划

> 2026-07-30 边界修订：本文主体记录原始 Lite 迁移计划。当前仅恢复 ChatGPT Plus 与 Claude Pro/Max 的 Craft OAuth 闭包，两者均由 Pi 执行；Claude Agent SDK、GitHub Copilot、Sources/MCP 不恢复。实施记录见 [`migration-features.md`](./migration-features.md)。

## 1. 总体方案

- 在当前仅有 `migration-mvp.md`、尚未初始化 Git 的目录中建立全新项目。
- 固定以 `craft-agents-oss` `v0.11.2` / `a60ebc1a5a7c` 为代码基线；echo 和 xagent 只作为改造案例，参考仓库始终只读。
- 采用“按 package allowlist 迁移并立即裁剪”的方式，不先提交完整 craft 仓库，也不通过 feature flag 隐藏废弃功能。
- 技术栈和运行架构与 craft 对齐：Bun monorepo、Electron、React/Vite/Tailwind、WebSocket RPC、共享 renderer、headless server、CLI、Pi 子进程、JSONL 会话、`electron-builder`。
- 保持可插拔 Agent backend 接口，但 MVP 只注册 Pi Agent。
- 一个模块完成代码、测试、文档和残留扫描后提交一次；参考仓库现有工作区修改不得触碰。

## 2. 分阶段实施

### 阶段 0：Git、远程仓库和产品基线

- 初始化 `main` 分支的新 Git 历史。
- 若目标不存在，使用当前 `gh` 身份创建 private `open-fox/mkagent`，配置为 `origin`。
- 创建 public `open-fox/mkagent-public`，只托管签名安装包、更新清单和校验文件，不发布源码。
- 添加只读 `upstream`：`https://github.com/craft-ai-agents/craft-agents-oss.git`。
- 首批提交建立 `LICENSE`、`NOTICE`、README、产品边界、上游基线记录和功能矩阵。
- 创建 `product.manifest.json`，集中声明：
  - 产品名 `mkagent` / `MkAgent`
  - npm scope `@mkagent/*`
  - 域名 `mkagent.app`
  -协议 `mkagent://`
  - 环境变量前缀 `MKAGENT_`
  - 数据目录 `~/.mkagent`
  - appId/bundle id `app.mkagent.desktop`
  - 暂定版权 `Copyright © 2026 MkAgent contributors`

### 阶段 1：Monorepo、品牌和默认 Workspace

- 迁移 Bun workspace、TypeScript、ESLint、Vite、Tailwind、测试和构建基础配置。
- 建立：
  - `apps/electron`
  - `apps/webui`
  - `apps/cli`
  - `packages/core`
  - `packages/shared`
  - `packages/ui`
  - `packages/server-core`
  - `packages/server`
  - `packages/pi-agent-server`
  - `packages/session-tools-core`
- 不创建 Viewer、Messaging、session MCP 等 workspace。
- 集中实现品牌和路径模块，禁止业务代码硬编码产品名、域名、环境变量前缀和配置目录。
- 基于 xagent 图标源与生成脚本生成 Electron、WebUI 和安装包资源。
- 首次 Desktop、Server 或 CLI 启动均通过同一个 `ensureDefaultWorkspace()` 创建 slug 为 `default` 的 workspace。
- 建立品牌残留检查；除 README、NOTICE、LICENSE 和上游同步文档外，源码、注释和产物不得出现旧包名、协议、路径、环境变量或服务地址。

### 阶段 2：协议、Workspace、会话和存储

- 迁移共享 DTO、RPC codec、握手鉴权、request/response、push、重连、版本和 capability 协议。
- Desktop embedded server、WebUI adapter 和 CLI 统一依赖同一个 Client API 与 `server-core`。
- 保留本地多 Workspace：
  - 创建、切换、设置和删除
  - 每窗口绑定
  - 会话、Skills、权限和 Views 隔离
  - UI 暂时显示创建和切换入口
- 不实现远程 workspace、federation 或 transfer。
- 迁移 JSONL SessionManager，支持：
  - 新建、继续、取消和恢复
  - 搜索、重命名、删除
  - flag、archive、未读
  - 导入、导出、分支和多窗口
  - idle、processing、waiting-permission、failed、interrupted 等技术状态
- 会话 schema 不包含 labels、用户 status、project、source 或 automation 字段。
- Views 只提供未读、待审核计划、运行中、已归档等内置筛选；保留 evaluator/schema，不提供自定义编辑 UI。

### 阶段 3：Pi、连接和凭证

- 建立通用 `AgentBackend`、capability 和 registry；唯一注册项为 `pi`。
- Pi 在独立 `pi-agent-server` 子进程运行，支持初始化、prompt、abort、模型切换、thinking level、权限响应、事件和 session resume。
- 连接 schema 只支持：
  - API key provider
  - 无鉴权 Ollama
  - 自定义 `openai-completions`
  - 自定义 `anthropic-messages`
- 展示上游已有且可使用 API key 的 Pi provider preset；过滤订阅专属入口。
- 凭证加密保存，不进入 config、日志、Sentry、JSONL 或会话导出。
- 物理删除所有 subscription/OAuth 内容，包括类型、配置迁移、RPC、handler、callback server、deep link、token refresh、UI、i18n、测试、依赖和打包资源。
- CI 使用 allowlist 扫描 OAuth/subscription 残留；旧字段提交给 schema 或旧 route 被调用时必须明确拒绝。

### 阶段 4：工具、Browser、文档和权限

- 保留 Pi 基础工具：`read`、`bash`、`edit`、`write`、`grep`、`find`、`ls`。
- 保留 `web_search`、`web_fetch`、Browser session tool、BrowserPaneManager、右上角入口、pane 和 toolbar。
- 工具同时进入实例注册和名称 allowlist，并增加一致性测试。
- 保留附件选择、粘贴、拖放、持久化、恢复和安全检查。
- 保留 `session-tools-core` 中：
  - plan、Skill、Mermaid 和配置验证
  - mini LLM 调用
  - preferences、数据转换和 script sandbox
  - Browser、session info/list
  - 精简 spawn session 和 `send_agent_message`
- 删除 Sources OAuth/test/template、labels/status、Projects/Kanban 和外部 Messaging channel 工具。
- 完整保留 `markitdown`、PDF、XLSX、DOCX、PPTX、图片、iCal、doc diff、Python scripts、跨平台 wrapper 和 `uv`。
- 删除图片生成模型与 `gen_image`，但保留图片附件、预览、Markdown 图片和 `img-tool`。
- 权限和网络代理与 craft 对齐；移除 Source/MCP 权限规则。

### 阶段 5：共享 UI 和核心交互

- Desktop 与 WebUI 复用同一个 renderer、AppShell、Chat、Skills、Settings 和 Browser UI。
- 保持三栏布局：
  - 左栏：顶部新建会话；会话、Skills、设置；Workspace 控件
  - 中栏：搜索、内置筛选、会话/Skills/设置列表
  - 右栏：Chat、Skill 详情或设置详情
- 左栏和中栏支持拖动、持久化、最小/最大宽度和恢复默认值。
- 保留 light、dark、system、主题 preset 和 craft 的组件视觉体系。
- 保留流式文本、thinking、工具结果、权限请求、技术状态和未读提示。
- 保留：
  - mini chat、`EditPopover`、mini model、标题和摘要
  - Skills 三层发现、详情、文件、导入、编辑、picker/mention、watcher 和 Pi prompt 注入
  - `submit_plan`、计划接受/修改/拒绝及执行暂停恢复
  - annotations、选区标注和 follow-up
  - Markdown、代码、diff、terminal、Mermaid、data table、PDF/Office/图片富渲染
- 只维护 `en` 和 `zh-Hans`；CI 检查 locale key 一致性。

### 阶段 6：WebUI 和 CLI

- WebUI 由本地 headless server 同源托管，通过 Browser adapter 实现统一 Client API。
- 非 localhost 使用必须有鉴权，并提示使用 TLS；不扩展为远程 workspace 产品。
- CLI 至少支持：
  - `run`
  - workspace 管理
  - session create/messages/rename/delete/flag/archive/import/export/branch
  - send/cancel
  - connections
  - config validate
  - ping/health
- `run` 支持临时本地 server；`--url/--token` 连接已有 server；`--json` 输出稳定机器协议。
- 删除 Sources、Automations、Messaging、Projects 和 workspace transfer 命令。

### 阶段 7：打包、更新、Sentry 和文档

- 产物：
  - macOS arm64/x64：DMG + ZIP
  - Windows x64：NSIS
  - Linux x64：AppImage
  - 各平台 headless server
  - Bun CLI package/bin
- 打包包含 Pi server、Bun runtime、ripgrep、Browser、文档工具、uv、权限、主题、文档、图标和许可证。
- private `open-fox/mkagent` 的 Release workflow 构建并签名产物，再使用专用最小权限 secret 发布到 public `open-fox/mkagent-public`。
- Electron updater 配置 public GitHub provider：
  - owner：`open-fox`
  - repo：`mkagent-public`
  - 客户端不包含 GitHub token
  - 发布清单、blockmap 和校验文件与安装包同版本
- Sentry严格按 craft 当前机制迁移：
  - main 和 renderer 接入
  - `SENTRY_ELECTRON_INGEST_URL` 存在时启用，否则禁用
  - 保留敏感字段清洗
  - 不新增设置页开关
  - source map 上传暂不启用
  - 不复用 craft 的 DSN
- 完成 README、架构、开发、连接模型、Ollama、权限、代理、Workspace、Sessions、Skills、Browser、附件、文档工具、更新、数据目录、测试和上游同步文档。
- 建立定时 upstream drift workflow，自动产生差异报告/同步 PR，不自动合并拒绝功能。

## 3. 公共接口与数据边界

- `AgentBackendId` 首版只有 `pi`，但 SessionManager 和 UI 只依赖 backend capability。
- Connection DTO 不包含 subscription/OAuth variant；认证类型限定为 API key 或 none。
- 自定义模型协议限定为 `openai-completions | anthropic-messages`。
- Session header 保留连接、模型、权限、token usage、resume、flag、archive、unread、技术状态和分支关系。
- RPC channel 按保留能力重建 allowlist；删除功能的 channel 不保留兼容空实现。
- 数据根目录固定为 `~/.mkagent`，仅允许通过 `MKAGENT_CONFIG_DIR` 覆盖；不读取或迁移旧产品目录。
- Skills 来源优先级固定为 global < workspace < project；`requiredSources` 不生效并给出兼容提示。
- 会话导出不得包含连接密钥、代理凭证、Sentry 信息或其他加密数据。

## 4. 测试与质量门禁

- 每个模块提交前运行目标 lint、typecheck、unit test 和 `git diff --check`；每个阶段结束运行完整 `validate:ci`。
- 必测场景：
  - 默认及多 Workspace 的创建、切换、窗口绑定和数据隔离
  - 会话全生命周期、重启恢复、导入可续聊、分支、多窗口和损坏 JSONL fail-soft
  - Pi registry 唯一性、事件映射、工具双注册、权限暂停恢复和 `.pi-sessions` 恢复
  - API-key provider、两种自定义协议及 Ollama
  - Subscription/OAuth route/schema/依赖均不存在
  - Skills、mini chat、Plan Review、annotations、附件和富文档渲染
  - Browser、`web_search`、`web_fetch`、session tools 和完整文档工具 smoke
  - Desktop/WebUI/CLI 对同一 workspace/session 的行为一致
  - 三平台构建、解包资源、首次启动和更新清单
  - Sentry 无 DSN 时不发送，有 DSN 时执行脱敏
- CI 分层：
  - Linux 快速校验
  - macOS/Windows/Linux 构建矩阵
  - 安装包解包和资源定位
  - 品牌、路径、OAuth、删除功能和凭证残留扫描
  - Release 签名、公开仓库上传和 updater smoke
- 任一质量控制未完成时，对应阶段不得完成或进入发布分支。

## 5. 已锁定默认值

- 新 Git 历史，不迁移已有产品数据。
- private 源码仓库：`open-fox/mkagent`，缺失时自动创建。
- public 更新仓库：`open-fox/mkagent-public`，缺失时自动创建。
- 上游基线：craft `v0.11.2` / `a60ebc1a5a7c`。
- 默认 workspace：`default`。
- appId/bundle id：`app.mkagent.desktop`。
- 产品域名：`mkagent.app`。
- 只有 Pi backend；无任何订阅或 OAuth。
- Sentry 对齐 craft 当前实现，不增加设置开关和 source map 上传。
- 暂无正式签名凭证时允许生成开发/测试包，但公开 stable Release 必须等待对应平台签名、公证凭证配置完成。
- 每个功能模块独立提交；格式化、品牌迁移、功能迁移和功能删除不得混在同一提交。
