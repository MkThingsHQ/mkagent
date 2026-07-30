# MkAgent UI 对齐复盘与后续实施规范

> 2026-07-30 补充：订阅入口边界已调整为仅恢复 Craft 的 Claude Pro/Max 与 ChatGPT Plus 卡片、凭证步骤和状态交互；不恢复 Copilot 或 Sources UI。仍遵循本文的“直接复用完整保留闭包，外围只做最小 Pi-only 适配”原则。

## 1. 文档目的

本文复盘 MkAgent 从 MVP 到三轮 Craft Agent UI 对齐的实施过程，解释前两轮反复出现视觉和交互偏差的原因，记录第三轮源码复用带来的改进及新暴露的范围问题，并形成后续 UI 开发必须遵守的实施和验收规范。

本文所说的“对齐”包含四个层面：

1. **源码对齐**：保留功能的 UI 组件、布局、样式、图标、交互和文案直接来自 Craft，不重新实现相似版本。
2. **视觉对齐**：三栏结构、尺寸、间距、背景、分割线、图标、按钮、菜单、输入框和设置控件与 Craft 一致。
3. **功能对齐**：保留界面的操作流程和状态变化可用，不只是静态外观相似。
4. **范围对齐**：MkAgent 明确排除的功能必须从源码、路由、接口、文案和测试中物理删除，不能只隐藏入口。

最终原则是：

> 保留的功能直接复用 Craft 源码；排除的功能完整删除；MkAgent 只在产品标识、Pi-only 后端和确有必要的接口边界上做少量定制。

## 2. 产品边界与基线

### 2.1 上游基线

- 参考仓库：`/Users/javayhu/workspace/agents/craft-agents-oss`
- 已记录基线：Craft Agent `v0.11.2` / `a60ebc1a5a7c`
- Craft 是 UI 布局、组件、图标、主题、交互、设置顺序和中英文文案的唯一来源。
- Echo、XAgent 等仓库只能用于理解改造方式，不能作为 MkAgent UI 的实现来源。

### 2.2 MkAgent 保留范围

- Electron Desktop、WebUI、CLI 和 headless server
- 三栏应用框架和可拖动布局
- Sessions、Skills、Settings、Workspace
- Pi Agent、API Key、自定义模型连接和 Ollama
- Chat、权限模式、模型选择、附件、Browser 和文档工具
- 主题、快捷键、自动更新等仍在产品范围内的设置

### 2.3 MkAgent 排除范围

- Claude backend 和订阅/OAuth 登录
- Messaging
- Automations 和 scheduler 产品界面
- Labels 和用户自定义 Statuses
- Projects 和 Kanban
- Sources 和 MCP
- Viewer、公开分享、远程 Workspace
- 图片生成

“排除”表示物理删除，而不是：

- 在 JSX 中写 `false && ...`
- 使用 feature flag 隐藏入口
- 从导航列表中过滤掉入口
- 保留路由、组件和 Hook，但让接口返回空数组
- 用 no-op 或 unavailable stub 维持已删除模块的初始化

## 3. 对齐过程复盘

### 3.1 MVP 阶段：实现了产品流程，但 UI 只是 Craft 风格

MVP 首先完成了 Pi-only 的 Desktop/WebUI/CLI、WebSocket RPC、会话、Skills、Browser、设置和打包能力，并建立了一个简化的三栏界面。

这一阶段的问题是把“参考 Craft”理解成了“实现一个 Craft 风格界面”。虽然使用了相近的布局、颜色和命名，但组件结构、状态组织和交互细节并非直接来自 Craft。因此，肉眼看起来接近，实际在大量细节上不同。

典型偏差包括：

