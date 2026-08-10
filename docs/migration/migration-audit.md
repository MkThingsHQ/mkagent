# MkAgent 对齐审核流程与历史经验

## 1. 文档目的

本文定义 MkAgent 对 Craft Agent 进行完整代码审核、修复和验收时必须遵循的流程，并记录历次迁移与本轮复审暴露的问题。

MkAgent 是 Craft Agent 的 Lite 发行版。审核目标不是证明两者“整体相似”，而是逐文件证明：

1. 保留功能直接复用 Craft 的源码、架构、UI 和测试。
2. 差异仅来自品牌替换、Pi-only 后端或明确的 Lite 产品裁剪。
3. 删除功能的 UI、状态、RPC、schema、运行时、资源、依赖和测试全部清理。
4. 每个保留能力有与 Craft 对齐的测试和真实运行验证。

本文与以下文档配合使用：

- [`migration-mvp.md`](./migration-mvp.md)：产品边界。
- [`migration-plan.md`](./migration-plan.md)：总体迁移计划。
- [`migration-ui.md`](./migration-ui.md)：UI 对齐历史和规范。
- [`migration-features.md`](./migration-features.md)：Lite 功能裁剪与运行时迁移记录。

## 2. 固定基线与审核边界

当前审核基线：

| 项目 | 值 |
|---|---|
| MkAgent | `/Volumes/SAMSUNG/workspace/github/mkagent` |
| Craft Agent | `/Volumes/SAMSUNG/workspace/agents/craft-agents-oss` |
| Craft 版本 | `v0.11.2` |
| Craft commit | `a60ebc1a5a7cb0a6af7a77d5eed0512c5fc07658` |

开始审核前必须记录两个仓库的 commit 和工作区状态。Craft 仓库只读；如果其中已有本地修改，审计程序必须读取固定 commit 中的内容，不能把未提交文件当作基线，也不能清理或覆盖用户修改。

本轮 Craft 工作区已有 `bun.lock` 修改，整个审核过程均保留该修改。

## 3. 为什么早期审核仍会漏问题

### 3.1 以页面或目录代替逐文件审核

早期流程会确认某个目录“来自 Craft”，或允许整个目录存在差异。这无法发现：

- 同一目录中的单个文件被重新实现。
- 新增文件绕过扩展名或目录 allowlist。
- 二进制、无扩展名、配置、脚本和资源文件未进入比较。
- 一个已登记文件在后续修改后继续沿用旧的审核结论。

改进：审核单位固定为相对路径文件；不得使用宽泛目录豁免。每个差异文件都必须有内容哈希和具体原因。

### 3.2 只看 UI 外观，没有检查数据初始化与宿主接线

主题、工具图标和默认权限页面都存在，但 WebUI/headless 首次启动没有复制默认资源，因此页面显示为空。编译和静态截图无法证明设置数据真实存在。

改进：沿以下完整链路审核保留功能：

```text
静态资源
  → 首次启动初始化
  → config/storage
  → watcher
  → RPC handler
  → transport adapter
  → renderer state
  → 用户可见 UI
  → 自动化测试
```

### 3.3 测试文件存在，不代表测试覆盖仍与 Craft 一致

同路径测试可能删除了大量 case；少量 MkAgent 新测试也可能掩盖上游测试缺失。

改进：除了检查测试文件路径，还要统计同路径文件的测试 case 数。case 减少必须逐文件登记；替代测试必须指明被替代的 Craft 测试；随功能删除的测试必须写明对应产品边界。

### 3.4 构建通过，不代表运行时可用

本轮真实 WebUI 冒烟发现 `notification:getEnabled` 没有 handler。该问题不会被 renderer build、typecheck 或静态 UI 检查发现。

第一次修复如果直接把 handler 放入共享 core，又会和 Electron 原生 notification handler 重复注册，导致 Electron 启动失败。最终处理方式是只在 headless server 宿主注册 WebUI 所需的通知偏好 handler，并增加真实 WebSocket smoke test。

经验：共享 renderer 不等于所有宿主使用相同 handler 集合。Core、headless 和 Electron GUI channel 必须分层注册，并测试“全部保留 channel 恰好注册一次”。

### 3.5 旧进程和缓存会制造假差异

Electron 冒烟一度显示旧的 `Craft menu`，但源码和最新构建产物已经是 `MkAgent menu`。原因是 CDP 连接到了先前启动的旧实例。

改进：

