# 功能矩阵

本文档记录 MkAgent 相对上游基线**刻意**划定的产品边界。与 Craft Agents 的技术侧对比(含安装包体积)见 [`comparison-with-craft.md`](./comparison-with-craft.md)。

## 保留能力

- Electron Desktop、WebUI、CLI、headless server、共享 renderer、WebSocket RPC
- Pi agent backend、API key 模型连接，以及 ChatGPT Plus / Claude Pro/Max 订阅
- 自定义 OpenAI-兼容与 Anthropic-兼容端点,以及 Ollama
- 本地多 workspace 与 `default` workspace
- 会话(create / continue / cancel / resume / search / rename / delete / flag / archive / unread / import-export / branch / multi-window)
- Skills、mini chat、plan、annotations、follow-up
- Browser 面板 + `web_search` + `web_fetch`
- Desktop 专用 OpenConnector `v1.3.5` sidecar、Providers/Actions/Runs 控制台与五个固定 Pi 工具
- 附件与文档工具
- 权限(Explore/safe、Ask、Execute/allow-all)、网络代理、主题、英文与简体中文
- 自动更新与 Sentry 集成(以 `SENTRY_ELECTRON_INGEST_URL` 为门控)

## 删除能力

- Claude Agent SDK backend
- GitHub Copilot，以及两种保留 LLM 订阅之外的全部 OAuth
- 外部 messaging channel 与 worker
- 产品 Automations 与定时任务
- 会话 labels 与用户自定义 status
- Projects 与 Kanban
- 通用 Sources(API Source、MCP Source)、用户可配置的 MCP pool 与 Craft 的 session/bridge MCP server；定向 OpenConnector 集成没有恢复这些能力
- Viewer app、公开分享、远程 workspace
- 图片生成(`gen_image`)

## 引用策略

从 Craft 保留的模块沿用上游目录布局、公开命名、代码风格与测试。产品专属标识替换为 MkAgent(`@mkagent/*`、`~/.mkagent`、`MKAGENT_*`、`mkagent://`、`app.mkagent.desktop`)。OpenConnector 则跟随单独固定的 `vendor/open-connector` submodule。参考仓库只读。

## 数据锚点

以下数字是 2026-07-30 记录的 Craft 复用审计快照。它们早于 OpenConnector 集成，仅保留作对照；重新运行审计之前，不应把它们当作当前仓库或安装包数据。

| 指标 | MkAgent | 备注 |
|---|---:|---|
| 已跟踪 TS/TSX 源码行数 | 190,558 | 排除 `node_modules`、`dist`、`release`、`.git` |
| 相对 Craft 审计过的源文件数 | 1,163 | 见 [`comparison-with-craft.md`](./comparison-with-craft.md#1-仓库与源码规模) |
| 同路径率 | 96 % | 归一化后逐字一致 59 % |
| 顶层 `dependencies` 数 | 55 | 删去 6 个 backend / OAuth / MCP / Copilot 相关包 |
| 许可证 | Apache-2.0 | `NOTICE` 包含归属说明 |

## 边界校验

```bash
bun run audit:craft-reuse           # 1,116 / 1,163 同路径
bun run lint:craft-test-coverage    # 246 保留 / 6 替代 / 121 因边界剔除 / 0 无解释缺失
bun run lint:craft-ui-sync          # renderer 层 seam 检查
```

如果失败,说明 Lite 边界已经漂移——把 audit 描述同步上来,或者回滚出问题的修改。
