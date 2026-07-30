# Workspace

MkAgent 在首次启动时创建 `default` workspace。每个本地 workspace 隔离会话、Skills、权限、Views 和项目上下文。

## Workspace 目录

workspace 位于 `~/.mkagent/workspaces/<slug>/`。slug 是从 workspace 名称派生的 URL-safe 标识;`default` workspace 始终使用字面 slug `default`。

## Workspace `config.json`

```jsonc
{
  "id": "default",
  "name": "Default",
  "slug": "default",
  "defaults": {
    "permissionMode": "safe",
    "cyclablePermissionModes": ["safe", "allow-all"],
    "thinkingLevel": "think",
    "workingDirectory": "~"
    // 还可以有:模型默认、Browser 工具默认、主题覆盖、mini-model、语言
  },
  "updatedAt": 1753820000000
}
```

`workingDirectory` 以可移植形式存储(`~`-relative),加载时展开。`permissionMode` 读取时既接受规范名,也兼容旧的 mode 名;旧的 `'think'` 写入前会归一化为 `'think'`。

## 发现流程

1. `ensureDefaultWorkspacesDir()` 创建父目录。
2. `ensureDefaultWorkspace()` 读取 `workspaces/<slug>/config.json`;若缺失,则用打包的默认配置新建一个。
3. 每次 server 启动都对绑定的 workspace 执行一次;CLI 的 `run` 也在 `--workspace` 或 `--workspace-dir` 指定的 workspace 上隐式执行。

磁盘上已存在但 `config.json` 损坏的 workspace 会被改名 `config.json.broken-<timestamp>` 后用默认值重建,不会读取。

## 隔离保证

| 维度 | 隔离边界 |
|---|---|
| 会话 | per-workspace `sessions/<id>/` |
| Skills | global < workspace < project;不会跨加载 |
| 权限 | workspace 级别覆盖 + 全局默认 |
| Views | per-workspace `views.json` |
| Mini chat / mini model | per-workspace 覆盖全局模型 |
| 主题 | per-workspace 颜色主题覆盖 |
| Browser 面板 | 每个 `(sessionId, workspaceId)` 对一个 `RemoteBrowserPaneManager` 实例 |

## 绑定语义

- Desktop 窗口在其生命周期内绑定到一个 workspace(重开仍绑定同一 workspace)。
- WebUI 每个浏览器会话绑定一个 workspace;workspace id 跟着每个 RPC 握手走。
- CLI 绑定 `--workspace` 或 `--workspace-dir` 传入的 workspace;绑定发生在任何会话命令前,所以 stream 事件能正确路由。

## 操作

| 操作 | 入口 |
|---|---|
| 新建 | Settings → Workspaces → New;CLI `workspace create <name>` |
| 切换 | Settings → Workspaces → Active;CLI flag |
| 重命名 | Settings → Workspaces → Rename;更新 `config.json` |
| 删除 | Settings → Workspaces → Delete;需要显式"输入 slug"二次确认;目录会被移动到 `workspaces/.trash/` |
| 绑定窗口 | 仅 Desktop;右键窗口标题栏 |

删除 workspace 是破坏性的本地操作。运行时在执行任何操作前会确认路径确实在配置的 workspaces 根内。

## 远程 Workspace

远程 workspace federation、transfer、Craft 的 "Viewer" 分享流被刻意不实现。详见 [`comparison-with-craft.md`](./comparison-with-craft.md)。