- 每轮 GUI 验收使用唯一的调试端口和 `--user-data-dir`。
- 记录连接的页面 URL、进程 PID、配置目录和构建时间。
- 修改 main/preload 后必须重启 Electron；修改 renderer 后至少重新构建并 reload。
- 先比较源码和产物，再判断是代码缺陷还是旧进程问题。

### 3.6 品牌扫描区分大小写会漏残留

品牌、包名、环境变量、协议和文件名可能使用不同大小写。只搜索一种拼写会漏掉 `Craft`、`CRAFT_AGENT_` 或文件名中的旧标识；过宽的排除规则还可能跳过 workflow 等关键目录。

改进：使用大小写不敏感扫描，并只排除 `.git`、依赖和构建产物等精确目录。所有命中逐条分类，不能仅凭搜索结果数量判断通过。

## 4. 标准审核流程

### 4.1 阶段 A：冻结现场

1. 记录 MkAgent 当前分支、commit 和工作区状态。
2. 记录 Craft tag、commit 和工作区状态。
3. 阅读四份 migration 文档，确认保留/删除功能矩阵。
4. 不修改 Craft，不自动格式化全仓，不覆盖无关未提交修改。
5. 为本轮审核建立问题清单，并优先修复用户已明确发现的问题。

推荐命令：

```bash
git status --short
git log -5 --oneline

git -C /Volumes/SAMSUNG/workspace/agents/craft-agents-oss status --short
git -C /Volumes/SAMSUNG/workspace/agents/craft-agents-oss rev-parse HEAD
git -C /Volumes/SAMSUNG/workspace/agents/craft-agents-oss describe --tags --always
```

### 4.2 阶段 B：先修明确问题并独立提交

已知问题不得混入全面审查的大提交。每个问题都沿资源、服务、协议和 UI 依赖闭包检查，并运行针对性测试与真实 UI 验证。

本轮第一阶段修复：

- All Sessions 下恢复 Flagged 和 Archived 子导航层级。
- 恢复 Color Theme 和 Workspace Theme 默认选项。
- 恢复默认 Tool Icons 初始化和显示。
- 恢复 Default Permissions 初始化、RPC 和显示。
- 为 What's New 提供真实发布说明和可用退出路径。
- 修复 WebUI provider 根节点初始化问题。

提交：

```text
4e11bc8 fix: restore retained navigation and settings defaults
```

第一阶段提交后再进入全量审核，避免后续大量差异掩盖明确问题的修复范围。

### 4.3 阶段 C：生成完整文件清单

文件清单必须包含：

- Git 已跟踪文件。
- 本轮准备提交的未跟踪文件。
- 源码、测试、配置、workflow、文档、shell/PowerShell 脚本。
- 二进制资源和无扩展名文件。

不得只按 `.ts`、`.tsx` 等扩展名筛选。当前审计使用：

```bash
git ls-files --cached --others --exclude-standard -z
git -C "$CRAFT_AGENT_SOURCE" ls-tree -r --name-only -z HEAD
```

然后按相对路径将文件划分为：

| 分类 | 要求 |
|---|---|
| 归一化后完全一致 | 自动逐字节比较，不需要人工豁免 |
| Craft 派生差异 | 逐文件记录 SHA256 和具体差异理由 |
| MkAgent 独有 | 证明其为品牌、Pi-only、headless/CLI 或审计门禁所必需 |
| Craft 中已删除 | 逐文件说明对应的 Lite 删除边界 |

归一化仅允许机械替换，例如包 scope、协议、配置目录和品牌名。不得把结构、逻辑或 UI 差异加入归一化规则，否则会掩盖真实偏离。

执行：

```bash
CRAFT_AGENT_SOURCE=/Volumes/SAMSUNG/workspace/agents/craft-agents-oss \
  bun run audit:craft-reuse
```

清单位于：

- [`scripts/craft-source-overrides.json`](../../scripts/craft-source-overrides.json)
- [`scripts/craft-ui-overrides.json`](../../scripts/craft-ui-overrides.json)

文件发生修改后，其哈希必须更新并重新审核。不能为了让检查通过而只刷新哈希；必须先重新比较 Craft 原文件并确认差异仍然必要。

### 4.4 阶段 D：按目录逐文件语义审核

自动哈希只能证明文件是否变化，不能证明差异是否合理。人工审核应按以下顺序执行，每个目录都逐文件看 diff：

