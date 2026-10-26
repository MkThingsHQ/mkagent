# 上游同步

MkAgent 的架构、UI 与运行时继承自 [Craft Agents OSS](https://github.com/craft-ai-agents/craft-agents-oss)。本文定义在 Lite 边界内吸收新 Craft 变更的工作流。

## 当前基线

| 项 | 值 |
|---|---|
| 仓库 | `craft-ai-agents/craft-agents-oss` |
| Tag | `v0.15.6` |
| Commit | `8df01c5d0ac73c35add5954e6f190ce038d35845` |

## 最近一次上游评估

| 项 | 值 |
|---|---|
| 评估日期 | `2026-10-26` |
| 上游 Tag | `v0.15.6` |
| 上游 Commit | `8df01c5d0ac73c35add5954e6f190ce038d35845` |

MkAgent 0.2.6 **仅同步 v0.15.5 → v0.15.6**。[逐路径清单](../sync/0.15.6-inventory.json)覆盖全部 93 个改动路径；[验证记录](../sync/0.15.6-validation.md)区分自动化、真实 Pi 链路与界面 fixture。

Coding 会话新增 `pr_status`、`pr_bind`、`pr_unbind`、`pr_set_auto_merge`。状态优先复用 header 快照，其他会话只读缓存；绑定先验证，`gh pr create` 后自动绑定额外 PR。自动合并只在用户明确要求时改变，使用仓库允许的方法。Pi 注册、执行入口及 Explore 权限均保留模式过滤。

多 PR 卡片组合当前分支与 pinned PR，支持 tabs、溢出 +N、左右键、紧急状态、复制链接与 Unpin。pinned PR 的修复提示明确使用已有 worktree、新 worktree 或独立 clone，保留当前目录分支及未提交内容。Auto 仅适用于本分支 PR，由用户主动开启；应用运行且计算机唤醒时每五分钟检查可信 owner/member/collaborator 的新评审反馈，过滤自己的回复。服务端调度独立于窗口，记录去重游标、重启恢复，停用/删除/退出时清理；异步查询返回后重新核实权限、开关与实际 checkout。评论视为不可信数据，不因评论执行命令或打开链接，不扩大 push/comment/merge/auto-merge 授权。

本机仓库递归四层搜索，跳过 node_modules、Library、隐藏目录及工作区数据，遇仓库停止、避免 symlink 循环，合并 worktree/bare 仓库；两秒总预算覆盖遍历与 Git 查询，支持 ~ 路径。已开始会话切换 Coding mode 立即创建新会话，后台总结，首条消息最多等待 30 秒，顺序队列、取消、失败、超时、删除与迟到总结均隔离。

保留 MkAgent 品牌、本地配置、Pi 1.1.0，以及 v0.15.4/0.15.5 和此前全部已同步能力。Claude 配置转发修复按段评估：Pi 已整包传递配置、使用 SDK 图片缩放和既有 compaction/context 计量，新增回归验证，不恢复 Claude SDK。Sources/MCP OAuth relay、Pages、Projects/conductor、Automations 产品、公开分享、labels/custom statuses、messaging 仍排除；Decision/Guarded 继续暂缓。PR Auto review fix 属于本次明确接入的 Coding 功能。

```bash
# 仅操作独立的临时参考副本，已有参考目录保持只读。
git clone --no-checkout https://github.com/craft-ai-agents/craft-agents-oss.git /tmp/craft-v0156
git -C /tmp/craft-v0156 fetch origin refs/tags/v0.15.6
git -C /tmp/craft-v0156 checkout --detach 8df01c5d0ac73c35add5954e6f190ce038d35845
export CRAFT_AGENT_SOURCE=/tmp/craft-v0156
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