- 三栏背景层级、圆角、顶部分割线和窗口标题栏关系不同。
- 左栏和中栏宽度及拖动行为不完整。
- Session item、Skill item、空状态和标题区域由 MkAgent 自己组织。
- Chat header、菜单、分享/关闭按钮、输入框、权限模式和模型选择器没有使用 Craft 的完整组合。
- 设置页只模仿外观，控件宽度、下拉菜单、顺序、行高和说明文字持续漂移。
- MkAgent 新增了 Craft 中不存在的入口和文案，例如 Running、New session、No messages yet 等。

经验：**设计语言相似不等于 UI 对齐。** 当目标是像素、交互和文案都以现有产品为准时，重新实现必然会产生大量局部决策，而每个局部决策都会成为偏差源。

### 3.2 第一轮对齐：`c7f9aa9 feat(electron): align Lite UI with Craft`

这一轮修改了 68 个文件，新增约 9,659 行，主要引入或调整了：

- `LeftSidebar`、`PanelHeader`、`TopBar`
- Craft 风格图标
- Settings 的 Row、Section、Select、Toggle 等基础组件
- 部分布局和主题处理

改进点是开始复用 Craft 的局部组件和视觉原语，但应用的主框架、页面组合和状态流仍以原 MkAgent 实现为中心。结果是基础控件更像 Craft，整体结构仍不是 Craft。

主要问题：

- 以文件或控件为单位迁移，没有以完整用户界面和依赖闭包为单位迁移。
- 只替换可见组件，没有同步 Craft 的父容器、状态 Hook、路由和组合逻辑。
- 混合使用 Craft 组件和 MkAgent 自定义组件，产生新的尺寸、属性和行为差异。
- 缺少逐页面、逐状态的视觉回归验证。

经验：**不能只复制叶子组件。** 一个按钮或列表项的最终表现由上层布局、上下文、状态、主题 token 和相邻组件共同决定。缺少其中任何一层，都可能造成“代码来自 Craft，但界面仍不一样”。

### 3.3 第二轮对齐：`526d455 feat: align MkAgent UI with Craft`

这一轮修改了 42 个文件，新增约 2,384 行，继续补充：

- Session、Sidebar、Skill 菜单
- WorkspaceSwitcher
- `CraftChatInput`
- Info 页面组件
- Settings segmented control、textarea 和多个设置页
- ThemeContext 和 local storage

这一轮覆盖了更多界面，但仍采用“看着 Craft 源码，再在 MkAgent 中组装相似实现”的方式。`CraftChatInput` 之类的新组件名称带有 Craft，但并不等于复用了 Craft 原始输入区的完整组件树和状态逻辑。

最终仍出现了用户反馈中的系统性偏差：

- New Session 图标、侧边栏入口和多余 Running 不一致。
- 三栏宽度不能拖动，背景和顶部边界不一致。
- 会话列表 item、筛选按钮、导入/导出按钮和文案不一致。
- Chat 标题、菜单、分享/关闭按钮、空状态 logo 和底部输入区不一致。
- Skill item 图标和详情页编辑按钮位置不一致。
- Settings 的宽度、下拉样式、设置项顺序、About 布局、Connection 流程、Workspace icon、默认模式和快捷键文案不一致。

这些不是孤立 bug，而是实施方法错误的结果：MkAgent 仍在为每个界面重新做产品和视觉决策。

经验：**“参考源码实现”仍然是重新实现。** 只要本地存在一套独立的页面结构和交互逻辑，后续就会不断追赶 Craft，且每次 Craft 更新都会扩大维护成本。

### 3.4 第三轮对齐：`a12f513 feat(electron): reuse Craft renderer for UI parity`

这一轮修改了 555 个文件，目标从“模仿”改为“直接复用”：

- 迁移 Craft renderer 的组件、页面、Hook、状态、样式、测试和资源。
- 将包 scope 从 `@craft-agent/*` 规范化为 `@mkagent/*`。
- 将协议和数据目录等产品标识改为 MkAgent。
- Electron 与 WebUI 复用相同 renderer 和兼容适配层。
- 增加 `scripts/check-craft-ui-sync.ts` 检查复制文件是否偏离 Craft。
- 通过真实应用检查三栏拖动、Sessions、Skills、Settings 和 Add Connection。
- 当轮完整测试记录为 2,980 passed、11 个 Windows-only skipped、0 failed；Electron/WebUI 构建、相关 typecheck 和 UI sync 检查通过。

