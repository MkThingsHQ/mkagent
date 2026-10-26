# 上游同步

MkAgent 的架构、UI 与运行时继承自 [Craft Agents OSS](https://github.com/craft-ai-agents/craft-agents-oss)。本文定义在 Lite 边界内吸收新 Craft 变更的工作流。

## 当前基线

| 项 | 值 |
|---|---|
| 仓库 | `craft-ai-agents/craft-agents-oss` |
| Tag | `v0.15.4` |
| Commit | `89e2d6a25fb1c5c46e27ecf8e8f9a744f5abc27b` |

## 最近一次上游评估

| 项 | 值 |
|---|---|
| 评估日期 | `2026-10-26` |
| 上游 Tag | `v0.15.4` |
| 上游 Commit | `89e2d6a25fb1c5c46e27ecf8e8f9a744f5abc27b` |

MkAgent 0.2.4 **仅同步 v0.15.3 → v0.15.4**。[逐路径清单](../sync/0.15.4-inventory.json)覆盖全部 133 个改动路径；[验证记录](../sync/0.15.4-validation.md)区分自动化、真实 Pi 和实际界面证据。不混入 v0.15.5/v0.15.6。

新增 Coding 会话标识、精简提示词与保留的编码工具筛选，支持 Workspace 默认值、CLI `--coding`、输入区 chip 和会话列表图标。对话开始后模式固定；切换会同步生成旧对话总结，在新会话首次发送时作为隐藏上下文注入，保留模型、连接、权限、思考级别和目录。偏好及 CLAUDE.md/AGENTS.md 保留。没有引入后续异步总结改造。

开启 Coding 后可选择已有目录或新建 worktree。列表合并近期目录、Workspace 默认目录下的直接仓库和 `gh repo list`；bare/多 worktree 按 common git dir 去重。远端仓库显式确认后 clone，新分支默认 `codex/<session id>`，从刷新后的默认分支创建独立目录。既有 dirty checkout 和分支保持原样；clone 临时目录、checkout 失败的本次分支/路径会清理。没有引入后续递归仓库发现。

PR 状态使用现有 `gh` 登录，显示 PR 状态、冲突、评审、checks 和本地未提交/未推送状态，详情含提交/检查/评审摘要。轮次结束及 Git refs 改变后刷新，按状态 15 秒–2 分钟轮询，隐藏时退订暂停。Resolve/Fix/Fix CI 仅发送本地修复提示，不自行 push、回复或合并 PR。窄屏标题让位给 PR 信息，移动端遵循上游不显示 PR 芯片；不恢复 labels/custom statuses。Git 分支查询异步执行，detached HEAD、错误/超时/空路径返回空。

保留 Pi 1.1.0、HEIC/HEIF、OpenCode Go、maxTokens、压缩窗口、Skills starters、用量、分支计费、浏览器/Stop 和本地配置。Claude SDK、Sources/MCP、Pages、Projects/conductor、Automations、公开分享、labels/custom statuses、messaging 仍排除，Decision/Guarded 继续暂缓。PR watcher 不依赖 Sources；没有引入多 PR、pr_bind/pr_status 或自动 review/merge。界面保留英文和简体中文。

```bash
# 仅操作独立的临时参考副本，已有参考目录保持只读。
git clone --no-checkout https://github.com/craft-ai-agents/craft-agents-oss.git /tmp/craft-v0154
git -C /tmp/craft-v0154 fetch origin refs/tags/v0.15.4
git -C /tmp/craft-v0154 checkout --detach 89e2d6a25fb1c5c46e27ecf8e8f9a744f5abc27b
export CRAFT_AGENT_SOURCE=/tmp/craft-v0154
```

当上游发布值得评估的新 tag 时:

1. 记录新 tag 与 commit:`git -C ../craft-agents-oss rev-parse HEAD && git -C ../craft-agents-oss describe --tags --always`。
2. 把 commit 加到本文件的 "当前基线" 表中。
3. 用新 commit 重新跑下面的步骤。

MkAgent 工作期间,参考 checkout(`../craft-agents-oss`、`../echo`、`../xagent`)保持只读。

## 同步流程

```text
  ┌──────────────────────────────────────────────────────────────────┐
  │ 1. 锁基线                                                          │
  │    git -C "$CRAFT_AGENT_SOURCE" checkout <commit>                  │
  │    git -C "$CRAFT_AGENT_SOURCE" status --short   # 必须干净          │
  │                                                                  │
  │ 2. 更新 audit                                                      │
  │    bun run audit:craft-reuse                                      │
  │       期望:所有差异均已审阅并登记                            │
  │    bun run lint:craft-test-coverage                              │
  │       期望:无解释缺失 = 0                                         │
  │                                                                  │
  │ 3. 逐文件接入上游变更                                              │
  │    每个改动 same-path 文件的 upstream commit:                     │
  │      classify:  STRICT_REUSE  |  LITE_SEAM  |  REMOVED_FEATURE    │
  │      STRICT_REUSE:   原样取文件,刷新哈希                          │
  │      LITE_SEAM:      手工合并,保留 MkAgent 定制缝                  │
  │      REMOVED_FEATURE: 不要导入,在 seam 里写明原因                 │
  │                                                                  │
  │ 4. 评估仅上游存在的新功能                                          │
  │      适配 MkAgent 范围 → mkagent migration-review issue           │
  │      不在范围       → 保持 MkAgent Lite                            │
  │                                                                  │
  │ 5. 校验                                                            │
  │    bun run typecheck:all                                          │
  │    bun run lint                                                   │
  │    bun run validate:ci                                            │
  │    bun run audit:craft-reuse    # 合并后哈希仍稳定                │
  │    bun run test                                                    │
  │    bun run electron:build                                         │
  │    bun run webui:build                                            │
  │    bun run cli:build                                              │
  │    bun run server:build:subprocess                                │
  │                                                                  │
  │ 6. 对全新 config dir 做 GUI smoke                                  │
  │    rm -rf /tmp/mkagent-smoke && CONFIG_DIR=/tmp/mkagent-smoke \│
  │       bun run electron:dist:dev:mac                              │
  │    + headless smoke: bun run server:dev:webui                     │
  └──────────────────────────────────────────────────────────────────┘
```

## 文件 seam 分类

| 类别 | 规则 | 校验方式 |
|---|---|---|
| `STRICT_REUSE` | 同相对路径,只有机械差异(scope、URL 协议、配置根、品牌字符串) | `audit:craft-reuse` 归一化后逐字一致 |
| `LITE_SEAM` | 同相对路径,但已删除对应排除功能的分支,或接到 MkAgent 专用接口 | 人工语义审 + 定向 unit/integration 测试 + typecheck |
| `REMOVED_FEATURE` | 因对应的产品能力已删除,整个文件从 MkAgent 中移除 | 路径、call site、build closure 与 `lint:craft-test-coverage` 标签 |

接入上游独有功能时,先过一遍 Lite 问题;只挑选适配 Lite 边界的功能。

## 覆盖清单

两份源真值文件记录哪些 MkAgent 文件相对 Craft 偏离:

- `scripts/craft-source-overrides.json`(跟踪所有 `apps/`、`packages/` 源文件)
- `scripts/craft-ui-overrides.json`(renderer 范围内的子集,112 条)

每次同步后,**必须**重新生成并审阅。`audit:craft-reuse` 通过的前提是偏离合理,而**不是**只为了通过检查去 bump 哈希。

## 不允许同步的内容

- Claude Agent SDK backend 与 `claude-agent-sdk*` 包；保留的 Claude OAuth 必须继续通过 Pi
- GitHub Copilot、通用 / Sources OAuth 及其 SDK
- 外部 messaging gateway 与 worker
- Sources、MCP server、bridge MCP server、相关 UI
- 图片生成模型与 `gen_image`
- 公开分享、Viewer app
- 产品 Automations 与 scheduler UI
- Sources API / Settings UI、会话 labels、用户自定义 status
- WhatsApp worker

以上都登记在 Lite 边界删除项中,详见 [`comparison-with-craft.md`](./comparison-with-craft.md) 与 [`migration/`](../migration/README.md)。

## 故障排查

| 症状 | 可能原因 | 处理 |
|---|---|---|
| `audit:craft-reuse` 报一个文件意外失配 | seam 修改后忘了刷新覆盖哈希 | 重新生成 `scripts/craft-source-overrides.json`,接受前再审一下差异 |
| `lint:craft-test-coverage` 出现 "missing" 标签 | 上游 test 移动 / 新增但没归类 | 在 `scripts/check-craft-test-coverage.ts` 中更新 seam 分类 |
| 同步后 `apps/electron/src/main` 单独报类型错 | 上游引入了新的环境变量或平台辅助 | 确认它能跨过 Lite seam,在提交前记录在文档中 |
| 打包后 renderer asset 404 | 新增上游 asset 但没更新 `scripts/copy-assets.ts` | 把 asset 加到 copy list 并重新构建 |
| `electron:build` 成功,但 `MkAgent Helper` 缺少某个 plugin | 确认 `appId` 是 `app.mkagent.desktop` 且 `extraResources` 只用 `@mkagent/*` 域 | 检查 `apps/electron/electron-builder.yml` |