1. 根配置、workspace、CI 和构建脚本。
2. `apps/electron`：main、preload、transport、renderer、resources、packaging。
3. `apps/webui`：启动、鉴权、adapter、共享 renderer 接线。
4. `apps/cli`：参数、连接、命令、流式输出和退出码。
5. `packages/server-core`：RPC、SessionManager、WebUI HTTP、服务和安全边界。
6. `packages/server`：headless 初始化、宿主专属 handler、TLS 和关闭流程。
7. `packages/shared`：DTO、协议、配置、watcher、Agent、prompt、workspace 和存储。
8. `packages/pi-agent-server`：模型解析、工具注册、事件和恢复。
9. `packages/session-tools-core`：工具定义、sandbox、路径与凭证隔离。
10. `packages/ui`：包导出、共享组件和渲染行为。
11. `docs`、资源、测试和审计脚本。

每个差异都问五个问题：

1. Craft 原实现是什么？
2. MkAgent 为什么不能直接复用？
3. 差异是否只服务于 Lite 边界？
4. 是否能通过删除代码或外围 adapter 缩小 diff？
5. 是否有对应测试覆盖？

典型处理规则：

- Craft 保留功能缺失：优先复制 Craft 原文件或原逻辑。
- MkAgent 自有平行实现：能删除就删除，改为复用 Craft。
- 删除功能残留：沿完整依赖闭包物理删除。
- Host 差异：保留在 Electron、WebUI/headless 或 CLI 的宿主边界，不污染共享 core。
- 注释、日志和抽象：没有必要性证明就不新增。

### 4.5 阶段 E：UI 专项审核

UI 审核分为源码和运行时两部分。

源码门禁：

```bash
CRAFT_AGENT_SOURCE=/Volumes/SAMSUNG/workspace/agents/craft-agents-oss \
  bun run lint:craft-ui-sync
```

规则：

- Renderer 每个差异文件单独登记，不允许目录级 allowlist。
- 保留页面的组件树、状态、样式、图标、文案和交互以 Craft 为源。
- MkAgent 只删除排除入口或适配 Pi/Lite 接口。
- 不创建“看起来像 Craft”的替代组件。

运行时至少覆盖：

- All Sessions 展开/收起以及 Flagged、Archived 层级。
- Sessions、Skills、Settings、Workspace 导航。
- Appearance 的 mode、color themes、workspace themes、tool icons。
- Permissions 的默认规则和 workspace 自定义区域。
- What's New 打开、内容、关闭按钮和 Esc。
- Desktop 与 WebUI 的相同 retained 页面。
- 浏览器控制台和 Electron main/renderer 日志无新增错误。

不能只截一张静态图。下拉菜单、Dialog、切换开关、返回路径和错误状态都要操作。

### 4.6 阶段 F：测试覆盖对齐

执行：

```bash
CRAFT_AGENT_SOURCE=/Volumes/SAMSUNG/workspace/agents/craft-agents-oss \
  bun run lint:craft-test-coverage
```

每个 Craft 测试只能属于以下一种情况：

1. 同路径保留，且 case 数不少于经过审核的预期。
2. 因品牌或 Lite schema 使用明确登记的替代测试。
3. 对应功能已物理删除，测试随之删除并登记原因。

不得：

- 用一个宽泛的新测试替代多个上游测试。
- 因测试失败而删除保留功能的测试。
- 只比较文件名，不比较 case 数。
- 将失效测试标记 skip 后宣称对齐。

### 4.7 阶段 G：分层验证

先执行快速反馈，再执行完整门禁：

```bash
# 快速检查
git diff --check
bun run typecheck:all

# 三项 Craft 对齐门禁
CRAFT_AGENT_SOURCE=/Volumes/SAMSUNG/workspace/agents/craft-agents-oss bun run audit:craft-reuse
CRAFT_AGENT_SOURCE=/Volumes/SAMSUNG/workspace/agents/craft-agents-oss bun run lint:craft-ui-sync
CRAFT_AGENT_SOURCE=/Volumes/SAMSUNG/workspace/agents/craft-agents-oss bun run lint:craft-test-coverage

# 完整自动化验证
bun run test
bun run validate:ci
CRAFT_AGENT_SOURCE=/Volumes/SAMSUNG/workspace/agents/craft-agents-oss bun run lint

# 构建闭包
bun run electron:build
bun run webui:build
bun run cli:build
bun run server:build:subprocess
bun run server:build
```

验证层次及其作用：