这轮解决了前两轮最核心的问题：保留界面的组件树和交互不再由 MkAgent 独立设计，三栏、列表、详情、设置和输入区能够随 Craft 源码整体迁移。

但这轮又暴露了另一个方向的问题：为了让完整 Craft renderer 运行，保留了大量 MkAgent 不需要的 UI 源码，并通过以下方式隐藏或托底：

- `product-profile.ts` 过滤侧边栏和设置入口，并关闭 Sources 和 Kanban 的可见入口。
- `craft-renderer-compat.ts` 为 Sources、Projects、Automations、Labels、Statuses、Messaging 等缺失能力返回空值或 no-op。
- `check-craft-ui-sync.ts` 默认校验几乎整个 Craft renderer，客观上鼓励继续保留排除功能的源码。

因此第三轮的状态是“UI 源码复用基本正确，产品范围裁剪不正确”。它满足了视觉对齐，但没有满足原计划中“物理删除排除功能”的要求。

经验：**直接复用不等于全量复制。** 正确单位应是“保留功能及其依赖闭包”，而不是整个上游 renderer。对于排除功能，隐藏和空实现会增加 bundle、类型、路由、文案、测试和未来同步负担，也可能让不可用入口通过深链或状态恢复重新出现。

## 4. 根因总结

### 4.1 前两轮：复用粒度太小

- 复制了控件，没有复制完整页面。
- 复制了页面外观，没有复制状态和交互。
- 复制了局部样式，没有复制布局约束。
- 参考了文案，没有把 Craft locale 当成唯一来源。
- 依靠人工目测，没有建立自动差异检查。

### 4.2 第三轮：复用范围太大

- 把完整 renderer 当成复用单位，带回了排除功能。
- 用运行时 profile 代替源码裁剪。
- 用兼容 stub 掩盖无效模块仍在初始化的问题。
- 同步脚本验证“是否全量保留 Craft”，而不是验证“保留部分是否与 Craft 一致”。

### 4.3 共同问题：没有先建立可审计的界面清单

实施前没有把以下内容逐项映射：

- 用户可见页面和状态
- Craft 源文件及依赖闭包
- MkAgent 是否保留
- 是否允许定制及定制原因
- 对应功能接口
- 对应自动化测试和视觉用例

缺少这份清单后，前两轮容易漏迁，第三轮又容易迁入过多内容。

## 5. 后续 UI 对齐的正确流程

### 5.1 第一步：固定上游版本和功能矩阵

每次同步前记录：

- Craft tag 和 commit SHA
- 本次涉及的页面和组件
- MkAgent 保留/删除功能矩阵
- 上一基线到新基线的上游差异

未更新功能矩阵前，不得因为 Craft 新增了入口就自动带入 MkAgent。

### 5.2 第二步：建立源码 allowlist，而不是运行时 feature profile

为每个保留界面记录 Craft 源文件和必要依赖，例如：

| 界面 | Craft 源码范围 | MkAgent 策略 |
| --- | --- | --- |
| 三栏 AppShell | Panel、PanelSlot、ResizeSash、保留导航所需 AppShell 逻辑 | 原样复用；仅删除排除导航分支 |
| Sessions | SessionList、SessionItem、SessionMenu、搜索和筛选依赖 | 原样复用；删除 Labels/Projects 等筛选分支 |
| Chat | ChatPage、ChatDisplay、InputContainer、FreeFormInput | 原样复用；仅适配 Pi 能力和删除排除入口 |
| Skills | SkillsListPanel、SkillInfoPage、相关菜单和图标 | 原样复用并连接现有 Skills API |
| Settings | Navigator 和保留的设置页 | 原样复用；注册表中物理删除排除页面 |

