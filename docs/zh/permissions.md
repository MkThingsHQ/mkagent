# 权限

Pi 工具调用都经过统一的权限引擎。这里没有 Source / MCP 专属规则——那些产品不属于 MkAgent。

## Mode

| Mode | 行为 |
|---|---|
| `safe` | 只读策略默认通过;一旦写入文件、修改 shell 状态、操控 Browser,或访问配置允许名单之外的网络,先问用户 |
| `allow-all` | 所有工具调用都不询问。仅在受信 workspace 中使用,UI 会一直显示条幅 |
| `plan`(工作流独有) | Pi 必须先调用 `submit_plan`,用户接受 / 修改 / 拒绝之后才能跑任何非 plan 工具 |

workspace 的设置控制默认 mode 与可循环列表(`cyclablePermissionModes`)。出厂默认 `safe`,可循环列表 `["safe", "allow-all"]`。

## 引擎架构

```text
                  Pi 工具调用 (read/write/bash/edit/web_search/...)
                                  │
                                  ▼
            共享权限引擎 (@mkagent/shared/agent/permissions-config)
                                  │
       ┌──────────────────┬───────┴────────┬────────────────────────┐
       ▼                  ▼                ▼                        ▼
   policy table    workspace overrides   user prompt     tool-specific check
   (默认)          (workspaces/<slug>/   (headless/cli    (BrowserPaneManager、
                    permissions/)         server)         document-tool 包装器)
                                  │
                                  ▼
                       grant  /  deny  /  prompt
```

Electron 与 headless server 共享这套引擎。renderer 是唯一决定要不要弹窗的层级;headless server 在权限 RPC 回复前会阻塞。

## 内置策略

| 工具 | `safe` 允许 | `safe` 拦截 |
|---|---|---|
| 文件读(`read`) | 相对路径 + 白名单内的绝对路径 | 网络路径、`workingDirectory` 之外 |
| 文件写(`write`、`edit`) | workspace `workingDirectory` 与 `/tmp/mkagent-*` | 其他一切 |
| Bash | 明确的白名单命令 | 其他 |
| Browser 操作 | 同源 + 明确允许的跨域列表 | cookie 写入、下载、任意脚本 |
| 网络 | 配置的代理 + `localhost` | 配置允许名单之外的端口 |

Source、MCP、OAuth 允许名单不会被加载——对应 schema 字段只保留作向后兼容读,实际不生效。

## 询问生命周期

1. Pi 调用工具。
2. 引擎返回 `prompt` 与 policy id;renderer 显示 `<PermissionPrompt>`。
3. 用户点 Grant / Deny / Allow for session。
4. 回复通过 JSONL 流送回 Pi,同一 turn 继续执行。
5. 在紧凑的 tool loop 中的 "Grant" 会在 JSONL 上落 `permission_granted` 事件,以保证回放一致。

## Workspace 覆盖

`~/.mkagent/workspaces/<slug>/permissions/` 下放覆盖文件,优先级高于内置策略。覆盖改动只对新工具调用生效;飞行中的 turn 仍使用 turn 开始时的策略。

## CLI 覆盖

`mkagent run --mode <mode>` 为临时会话设定初始 mode。`send` 与实时 CLI 默认继承 workspace 默认 mode,除非显式传入 `--mode`。

## 审计权限决策

权限询问与授予都是会话 JSONL 的一部分。审计:

```bash
bun run apps/cli/src/index.ts session messages <id> | grep -E 'permission_'
```

renderer 还在会话详情页提供专用的 "Permissions" 时间线。

## 限制

- 没有 per-tool 限流;由 Pi 自己 throttle。
- 跨会话的"持久授权"刻意不实现。"会话内授权"是唯一的持久作用域。
- 文件编辑的自动放行走 Bash,不走 GUI;引擎仍然坚持要用户意图。
