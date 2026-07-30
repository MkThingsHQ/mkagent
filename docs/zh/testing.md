# 测试

本地验证与 CI 遵循同一套边界。三层一起跑:unit / integration、isolated 子进程测试、确定性的 Pi 会话集成。每一层都是刻意选择的。

## 必需命令

```bash
bun run typecheck:all
bun run lint
bun run validate:ci
bun run test
bun run test:doc-tools
bun run electron:build
bun run audit:craft-reuse
bun run lint:craft-test-coverage
```

`bun run validate:ci` 是门禁:含 `typecheck:all`、shared package 定向套件(`test:shared:all`)、文档工具 smoke 测试(`test:doc-tools`)以及 i18n parity / sorted lint 检查。

## 测试分层

| 层 | 文件 | 覆盖范围 |
|---|---|---|
| Unit + integration | `bun test` 跑 `*.test.ts` | workspace 隔离、JSONL 持久化、import/resume、branch、unread/state 事件、Pi 注册、权限 schema、config migration、connection 变体、transport(success/error/reconnect/unknown channel)、session event/message/turn 分组、renderer parity |
| Isolated 子进程 | 全部 `*.isolated.ts`(CI 在独立进程中各跑一次) | 接触 `process.exit`、Bun 子进程边界或任何会在 worker 间泄漏的全局状态的测试 |
| 文档工具(Python) | `bun run test:doc-tools` | 八个 Python smoke 测试:`pdf_tool`、`xlsx_tool`、`docx_tool`、`pptx_tool`、`img_tool`、`ical_tool`、`doc_diff`、`markitdown`。通过 `apps/electron/resources/scripts/tests/` 中的 fixture 端到端跑包装器 |
| Pi 会话集成 | `packages/pi-agent-server` 的确定性 harness | 启动真正的 Pi 子进程,对接本地 OpenAI-兼容 SSE fixture,验证工具调用、工具结果、事件顺序、renderer 接线 |

## Hermeticity 规则

- 测试通过注入 `MKAGENT_CONFIG_DIR` 而不是读 `$HOME`。canonical 注入示例见 `packages/shared/src/config/__tests__/preferences-ui-language.test.ts`。
- 共享的 Prerequisite Manager 只保留 Browser 文档与 Skill 指令的 prerequisite。测试 setup 覆盖 `pathExists`、`browserToolEnabled`、`browserToolsDocPath`。
- 接触凭证层的测试用伪造的 `CredentialManager`;不会真写 keychain。
- 接触 network interceptor 的测试用 mock fetch;真 interceptor 只在 Electron main 加载。

## 覆盖率纪律

`bun run lint:craft-test-coverage` 走遍 Craft checkout 中的每个 test,并打上以下标签之一:

1. 同路径保留
2. 因 Lite / 品牌替换为等价测试
3. 因对应的产品功能已删除而剔除

"missing" 标签——悄悄消失的 test——是 lint 错误。当前快照:**246 保留 / 6 替代 / 121 因边界剔除 / 0 无解释缺失**。

## 构建验证

```bash
bun run electron:build           # main + preload + renderer + resources + assets
bun run webui:build              # vite 构建共享 renderer
bun run cli:build                # 输出 apps/cli/dist/mkagent
bun run server:build:subprocess  # packages/pi-agent-server/dist/index.js(约 3,655 个模块)
bun run electron:dist:dev:mac    # macOS arm64 dev .app,ad-hoc 签名
```

CI 额外在每个平台上跑 macOS、Windows、Linux 的未打包 desktop 构建,以及 headless assembly。macOS / Windows 签名 secret 受环境变量控制;**测试或构建失败必须与"未配置签名 secret"分开报告**。

## 干净 worktree 验证

```bash
git clone <this repo> /tmp/mkagent-clean
cd /tmp/mkagent-clean
bun install --force --frozen-lockfile
bun run validate:ci
bun run electron:build
bun run lint
bun run audit:craft-reuse
```

这就是记录 commit 上跑通完整门禁的例行脚本(见 `migration/migration-features.md`)。
