# 会话

会话是追加写入的 JSONL 记录,Pi 恢复数据存在同一目录下。Desktop、WebUI、CLI 都读写同一份文件;不存在独立的客户端存储。

## 磁盘布局

```text
~/.mkagent/workspaces/<slug>/
  config.json                              # workspace 设置(主题、默认 mode、...)
  skills/                                  # workspace 级别 Skills
  permissions/                             # 默认 + workspace 覆盖
  sessions/
    <session-id>/
      session.jsonl                        # 追加写入的记录
      .pi-sessions/                        # Pi SDK 恢复数据
      attachments/                         # 用户附件(沙盒路径)
```

`session-id` 是 UUIDv4 字符串;同一 id 在 resume、branch、import 时复用。

JSONL 的每一行都是 `@mkagent/shared/protocol/sessions` 中定义的 `SessionEvent` 判别联合。常见类型:

| Event | 说明 |
|---|---|
| `session_created` | title、model、working directory、时间戳 |
| `message_added` | user / assistant / system 轮次消息,含 id、content blocks、parentId |
| `tool_started` / `tool_result` | 工具调用,含 id、name、args、status、payload |
| `permission_requested` / `permission_granted` | 权限弹窗生命周期 |
| `annotation_added` / `annotation_updated` | 消息级 annotations 与 follow-up |
| `background_task_*` | 后台调度(虽然产品级 Automations UI 已删除,这条线仍保留以驱动后台工作) |
| `session_completed` / `session_failed` | 终止状态 |

只有通过 `sessions:import` RPC 物化为已注册、可打开的会话,导入才算完成。导出包不包含 API key、代理凭证或加密凭证数据。

## 生命周期操作

- **Create:** `POST session.create` 预留 id 并写入 `session_created`。
- **Continue / resume:** `POST session.send` 读取 JSONL 尾并向 Pi 请求下一轮。
- **Cancel:** `POST session.cancel` 停掉飞行中的轮次;Pi 恢复文件保留未完成的 tool call。
- **Search:** 内置索引支持 `query`、`in:title`、`state:`、`view:` 过滤(Views 见下文)。
- **Rename:** 在最新的 `session_created` 事件上更新 `title`。
- **Delete:** 在 `~/.mkagent/workspaces/<slug>/sessions/.trash/` 暂存目录,过期后清理。
- **Flag / archive / unread:** 元数据标记,挂在最新 `session_*` 事件上以加速列表渲染。
- **Import / export:** 可移植 bundle 格式,封装 `session.jsonl` 加附件。导入前必须通过 `SessionBundle` 验证。
- **Branch:** 复制 `session.jsonl` 到选定 message id,分配新 session id,并回退 Pi 恢复状态,使新分支能从该点 `Continue`。
- **Multi-window:** 同一会话可被多个客户端打开;最新写入者获胜,但只读视图可以无锁 tail JSONL。

## 技术状态

| 状态 | 触发 |
|---|---|
| `idle` | 没有飞行中的 turn |
| `processing` | 用户/助手 turn 正在或排队执行 |
| `waiting_for_permission` | Pi 请求权限;renderer 显示确认弹窗 |
| `failed` | 上一个 turn 因未处理错误结束 |
| `interrupted` | 进程中途退出(Electron 退出、Pi 崩溃) |

## 内置 Views

Views 以 Filtrex 表达式的形式存在 `~/.mkagent/workspaces/<slug>/views.json` 中。evaluator 只允许存活在 Lite 边界内的字段:

```text
hasUnread == true            # 未读
isFlagged == true            # Flagged
isArchived == true           # Archived
isProcessing == true         # 运行中
hasPendingPlan == true       # 待计划审核
permissionMode == "safe"     # 当前 workspace 默认只读
```

schema 为兼容历史可保留 label/status 字段,但这些条件已 no-op,因为 MkAgent 没有用户自定义 label 或 status。UI 暴露固定五个按钮(未读、Flagged、运行中、Archived、计划审核),**不**提供自定义 View 编辑器。

## Pi 恢复

Pi 子进程把自己的临时状态存在 `sessions/<id>/.pi-sessions/` 下。MkAgent 不解析这些文件,只在 resume 时把它们原样还给 Pi。想要完全 hermetic 的恢复测试,可以走 `SessionManager` 的 hook 注入路径。

## 会话内的权限

每个 Pi 工具调用都经过统一的权限引擎(`@mkagent/shared/agent/permissions-config`)。被拒的调用会以错误事件落到 JSONL,turn 在 `failed` 收尾;通过的继续。详见 [permissions.md](./permissions.md)。

## 审计会话

还没有 replayer 的 CLI 子命令;标准审计路径是 `bun run apps/cli/src/index.ts session messages <id>` 与 `session export <id>`。两条命令都保留事件顺序并对凭证字段脱敏。