同步脚本只校验 allowlist 中的保留文件。对于必须修改的上游文件，维护明确的 override 清单，记录：

- 上游文件
- 修改原因
- 最小 diff
- 对应测试
- 是否可以通过外围 adapter 取代修改

### 5.3 第三步：物理删除排除功能

按一个功能一个提交的方式删除，并检查完整依赖链：

1. 导航入口和菜单。
2. 页面、Dialog 和组件。
3. Route、navigation state 和 deep link。
4. Atom、Context、Hook 和初始化副作用。
5. preload/API 类型、RPC channel 和 handler。
6. shared DTO、schema 和 storage 字段。
7. i18n 文案、图标和静态资源。
8. 仅服务该功能的测试和依赖。

删除后执行残留扫描。搜索命中必须逐条分类，不能看到界面已隐藏就认为删除完成。

### 5.4 第四步：兼容层只处理真实差异

兼容层可以处理：

- Electron 与 WebUI 的宿主能力差异。
- `@craft-agent` 到 `@mkagent` 的包名变化。
- `craftagents://` 到 `mkagent://` 的协议变化。
- `.craft-agent` 到 `.mkagent` 的数据目录变化。
- Craft UI 所需接口与 MkAgent Pi-only 后端之间、且属于保留功能的字段映射。

兼容层不得处理：

- 为已删除功能返回空数组。
- 为已删除功能注册 no-op listener。
- 让不属于 MkAgent 的页面“能挂载但不可用”。
- 吞掉错误并伪装成功。

如果 renderer 仍要求某个排除功能的接口，说明该功能依赖尚未删除干净。

### 5.5 第五步：文案只来自 Craft

- 保留界面默认直接复制 Craft 的 `en` 和 `zh-Hans` locale key/value。
- 禁止新增解释性空状态、按钮、标签和状态名称。
- 产品名必须替换时，优先改写为不含产品名称的中性文案。
- 只有 MkAgent 独有功能才允许新增 key，并在评审中单独列出。
- CI 同时检查 locale key parity、排序、废弃 key 和新增 key allowlist。

### 5.6 第六步：按界面闭环功能，而不是一次复制整个目录

建议顺序：

1. AppShell、主题和三栏 resize。
2. Sessions 列表与 Chat 详情。
3. Chat input、权限模式和模型选择。
4. Skills 列表与详情。
5. Settings navigator 和保留设置页。
6. Workspace switcher 和配置流程。
7. Browser、附件、预览等次级界面。

每一项都必须完成源码复用、接口连接、文案、测试和视觉验证后再进入下一项，避免最后集中发现跨页面偏差。

## 6. 验收标准

### 6.1 源码验收

- allowlist 中未声明 override 的文件与固定 Craft 基线完全一致，仅允许机械化产品标识替换。
- 不存在 MkAgent 自己实现的 Craft 平行组件，例如 `CraftXxx` 但内部不是 Craft 原组件的情况。
- override 数量保持最小，并能说明每一处差异的必要性。
- 排除功能的组件、路由、API、文案、资源和测试均无残留。

### 6.2 视觉验收

至少对以下状态进行 Craft/MkAgent 同尺寸截图对比：

- 空会话、普通会话、运行中、权限请求和错误状态。
- 左栏展开/收起，中栏最小/默认/最大宽度，右栏不同内容。
- Session 搜索、筛选、item hover/selected/menu。
- Skill 列表、详情和编辑状态。
- App、AI、Appearance、Input、Workspace、Permissions、Shortcuts、Preferences。
- Add Connection 的完整流程。
- Light、Dark、System 和各主题 preset。
- 中文和英文。

不能只验证首页截图。菜单、popover、dialog、select、tooltip、hover、focus、disabled 和 loading 都属于 UI 对齐范围。

### 6.3 交互验收