| 层次 | 能发现的问题 |
|---|---|
| diff/残留扫描 | 空白错误、旧品牌、意外文件和凭证字面量 |
| typecheck | 跨包接口、DTO 和宿主接线错误 |
| unit/integration | 状态、持久化、协议、权限和回归行为 |
| isolated tests | 模块缓存、Electron mock 和全局状态隔离问题 |
| production build | 资源、导出、bundle 和跨 workspace 闭包问题 |
| GUI smoke | 首次初始化、真实 RPC、交互、缓存和运行时错误 |
| 平台安装包 | 目标架构 runtime、签名、资源路径和安装行为 |

macOS 本地构建通过不能替代 Windows/Linux 安装包的实际验证。未执行的平台必须明确记录，不能笼统写成“三平台全部验证”。

### 4.8 阶段 H：提交前自检

提交前必须：

1. 停止本轮启动的 WebUI、Electron 和浏览器自动化进程。
2. 再次运行三项 Craft 对齐门禁和 `git diff --check`。
3. 检查未跟踪文件、构建产物和临时目录。
4. 扫描新增行中的 API key、token 和私有路径。
5. 确认 Craft 工作区未被修改。
6. 暂存后运行 `git diff --cached --check` 并复核 staged stat。
7. 提交后确认 MkAgent 工作区干净，并记录 commit。

提交应该按目的拆分：明确问题修复与全面审核修复分开，品牌机械替换与功能修改分开，避免不可审查的大杂烩。

## 5. 本轮全面审核结果

第二阶段提交：

```text
eac5792 fix: enforce file-level Craft parity
```

### 5.1 文件血缘

| 指标 | 结果 |
|---|---:|
| MkAgent 审核文件 | 1,299 |
| 与 Craft 同相对路径 | 1,238（95.3%） |
| 品牌归一后完全一致 | 764（58.8%） |
| Craft 派生差异文件 | 474 |
| MkAgent 独有文件 | 61 |
| 已审核 Craft-only 删除 | 627 |

### 5.2 Renderer

| 分类 | 数量 |
|---|---:|
| 归一化后完全一致 | 282 |
| 逐文件登记差异 | 101 |
| Renderer 总文件 | 383 |

### 5.3 Craft 测试覆盖

| 分类 | 数量 |
|---|---:|
| Craft 测试总数 | 373 |
| 同路径保留 | 246 |
| 品牌/Lite 替代 | 5 |
| 随删除功能排除 | 122 |
| 已审核同路径 case 减少 | 35 |
| 无解释缺失 | 0 |

### 5.4 最终测试与构建

| 验证 | 结果 |
|---|---|
| 普通测试 | 3,153 pass，11 个 Windows-only skip，0 fail |
| isolated tests | 37 pass，0 fail |
| 合计 | 3,190 pass，0 fail |
| `validate:ci` | 通过 |
| lint | 0 error；70 个 Craft 同源 React Hook warning |
| Electron/WebUI/CLI/Pi/headless server build | 通过 |
| WebUI 和 Electron GUI smoke | 通过 |

## 6. 本轮发现并修复的关键问题

- 恢复 Craft 原生 menu、thumbnail protocol、持久化语言和 menu 重建。
- 恢复配置 watcher 的嵌套主题、默认权限、错误处理、生命周期和连接 hash 去重。
- 修复 SessionManager 的队列消息、后台事件、错误持久化、cold metadata、分支回滚和持久化竞态。
- 恢复 workflow 事件字段和完成事件。
- 将 Git Bash 路径真实传入 Pi settings。
- 阻止 DeepSeek 及其他 provider key、LLM key 和 server token 进入 sandbox。
- 恢复 Craft 的 Browser、Skills、LLM tool 和 permissions 文档。
- 恢复 CLI retained 命令、TLS、超时、workspace 绑定、流输出和退出码。
- 修复 WebUI adapter 的 Git Bash、keep-awake、workspace 删除和新窗口 workspace query。
- 增加 WebUI 上传总量、单文件大小、临时目录 TTL 和清理。
- 对齐跨架构 Bun/uv 下载、校验、资源复制和运行时解析。
- 清理已经不存在的 UI 导出和只服务删除功能的包出口。

## 7. 后续每轮审核的完成定义

只有同时满足以下条件，才能宣称本轮审核完成：

