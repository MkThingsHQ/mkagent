# 上游同步

MkAgent 的架构、UI 与运行时继承自 [Craft Agents OSS](https://github.com/craft-ai-agents/craft-agents-oss)。本文定义在 Lite 边界内吸收新 Craft 变更的工作流。

## 当前基线

| 项 | 值 |
|---|---|
| 仓库 | `craft-ai-agents/craft-agents-oss` |
| Tag | `v0.15.8` |
| Commit | `1627c43e93bb4f5b1532116b8eb092c0ada4b23f` |

## 最近一次上游评估

| 项 | 值 |
|---|---|
| 评估日期 | `2026-11-14` |
| 上游 Tag | `v0.15.8` |
| 上游 Commit | `1627c43e93bb4f5b1532116b8eb092c0ada4b23f` |

MkAgent 0.2.7 同步 **v0.15.6 → v0.15.8**。上游没有独立 v0.15.7 标签或提交，其 MCP OAuth 发布说明随 v0.15.8 收录，仍不属于 Lite 范围。[逐路径清单](../sync/0.15.8-inventory.json)覆盖全部 153 个改动文件；[验证记录](../sync/0.15.8-validation.md)区分本地验证与尚未验证的行为。

子会话及分支按家族嵌套显示，可折叠并按工作区记忆；日期/未读分组、分页、键盘导航与多选保持家族完整。Coding 模式新增受设置控制的内置浏览器、Mermaid 校验、数据转换、LLM 子任务、spawn/get/list 会话工具，并复用标准模式的文档和预览说明。子会话继承目录、模型和 Coding 模式，权限继续限制在父会话范围内。

Pi 分支只从父会话派生一次，重启或工具变化后恢复自己的历史并保留分支截断点。代理工具整组替换，compaction 运行时延后重建。macOS HEIC 使用 ImageIO 转换为方向正确的 sRGB 图片，保留跨平台 fallback。会话发现采用有限并发的异步首行读取、云端逐出检测和超时，保留 MkAgent 对大型 PR 元数据完整读取首行的修复。Lite 管理器保留现有单一初始化等待机制，列表消费者仍等待磁盘加载完成。Explore 拒绝未知工具及隔离子代理，Monitor shell 命令遵循 Bash 权限检查。

保留 MkAgent 品牌与本地配置、Pi 1.1.0 及此前同步能力。Sources/MCP、Claude SDK 及其 refusal fallback、Pages、Projects、看板 Tasks、Automations、公开分享、messaging 仍排除；Decision/Guarded 继续暂缓。基线表示逐项审查范围，不表示完整 Craft 功能对等。

```bash
git clone --no-checkout https://github.com/craft-ai-agents/craft-agents-oss.git /tmp/mkagent-craft-0158
git -C /tmp/mkagent-craft-0158 checkout --detach 1627c43e93bb4f5b1532116b8eb092c0ada4b23f
export CRAFT_AGENT_SOURCE=/tmp/mkagent-craft-0158
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