- 左栏和中栏可拖动，宽度持久化，最小/最大范围与 Craft 一致。
- Session 新建、打开、重命名、删除、筛选、分享/关闭等保留操作可用。
- Chat 标题、菜单、权限模式、模型选择、发送、停止和附件行为可用。
- Skills 的选择、查看、导入和编辑流程可用。
- Settings 保存、刷新后恢复、默认值和依赖项行为与 Craft 一致。
- Electron 与 WebUI 使用同一 renderer 时都能完成上述操作。

### 6.4 自动化验收

每次 UI 同步至少运行：

- Craft UI 源码同步检查。
- 排除功能残留扫描。
- renderer 单元和交互测试。
- Electron main/preload/renderer build。
- WebUI build。
- Electron/shared typecheck。
- i18n parity、排序和新增文案检查。
- `git diff --check`。

高风险页面应增加截图或基于浏览器的回归测试。测试必须验证用户操作和最终状态，不能只断言组件成功渲染。

## 7. 当前实现需要纠正的事项

第三轮对齐已经提交，但仍需进行一次“保留源码不漂移、排除功能真删除”的收敛：

1. 将 `scripts/check-craft-ui-sync.ts` 从“几乎整个 renderer”改为显式保留文件 allowlist。
2. 按功能删除 Sources、Projects/Kanban、Automations、Labels/Statuses、Messaging 等 UI 依赖。
3. 删除对应 route、atom、hook、dialog、playground、图标、sample asset、i18n 和测试。
4. 删除 `product-profile.ts` 中用于隐藏已排除功能的配置；如果最终仍保留该文件，只能描述真实产品差异，不能承担功能删除职责。
5. 收缩 `craft-renderer-compat.ts`，移除所有针对排除功能的空实现和 no-op listener。
6. 检查静态 import 和构建产物，确保排除模块没有被打包。
7. 对保留界面重新执行源码、视觉、交互和自动化四层验收。

这轮收敛不能再次退回“自己重写简化 UI”。当 Craft 的中心文件同时包含保留和排除功能时，应以 Craft 文件为基线做最小删除，并在 override 清单中记录差异。

## 8. 禁止事项

- 禁止根据截图猜测组件并重新实现。
- 禁止创建与 Craft 同用途的平行组件。
- 禁止新增 Craft 中不存在的按钮、状态、空状态和说明文案。
- 禁止只复制样式而忽略父容器和状态逻辑。
- 禁止用配置、feature flag、CSS、空数据或 no-op 冒充功能删除。
- 禁止为了让全量 Craft renderer 启动而扩大 MkAgent 后端接口。
- 禁止在没有差异清单和测试证据时批量同步新上游版本。
- 禁止只用 build/typecheck 代替真实 UI 和交互验证。

## 9. 提交与评审要求

- 每个提交只处理一个完整界面或一个排除功能，避免将大规模源码同步、产品裁剪和功能修复混在一起。
- 提交说明必须列出上游基线、复用文件、override、删除内容和验证结果。
- 评审按用户可见能力组织，不按文件数量描述完成度。
- 对每个差异明确标记为：
  - Craft 原样复用
  - 机械化产品标识替换
  - Pi-only 必要适配
  - MkAgent 产品范围删除
- 任何无法归入以上四类的 UI 改动都应默认拒绝，除非用户明确提出新的产品需求。

## 10. 最终经验

本次对齐最重要的经验不是“多比较几次截图”，而是要同时控制复用粒度和产品边界：

- 粒度过小，会变成模仿 Craft，持续产生视觉和交互偏差。
- 范围过大，会把 MkAgent 不需要的 Craft 产品功能和维护负担全部带回来。
- 正确做法是以保留功能的完整依赖闭包为单位直接复用，以明确 allowlist 管理上游同步，以物理删除落实产品范围，并用源码、视觉、功能和自动化四层证据完成验收。

后续所有 MkAgent UI 工作都应以本文为准，不再采用“先自行实现，再反复对齐”的方式。