- [ ] 已记录 Craft 固定 commit，Craft 工作区未被修改。
- [ ] MkAgent 所有准备提交的文件都进入血缘审计。
- [ ] 没有目录级宽泛豁免。
- [ ] 每个差异、独有和删除文件都有逐文件原因。
- [ ] 保留 UI 的源码检查和真实交互检查都通过。
- [ ] Craft 测试逐文件分类，case 减少均已审核。
- [ ] 删除功能的完整依赖闭包已清理。
- [ ] Desktop、WebUI、CLI 和 headless 的宿主差异没有泄漏到共享 core。
- [ ] 全量测试、isolated tests、typecheck、lint 和构建通过。
- [ ] GUI 控制台和主进程日志无新增错误。
- [ ] 未执行的平台、签名、外部服务或真实账号验证已明确披露。
- [ ] 提交后工作区干净，提交 hash 已记录。

## 8. 核心经验

1. “文件来自 Craft”必须由路径、内容和固定基线证明，不能靠印象。
2. 对齐的最小可信单位是单个文件，功能验收的最小可信单位是完整依赖闭包。
3. 保留功能优先恢复 Craft 原实现；Lite 应做减法，不应创建平行实现。
4. UI 可见不等于功能可用，必须验证默认数据、RPC 和首次启动初始化。
5. 测试文件数量不等于覆盖对齐，必须检查 case 数和删除原因。
6. Core 与宿主专属 handler 必须分层，否则容易出现缺失或重复注册。
7. 真实 GUI 冒烟必须检查控制台；静态截图和构建不足以发现运行时断链。
8. 旧进程、旧 profile 和缓存会制造假结论，测试环境必须可识别、可隔离、可清理。
9. 每次代码修改都会使旧哈希结论失效；最终修复后必须重新跑全部审计门禁。
10. “全部通过”只能描述实际执行的范围，未运行的平台和外部 provider 必须单独说明。

## 9. 2026-07-30 LLM 订阅 OAuth 恢复审核

本轮在 `dev/llm_oauth` 分支恢复 ChatGPT Plus 与 Claude Pro/Max 订阅登录，继续保持唯一 Agent backend 为 Pi。实现直接复用 Craft 的 ChatGPT/Claude OAuth、PKCE、callback 页面、onboarding 和凭据结构，只在 MkAgent 品牌、宿主边界以及 Pi OAuth 凭据刷新回写处做必要定制。未恢复 Claude Agent SDK、GitHub Copilot、Sources、MCP 或通用 OAuth。

### 9.1 依赖闭包检查

- Desktop：恢复 Craft 的 Claude code flow 与 ChatGPT localhost callback；OAuth 凭据按 LLM connection slug 安全存储。
- WebUI：可使用服务器已有的 OAuth connection；新的 ChatGPT localhost 登录仍明确限制在 Desktop，Claude 保留手工 code flow。
- Pi：父进程向子进程传递完整 OAuth credential；Pi 刷新 access token 后回写 MkAgent 凭据存储，并在后续 prompt、mini query 和 query 前同步最新值。
- 产品边界：内置 connection 只有 Claude、ChatGPT 和 Pi API key；没有 Copilot、Sources/MCP 或 Claude SDK backend。

### 9.2 自动化结果

| 验证 | 结果 |
|---|---|
| 普通测试 | 3,176 pass，11 个 Windows-only skip，0 fail |
| isolated tests | 37 pass，0 fail |
| `typecheck:all` / `validate:ci` | 通过 |
| Craft 文件血缘 | 1,332 个 MkAgent 文件；1,246 个同路径；770 个归一化一致；476 个登记差异；86 个 MkAgent-only；619 个审核删除 |
| Craft UI 血缘 | 283 个归一化一致，101 个逐文件登记差异，384 个 Renderer 文件 |
| Craft 测试覆盖 | 373 个 Craft 测试全部分类；246 同路径、5 替代、122 随删除能力排除；31 个 case 减少已审核 |
| lint | 0 error；70 个既有 React Hook warning |
| Electron / WebUI / CLI / Pi subprocess / headless server build | 通过 |

### 9.3 未执行范围

- 没有使用真实 ChatGPT 或 Claude 账号完成外部 OAuth 登录和实际模型请求；该验证需要用户账号与浏览器交互。
- 本地桌面自动化命令 `orca` 不可用，因此没有执行设置页点击和 callback 后的 GUI smoke；本轮 UI 结论来自 Craft 文件血缘门禁、Renderer 构建、类型检查和 onboarding/RPC 测试。
- 没有构建或运行 Windows/Linux 安装包，也没有执行签名、公证与发布验证。
