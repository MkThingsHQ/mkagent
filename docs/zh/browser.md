# Browser

Browser 面板出现在桌面聊天界面与会话工具中。每个会话分配一个 `BrowserPaneManager` 实例(按 `sessionId` 索引),由 Browser 按钮、BrowserPane 组件以及 Pi 的 `browser` 工具共享。

## Browser 出现的位置

| 入口 | 位置 |
|---|---|
| 桌面聊天 | 聊天头部的右上 Browser 按钮 |
| 会话工具 | `mcp__session__browser` 在 `@mkagent/session-tools-core` 注册 |
| 设置 | workspace 设置中的 Browser 工具开关(`browserToolEnabled`) |
| WebUI | Browser 面板 host-delegated;不创建远程 Browser 面板 |

Browser 按钮是 `BrowserPaneManager.toggleForSession(...)` 之上的 UI 句柄。会话工具形态是 `mcp__session__browser`——Pi 调用方式与 `mcp__session__list_sessions` 相同。

## BrowserPaneManager 职责

```text
BrowserPaneManager
  ├─ 每个会话的状态(当前 URL、历史、聚焦 selector、控制提示)
  ├─ 生命周期:绑定到窗口、focus、navigate、close、cleanup
  ├─ session binding:每个 (sessionId, workspaceId) 对应一个实例
  ├─ remote bridge:headless server 托管面板,Desktop 作为视图挂载
  └─ 权限集成:Browser 工具调用走统一的权限引擎
```

实例的生命周期与会话一致;关闭 Browser 按钮只是把面板藏起来。

## `web_search` 与 `web_fetch`

除了 Browser 面板,MkAgent 还提供两个非交互的检索工具:

| 工具 | 用途 | 实现 |
|---|---|---|
| `web_search` | 关键词 / 自然语言搜索 | provider-agnostic;无 key 时 fallback 到 DuckDuckGo |
| `web_fetch` | 抓取并解析 URL | provider-agnostic;需要时走 Pi 侧 renderer |

两者都遵循会话权限,共用同一份网络代理。

## 工具也要受权限管

`mcp__session__browser` 是会话工具:它的 handler 跑在 `packages/server-core`,用与其他工具一样的权限引擎。Browser 行为被拒会在 JSONL 上产出 `permission_requested` 事件与被拒 grant。

## WebUI 委托

WebUI 把 Browser 能力委托给已连接的 host。连接复用与 sessions 一样的 RPC channel,无需额外的鉴权面。这**不**会把 WebUI 变成"远程 workspace 产品":WebUI 仍然只服务一个本地 workspace。

## 刻意不存在的部分

Craft 那套 "Browser remote control for shared sessions"(Viewer / 公开分享 / 配对设备)流程刻意没实现。
