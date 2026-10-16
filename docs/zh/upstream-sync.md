# 上游同步

MkAgent 的架构、UI 与运行时继承自 [Craft Agents OSS](https://github.com/craft-ai-agents/craft-agents-oss)。本文定义在 Lite 边界内吸收新 Craft 变更的工作流。

## 当前基线

| 项 | 值 |
|---|---|
| 仓库 | `craft-ai-agents/craft-agents-oss` |
| Tag | `v0.15.0` |
| Commit | `20e98eed968b9663d80f9efd40c10d363ea0b781` |

## 最近一次上游评估

| 项 | 值 |
|---|---|
| 评估日期 | `2026-10-16` |
| 上游 Tag | `v0.15.0` |
| 上游 Commit | `20e98eed968b9663d80f9efd40c10d363ea0b781` |

MkAgent 0.2.0 从 v0.14.1 基线（`332533f3096d12500012fe089c3f155e32af1c44`）同步到 v0.15.0，不包含 v0.15.1/v0.15.2 的后续变更。[逐路径评估清单](../sync/0.15.0-inventory.json)记录本版本全部变更的处理；[验证报告](../sync/0.15.0-validation.md)记录测试、启动与验证边界。

界面采用导航画布与连体纸张面板、固定侧栏页脚、统一列表网格、会话头部操作、安静的工作日志与回答尾部、内凹代码与 diff、Shell 运行按钮、带权限/模型/上下文标签的浮起输入框、单列设置/详情、弹窗与通知、动效偏好和对比度主题。手机 WebUI 保留触摸目标、较大的输入字号及键盘可用高度。Lite 会话头部和列表删除可配置状态、标签及项目控件，不恢复对应产品模块。

Pi 及配套依赖固定为 1.1.0，同步 Sonnet/Haiku 5.5、GPT-6.1 Sol 目录，Luna/Haiku/Flash 小模型路由，Cloudflare AI Gateway，Azure provider 映射与端点热更新，工具失败状态，以及主会话/工具会话扩展加载隔离。Pi 原生 Bash 没有 Claude 的后台参数，因此在现有权限检查之后增加适配：使用 Pi Bash 实现执行命令，由独立 AbortController 管理每项任务并写入实时输出文件；停止时不再扫描全局命令行。运行中和完成任务使用上游新任务标签及输出面板。Windows 不支持透明材质时退回不透明窗口，保留带空格路径、WebUI 登录样式、深链接和工作区 slug 路由修复。

继续排除 Decision model/Guarded、Claude SDK 及其 Source 工具修复、Sources/MCP、Pages/Claude artifacts、Projects/任务编排、Automations/时区与失败钩子、公开分享、标签/自定义状态和消息集成。凭据提示取消属于已裁剪的 Sources 授权界面；本地 LLM OAuth/API key 设置仍由 MkAgent 保留测试覆盖。新会话建议使用本地文件、新闻和 Skills，不展示不可用的邮箱/Source 设置。

```bash
# 仅操作独立的临时参考副本，已有参考目录保持只读。
git clone --no-checkout https://github.com/craft-ai-agents/craft-agents-oss.git /tmp/craft-v0150
git -C /tmp/craft-v0150 fetch origin refs/tags/v0.15.0
git -C /tmp/craft-v0150 checkout --detach 20e98eed968b9663d80f9efd40c10d363ea0b781
export CRAFT_AGENT_SOURCE=/tmp/craft-v0150
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
